"""API REST de leituras do ESP32 (trabalho final - Etapas 2 e 3).

  POST /api/leituras          recebe uma medição (ESP32, protegida por X-API-Key)
  GET  /api/leituras          histórico, com filtro por período
  GET  /api/leituras/ultima   última leitura (+ indicador de comunicação)
  GET  /api/dispositivos      dispositivos que já enviaram dados
  GET  /api/status            disponibilidade da API e do banco (pública)

O banco é acessado só por aqui (o navegador nunca fala com o MySQL).
Configuração por variável de ambiente (.env):
  ESP32_API_KEY        chave que o ESP32 envia no cabeçalho X-API-Key (obrigatória p/ o POST)
  LEITURAS_OFFLINE_MIN minutos sem dados para considerar o ESP32 offline (padrão 5)
"""
import hmac
import logging
import os
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from ..auth import _validar, get_http
from ..config import Settings, get_settings
from ..db import BancoNaoConfigurado, get_engine_dep

router = APIRouter(prefix="/api", tags=["Leituras ESP32"])
log = logging.getLogger("safra.leituras")

_RECIFE = ZoneInfo("America/Recife")
_PERIODOS = {"24h": timedelta(hours=24), "7d": timedelta(days=7), "30d": timedelta(days=30)}

_DDL = """
CREATE TABLE IF NOT EXISTS leituras (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id   VARCHAR(50)  NOT NULL,
  temperatura DECIMAL(5,2) NOT NULL,
  umidade     DECIMAL(5,2) NOT NULL,
  criado_em   DATETIME(3)  NOT NULL,            -- sempre em UTC
  INDEX idx_leituras_dispositivo_data (device_id, criado_em),
  INDEX idx_leituras_data (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""
_DDL_ALERTAS = """
CREATE TABLE IF NOT EXISTS alertas_leituras (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id    VARCHAR(50)  NOT NULL,
  leitura_id   BIGINT       NOT NULL,
  tipo         VARCHAR(30)  NOT NULL,           -- temperatura_alta | umidade_baixa | umidade_alta
  valor        DECIMAL(5,2) NOT NULL,
  limite_valor DECIMAL(5,2) NOT NULL,
  criado_em    DATETIME(3)  NOT NULL,
  INDEX idx_alertas_data (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""
_DDL_LIMITES = """
CREATE TABLE IF NOT EXISTS limites_alertas (
  id        TINYINT PRIMARY KEY,
  temp_max  DECIMAL(5,2) NOT NULL,
  umid_min  DECIMAL(5,2) NOT NULL,
  umid_max  DECIMAL(5,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""
_LIM_PADRAO = {"temp_max": 30.0, "umid_min": 40.0, "umid_max": 80.0}
_tabela_pronta = False


# ------------------------------------------------------------------ segurança
def exigir_chave_esp32(x_api_key: str | None = Header(default=None)) -> None:
    """O ESP32 não tem login: ele prova quem é com uma chave no cabeçalho X-API-Key."""
    esperado = (os.getenv("ESP32_API_KEY") or "").strip()
    if not esperado:
        raise HTTPException(503, "ESP32_API_KEY não está configurada no servidor (.env).")
    if not x_api_key or not hmac.compare_digest(x_api_key.encode(), esperado.encode()):
        raise HTTPException(401, "Chave de API inválida.")


async def exigir_sessao(authorization: str | None = Header(default=None),
                        cfg: Settings = Depends(get_settings),
                        http: httpx.AsyncClient = Depends(get_http)) -> None:
    """Consultas: qualquer usuário logado no Safra (analista, produtor ou administrador)."""
    if (os.getenv("LEITURAS_GET_PUBLICO") or "").strip().lower() == "true":
        return   # modo demonstração: consultas abertas (o POST do ESP32 continua com chave)
    await _validar(authorization, cfg, http, cfg.perfis_permitidos | cfg.perfis_produtor | cfg.perfis_adm)


# ------------------------------------------------------------------ validação
class LeituraIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    device_id: str = Field(pattern=r"^[A-Za-z0-9_.-]{1,50}$", examples=["ESP32_01"])
    temperatura: float = Field(ge=-40, le=80, allow_inf_nan=False, examples=[28.5])   # faixa do DHT22
    umidade: float = Field(ge=0, le=100, allow_inf_nan=False, examples=[65.2])


# ------------------------------------------------------------------ banco
def _garantir_tabela(eng) -> None:
    global _tabela_pronta
    if _tabela_pronta:
        return
    with eng.begin() as con:
        for ddl in (_DDL, _DDL_ALERTAS, _DDL_LIMITES):
            con.execute(text(ddl))
    _tabela_pronta = True


@contextmanager
def _banco(obter_engine):
    try:
        eng = obter_engine()
        _garantir_tabela(eng)
        yield eng
    except BancoNaoConfigurado as e:
        raise HTTPException(503, str(e))
    except SQLAlchemyError as e:
        log.warning("banco indisponível: %s", e)
        raise HTTPException(503, "Banco de dados indisponível. Tente novamente em instantes.")


def _limites(con) -> dict:
    r = con.execute(text("SELECT temp_max, umid_min, umid_max FROM limites_alertas WHERE id = 1")).mappings().first()
    return {k: float(r[k]) for k in _LIM_PADRAO} if r else dict(_LIM_PADRAO)


def _violacoes(temp: float, umid: float, lim: dict) -> list:
    v = []
    if temp > lim["temp_max"]:
        v.append(("temperatura_alta", temp, lim["temp_max"]))
    if umid < lim["umid_min"]:
        v.append(("umidade_baixa", umid, lim["umid_min"]))
    if umid > lim["umid_max"]:
        v.append(("umidade_alta", umid, lim["umid_max"]))
    return v


_MSG = {"temperatura_alta": "Temperatura elevada: {v:.1f} °C (máx. {l:g} °C)",
        "umidade_baixa": "Umidade baixa: {v:.1f} % (mín. {l:g} %)",
        "umidade_alta": "Umidade alta: {v:.1f} % (máx. {l:g} %)"}


def _utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc)


def _agora() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _serializar(r) -> dict:
    dt = _utc(r["criado_em"])
    return {
        "id": r["id"],
        "device_id": r["device_id"],
        "temperatura": float(r["temperatura"]),
        "umidade": float(r["umidade"]),
        "data_hora": dt.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "data_hora_local": dt.astimezone(_RECIFE).strftime("%d/%m/%Y %H:%M"),
    }


def _comunicacao(ultima: datetime | None) -> dict:
    """Indicador de última comunicação: quanto tempo faz e se o ESP32 ainda está enviando."""
    if ultima is None:
        return {"segundos_desde_ultima": None, "online": False}
    limite = float(os.getenv("LEITURAS_OFFLINE_MIN", "5")) * 60
    seg = max(0, int((_agora() - ultima).total_seconds()))
    return {"segundos_desde_ultima": seg, "online": seg <= limite}


def _momento(valor: str, fim: bool) -> datetime:
    """AAAA-MM-DD ou AAAA-MM-DDTHH:MM[:SS]. Sem fuso = horário de Recife. Devolve UTC sem tzinfo."""
    v = valor.strip().replace("Z", "+00:00")
    try:
        if len(v) == 10:
            d = date.fromisoformat(v)
            dt = datetime(d.year, d.month, d.day, tzinfo=_RECIFE)
            if fim:
                dt += timedelta(days=1) - timedelta(milliseconds=1)
        else:
            dt = datetime.fromisoformat(v)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=_RECIFE)
    except ValueError:
        raise HTTPException(422, f"Data inválida: '{valor}'. Use AAAA-MM-DD ou AAAA-MM-DDTHH:MM.")
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


# ------------------------------------------------------------------ rotas
@router.post("/leituras", status_code=201, summary="Receber uma medição do ESP32",
             dependencies=[Depends(exigir_chave_esp32)])
def receber_leitura(dados: LeituraIn, obter_engine=Depends(get_engine_dep)):
    agora = _agora()
    with _banco(obter_engine) as eng:
        with eng.begin() as con:
            res = con.execute(
                text("INSERT INTO leituras (device_id, temperatura, umidade, criado_em) "
                     "VALUES (:d, :t, :u, :c)"),
                {"d": dados.device_id, "t": dados.temperatura, "u": dados.umidade, "c": agora})
            novo_id = res.lastrowid
            disparados = _violacoes(dados.temperatura, dados.umidade, _limites(con))
            for tipo, valor, limite in disparados:      # registra cada alerta gerado
                con.execute(text("INSERT INTO alertas_leituras (device_id, leitura_id, tipo, valor, limite_valor, criado_em) "
                                 "VALUES (:d, :l, :t, :v, :m, :c)"),
                            {"d": dados.device_id, "l": novo_id, "t": tipo, "v": valor, "m": limite, "c": agora})
    return {"sucesso": True, "alertas": [t for t, _, _ in disparados], "leitura": _serializar({
        "id": novo_id, "device_id": dados.device_id, "temperatura": dados.temperatura,
        "umidade": dados.umidade, "criado_em": agora})}


@router.get("/leituras", summary="Histórico de medições (filtro por período)",
            dependencies=[Depends(exigir_sessao)])
def listar_leituras(
    device_id: str | None = Query(None, max_length=50),
    periodo: Literal["24h", "7d", "30d"] | None = Query(None, description="Atalho: últimas 24h, 7 dias ou 30 dias"),
    inicio: str | None = Query(None, description="AAAA-MM-DD ou AAAA-MM-DDTHH:MM"),
    fim: str | None = Query(None, description="AAAA-MM-DD ou AAAA-MM-DDTHH:MM"),
    limite: int = Query(500, ge=1, le=5000),
    ordem: Literal["asc", "desc"] = Query("desc"),
    obter_engine=Depends(get_engine_dep),
):
    ini = fi = None
    if inicio or fim:                      # datas explícitas têm prioridade sobre "periodo"
        ini = _momento(inicio, False) if inicio else None
        fi = _momento(fim, True) if fim else None
        if ini and fi and ini > fi:
            raise HTTPException(422, "'inicio' deve ser anterior a 'fim'.")
    elif periodo:
        ini = _agora() - _PERIODOS[periodo]

    onde, p = [], {}
    if device_id:
        onde.append("device_id = :d"); p["d"] = device_id
    if ini:
        onde.append("criado_em >= :ini"); p["ini"] = ini
    if fi:
        onde.append("criado_em <= :fim"); p["fim"] = fi
    clausula = ("WHERE " + " AND ".join(onde)) if onde else ""

    with _banco(obter_engine) as eng, eng.connect() as con:
        r = con.execute(text(
            "SELECT COUNT(*) AS n, MIN(temperatura) AS tmin, MAX(temperatura) AS tmax, AVG(temperatura) AS tavg, "
            f"MIN(umidade) AS umin, MAX(umidade) AS umax, AVG(umidade) AS uavg FROM leituras {clausula}"), p).mappings().one()
        linhas = con.execute(text(
            f"SELECT id, device_id, temperatura, umidade, criado_em FROM leituras {clausula} "
            f"ORDER BY criado_em {ordem}, id {ordem} LIMIT :lim"), {**p, "lim": limite}).mappings().all()

    def _n(v):
        return None if v is None else round(float(v), 2)

    return {
        "total": int(r["n"]),
        "retornadas": len(linhas),
        "resumo": {"temperatura": {"min": _n(r["tmin"]), "max": _n(r["tmax"]), "media": _n(r["tavg"])},
                   "umidade": {"min": _n(r["umin"]), "max": _n(r["umax"]), "media": _n(r["uavg"])}},
        "leituras": [_serializar(x) for x in linhas],
    }


@router.get("/leituras/ultima", summary="Última leitura recebida", dependencies=[Depends(exigir_sessao)])
def ultima_leitura(device_id: str | None = Query(None, max_length=50), obter_engine=Depends(get_engine_dep)):
    filtro = "WHERE device_id = :d" if device_id else ""
    with _banco(obter_engine) as eng, eng.connect() as con:
        r = con.execute(text(
            f"SELECT id, device_id, temperatura, umidade, criado_em FROM leituras {filtro} "
            "ORDER BY criado_em DESC, id DESC LIMIT 1"), {"d": device_id} if device_id else {}).mappings().first()
    if r is None:
        raise HTTPException(404, "Nenhuma leitura registrada ainda.")
    return {**_serializar(r), **_comunicacao(r["criado_em"])}


@router.get("/dispositivos", summary="Listar dispositivos", dependencies=[Depends(exigir_sessao)])
def listar_dispositivos(obter_engine=Depends(get_engine_dep)):
    with _banco(obter_engine) as eng, eng.connect() as con:
        linhas = con.execute(text(
            "SELECT device_id, COUNT(*) AS total, MIN(criado_em) AS primeira, MAX(criado_em) AS ultima "
            "FROM leituras GROUP BY device_id ORDER BY ultima DESC")).mappings().all()
    fmt = lambda dt: _utc(dt).isoformat(timespec="seconds").replace("+00:00", "Z")
    return {"dispositivos": [
        {"device_id": x["device_id"], "total_leituras": int(x["total"]),
         "primeira_leitura": fmt(x["primeira"]), "ultima_leitura": fmt(x["ultima"]),
         **_comunicacao(x["ultima"])} for x in linhas]}


@router.get("/status", summary="Disponibilidade da API e do banco")
def status(obter_engine=Depends(get_engine_dep)):
    banco, total, ultima = "ok", None, None
    try:
        eng = obter_engine()
        _garantir_tabela(eng)
        with eng.connect() as con:
            r = con.execute(text("SELECT COUNT(*) AS n, MAX(criado_em) AS u FROM leituras")).mappings().one()
        total = int(r["n"])
        ultima = _utc(r["u"]).isoformat(timespec="seconds").replace("+00:00", "Z") if r["u"] else None
    except (BancoNaoConfigurado, SQLAlchemyError) as e:
        log.warning("status: banco indisponível: %s", e)
        banco = "indisponivel"
    return {"api": "ok", "banco": banco, "total_leituras": total, "ultima_leitura": ultima,
            "hora_servidor": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")}


class LimitesIn(BaseModel):
    temp_max: float = Field(ge=-40, le=80, allow_inf_nan=False)
    umid_min: float = Field(ge=0, le=100, allow_inf_nan=False)
    umid_max: float = Field(ge=0, le=100, allow_inf_nan=False)


@router.get("/limites", summary="Limites de alerta configurados", dependencies=[Depends(exigir_sessao)])
def ler_limites(obter_engine=Depends(get_engine_dep)):
    with _banco(obter_engine) as eng, eng.connect() as con:
        return _limites(con)


@router.put("/limites", summary="Definir limites de alerta", dependencies=[Depends(exigir_sessao)])
def salvar_limites(dados: LimitesIn, obter_engine=Depends(get_engine_dep)):
    if dados.umid_min >= dados.umid_max:
        raise HTTPException(422, "A umidade mínima deve ser menor que a máxima.")
    with _banco(obter_engine) as eng, eng.begin() as con:
        con.execute(text("INSERT INTO limites_alertas (id, temp_max, umid_min, umid_max) VALUES (1, :t, :a, :b) "
                         "ON DUPLICATE KEY UPDATE temp_max = :t, umid_min = :a, umid_max = :b"),
                    {"t": dados.temp_max, "a": dados.umid_min, "b": dados.umid_max})
    return dados.model_dump()


@router.get("/alertas", summary="Alertas registrados", dependencies=[Depends(exigir_sessao)])
def listar_alertas(periodo: Literal["24h", "7d", "30d"] | None = Query(None),
                   limite: int = Query(100, ge=1, le=1000), obter_engine=Depends(get_engine_dep)):
    p = {"lim": limite}
    onde = ""
    if periodo:
        onde = "WHERE criado_em >= :ini"; p["ini"] = _agora() - _PERIODOS[periodo]
    with _banco(obter_engine) as eng, eng.connect() as con:
        total = con.execute(text(f"SELECT COUNT(*) FROM alertas_leituras {onde}"), p).scalar()
        linhas = con.execute(text(f"SELECT id, device_id, leitura_id, tipo, valor, limite_valor, criado_em "
                                  f"FROM alertas_leituras {onde} ORDER BY criado_em DESC, id DESC LIMIT :lim"), p).mappings().all()
    return {"total": int(total), "alertas": [
        {"id": x["id"], "device_id": x["device_id"], "leitura_id": x["leitura_id"], "tipo": x["tipo"],
         "mensagem": _MSG[x["tipo"]].format(v=float(x["valor"]), l=float(x["limite_valor"])),
         "data_hora": _utc(x["criado_em"]).isoformat(timespec="seconds").replace("+00:00", "Z"),
         "data_hora_local": _utc(x["criado_em"]).astimezone(_RECIFE).strftime("%d/%m/%Y %H:%M")} for x in linhas]}
