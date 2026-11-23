from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.clients import inmet, open_meteo, thingspeak
from app.main import app


def _agora():
    return datetime.now(timezone.utc)


def _feeds(n_horas=6):
    a = _agora()
    return [{"created_at": (a - timedelta(minutes=10 * i)).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "field1": "27.0", "field2": "55"} for i in range(n_horas * 6)]


def _obs(temp=27.5):
    h0 = _agora().replace(minute=0, second=0, microsecond=0)
    return [inmet.ObservacaoInmet(h0 - timedelta(hours=i), temp, 58.0, 0.0) for i in range(24)]


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def _patch(monkeypatch, feeds=None, obs=None, ts_erro=None, inmet_erro=None, om_obs=None, om_erro=None):
    async def fake_ts(http, cfg):
        if ts_erro:
            raise thingspeak.ThingSpeakErro(ts_erro)
        return feeds

    async def fake_inmet(http, cfg, agora):
        if not cfg.inmet_token:   # como o cliente real
            raise inmet.InmetNaoConfigurado("INMET_TOKEN não configurado")
        if inmet_erro:
            raise inmet.InmetNaoConfigurado(inmet_erro)
        return obs

    async def fake_om(http, cfg, agora):
        if om_erro:
            raise open_meteo.OpenMeteoErro(om_erro)
        return om_obs if om_obs is not None else _obs(26.0)

    monkeypatch.setattr(thingspeak, "buscar_feeds", fake_ts)
    monkeypatch.setattr(inmet, "buscar_observacoes", fake_inmet)
    monkeypatch.setattr(open_meteo, "buscar_observacoes", fake_om)


def test_payload_completo_com_inmet(client, monkeypatch):
    _patch(monkeypatch, _feeds(), _obs())
    j = client.get("/analista/inicial").json()
    assert j["fontes"]["thingspeak"]["ok"] and j["fontes"]["clima"]["ok"]
    assert j["fontes"]["clima"]["id"] == "inmet" and j["fontes"]["clima"]["tipo"] == "estação"
    assert j["fontes"]["clima"]["rotulo"] == "INMET A307"
    assert j["cards"]["dados_processados"]["valor"] > 0
    assert j["cards"]["temperatura"]["sensor"] == 27.0
    assert j["cards"]["temperatura"]["comparacao"]["delta_temperatura"] == -0.5
    assert j["cards"]["chuva_24h_mm"] == 0.0
    assert len(j["grafico"]["rotulos"]) == 24 == len(j["grafico"]["clima_temperatura"])
    assert any(a["titulo"] == "Condições favoráveis à colheita" for a in j["alertas"])


def test_inmet_falha_e_cai_para_open_meteo(client, monkeypatch):
    _patch(monkeypatch, _feeds(), inmet_erro="INMET_TOKEN não configurado", om_obs=_obs(26.0))
    j = client.get("/analista/inicial").json()
    cl = j["fontes"]["clima"]
    assert cl["ok"] and cl["id"] == "open_meteo" and cl["tipo"] == "modelo" and "INMET_TOKEN" in cl["aviso"]
    assert j["cards"]["temperatura"]["comparacao"]["clima_temperatura"] == 26.0
    assert any(a["titulo"] == "Usando Open-Meteo no lugar do INMET" for a in j["alertas"])


def test_sem_token_usa_open_meteo_sem_tentar_inmet(client, monkeypatch):
    import dataclasses

    from app.config import get_settings
    _patch(monkeypatch, _feeds(), obs=[], om_obs=_obs(26.0))
    sem_token = dataclasses.replace(get_settings(), inmet_token=None)
    app.dependency_overrides[get_settings] = lambda: sem_token
    try:
        cl = client.get("/analista/inicial").json()["fontes"]["clima"]
    finally:
        app.dependency_overrides.clear()
    assert cl["id"] == "open_meteo" and "INMET_TOKEN" in cl["aviso"]


def test_clima_totalmente_fora_do_ar_nao_derruba_o_resto(client, monkeypatch):
    _patch(monkeypatch, _feeds(), inmet_erro="sem token", om_erro="Open-Meteo respondeu 503")
    j = client.get("/analista/inicial").json()
    assert j["fontes"]["clima"]["ok"] is False and j["fontes"]["thingspeak"]["ok"] is True
    assert "Open-Meteo respondeu 503" in j["fontes"]["clima"]["erro"]
    assert j["cards"]["chuva_24h_mm"] is None and j["cards"]["temperatura"]["comparacao"] is None
    assert j["cards"]["temperatura"]["sensor"] == 27.0
    assert any(a["titulo"] == "Dados de clima indisponíveis" for a in j["alertas"])


def test_thingspeak_fora_do_ar_gera_alerta_critico(client, monkeypatch):
    _patch(monkeypatch, ts_erro="ThingSpeak respondeu 503", obs=_obs())
    j = client.get("/analista/inicial").json()
    assert j["fontes"]["thingspeak"]["ok"] is False and j["qualidade"] is None
    assert j["alertas"][0]["nivel"] == "critico"


def test_rbac_bloqueia_sem_token_e_perfil_errado(client, monkeypatch):
    import dataclasses

    from app.config import get_settings

    _patch(monkeypatch, _feeds(), _obs())
    cfg_on = dataclasses.replace(get_settings(), auth_ativa=True)
    app.dependency_overrides[get_settings] = lambda: cfg_on

    class RespostaNode:  # resposta falsa do GET /configuracoes do Node
        def __init__(self, status, perfil):
            self.status_code, self._perfil = status, perfil

        def json(self):
            return {"usuario": {"perfil": self._perfil}}

    def node_devolve(status, perfil=""):
        async def get(url, headers=None):
            return RespostaNode(status, perfil)
        monkeypatch.setattr(client.app.state.http, "get", get)

    try:
        assert client.get("/analista/inicial").status_code == 401           # sem token
        cab = {"Authorization": "Bearer abc"}
        for status, perfil, esperado in ((401, "", 401), (200, "Produtor", 403), (200, "Analista", 200)):
            auth._ok.clear()
            node_devolve(status, perfil)
            r = client.get("/analista/inicial", headers=cab)
            assert r.status_code == esperado, (status, perfil, r.text)
    finally:
        app.dependency_overrides.clear()


def test_canal_sem_leituras_recentes_gera_alerta_critico(client, monkeypatch):
    antigas = [{"created_at": (_agora() - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%SZ"), "field1": "27", "field2": "55"}]
    _patch(monkeypatch, antigas, _obs())
    j = client.get("/analista/inicial").json()
    assert j["cards"]["dados_processados"]["valor"] == 0
    assert j["cards"]["temperatura"]["minutos_sem_dados"] >= 3 * 24 * 60 - 1
    assert j["alertas"][0]["titulo"] == "ESP32 sem enviar dados" and "dias" in j["alertas"][0]["descricao"]


def test_canal_vazio_gera_alerta_de_canal_sem_leituras(client, monkeypatch):
    _patch(monkeypatch, [], _obs())
    assert client.get("/analista/inicial").json()["alertas"][0]["titulo"] == "Canal sem leituras válidas"
