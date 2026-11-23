"""Cliente do INMET (estações automáticas).
Os dados horários observados exigem token (https://portal.inmet.gov.br).
Formato: /token/estacao/{AAAA-MM-DD}/{AAAA-MM-DD}/{COD}/{TOKEN}; horas em UTC."""
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

import httpx

from .. import cache
from ..config import Settings

BASE = "https://apitempo.inmet.gov.br"
TTL_SEGUNDOS = 600  # os dados são horários


class InmetErro(Exception):
    pass


class InmetNaoConfigurado(InmetErro):
    pass


@dataclass(frozen=True)
class ObservacaoClima:
    momento: datetime          # UTC, início da hora
    temperatura: float | None
    umidade: float | None
    chuva_mm: float | None


ObservacaoInmet = ObservacaoClima   # nome antigo, mantido por compatibilidade


def _num(v) -> float | None:
    if v is None or str(v).strip() == "":
        return None
    try:
        return float(str(v).replace(",", "."))
    except ValueError:
        return None


def interpretar(registros: list[dict]) -> list[ObservacaoClima]:
    saida = []
    for r in registros:
        try:
            dia = date.fromisoformat(str(r["DT_MEDICAO"]))
            hora = int(str(r["HR_MEDICAO"]).zfill(4)[:2])
        except (KeyError, ValueError):
            continue
        saida.append(ObservacaoClima(
            momento=datetime(dia.year, dia.month, dia.day, hora, tzinfo=timezone.utc),
            temperatura=_num(r.get("TEM_INS")),
            umidade=_num(r.get("UMD_INS")),
            chuva_mm=_num(r.get("CHUVA")),
        ))
    return sorted(saida, key=lambda o: o.momento)


async def buscar_observacoes(http: httpx.AsyncClient, cfg: Settings, agora: datetime) -> list[ObservacaoClima]:
    if not cfg.inmet_token:
        raise InmetNaoConfigurado("INMET_TOKEN não configurado (solicite em portal.inmet.gov.br)")

    fim = agora.astimezone(timezone.utc).date()
    inicio = fim - timedelta(days=1)
    url = f"{BASE}/token/estacao/{inicio.isoformat()}/{fim.isoformat()}/{cfg.inmet_estacao}/{cfg.inmet_token}"

    async def _buscar() -> list[ObservacaoClima]:
        try:
            r = await http.get(url)
        except httpx.HTTPError as e:
            raise InmetErro(f"INMET inacessível ({type(e).__name__})") from e
        if r.status_code in (401, 403):
            raise InmetErro("INMET recusou o token (verifique INMET_TOKEN)")
        if r.status_code != 200:
            raise InmetErro(f"INMET respondeu {r.status_code}")
        try:
            return interpretar(r.json() or [])
        except ValueError as e:
            raise InmetErro("INMET devolveu uma resposta que não é JSON") from e

    return await cache.obter(f"inmet:{cfg.inmet_estacao}:{fim}", TTL_SEGUNDOS, _buscar)
