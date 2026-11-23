"""Tela Lavouras do Produtor: cada talhão recebe clima, solo e fase do ciclo calculados com dados do Open-Meteo.

* Fase/progresso: graus-dia (GDD, base 10 °C) acumulados desde a poda ÷ GDD alvo da cultura.
* Solo, ET0, chuva e temperatura: Open-Meteo (modelo, não é sensor de campo).
Os talhões (nome, área, poda...) ficam em Backend/lavouras.json.
"""
import asyncio
import json
import os
import threading
from datetime import date, datetime, timedelta
from pathlib import Path

import httpx

from .. import cache
from ..clients.open_meteo import URL, OpenMeteoErro
from ..config import Settings

ARQUIVO = Path(__file__).resolve().parents[2] / "lavouras.json"
TTL = 600
_LOCK = threading.Lock()
GDD_BASE = 10.0
LIMITE_CALOR = 36.0
SOLO_SECO_PCT = 15.0      # umidade volumétrica (%) abaixo da qual sugerimos irrigar (PROVISÓRIO)
CHUVA_FORTE_MM = 10.0


def _num(v):
    return float(v) if isinstance(v, (int, float)) else None


def carregar_cadastro() -> list[dict]:
    try:
        return json.loads(ARQUIVO.read_text(encoding="utf-8")).get("lavouras", [])
    except FileNotFoundError:
        raise OpenMeteoErro("Arquivo lavouras.json não encontrado em Backend/")
    except ValueError as e:
        raise OpenMeteoErro(f"lavouras.json inválido: {e}")


async def _clima(http: httpx.AsyncClient, lat: float, lon: float) -> dict:
    params = {"latitude": lat, "longitude": lon, "timezone": "America/Recife", "past_days": 92, "forecast_days": 7,
              "current": "temperature_2m,relative_humidity_2m,precipitation",
              "hourly": "soil_moisture_3_to_9cm",
              "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration"}

    async def _buscar() -> dict:
        try:
            r = await http.get(URL, params=params)
        except httpx.HTTPError as e:
            raise OpenMeteoErro(f"Open-Meteo inacessível ({type(e).__name__})") from e
        if r.status_code == 429:
            raise OpenMeteoErro("Open-Meteo: limite de uso atingido (tente mais tarde)")
        if r.status_code != 200:
            raise OpenMeteoErro(f"Open-Meteo respondeu {r.status_code}")
        try:
            d = r.json()
        except ValueError as e:
            raise OpenMeteoErro("Open-Meteo devolveu uma resposta que não é JSON") from e
        if not isinstance(d, dict) or not (d.get("daily") or {}).get("time"):
            raise OpenMeteoErro("Open-Meteo devolveu uma resposta sem dados diários")
        return d

    return await cache.obter(f"lavouras:{round(lat, 2)}:{round(lon, 2)}", TTL, _buscar)


def _solo_pct(d: dict, agora: str) -> float | None:
    h = d.get("hourly") or {}
    tempos, vals = h.get("time") or [], h.get("soil_moisture_3_to_9cm") or []
    hora = agora[:13]
    idx = next((i for i, t in enumerate(tempos) if str(t)[:13] >= hora), None)
    if idx is None:
        return None
    for i in (idx, idx - 1, idx + 1):
        if 0 <= i < len(vals) and _num(vals[i]) is not None:
            return round(vals[i] * 100, 1)
    return None


