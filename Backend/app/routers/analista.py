import httpx
from fastapi import APIRouter, Depends

from ..auth import exigir_perfil, get_http
from ..config import Settings, get_settings
from ..services import inicial

router = APIRouter(prefix="/analista", tags=["Analista"], dependencies=[Depends(exigir_perfil)])


@router.get("/inicial", summary="Dados da dashboard Analista > Inicial")
async def dashboard_inicial(http: httpx.AsyncClient = Depends(get_http), cfg: Settings = Depends(get_settings)):
    return await inicial.montar(http, cfg)
