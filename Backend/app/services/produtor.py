"""Monta o payload do Produtor a partir do Open-Meteo: clima agora, 7 dias, janela de colheita e alertas.
Os limiares usam os mesmos JANELA_* do .env do Analista (valores PROVISÓRIOS: valide com o agrônomo)."""
import time
from datetime import datetime

import httpx

from ..clients import open_meteo
from ..config import Settings
from ..ml import mercado, produtividade
from ..ml.dados import DadosErro

LIMITE_CALOR = 36.0        # °C (máxima prevista)
LIMITE_FRIO = 12.0         # °C (mínima prevista)
LIMITE_UMID_BAIXA = 30.0   # % (agora)
CHUVA_RELEVANTE_MM = 5.0   # mm/dia
CHUVA_PROB_ALTA = 70       # %

_WMO = {0: "Céu limpo", 1: "Predominantemente limpo", 2: "Parcialmente nublado", 3: "Nublado",
        45: "Neblina", 48: "Neblina", 51: "Garoa fraca", 53: "Garoa", 55: "Garoa forte",
        61: "Chuva fraca", 63: "Chuva moderada", 65: "Chuva forte",
        80: "Pancadas de chuva", 81: "Pancadas de chuva", 82: "Pancadas fortes",
        95: "Trovoada", 96: "Trovoada com granizo", 99: "Trovoada com granizo"}


def condicao(codigo, dia: bool = True) -> str:
    codigo = int(codigo) if isinstance(codigo, (int, float)) else None
    if codigo in (0, 1) and dia:
        return "Ensolarado"
    return _WMO.get(codigo, "—")


def _g(lista, i):
    try:
        v = lista[i]
    except (IndexError, TypeError):
        return None
    return float(v) if isinstance(v, (int, float)) else None


def _r(v, casas=1):
    return None if v is None else round(v, casas)


def _umidade_media_por_dia(hourly: dict) -> dict[str, float]:
    soma: dict[str, list[float]] = {}
    for ts, u in zip(hourly.get("time") or [], hourly.get("relative_humidity_2m") or []):
        if isinstance(u, (int, float)):
            soma.setdefault(str(ts)[:10], []).append(float(u))
    return {d: sum(v) / len(v) for d, v in soma.items() if v}


def _max_proximas_24h(hourly: dict, agora_local: str) -> float | None:
    tempos = [str(t) for t in hourly.get("time") or []]
    temps = hourly.get("temperature_2m") or []
    hora = agora_local[:13]
    inicio = next((i for i, t in enumerate(tempos) if t[:13] >= hora), None)
    if inicio is None:
        return None
    vals = [float(v) for v in temps[inicio:inicio + 24] if isinstance(v, (int, float))]
    return max(vals) if vals else None


def montar_dias(dados: dict) -> list[dict]:
    d = dados.get("daily") or {}
    umid = _umidade_media_por_dia(dados.get("hourly") or {})
    dias = []
    for i, data in enumerate(d.get("time") or []):
        tmax, tmin = _g(d.get("temperature_2m_max"), i), _g(d.get("temperature_2m_min"), i)
        dias.append({
            "data": data, "tmax": _r(tmax), "tmin": _r(tmin),
            "tmedia": _r((tmax + tmin) / 2) if tmax is not None and tmin is not None else None,
            "umidade_media": _r(umid.get(data), 0),
            "chuva_mm": _r(_g(d.get("precipitation_sum"), i)),
            "prob_chuva": _r(_g(d.get("precipitation_probability_max"), i), 0),
            "condicao": condicao(_g(d.get("weather_code"), i)),
        })
    return dias