def _analisar(cad: dict, d: dict) -> dict:
    daily = d["daily"]
    dias = daily["time"]
    tmax, tmin = daily.get("temperature_2m_max") or [], daily.get("temperature_2m_min") or []
    chuva, et0 = daily.get("precipitation_sum") or [], daily.get("et0_fao_evapotranspiration") or []
    cur = d.get("current") or {}
    agora = str(cur.get("time") or datetime.now().isoformat())
    hoje = agora[:10]
    i_hoje = dias.index(hoje) if hoje in dias else max(0, len(dias) - 7)

    def gdd(i):
        a, b = _num(tmax[i]) if i < len(tmax) else None, _num(tmin[i]) if i < len(tmin) else None
        return None if a is None or b is None else max(0.0, (a + b) / 2 - GDD_BASE)

    inicio = date.fromisoformat(cad["ciclo_inicio"])
    dia_hoje = date.fromisoformat(hoje)
    alvo = float(cad.get("gdd_alvo") or 1800)
    prox = range(i_hoje + 1, min(len(dias), i_hoje + 8))
    chuva_7d = round(sum(_num(chuva[i]) or 0 for i in prox), 1)
    et0_7d = [_num(et0[i]) for i in prox if i < len(et0) and _num(et0[i]) is not None]
    et0_dia = round(sum(et0_7d) / len(et0_7d), 1) if et0_7d else None
    tmax_7d = max([_num(tmax[i]) for i in prox if i < len(tmax) and _num(tmax[i]) is not None] or [None], default=None)
    solo = _solo_pct(d, agora)

    if inicio > dia_hoje:
        fase, status, progresso, gdd_acum, colheita_em = "Preparação", "preparacao", 0.0, 0.0, None
        rotulo_prog = f"Poda prevista em {inicio.strftime('%d/%m')}"
    else:
        gdd_acum = sum(g for i, dt in enumerate(dias) if inicio <= date.fromisoformat(dt) <= dia_hoje and i <= i_hoje
                       and (g := gdd(i)) is not None)
        progresso = min(100.0, gdd_acum / alvo * 100)
        status = "colheita" if progresso >= 85 else "desenvolvimento"
        fase = "Em colheita" if status == "colheita" else "Em desenvolvimento"
        rotulo_prog = "Progresso da colheita" if status == "colheita" else "Desenvolvimento"
        taxas = [g for i in prox if (g := gdd(i)) is not None]
        taxa = sum(taxas) / len(taxas) if taxas else None
        colheita_em = None
        if taxa and gdd_acum < alvo:
            dias_restantes = round((alvo - gdd_acum) / taxa)
            colheita_em = (dia_hoje + timedelta(days=dias_restantes)).isoformat()

    avisos = []
    if tmax_7d is not None and tmax_7d >= LIMITE_CALOR:
        avisos.append(f"Calor de {tmax_7d:.0f} °C previsto: reforce a irrigação nas horas mais quentes.")
    if solo is not None and solo < SOLO_SECO_PCT and status != "preparacao":
        avisos.append(f"Solo seco ({solo:.0f}%): avalie irrigar.")
    if status == "colheita" and chuva_7d >= CHUVA_FORTE_MM:
        avisos.append(f"{chuva_7d:.0f} mm de chuva prevista: risco para os cachos na colheita.")
    if _num(cur.get("relative_humidity_2m")) is not None and cur["relative_humidity_2m"] >= 85 and status == "desenvolvimento":
        avisos.append("Umidade alta: atenção a doenças fúngicas (míldio).")

    return {"id": cad["id"], "talhao": cad["talhao"], "nome": cad["nome"], "tipo": cad.get("tipo", "mesa"),
            "area_ha": cad["area_ha"], "producao_t": round(cad["area_ha"] * float(cad.get("t_ha") or 0), 1),
            "status": status, "fase": fase, "progresso_pct": round(progresso), "progresso_rotulo": rotulo_prog,
            "ciclo_inicio": cad["ciclo_inicio"], "gdd_acumulado": round(gdd_acum), "gdd_alvo": round(alvo),
            "colheita_estimada": colheita_em,
            "clima": {"temperatura": _num(cur.get("temperature_2m")), "umidade": _num(cur.get("relative_humidity_2m")),
                      "solo_pct": solo, "chuva_7d_mm": chuva_7d, "et0_mm_dia": et0_dia, "tmax_7d": tmax_7d},
            "avisos": avisos}


