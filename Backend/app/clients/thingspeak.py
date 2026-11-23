"""RF02 – consome o canal do ThingSpeak via API REST (channel feeds).
A Read Key fica só no servidor (RNF02). Cache de 15 s respeita o RNF11."""
import httpx

from .. import cache
from ..config import Settings

TTL_SEGUNDOS = 15


class ThingSpeakErro(Exception):
    pass


async def buscar_feeds(http: httpx.AsyncClient, cfg: Settings) -> list[dict]:
    if not cfg.thingspeak_canal:
        raise ThingSpeakErro("THINGSPEAK_CHANNEL_ID não configurado no .env")

    async def _buscar() -> list[dict]:
        params = {"results": 8000}   # últimas leituras, mesmo que antigas (para detectar ESP32 parado)
        if cfg.thingspeak_read_key:
            params["api_key"] = cfg.thingspeak_read_key
        try:
            r = await http.get(f"https://api.thingspeak.com/channels/{cfg.thingspeak_canal}/feeds.json", params=params)
        except httpx.HTTPError as e:
            raise ThingSpeakErro(f"ThingSpeak inacessível ({type(e).__name__})") from e
        if r.status_code != 200:
            raise ThingSpeakErro(f"ThingSpeak respondeu {r.status_code}")
        return r.json().get("feeds") or []

    return await cache.obter(f"thingspeak:{cfg.thingspeak_canal}", TTL_SEGUNDOS, _buscar)
