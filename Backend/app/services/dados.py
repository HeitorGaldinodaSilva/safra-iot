"""Administrador > Dados: qualidade e status das fontes de dados do sistema, calculados com dados REAIS:
sensor ESP32 (ThingSpeak), Open-Meteo (observação e previsão), banco de dados (MySQL) e produção IBGE/PAM (cache local)."""
import asyncio
import csv
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx

from ..clients import open_meteo, thingspeak
from ..config import Settings
from . import adm, produtor, qualidade, tratamento

PASTA_CACHE = Path(__file__).resolve().parents[2] / ".cache"
CAMPOS_PAM = ("area_ha", "producao_t", "rendimento_kg_ha")


def _pct(parte: int, todo: int) -> float | None:
    return round(100 * parte / todo, 1) if todo else None


def _quanto(minutos: float) -> str:
    if minutos < 60:
        return f"{round(minutos)} min"
    h = minutos / 60
    return f"{round(h)} h" if h < 48 else f"{round(h / 24)} dias"


def _num(v) -> bool:
    try:
        n = float(str(v).replace(",", "."))
    except (TypeError, ValueError):
        return False
    return n == n


def _banco(obter_engine) -> dict:
    """Pinga o MySQL e conta os registros de log das últimas 24 h (roda em thread: é bloqueante)."""
    from sqlalchemy import text
    from ..db import BancoNaoConfigurado
    t0 = time.perf_counter()
    try:
        with obter_engine().connect() as c:
            c.execute(text("SELECT 1"))
            ms = round((time.perf_counter() - t0) * 1000)
            try:
                n = c.execute(text("SELECT COUNT(*) FROM log_sistema WHERE data_hora >= NOW() - INTERVAL 24 HOUR")).scalar()
            except Exception:
                n = None
        return {"ok": True, "ms": ms, "log24h": n, "erro": None}
    except BancoNaoConfigurado as e:
        return {"ok": False, "ms": None, "log24h": None, "erro": str(e)}
    except Exception as e:   # nunca expõe host/senha na mensagem
        return {"ok": False, "ms": None, "log24h": None, "erro": f"Banco inacessível ({type(e).__name__})"}


def _pam() -> dict | None:
    """Completude dos CSVs de produção do IBGE (PAM) guardados em Backend/.cache."""
    arquivos = sorted(PASTA_CACHE.glob("pam_*.csv"))
    celulas = preenchidas = 0
    detalhes, mtime = [], 0.0
    for arq in arquivos:
        try:
            with arq.open(encoding="utf-8", newline="") as f:
                linhas = list(csv.DictReader(f))
            mtime = max(mtime, arq.stat().st_mtime)
        except (OSError, UnicodeDecodeError, csv.Error):
            continue
        anos = [int(l["ano"]) for l in linhas if str(l.get("ano", "")).strip().isdigit()]
        for l in linhas:
            for campo in CAMPOS_PAM:
                celulas += 1
                preenchidas += _num(l.get(campo))
        partes = arq.stem.split("_")
        produto = partes[1] if len(partes) > 1 else arq.stem
        detalhes.append(f"{produto}: {min(anos)}–{max(anos)}" if anos else produto)
    if not celulas:
        return None
    return {"valor": _pct(preenchidas, celulas), "detalhe": " · ".join(detalhes), "arquivos": len(detalhes),
            "atualizado": datetime.fromtimestamp(mtime, tz=timezone.utc)}


