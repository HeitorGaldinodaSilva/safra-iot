"""Cache TTL em memória. Protege as APIs externas e ajuda o RNF04 (<= 3 s)."""
import time
from typing import Awaitable, Callable, TypeVar

T = TypeVar("T")
_dados: dict[str, tuple[float, object]] = {}


async def obter(chave: str, ttl_segundos: float, produtor: Callable[[], Awaitable[T]]) -> T:
    agora = time.monotonic()
    guardado = _dados.get(chave)
    if guardado and guardado[0] > agora:
        return guardado[1]  # type: ignore[return-value]
    valor = await produtor()          # se falhar, a exceção sobe e nada é guardado
    _dados[chave] = (agora + ttl_segundos, valor)
    return valor


def limpar() -> None:
    _dados.clear()