def janela_ideal(dias: list[dict], cfg: Settings) -> dict | None:
    """Maior sequência de dias secos, com temperatura média e umidade dentro das faixas ideais."""
    (tmin, tmax), (umin, umax) = cfg.janela_temp, cfg.janela_umid
    melhor, atual = [], []
    for d in dias:
        ok = (d["tmedia"] is not None and d["umidade_media"] is not None
              and tmin <= d["tmedia"] <= tmax and umin <= d["umidade_media"] <= umax
              and (d["chuva_mm"] or 0) < 1.0)
        atual = atual + [d] if ok else []
        if len(atual) > len(melhor):
            melhor = atual
    if not melhor:
        return None
    return {"inicio": melhor[0]["data"], "fim": melhor[-1]["data"], "dias": len(melhor)}


def gerar_alertas(atual: dict, dias: list[dict]) -> list[dict]:
    alertas = []
    prox = dias[:3]
    quente = [d for d in prox if d["tmax"] is not None and d["tmax"] >= LIMITE_CALOR]
    if quente:
        d = max(quente, key=lambda x: x["tmax"])
        alertas.append({"tipo": "risco_calor", "severidade": "atencao", "titulo": "Risco de calor",
                        "mensagem": f"Máxima prevista de {d['tmax']:.0f}°C em {d['data'][8:10]}/{d['data'][5:7]}."})
    frio = [d for d in prox if d["tmin"] is not None and d["tmin"] <= LIMITE_FRIO]
    if frio:
        d = min(frio, key=lambda x: x["tmin"])
        alertas.append({"tipo": "risco_frio", "severidade": "atencao", "titulo": "Temperatura baixa",
                        "mensagem": f"Mínima prevista de {d['tmin']:.0f}°C em {d['data'][8:10]}/{d['data'][5:7]}."})
    chuva = [d for d in prox[:2] if (d["chuva_mm"] or 0) >= CHUVA_RELEVANTE_MM or (d["prob_chuva"] or 0) >= CHUVA_PROB_ALTA]
    if chuva:
        d = chuva[0]
        alertas.append({"tipo": "chuva_prevista", "severidade": "info", "titulo": "Chuva prevista",
                        "mensagem": f"{d['chuva_mm'] or 0:.1f} mm e {d['prob_chuva'] or 0:.0f}% de chance em {d['data'][8:10]}/{d['data'][5:7]}: avalie a colheita."})
    u = atual.get("umidade")
    if u is not None and u < LIMITE_UMID_BAIXA:
        alertas.append({"tipo": "risco_umidade_baixa", "severidade": "atencao", "titulo": "Umidade do ar baixa",
                        "mensagem": f"Umidade relativa de {u:.0f}% agora."})
    return alertas


async def montar(http: httpx.AsyncClient, cfg: Settings) -> dict:
    dados = await open_meteo.buscar_previsao(http, cfg)
    c = dados["current"]
    dia = bool(c.get("is_day", 1))
    atual = {"temperatura": _r(_g([c.get("temperature_2m")], 0)), "sensacao": _r(_g([c.get("apparent_temperature")], 0)),
             "umidade": _r(_g([c.get("relative_humidity_2m")], 0), 0), "vento_kmh": _r(_g([c.get("wind_speed_10m")], 0), 0),
             "chuva_mm": _r(_g([c.get("precipitation")], 0)), "condicao": condicao(c.get("weather_code"), dia)}
    dias = montar_dias(dados)
    max24 = _max_proximas_24h(dados.get("hourly") or {}, str(c.get("time") or ""))
    return {"atualizado_em": datetime.now().astimezone().isoformat(),
            "fonte": {"id": "open_meteo", "rotulo": "Open-Meteo", "tipo": "modelo"},
            "atual": atual, "max_proximas_24h": _r(max24), "dias": dias,
            "janela_ideal": janela_ideal(dias, cfg), "alertas": gerar_alertas(atual, dias)}


# ---------------------------------------------------------------- resumo da safra (cards da tela Inicial)
_TTL_OK, _TTL_ERRO = 6 * 3600, 600
_guardado: dict[str, tuple[float, dict]] = {}


def _var(atual: float | None, base: float | None) -> float | None:
    return round((atual / base - 1) * 100, 1) if atual is not None and base else None