async def montar(http: httpx.AsyncClient, cfg: Settings, obter_engine, agora: datetime | None = None) -> dict:
    agora = (agora or datetime.now(timezone.utc)).astimezone(timezone.utc)
    r_ts, r_obs, r_prev, banco = await asyncio.gather(
        thingspeak.buscar_feeds(http, cfg), open_meteo.buscar_observacoes(http, cfg, agora),
        open_meteo.buscar_previsao(http, cfg), asyncio.to_thread(_banco, obter_engine),
        return_exceptions=True)
    esperados_tipos = {0: thingspeak.ThingSpeakErro, 1: open_meteo.OpenMeteoErro, 2: open_meteo.OpenMeteoErro}
    for i, r in enumerate((r_ts, r_obs, r_prev)):   # bug inesperado não pode virar "fonte indisponível"
        if isinstance(r, Exception) and not isinstance(r, esperados_tipos[i]):
            raise r
    if isinstance(banco, Exception):
        raise banco
    ts_erro = str(r_ts) if isinstance(r_ts, Exception) else None
    obs_erro = str(r_obs) if isinstance(r_obs, Exception) else None
    prev_erro = str(r_prev) if isinstance(r_prev, Exception) else None
    inicio24 = agora - timedelta(hours=24)

    # ---------- sensor ESP32 (ThingSpeak) ----------
    qual, ultima, minutos, validas24, desc24 = None, None, None, 0, 0
    if not ts_erro:
        leituras = tratamento.interpretar_feeds(r_ts, cfg.thingspeak_campo_temp, cfg.thingspeak_campo_umid)
        trat = tratamento.tratar(leituras)
        t24 = tratamento.tratar([l for l in leituras if l.momento >= inicio24])
        validas24 = len(t24.validas)
        desc24 = t24.invalidas + t24.incompletas + t24.duplicadas
        ultima = trat.validas[-1] if trat.validas else None
        minutos = (agora - ultima.momento).total_seconds() / 60 if ultima else None
        qual = qualidade.calcular(trat, agora)

    # ---------- Open-Meteo: observação (24 h) e previsão (7 dias) ----------
    obs24, integ_obs, validos_obs = [], None, 0
    if not obs_erro:
        h0 = adm._hora(agora)
        horas = {h0 - timedelta(hours=i) for i in range(24)}
        obs24 = [o for o in r_obs if o.momento in horas]
        validos_obs = sum(adm._valido("temperatura", o.temperatura) + adm._valido("umidade", o.umidade)
                          + adm._valido("chuva", o.chuva_mm) for o in obs24)
        integ_obs = _pct(validos_obs, 24 * adm.VARIAVEIS)
    dias, integ_prev = [], None
    if not prev_erro:
        dias = produtor.montar_dias(r_prev)
        campos = ("tmax", "tmin", "chuva_mm", "prob_chuva", "umidade_media")
        integ_prev = _pct(sum(d[c] is not None for d in dias for c in campos), len(dias) * len(campos))

    pam = _pam()

    # ---------- qualidade por fonte ----------
    q_itens = [
        {"id": "sensor", "nome": "Sensor ESP32 (ThingSpeak)", "valor": qual["geral"] if qual else None,
         "detalhe": ts_erro or (qual["rotulo"] if qual else "Sem dados")},
        {"id": "clima", "nome": "Clima observado (Open-Meteo)", "valor": integ_obs,
         "detalhe": obs_erro or f"{len(obs24)} de 24 horas recebidas"},
        {"id": "previsao", "nome": "Previsão 7 dias (Open-Meteo)", "valor": integ_prev,
         "detalhe": prev_erro or f"{len(dias)} dias carregados"},
        {"id": "producao", "nome": "Produção agrícola (IBGE/PAM)", "valor": pam["valor"] if pam else None,
         "detalhe": pam["detalhe"] if pam else "Sem cache local (rode o treino dos modelos)"},
    ]
    valores = [i["valor"] for i in q_itens if i["valor"] is not None]
    integ_geral = round(sum(valores) / len(valores), 1) if valores else None
    rotulo = (None if integ_geral is None else "Excelente" if integ_geral >= 98 else "Boa" if integ_geral >= 90
              else "Regular" if integ_geral >= 70 else "Baixa")

    # ---------- fontes ----------
    if ts_erro:
        esp = ("Offline", ts_erro)
    elif minutos is None:
        esp = ("Offline", "Nenhuma leitura recebida")
    elif minutos > cfg.thingspeak_offline_min:
        esp = ("Offline", f"Última leitura há {_quanto(minutos)}")
    else:
        esp = ("Online", f"Última leitura há {_quanto(minutos)}")
    fontes = [
        {"id": "esp32", "sigla": "ESP", "nome": "ESP32", "descricao": "Sensores climáticos", "estado": esp[0], "detalhe": esp[1]},
        {"id": "thingspeak", "sigla": "TS", "nome": "ThingSpeak", "descricao": "Dados ambientais",
         "estado": "Offline" if ts_erro else "Online", "detalhe": ts_erro or "API respondendo"},
        {"id": "banco", "sigla": "BD", "nome": "Banco de dados", "descricao": "MySQL (Railway)",
         "estado": "Online" if banco["ok"] else "Offline",
         "detalhe": banco["erro"] or f"Resposta em {banco['ms']} ms"},
        {"id": "om_obs", "sigla": "OM", "nome": "Open-Meteo · observação", "descricao": "Clima das últimas 24 h",
         "estado": "Offline" if obs_erro else "Online", "detalhe": obs_erro or "API respondendo"},
        {"id": "om_prev", "sigla": "OM", "nome": "Open-Meteo · previsão", "descricao": "Previsão de 7 dias",
         "estado": "Offline" if prev_erro else "Online", "detalhe": prev_erro or "API respondendo"},
        {"id": "pam", "sigla": "IBGE", "nome": "IBGE · PAM", "descricao": "Produção agrícola (cache)",
         "estado": "Online" if pam else "Sem cache", "detalhe": pam["detalhe"] if pam else "Arquivos não encontrados"},
    ]
    online = sum(f["estado"] == "Online" for f in fontes)

    # ---------- dados com atenção ----------
    atencao = []
    if ts_erro:
        atencao.append(f"ThingSpeak indisponível: {ts_erro}")
    elif esp[0] == "Offline":
        atencao.append(f"ESP32 sem enviar dados ({esp[1].lower()})")
    if desc24:
        atencao.append(f"{desc24} leitura(s) do sensor descartada(s) na limpeza em 24 h")
    if not obs_erro and validos_obs < 24 * adm.VARIAVEIS:
        atencao.append(f"{24 * adm.VARIAVEIS - validos_obs} ponto(s) do Open-Meteo sem valor válido em 24 h")
    for f in fontes:
        if f["estado"] != "Online" and f["id"] not in ("esp32", "thingspeak"):
            atencao.append(f"{f['nome']}: {f['estado'].lower()}")

    # ---------- processamento recente ----------
    iso = agora.isoformat()
    ev = []
    if ultima:
        ev.append({"tipo": "sensor", "titulo": "Leituras do ESP32 processadas",
                   "descricao": f"{validas24} leitura(s) válida(s) em 24 h · última às {adm._local(ultima.momento)}",
                   "quando": ultima.momento.isoformat()})
    if not obs_erro:
        ev.append({"tipo": "clima", "titulo": "Clima observado sincronizado",
                   "descricao": f"{validos_obs} pontos válidos do Open-Meteo nas últimas 24 h", "quando": iso})
    if not prev_erro:
        ev.append({"tipo": "previsao", "titulo": "Previsão sincronizada",
                   "descricao": f"{len(dias)} dias de previsão carregados do Open-Meteo", "quando": iso})
    if banco["ok"]:
        extra = f" · {banco['log24h']} registro(s) de log em 24 h" if banco["log24h"] is not None else ""
        ev.append({"tipo": "banco", "titulo": "Banco de dados verificado",
                   "descricao": f"Resposta em {banco['ms']} ms{extra}", "quando": iso})
    if pam:
        ev.append({"tipo": "producao", "titulo": "Produção IBGE carregada",
                   "descricao": f"{pam['arquivos']} arquivo(s) em cache · {pam['detalhe']}", "quando": pam["atualizado"].isoformat()})
    if desc24:
        ev.append({"tipo": "alerta", "titulo": "Limpeza de dados do sensor",
                   "descricao": f"{desc24} leitura(s) descartada(s) (duplicadas, incompletas ou fora da faixa)", "quando": iso})
    ev.sort(key=lambda e: e["quando"], reverse=True)

    return {
        "atualizado_em": iso,
        "geral": "ok" if online == len(fontes) else "parcial",
        "cards": {
            "processados": {"valor": validas24 + validos_obs, "sensor": validas24, "clima": validos_obs},
            "integridade": {"valor": integ_geral, "rotulo": rotulo},
            "fontes": {"online": online, "total": len(fontes)},
            "atencao": {"valor": len(atencao), "itens": atencao},
        },
        "sensor": {"ultima_leitura": ultima.momento.isoformat() if ultima else None,
                   "minutos_sem_dados": round(minutos) if minutos is not None else None},
        "qualidade": q_itens,
        "fontes": fontes,
        "atividades": ev[:6],
    }
