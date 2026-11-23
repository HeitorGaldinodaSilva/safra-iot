import httpx
from fastapi import APIRouter, Depends, HTTPException

from ..auth import exigir_perfil_adm, get_http
from ..clients.open_meteo import OpenMeteoErro
from ..config import Settings, get_settings
from ..db import get_engine_dep
from ..services import adm, alertas, dados

router = APIRouter(prefix="/adm", tags=["Administrador"], dependencies=[Depends(exigir_perfil_adm)])


@router.get("/inicial", summary="Dados da dashboard Administrador > Inicial (Open-Meteo)")
async def dashboard_inicial(http: httpx.AsyncClient = Depends(get_http), cfg: Settings = Depends(get_settings)):
    try:
        return await adm.montar(http, cfg)
    except OpenMeteoErro as e:
        raise HTTPException(503, str(e))


@router.get("/dados", summary="Dados da dashboard Administrador > Dados (qualidade e fontes)")
async def dashboard_dados(http: httpx.AsyncClient = Depends(get_http), cfg: Settings = Depends(get_settings),
                          obter_engine=Depends(get_engine_dep)):
    return await dados.montar(http, cfg, obter_engine)


@router.get("/alertas", summary="Alertas ativos da dashboard Administrador (clima, fontes, segurança, usuários)")
async def dashboard_alertas(http: httpx.AsyncClient = Depends(get_http), cfg: Settings = Depends(get_settings),
                            obter_engine=Depends(get_engine_dep)):
    return await alertas.montar(http, cfg, obter_engine)
