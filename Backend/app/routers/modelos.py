import logging

from fastapi import APIRouter, Depends
from sqlalchemy.exc import SQLAlchemyError

from ..auth import exigir_perfil
from ..config import Settings, get_settings
from ..db import BancoNaoConfigurado, get_engine_dep
from ..services import modelos

router = APIRouter(prefix="/analista", tags=["Analista"], dependencies=[Depends(exigir_perfil)])
log = logging.getLogger("safra.modelos")


def _vazio(erro: str) -> dict:
    return {"ok": False, "erro": erro, "gerado_em": None, "resumo": None, "modelos": []}


@router.get("/modelos", summary="Registro dos modelos (métricas reais dos treinos)")
def listar_modelos(cfg: Settings = Depends(get_settings), obter_engine=Depends(get_engine_dep)):
    # def (e não async def): a consulta ao banco é bloqueante e roda no pool de threads do FastAPI
    try:
        return modelos.montar(obter_engine(), cfg)
    except BancoNaoConfigurado as e:
        return _vazio(str(e))
    except SQLAlchemyError as e:
        log.warning("registro de modelos indisponível: %s", e)
        return _vazio("Registro de modelos indisponível. Se for a primeira vez, rode: python -m app.ml.treinar")
