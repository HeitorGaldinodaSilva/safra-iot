import asyncio

import httpx

from app import cache
from app.config import get_settings
from app.services import produtor

DIAS = [f"2026-11-{d:02d}" for d in range(17, 24)]
HORAS = [f"{d}T{h:02d}:00" for d in DIAS for h in range(24)]
RESPOSTA = {
    "current": {"time": "2026-11-17T10:15", "temperature_2m": 31.2, "relative_humidity_2m": 55, "apparent_temperature": 33.0,
                "precipitation": 0.0, "weather_code": 0, "wind_speed_10m": 12.4, "is_day": 1},
    "hourly": {"time": HORAS, "temperature_2m": [20 + (i % 24) * 0.5 for i in range(len(HORAS))],
               "relative_humidity_2m": [55] * len(HORAS), "precipitation_probability": [10] * len(HORAS)},
    "daily": {"time": DIAS, "weather_code": [0, 0, 3, 63, 0, 0, 0],
              "temperature_2m_max": [31, 32, 30, 28, 37, 31, 30], "temperature_2m_min": [21, 21, 20, 20, 22, 21, 20],
              "precipitation_sum": [0, 0, 0, 12, 0, 0, 0], "precipitation_probability_max": [5, 10, 30, 90, 10, 5, 5]},
}


def _http(resposta, status=200):
    return httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(status, json=resposta)))


def _rodar(resposta, status=200):
    async def f():
        cache.limpar()
        async with _http(resposta, status) as http:
            return await produtor.montar(http, get_settings())
    return asyncio.run(f())


def test_payload_atual_e_condicao():
    p = _rodar(RESPOSTA)
    assert p["fonte"]["id"] == "open_meteo"
    assert p["atual"] == {"temperatura": 31.2, "sensacao": 33.0, "umidade": 55.0, "vento_kmh": 12.0,
                          "chuva_mm": 0.0, "condicao": "Ensolarado"}
    assert len(p["dias"]) == 7 and p["dias"][3]["condicao"] == "Chuva moderada"
    assert p["dias"][0]["umidade_media"] == 55 and p["dias"][0]["tmedia"] == 26.0
    assert p["max_proximas_24h"] is not None


def test_janela_ideal_e_a_maior_sequencia_seca():
    # dias 0-2 ok (3 dias), dia 3 chove, dia 4 calor (média 29,5 ainda ok), dias 4-6 ok (3 dias) -> a 1ª sequência vence
    j = _rodar(RESPOSTA)["janela_ideal"]
    assert j == {"inicio": "2026-11-17", "fim": "2026-11-19", "dias": 3}


def test_alertas_calor_e_chuva():
    resp = {**RESPOSTA, "daily": {**RESPOSTA["daily"], "temperature_2m_max": [37, 31, 30, 28, 31, 31, 30],
                                  "precipitation_sum": [0, 8, 0, 0, 0, 0, 0], "precipitation_probability_max": [5, 80, 5, 5, 5, 5, 5]}}
    tipos = {a["tipo"] for a in _rodar(resp)["alertas"]}
    assert {"risco_calor", "chuva_prevista"} <= tipos


def test_umidade_baixa_gera_alerta():
    resp = {**RESPOSTA, "current": {**RESPOSTA["current"], "relative_humidity_2m": 22}}
    assert "risco_umidade_baixa" in {a["tipo"] for a in _rodar(resp)["alertas"]}


def test_open_meteo_fora_do_ar_levanta_erro_tratavel():
    from app.clients.open_meteo import OpenMeteoErro
    try:
        _rodar({}, status=500)
    except OpenMeteoErro as e:
        assert "500" in str(e)
    else:
        raise AssertionError("deveria levantar OpenMeteoErro")
