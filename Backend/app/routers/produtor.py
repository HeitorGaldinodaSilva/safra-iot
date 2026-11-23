from datetime import date
from typing import Literal

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from ..auth import exigir_perfil_produtor, get_http
from ..clients import bcb
from ..clients.open_meteo import OpenMeteoErro
from ..config import Settings, get_settings
from ..services import alertas_produtor, exportacao, financeiro, lavouras, lotes, produtor, relatorios

router = APIRouter(prefix="/produtor", tags=["Produtor"], dependencies=[Depends(exigir_perfil_produtor)])


@router.get("/clima", summary="Clima e previsão da dashboard do Produtor (Open-Meteo)")
async def clima(http: httpx.AsyncClient = Depends(get_http), cfg: Settings = Depends(get_settings)):
    try:
        return await produtor.montar(http, cfg)
    except OpenMeteoErro as e:
        raise HTTPException(503, str(e))


@router.get("/resumo", summary="Cards da tela Inicial: área, produção, receita e produtividade (IBGE PAM + ComexStat)")
def resumo(cfg: Settings = Depends(get_settings)):
    # def (não async): lê CSV/baixa dados abertos, trabalho bloqueante que roda no pool de threads
    return produtor.resumo(cfg)


@router.get("/lavouras", summary="Tela Lavouras: fase do ciclo, clima e solo de cada talhão (Open-Meteo)")
async def lista_lavouras(http: httpx.AsyncClient = Depends(get_http), cfg: Settings = Depends(get_settings)):
    try:
        return await lavouras.montar(http, cfg)
    except OpenMeteoErro as e:
        raise HTTPException(503, str(e))


class LavouraIn(BaseModel):
    nome: str = Field(min_length=2, max_length=60)
    talhao: str | None = Field(default=None, max_length=40)
    tipo: Literal["mesa", "vinho"] = "mesa"
    area_ha: float = Field(gt=0, le=100_000)
    t_ha: float = Field(gt=0, le=200)
    ciclo_inicio: date
    gdd_alvo: int = Field(default=1800, ge=500, le=4000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)


@router.post("/lavouras", status_code=201, summary="Cadastra uma nova lavoura (talhão) em lavouras.json")
def lavoura_criar(l: LavouraIn, cfg: Settings = Depends(get_settings)):
    d = l.model_dump()
    d["ciclo_inicio"] = l.ciclo_inicio.isoformat()
    try:
        return lavouras.criar(d, cfg.open_meteo_lat, cfg.open_meteo_lon)
    except ValueError as e:
        raise HTTPException(500, str(e))


@router.delete("/lavouras/{id_}", status_code=204, summary="Exclui uma lavoura")
def lavoura_excluir(id_: str):
    if not lavouras.excluir(id_):
        raise HTTPException(404, "Lavoura não encontrada")


# ---------------- Financeiro ----------------
class MovimentacaoIn(BaseModel):
    tipo: Literal["receita", "despesa"]
    categoria: str = Field(min_length=1, max_length=40)
    descricao: str = Field(min_length=1, max_length=120)
    detalhe: str | None = Field(default=None, max_length=120)
    data: date
    status: Literal["recebido", "pago", "pendente"]
    valor: float = Field(gt=0, le=1_000_000_000)


class StatusIn(BaseModel):
    status: Literal["recebido", "pago", "pendente"]


@router.get("/financeiro", summary="Tela Financeiro: cards, fluxo mensal, despesas por categoria e movimentações")
def financeiro_resumo(periodo: Literal["6m", "12m", "ano"] = "6m", todas: bool = False):
    try:
        return financeiro.resumo(periodo, limite=0 if todas else 8)
    except ValueError as e:
        raise HTTPException(500, str(e))


@router.post("/financeiro/movimentacoes", status_code=201, summary="Nova movimentação")
def financeiro_criar(m: MovimentacaoIn):
    try:
        return financeiro.criar(m.model_dump())
    except ValueError as e:
        raise HTTPException(422, str(e))


