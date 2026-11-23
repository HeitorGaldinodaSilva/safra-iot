"""Escolhe a fonte de clima: INMET (estação) se houver token; senão, ou se falhar, Open-Meteo (modelo)."""
from datetime import datetime

import httpx

from ..config import Settings
from . import inmet, open_meteo


class ClimaIndisponivel(Exception):
    pass


async def buscar(http: httpx.AsyncClient, cfg: Settings, agora: datetime) -> tuple[list, dict]:
    """Devolve (observações, descrição da fonte usada)."""
    aviso = None
    try:
        return (await inmet.buscar_observacoes(http, cfg, agora),
                {"id": "inmet", "rotulo": f"INMET {cfg.inmet_estacao}", "tipo": "estação", "aviso": None})
    except inmet.InmetErro as e:
        aviso = str(e)
    try:
        obs = await open_meteo.buscar_observacoes(http, cfg, agora)
    except open_meteo.OpenMeteoErro as e:
        raise ClimaIndisponivel(f"{aviso} · {e}") from e
    return obs, {"id": "open_meteo", "rotulo": "Open-Meteo", "tipo": "modelo", "aviso": aviso}
