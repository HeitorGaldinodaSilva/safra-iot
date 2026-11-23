"""Indicadores de qualidade da base (card "Qualidade dos dados")."""
from datetime import datetime, timedelta

from .tratamento import ResultadoTratamento


def _pct(parte: int, todo: int) -> float:
    return round(100 * parte / todo, 1) if todo else 0.0


def calcular(t: ResultadoTratamento, agora: datetime, janela_horas: int = 24) -> dict:
    """completos : leituras com temperatura E umidade / leituras únicas
    validos   : leituras dentro da faixa física / leituras completas
    atualizados: horas das últimas 24 h que têm ao menos 1 leitura válida / 24
    geral     : média dos três."""
    unicas = t.total_brutas - t.duplicadas
    completas = unicas - t.incompletas
    completos = _pct(completas, unicas)
    validos = _pct(len(t.validas), completas)

    inicio = agora - timedelta(hours=janela_horas)
    horas = {l.momento.replace(minute=0, second=0, microsecond=0) for l in t.validas if l.momento >= inicio}
    atualizados = min(100.0, _pct(len(horas), janela_horas))

    geral = round((completos + validos + atualizados) / 3, 1)
    rotulo = "Boa qualidade" if geral >= 90 else "Qualidade regular" if geral >= 70 else "Qualidade baixa"
    return {"geral": geral, "completos": completos, "validos": validos,
            "atualizados": atualizados, "rotulo": rotulo}
