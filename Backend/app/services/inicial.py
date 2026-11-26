"""Agrega ThingSpeak (sensor) + INMET (oficial) no payload da dashboard Analista > Inicial."""
import asyncio
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx

from ..clients import clima, thingspeak
from ..config import Settings
from . import alertas_analista as alertas, qualidade, tratamento

RECIFE = ZoneInfo("America/Recife")


def _hora(dt: datetime) -> datetime:
    return dt.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)


def _media(v: list[float]) -> float | None:
    return round(sum(v) / len(v), 1) if v else None


def _arred(v: float | None, casas: int = 1) -> float | None:
    return None if v is None else round(v, casas)


async def montar(http: httpx.AsyncClient, cfg: Settings, agora: datetime | None = None) -> dict:
    agora = (agora or datetime.now(timezone.utc)).astimezone(timezone.utc)
    r_ts, r_clima = await asyncio.gather(
        thingspeak.buscar_feeds(http, cfg), clima.buscar(http, cfg, agora),
        return_exceptions=True,
    )
    ts_erro = str(r_ts) if isinstance(r_ts, Exception) else None
    clima_erro = str(r_clima) if isinstance(r_clima, Exception) else None
    for r in (r_ts, r_clima):   # erros inesperados (bug) não podem virar "fonte indisponível" silenciosa
        if isinstance(r, Exception) and not isinstance(r, (thingspeak.ThingSpeakErro, clima.ClimaIndisponivel)):
            raise r
    obs_brutas, fonte = ([], {"id": None, "rotulo": "Clima", "tipo": None, "aviso": None}) if clima_erro else r_clima

    # --- sensor (RF02 + RF05) ---
    trat = tratamento.tratar([])
    if not ts_erro:
        leituras = tratamento.interpretar_feeds(r_ts, cfg.thingspeak_campo_temp, cfg.thingspeak_campo_umid)
        trat = tratamento.tratar(leituras)
    inicio24 = agora - timedelta(hours=24)
    validas24 = [l for l in trat.validas if l.momento >= inicio24]
    ultima = trat.validas[-1] if trat.validas else None
    minutos_sem_dados = (agora - ultima.momento).total_seconds() / 60 if ultima else None
    qual = qualidade.calcular(trat, agora) if not ts_erro else None

    # --- clima (INMET ou Open-Meteo) ---
    obs = [o for o in obs_brutas if o.momento >= inicio24 - timedelta(hours=1)]
    obs_por_hora = {o.momento: o for o in obs}

    # --- série horária (24 h, horário de Recife) ---
    por_hora: dict[datetime, list] = {}
    for l in validas24:
        por_hora.setdefault(_hora(l.momento), []).append(l)
    h0 = _hora(agora)
    horas = [h0 - timedelta(hours=i) for i in range(23, -1, -1)]
    grafico = {"rotulos": [h.astimezone(RECIFE).strftime("%H:00") for h in horas],
               "sensor_temperatura": [], "clima_temperatura": [], "sensor_umidade": [], "clima_umidade": []}
    for h in horas:
        ls = por_hora.get(h, [])
        o = obs_por_hora.get(h)
        grafico["sensor_temperatura"].append(_media([l.temperatura for l in ls]))
        grafico["sensor_umidade"].append(_media([l.umidade for l in ls]))
        grafico["clima_temperatura"].append(_arred(o.temperatura) if o else None)
        grafico["clima_umidade"].append(_arred(o.umidade) if o else None)

    # --- comparação na última hora com dado dos dois lados ---
    comparacao = None
    for i in range(len(horas) - 1, -1, -1):
        st, it = grafico["sensor_temperatura"][i], grafico["clima_temperatura"][i]
        if st is not None and it is not None:
            su, iu = grafico["sensor_umidade"][i], grafico["clima_umidade"][i]
            comparacao = {"hora_local": grafico["rotulos"][i], "sensor_temperatura": st, "clima_temperatura": it,
                          "delta_temperatura": round(st - it, 1), "sensor_umidade": su, "clima_umidade": iu,
                          "delta_umidade": round(su - iu, 1) if su is not None and iu is not None else None}
            break

    chuvas = [obs_por_hora[h].chuva_mm for h in horas if h in obs_por_hora and obs_por_hora[h].chuva_mm is not None]
    chuva_24h = round(sum(chuvas), 1) if chuvas else None

    ult6 = [l for l in validas24 if l.momento >= agora - timedelta(hours=6)]
    medias = ({"temperatura": _media([l.temperatura for l in ult6]), "umidade": _media([l.umidade for l in ult6])}
              if ult6 else None)

    lista = alertas.gerar(
        cfg=cfg, agora=agora, thingspeak_erro=ts_erro, clima_erro=clima_erro,
        aviso_fonte=fonte["aviso"], rotulo_fonte=fonte["rotulo"],
        minutos_sem_dados=minutos_sem_dados, qualidade=qual, invalidas=trat.invalidas,
        delta_temp=comparacao["delta_temperatura"] if comparacao else None,
        medias_recentes=medias, chuva_24h=chuva_24h)

    return {
        "atualizado_em": agora.isoformat(),
        "fontes": {
            "thingspeak": {"ok": ts_erro is None, "erro": ts_erro},
            "clima": {"ok": clima_erro is None, "erro": clima_erro, **fonte},
        },
        "cards": {
            "dados_processados": {"valor": len(validas24), "descartadas": trat.invalidas + trat.incompletas + trat.duplicadas},
            "temperatura": {"sensor": _arred(ultima.temperatura) if ultima else None,
                            "ultima_leitura": ultima.momento.isoformat() if ultima else None,
                            "minutos_sem_dados": round(minutos_sem_dados) if minutos_sem_dados is not None else None,
                            "comparacao": comparacao},
            "chuva_24h_mm": chuva_24h,
        },
        "grafico": grafico,
        "qualidade": qual,
        "alertas": lista,
    }
