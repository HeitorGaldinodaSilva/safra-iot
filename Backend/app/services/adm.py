"""Administrador > Inicial: tudo calculado a partir de dados REAIS do Open-Meteo
(série horária das últimas 24 h + previsão de 7 dias). Nada fixo."""
import asyncio
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx

from ..clients import open_meteo
from ..config import Settings
from . import produtor

RECIFE = ZoneInfo("America/Recife")
VARIAVEIS = 3   # temperatura, umidade, chuva
FAIXAS = {"temperatura": (-10.0, 55.0), "umidade": (0.0, 100.0), "chuva": (0.0, 200.0)}


def _hora(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)


def _valido(nome: str, v) -> bool:
    lo, hi = FAIXAS[nome]
    return v is not None and lo <= v <= hi


def _rotulo_integridade(p: float) -> str:
    return "Excelente" if p >= 98 else "Bom" if p >= 90 else "Atenção" if p >= 75 else "Crítico"


def _local(dt: datetime) -> str:
    return dt.astimezone(RECIFE).strftime("%H:%M")


def _atividades(agora, obs24, janela, alertas, obs_ok, prev_ok) -> list[dict]:
    ev = []
    iso = agora.isoformat()
    if obs_ok:
        ev.append({"tipo": "dados", "titulo": "Dados climáticos atualizados",
                   "descricao": f"Série horária das últimas 24 h sincronizada ({len(obs24)} horas do Open-Meteo)", "quando": iso})
    if prev_ok:
        desc = "Previsão de 7 dias carregada"
        if janela:
            desc += f" · janela ideal de colheita: {janela['dias']} dia(s) a partir de {janela['inicio'][8:10]}/{janela['inicio'][5:7]}"
        ev.append({"tipo": "modelo", "titulo": "Previsão atualizada", "descricao": desc, "quando": iso})
    chuvosas = [o for o in obs24 if (o.chuva_mm or 0) > 0]
    if chuvosas:
        u = max(chuvosas, key=lambda o: o.momento)
        total = sum(o.chuva_mm for o in chuvosas)
        ev.append({"tipo": "permissao", "titulo": "Chuva registrada",
                   "descricao": f"{u.chuva_mm:.1f} mm às {_local(u.momento)} · {total:.1f} mm em 24 h",
                   "quando": u.momento.isoformat()})
    temps = [o for o in obs24 if o.temperatura is not None]
    if temps:
        mx = max(temps, key=lambda o: o.temperatura)
        ev.append({"tipo": "dados", "titulo": "Máxima das últimas 24 h",
                   "descricao": f"{mx.temperatura:.1f}°C às {_local(mx.momento)}", "quando": mx.momento.isoformat()})
    for a in alertas:
        ev.append({"tipo": "permissao", "titulo": f"Alerta: {a['titulo']}", "descricao": a["mensagem"], "quando": iso})
    ev.sort(key=lambda e: e["quando"], reverse=True)
    return ev[:6]