@router.patch("/financeiro/movimentacoes/{id_}/status", summary="Marca como recebido/pago/pendente")
def financeiro_status(id_: str, corpo: StatusIn):
    try:
        item = financeiro.alterar_status(id_, corpo.status)
    except ValueError as e:
        raise HTTPException(422, str(e))
    if item is None:
        raise HTTPException(404, "Movimentação não encontrada")
    return item


@router.delete("/financeiro/movimentacoes/{id_}", status_code=204, summary="Exclui uma movimentação")
def financeiro_excluir(id_: str):
    if not financeiro.excluir(id_):
        raise HTTPException(404, "Movimentação não encontrada")


@router.get("/financeiro/previsao", summary="Receita potencial da safra em R$ (ComexStat em US$ x PTAX do Banco Central)")
async def financeiro_previsao(http: httpx.AsyncClient = Depends(get_http), cfg: Settings = Depends(get_settings)):
    r = await run_in_threadpool(produtor.resumo, cfg)
    rec = r.get("receita")
    if not rec:
        raise HTTPException(503, (r.get("fontes", {}).get("comex") or {}).get("erro") or "Receita potencial indisponível")
    try:
        c = await bcb.ptax(http)
    except bcb.CambioErro as e:
        raise HTTPException(503, str(e))
    return {"ano": rec["ano"], "usd": rec["usd"], "preco_usd_kg": rec["preco_usd_kg"], "cambio": c["brl_por_usd"],
            "cambio_data": c["data"], "brl": round(rec["usd"] * c["brl_por_usd"])}


# ---------------- Relatórios ----------------
@router.get("/relatorios", summary="Tela Relatórios: produção (IBGE PAM), exportação/destinos/preço (ComexStat), câmbio (BCB) e financeiro")
async def relatorios_resumo(http: httpx.AsyncClient = Depends(get_http), cfg: Settings = Depends(get_settings)):
    # O clima da aba "Clima" (Open-Meteo) continua em GET /produtor/clima.
    return await relatorios.montar(http, cfg)


# ---------------- Exportação ----------------
@router.get("/exportacao", summary="Tela Exportação: lotes (talhões), destinos, preço e clima (ComexStat + PTAX + Open-Meteo)")
async def exportacao_resumo(http: httpx.AsyncClient = Depends(get_http), cfg: Settings = Depends(get_settings)):
    return await exportacao.montar(http, cfg)


# ---------------- Alertas ----------------
@router.get("/alertas", summary="Tela Alertas: clima, produção e exportação (Open-Meteo + ComexStat + PTAX + lavouras)")
async def alertas_resumo(http: httpx.AsyncClient = Depends(get_http), cfg: Settings = Depends(get_settings)):
    return await alertas_produtor.montar(http, cfg)


class LoteIn(BaseModel):
    produto: Literal["Uva", "Manga", "Vinho"]
    variedade: str | None = Field(default=None, max_length=60)
    volume_ton: float = Field(gt=0, le=100_000)
    destino: str | None = Field(default=None, max_length=60)
    regiao: Literal["Europa", "Estados Unidos", "Canadá", "Ásia", "Oriente Médio", "América Latina", "Outros"] | None = None
    status: Literal["programado", "andamento", "concluido"] = "programado"
    embarque: date | None = None
    preco_brl_kg: float | None = Field(default=None, gt=0, le=10_000)


@router.post("/exportacao/lotes", status_code=201, summary="Cadastra um novo lote de exportação")
def lote_criar(l: LoteIn):
    d = l.model_dump()
    d["embarque"] = l.embarque.isoformat() if l.embarque else None
    try:
        return lotes.criar(d)
    except ValueError as e:
        raise HTTPException(500, str(e))


@router.delete("/exportacao/lotes/{id_}", status_code=204, summary="Exclui um lote cadastrado")
def lote_excluir(id_: str):
    if not lotes.excluir(id_):
        raise HTTPException(404, "Lote não encontrado")
