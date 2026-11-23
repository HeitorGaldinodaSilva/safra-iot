"""Cotação do dólar (PTAX, venda) do Banco Central - API aberta, sem chave."""
from datetime import date, timedelta

import httpx

from .. import cache

URL = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)"


class CambioErro(Exception):
    pass


async def ptax(http: httpx.AsyncClient) -> dict:
    """Última PTAX de venda disponível (volta até 7 dias: fins de semana e feriados não têm cotação)."""

    async def _buscar() -> dict:
        for recuo in range(0, 8):
            d = date.today() - timedelta(days=recuo)
            try:
                r = await http.get(URL, params={"@dataCotacao": f"'{d.strftime('%m-%d-%Y')}'", "$top": 1, "$format": "json"})
            except httpx.HTTPError as e:
                raise CambioErro(f"Banco Central inacessível ({type(e).__name__})") from e
            if r.status_code != 200:
                raise CambioErro(f"Banco Central respondeu {r.status_code}")
            try:
                itens = r.json().get("value") or []
            except ValueError as e:
                raise CambioErro("Banco Central devolveu uma resposta que não é JSON") from e
            if itens and isinstance(itens[0].get("cotacaoVenda"), (int, float)):
                return {"brl_por_usd": float(itens[0]["cotacaoVenda"]), "data": d.isoformat()}
        raise CambioErro("Sem cotação PTAX nos últimos 7 dias")

    return await cache.obter("bcb:ptax", 3600, _buscar)
