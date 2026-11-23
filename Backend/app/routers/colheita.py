import json
import logging
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.exc import SQLAlchemyError

from ..auth import exigir_perfil
from ..config import Settings, get_settings
from ..db import BancoNaoConfigurado, get_engine_dep
from ..ml import colheita, dados, registro

router = APIRouter(prefix="/analista", tags=["Analista"], dependencies=[Depends(exigir_perfil)])
log = logging.getLogger("safra.colheita")


def _modelo(obter_engine) -> dict | None:
    try:
        for m in registro.listar(obter_engine()):
            if m["id"] == "colheita":
                return m
    except (BancoNaoConfigurado, SQLAlchemyError) as e:
        log.warning("registro indisponível ao estimar colheita: %s", e)
    return None


@router.get("/colheita", summary="Estimativa de colheita por graus-dia a partir da data da poda")
def estimar(poda: date = Query(..., description="Data da poda de produção (AAAA-MM-DD)"),
            cultivar: str | None = Query(None, description="syrah ou cabernet_sauvignon"),
            cfg: Settings = Depends(get_settings), obter_engine=Depends(get_engine_dep)):
    # def (não async): lê CSV/banco, trabalho bloqueante que roda no pool de threads
    cultivar = (cultivar or cfg.colheita_cultivar).lower()
    if cultivar not in colheita.CULTIVARES:
        raise HTTPException(422, f"Cultivar inválida. Use: {', '.join(colheita.CULTIVARES)}")
    try:
        d = dados.carregar_cache(cfg)
    except dados.DadosErro as e:
        return {"ok": False, "erro": str(e)}

    m = _modelo(obter_engine)
    erro_dias, resumo = None, None
    if m is not None and m["precisao"] is not None:
        try:
            params = json.loads(m["parametros"] or "{}")
        except ValueError:
            params = {}
        erro_dias = (params.get("por_cultivar", {}).get(cultivar) or {}).get("erro_p80_dias")
        resumo = {"status": m["status"], "precisao": m["precisao"], "versao_num": m["versao_num"]}
    try:
        r = colheita.estimar_colheita(d, poda, cultivar, date.today(), erro_dias)
    except colheita.ColheitaErro as e:
        return {"ok": False, "erro": str(e)}
    if resumo and resumo["status"] == "atencao":
        r["avisos"].append("O modelo de colheita está em atenção (não supera a linha de base): use a data como referência.")
    return {"ok": True, "erro": None, **r, "modelo": resumo}
