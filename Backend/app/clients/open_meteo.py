"""Open-Meteo: dados horários de MODELO meteorológico para uma coordenada.
Gratuito e sem chave para uso não comercial (~10 mil chamadas/dia). Não é medição de estação."""
from datetime import datetime, timezone

import httpx

from .. import cache
from ..config import Settings
from .inmet import ObservacaoClima

URL = "https://api.open-meteo.com/v1/forecast"
TTL_SEGUNDOS = 600


class OpenMeteoErro(Exception):
    pass


def _g(lista: list, i: int) -> float | None:
    try:
        v = lista[i]
    except IndexError:
        return None
    return float(v) if isinstance(v, (int, float)) else None


def interpretar(dados: dict, agora: datetime) -> list[ObservacaoClima]:
    h = dados.get("hourly") or {}
    temp, umid, chuva = (h.get(k) or [] for k in ("temperature_2m", "relative_humidity_2m", "precipitation"))
    limite = agora.astimezone(timezone.utc).replace(minute=0, second=0, microsecond=0)
    saida = []
    for i, ts in enumerate(h.get("time") or []):
        try:
            momento = datetime.fromisoformat(ts).replace(tzinfo=timezone.utc)   # pedimos timezone=GMT
        except ValueError:
            continue
        if momento > limite:      # a API também devolve as horas futuras de hoje
            continue
        saida.append(ObservacaoClima(momento, _g(temp, i), _g(umid, i), _g(chuva, i)))
    return sorted(saida, key=lambda o: o.momento)


async def buscar_observacoes(http: httpx.AsyncClient, cfg: Settings, agora: datetime) -> list[ObservacaoClima]:
    params = {"latitude": cfg.open_meteo_lat, "longitude": cfg.open_meteo_lon,
              "hourly": "temperature_2m,relative_humidity_2m,precipitation",
              "past_days": 1, "forecast_days": 1, "timezone": "GMT"}

    async def _buscar() -> list[ObservacaoClima]:
        try:
            r = await http.get(URL, params=params)
        except httpx.HTTPError as e:
            raise OpenMeteoErro(f"Open-Meteo inacessível ({type(e).__name__})") from e
        if r.status_code == 429:
            raise OpenMeteoErro("Open-Meteo: limite de uso atingido (tente mais tarde)")
        if r.status_code != 200:
            raise OpenMeteoErro(f"Open-Meteo respondeu {r.status_code}")
        try:
            return interpretar(r.json(), agora)
        except ValueError as e:
            raise OpenMeteoErro("Open-Meteo devolveu uma resposta que não é JSON") from e

    return await cache.obter(f"open-meteo:{cfg.open_meteo_lat}:{cfg.open_meteo_lon}", TTL_SEGUNDOS, _buscar)


async def buscar_previsao(http: httpx.AsyncClient, cfg: Settings) -> dict:
    """Clima atual + próximas horas + 7 dias (horário de Recife). Usado pela dashboard do Produtor."""
    params = {"latitude": cfg.open_meteo_lat, "longitude": cfg.open_meteo_lon,
              "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day",
              "hourly": "temperature_2m,relative_humidity_2m,precipitation_probability",
              "daily": "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
              "forecast_days": 7, "timezone": "America/Recife"}

    async def _buscar() -> dict:
        try:
            r = await http.get(URL, params=params)
        except httpx.HTTPError as e:
            raise OpenMeteoErro(f"Open-Meteo inacessível ({type(e).__name__})") from e
        if r.status_code == 429:
            raise OpenMeteoErro("Open-Meteo: limite de uso atingido (tente mais tarde)")
        if r.status_code != 200:
            raise OpenMeteoErro(f"Open-Meteo respondeu {r.status_code}")
        try:
            dados = r.json()
        except ValueError as e:
            raise OpenMeteoErro("Open-Meteo devolveu uma resposta que não é JSON") from e
        if not isinstance(dados, dict) or not dados.get("current") or not (dados.get("daily") or {}).get("time"):
            raise OpenMeteoErro("Open-Meteo devolveu uma resposta sem previsão")
        return dados

    return await cache.obter(f"open-meteo-prev:{cfg.open_meteo_lat}:{cfg.open_meteo_lon}", TTL_SEGUNDOS, _buscar)