async def montar(http: httpx.AsyncClient, cfg: Settings, agora: datetime | None = None) -> dict:
    agora = (agora or datetime.now(timezone.utc)).astimezone(timezone.utc)
    r_obs, r_prev = await asyncio.gather(
        open_meteo.buscar_observacoes(http, cfg, agora), open_meteo.buscar_previsao(http, cfg),
        return_exceptions=True)
    for r in (r_obs, r_prev):   # bug inesperado não pode virar "fonte indisponível" silenciosa
        if isinstance(r, Exception) and not isinstance(r, open_meteo.OpenMeteoErro):
            raise r
    obs_erro = str(r_obs) if isinstance(r_obs, Exception) else None
    prev_erro = str(r_prev) if isinstance(r_prev, Exception) else None
    if obs_erro and prev_erro:
        raise open_meteo.OpenMeteoErro(f"{obs_erro} · {prev_erro}")

    # --- série das últimas 24 h: integridade e volume ---
    h0 = _hora(agora)
    horas = {h0 - timedelta(hours=i) for i in range(24)}
    obs24 = sorted((o for o in (r_obs if not obs_erro else []) if o.momento in horas), key=lambda o: o.momento)
    validos = sum(_valido("temperatura", o.temperatura) + _valido("umidade", o.umidade) + _valido("chuva", o.chuva_mm)
                  for o in obs24)
    esperados = 24 * VARIAVEIS
    integ = round(validos / esperados * 100, 1) if not obs_erro else None

    # --- previsão: agora, dias, alertas ---
    atual, dias, janela, alertas = {}, [], None, []
    if not prev_erro:
        c = r_prev["current"]
        dia = bool(c.get("is_day", 1))
        g = produtor._g
        atual = {"temperatura": produtor._r(g([c.get("temperature_2m")], 0)),
                 "sensacao": produtor._r(g([c.get("apparent_temperature")], 0)),
                 "umidade": produtor._r(g([c.get("relative_humidity_2m")], 0), 0),
                 "vento_kmh": produtor._r(g([c.get("wind_speed_10m")], 0), 0),
                 "condicao": produtor.condicao(c.get("weather_code"), dia)}
        dias = produtor.montar_dias(r_prev)
        janela = produtor.janela_ideal(dias, cfg)
        alertas = produtor.gerar_alertas(atual, dias)
    elif obs24:   # sem previsão: usa a última hora observada
        atual = {"temperatura": produtor._r(obs24[-1].temperatura), "sensacao": None,
                 "umidade": produtor._r(obs24[-1].umidade, 0), "vento_kmh": None, "condicao": "Última hora observada"}
    clima_alertas = list(alertas)
    if obs_erro:
        alertas.append({"tipo": "fonte_indisponivel", "severidade": "atencao", "titulo": "Série horária indisponível",
                        "mensagem": obs_erro})
    if prev_erro:
        alertas.append({"tipo": "fonte_indisponivel", "severidade": "atencao", "titulo": "Previsão indisponível",
                        "mensagem": prev_erro})
    if integ is not None and integ < 90:
        alertas.append({"tipo": "integridade_baixa", "severidade": "atencao", "titulo": "Integridade dos dados baixa",
                        "mensagem": f"Apenas {integ:.1f}% dos pontos das últimas 24 h estão completos e válidos."})

    por_sev = {s: sum(1 for a in alertas if a["severidade"] == s) for s in ("critico", "atencao", "info")}
    geral = "ok" if not obs_erro and not prev_erro else "parcial"

    status = [
        {"nome": "Servidor (API Safra)", "descricao": "Respondendo normalmente", "valor": "Online"},
        {"nome": "Open-Meteo · observação", "descricao": obs_erro or f"{len(obs24)} de 24 horas recebidas",
         "valor": "Offline" if obs_erro else f"{integ:.1f}%".replace(".", ",")},
        {"nome": "Open-Meteo · previsão", "descricao": prev_erro or f"{len(dias)} dias carregados",
         "valor": "Offline" if prev_erro else "Online"},
    ]

    return {
        "atualizado_em": agora.isoformat(),
        "fonte": {"id": "open_meteo", "rotulo": "Open-Meteo", "tipo": "modelo"},
        "geral": geral,
        "fontes": {"observacao": {"ok": obs_erro is None, "erro": obs_erro},
                   "previsao": {"ok": prev_erro is None, "erro": prev_erro}},
        "cards": {
            "temperatura": atual,
            "integridade": {"valor": integ, "rotulo": _rotulo_integridade(integ) if integ is not None else None,
                            "validos": validos, "esperados": esperados},
            "dados_processados": {"valor": validos, "esperados": esperados},
            "alertas": {"total": len(alertas), **por_sev},
        },
        "atividades": _atividades(agora, obs24, janela, clima_alertas, not obs_erro, not prev_erro),
        "status": status,
        "alertas": alertas,
    }