def _preco_exportacao(cfg: Settings, produto: str) -> dict:
    """Preço médio de exportação (US$/kg) dos últimos 12 meses com embarque, ponderado pelo volume (ComexStat)."""
    df = mercado.baixar_comex(cfg, produto)
    ult = df[df["kg"] > 0].tail(12)
    if ult.empty:
        raise DadosErro("ComexStat sem exportações recentes")
    return {"usd_kg": round(float(ult["fob_usd"].sum() / ult["kg"].sum()), 2),
            "periodo": f"{ult.index[0].strftime('%m/%Y')} a {ult.index[-1].strftime('%m/%Y')}"}


def _calcular_resumo(cfg: Settings) -> dict:
    produto = cfg.produto_padrao if cfg.produto_padrao in mercado.PRODUTOS else "uva"
    nome = mercado.PRODUTOS[produto]["nome"]
    munis = ", ".join(mercado.MUNICIPIOS_CONHECIDOS.get(m, m) for m in cfg.pam_municipios)
    fontes = {"pam": {"ok": True, "erro": None, "rotulo": mercado.FONTE_PAM},
              "comex": {"ok": True, "erro": None, "rotulo": mercado.FONTE_COMEX}}
    out = {"produto": nome, "local": munis, "fontes": fontes, "area": None, "producao": None,
           "receita": None, "produtividade": None}
    try:
        df = mercado.baixar_pam(cfg, produto)
    except DadosErro as e:
        fontes["pam"].update(ok=False, erro=str(e))
        df = None
    prev_prod_t = ano_prev = None
    if df is not None and len(df) >= 2:
        ult, ant = df.iloc[-1], df.iloc[-2]
        ano = int(df.index[-1])
        out["area"] = {"ano": ano, "ha": round(float(ult["area_ha"]), 1),
                       "variacao_pct": _var(float(ult["area_ha"]), float(ant["area_ha"]))}
        try:
            y = produtividade._serie_continua(df)
            prev_kg_ha = produtividade._tendencia(y.to_numpy(float))
            faixa = None
            try:
                faixa = round(produtividade.avaliar(y)["p80"])
            except Exception:       # série curta demais para medir o erro: mostra só o valor
                pass
            ano_prev = int(y.index[-1]) + 1
            prev_prod_t = float(ult["area_ha"]) * prev_kg_ha / 1000     # área do último ano × rendimento previsto
            out["produtividade"] = {"ano": ano_prev, "kg_ha": round(prev_kg_ha), "faixa_kg_ha": faixa,
                                    "variacao_pct": _var(prev_kg_ha, float(ult["rendimento_kg_ha"]))}
            out["producao"] = {"ano": ano_prev, "toneladas": round(prev_prod_t, 1),
                               "variacao_pct": _var(prev_prod_t, float(ult["producao_t"]))}
        except Exception as e:      # noqa: BLE001 - série insuficiente não derruba a tela
            fontes["pam"].update(ok=False, erro=f"Não foi possível projetar a safra: {e}")
    if prev_prod_t is not None:
        try:
            p = _preco_exportacao(cfg, produto)
            out["receita"] = {"ano": ano_prev, "usd": round(prev_prod_t * 1000 * p["usd_kg"]),
                              "preco_usd_kg": p["usd_kg"], "preco_periodo": p["periodo"]}
        except DadosErro as e:
            fontes["comex"].update(ok=False, erro=str(e))
    return out


def resumo(cfg: Settings) -> dict:
    """Cards da tela Inicial. Bloqueante (lê CSV e pode baixar IBGE/ComexStat), então o router é `def`."""
    agora = time.monotonic()
    g = _guardado.get("resumo")
    if g and g[0] > agora:
        return g[1]
    r = _calcular_resumo(cfg)
    r["atualizado_em"] = datetime.now().astimezone().isoformat()
    ok = r["fontes"]["pam"]["ok"] and r["fontes"]["comex"]["ok"]
    _guardado["resumo"] = (agora + (_TTL_OK if ok else _TTL_ERRO), r)
    return r
