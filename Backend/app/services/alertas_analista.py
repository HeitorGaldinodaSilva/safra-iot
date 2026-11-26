"""RF09 – alertas derivados dos dados reais. Limiares configuráveis (config.py)."""
from datetime import datetime

from ..config import Settings

ORDEM = {"critico": 0, "atencao": 1, "info": 2, "ok": 3}


def _br(valor: float, casas: int = 1, sinal: bool = False) -> str:
    """Número no formato brasileiro (vírgula decimal)."""
    return f"{valor:{'+' if sinal else ''}.{casas}f}".replace(".", ",")


def _alerta(nivel: str, titulo: str, descricao: str, quando: datetime) -> dict:
    return {"nivel": nivel, "titulo": titulo, "descricao": descricao, "quando": quando.isoformat()}


def gerar(*, cfg: Settings, agora: datetime, thingspeak_erro: str | None, clima_erro: str | None,
          aviso_fonte: str | None, rotulo_fonte: str,
          minutos_sem_dados: float | None, qualidade: dict | None, invalidas: int,
          delta_temp: float | None, medias_recentes: dict | None, chuva_24h: float | None) -> list[dict]:
    a: list[dict] = []

    if thingspeak_erro:
        a.append(_alerta("critico", "ThingSpeak indisponível", thingspeak_erro, agora))
    elif minutos_sem_dados is None:
        a.append(_alerta("critico", "Canal sem leituras válidas",
                         "O ThingSpeak não devolveu nenhuma leitura válida. Confira se o ESP32 está publicando "
                         "e se THINGSPEAK_FIELD_TEMP/UMID apontam para os campos certos.", agora))
    elif minutos_sem_dados > cfg.thingspeak_offline_min:
        h = minutos_sem_dados / 60
        quanto = f"{round(minutos_sem_dados)} min" if h < 1 else f"{round(h)} h" if h < 48 else f"{round(h / 24)} dias"
        a.append(_alerta("critico", "ESP32 sem enviar dados",
                         f"Última leitura há {quanto} (limite: {cfg.thingspeak_offline_min} min)", agora))

    if clima_erro:
        a.append(_alerta("info", "Dados de clima indisponíveis", clima_erro, agora))
    elif aviso_fonte:
        a.append(_alerta("info", f"Usando {rotulo_fonte} no lugar do INMET", aviso_fonte, agora))

    if qualidade and qualidade["geral"] < cfg.limite_qualidade_geral:
        a.append(_alerta("atencao", "Qualidade dos dados abaixo do esperado",
                         f"Qualidade geral {_br(qualidade['geral'])}% (mínimo {_br(cfg.limite_qualidade_geral, 0)}%)", agora))

    if invalidas:
        a.append(_alerta("info", "Leituras descartadas na limpeza",
                         f"{invalidas} leitura(s) fora da faixa física do sensor nas últimas 24 h", agora))

    if delta_temp is not None and abs(delta_temp) > cfg.limite_divergencia_temp:
        a.append(_alerta("atencao", "Sensor diverge do INMET",
                         f"Diferença de {_br(delta_temp, sinal=True)} °C em relação a {rotulo_fonte}. "
                         "Pode ser microclima ou sensor descalibrado", agora))

    if medias_recentes and chuva_24h is not None:
        t, u = medias_recentes["temperatura"], medias_recentes["umidade"]
        if (cfg.janela_temp[0] <= t <= cfg.janela_temp[1] and cfg.janela_umid[0] <= u <= cfg.janela_umid[1]
                and chuva_24h == 0):
            a.append(_alerta("ok", "Condições favoráveis à colheita",
                             f"Últimas 6 h: {_br(t)} °C, {_br(u, 0)}% de umidade e sem chuva em 24 h", agora))

    return sorted(a, key=lambda x: ORDEM[x["nivel"]])
