from datetime import datetime, timezone

from app.clients import open_meteo

# Trecho real da resposta da API (timezone=GMT), incluindo horas futuras de hoje
RESPOSTA = {"hourly": {
    "time": ["2026-11-14T08:00", "2026-11-14T09:00", "2026-11-14T10:00", "2026-11-14T11:00"],
    "temperature_2m": [28.6, 30.4, 31.8, 33.3],
    "relative_humidity_2m": [71, 66, 58, None],
    "precipitation": [0.0, 0.2, 0.0, 0.0]}}


def test_interpretar_descarta_horas_futuras_e_aceita_nulos():
    agora = datetime(2026, 11, 14, 10, 40, tzinfo=timezone.utc)
    obs = open_meteo.interpretar(RESPOSTA, agora)
    assert [o.momento.hour for o in obs] == [8, 9, 10]          # 11h ainda não aconteceu
    assert obs[1].temperatura == 30.4 and obs[1].umidade == 66 and obs[1].chuva_mm == 0.2
    assert obs[0].momento.tzinfo is timezone.utc


def test_interpretar_resposta_vazia_ou_estranha():
    agora = datetime(2026, 11, 14, 10, tzinfo=timezone.utc)
    assert open_meteo.interpretar({}, agora) == []
    assert open_meteo.interpretar({"hourly": {"time": ["lixo"]}}, agora) == []