async def montar(http: httpx.AsyncClient, cfg: Settings) -> dict:
    cadastro = carregar_cadastro()
    pontos = {}
    for c in cadastro:
        pontos.setdefault((round(c.get("lat", cfg.open_meteo_lat), 2), round(c.get("lon", cfg.open_meteo_lon), 2)), None)
    chaves = list(pontos)
    resp = await asyncio.gather(*[_clima(http, la, lo) for la, lo in chaves])
    por_ponto = dict(zip(chaves, resp))
    lista = [_analisar(c, por_ponto[(round(c.get("lat", cfg.open_meteo_lat), 2), round(c.get("lon", cfg.open_meteo_lon), 2))])
             for c in cadastro]
    ativas = [l for l in lista if l["status"] != "preparacao"]
    solos = [l["clima"]["solo_pct"] for l in ativas if l["clima"]["solo_pct"] is not None]
    ets = [l["clima"]["et0_mm_dia"] for l in ativas if l["clima"]["et0_mm_dia"] is not None]
    chuvas = [l["clima"]["chuva_7d_mm"] for l in ativas]
    resumo = {"cadastradas": len(lista), "ativas": len(ativas),
              "area_total_ha": round(sum(l["area_ha"] for l in lista), 1),
              "area_producao_ha": round(sum(l["area_ha"] for l in ativas), 1),
              "producao_prevista_t": round(sum(l["producao_t"] for l in ativas), 1),
              "em_colheita": sum(1 for l in lista if l["status"] == "colheita"),
              "solo_medio_pct": round(sum(solos) / len(solos), 1) if solos else None,
              "et0_media_mm_dia": round(sum(ets) / len(ets), 1) if ets else None,
              "chuva_7d_media_mm": round(sum(chuvas) / len(chuvas), 1) if chuvas else None}
    return {"atualizado_em": datetime.now().astimezone().isoformat(),
            "fonte": {"id": "open_meteo", "rotulo": "Open-Meteo (modelo)"}, "resumo": resumo, "lavouras": lista}


# ---------------- Cadastro: criar e excluir talhões (grava em lavouras.json) ----------------
def _ler_doc() -> dict:
    try:
        doc = json.loads(ARQUIVO.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {"lavouras": []}
    except ValueError as e:
        raise ValueError(f"lavouras.json inválido: {e}")
    doc.setdefault("lavouras", [])
    return doc


def _gravar_doc(doc: dict) -> None:
    tmp = ARQUIVO.with_suffix(".tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, ARQUIVO)


def criar(d: dict, lat_padrao: float, lon_padrao: float) -> dict:
    with _LOCK:
        doc = _ler_doc()
        lista = doc["lavouras"]
        numeros = [int(x["id"][1:]) for x in lista if str(x.get("id", "")).startswith("t") and str(x["id"])[1:].isdigit()]
        n = (max(numeros) if numeros else 0) + 1
        novo = {"id": f"t{n:02d}", "talhao": (d.get("talhao") or f"TALHÃO {n:02d}").strip(), "nome": d["nome"].strip(),
                "tipo": d.get("tipo") or "mesa", "area_ha": round(float(d["area_ha"]), 2), "t_ha": float(d["t_ha"]),
                "ciclo_inicio": d["ciclo_inicio"], "gdd_alvo": int(d.get("gdd_alvo") or 1800),
                "lat": d.get("lat") if d.get("lat") is not None else lat_padrao,
                "lon": d.get("lon") if d.get("lon") is not None else lon_padrao}
        lista.append(novo)
        _gravar_doc(doc)
        return novo


def excluir(id_: str) -> bool:
    with _LOCK:
        doc = _ler_doc()
        antes = len(doc["lavouras"])
        doc["lavouras"] = [x for x in doc["lavouras"] if x.get("id") != id_]
        if len(doc["lavouras"]) == antes:
            return False
        _gravar_doc(doc)
        return True
