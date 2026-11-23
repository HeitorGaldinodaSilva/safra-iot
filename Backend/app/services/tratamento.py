"""RF05 – limpeza e tratamento das leituras do ThingSpeak antes do processamento."""
from dataclasses import dataclass, field
from datetime import datetime, timezone

FAIXA_TEMP = (-10.0, 60.0)   # °C plausível para o sensor
FAIXA_UMID = (0.0, 100.0)    # %


@dataclass(frozen=True)
class Leitura:
    momento: datetime        # UTC
    temperatura: float | None
    umidade: float | None


@dataclass
class ResultadoTratamento:
    validas: list[Leitura] = field(default_factory=list)
    total_brutas: int = 0
    duplicadas: int = 0
    incompletas: int = 0
    invalidas: int = 0       # fora da faixa física


def _num(v) -> float | None:
    if v is None or str(v).strip() == "":
        return None
    try:
        n = float(str(v).replace(",", "."))
    except ValueError:
        return None
    return None if n != n else n   # descarta NaN


def interpretar_feeds(feeds: list[dict], campo_temp: str, campo_umid: str) -> list[Leitura]:
    saida = []
    for f in feeds:
        try:
            momento = datetime.fromisoformat(str(f["created_at"]).replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if momento.tzinfo is None:
            momento = momento.replace(tzinfo=timezone.utc)
        saida.append(Leitura(momento, _num(f.get(campo_temp)), _num(f.get(campo_umid))))
    return sorted(saida, key=lambda l: l.momento)


def tratar(leituras: list[Leitura]) -> ResultadoTratamento:
    res = ResultadoTratamento(total_brutas=len(leituras))
    vistos: set[datetime] = set()
    for l in leituras:
        if l.momento in vistos:
            res.duplicadas += 1
            continue
        vistos.add(l.momento)
        if l.temperatura is None or l.umidade is None:
            res.incompletas += 1
            continue
        if not (FAIXA_TEMP[0] <= l.temperatura <= FAIXA_TEMP[1] and FAIXA_UMID[0] <= l.umidade <= FAIXA_UMID[1]):
            res.invalidas += 1
            continue
        res.validas.append(l)
    return res
