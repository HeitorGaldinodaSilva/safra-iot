from datetime import datetime, timezone

from app.config import get_settings
from app.services import alertas

AGORA = datetime(2026, 11, 13, 15, tzinfo=timezone.utc)
BASE = dict(cfg=get_settings(), agora=AGORA, thingspeak_erro=None, clima_erro=None,
            aviso_fonte=None, rotulo_fonte="INMET A307", minutos_sem_dados=1,
            qualidade={"geral": 99.0}, invalidas=0, delta_temp=0.5, medias_recentes=None, chuva_24h=None)


def titulos(**kw):
    return [a["titulo"] for a in alertas.gerar(**{**BASE, **kw})]


def test_sem_problemas_nao_gera_alertas():
    assert titulos() == []


def test_esp32_offline_e_critico_e_vem_primeiro():
    a = alertas.gerar(**{**BASE, "minutos_sem_dados": 40, "invalidas": 3})
    assert a[0]["nivel"] == "critico" and a[0]["titulo"] == "ESP32 sem enviar dados"
    assert "Leituras descartadas na limpeza" in [x["titulo"] for x in a]


def test_divergencia_com_inmet_usa_virgula_decimal():
    a = alertas.gerar(**{**BASE, "delta_temp": -6.25})
    d = next(x for x in a if x["titulo"] == "Sensor diverge do INMET")
    assert "-6,2" in d["descricao"] or "-6,3" in d["descricao"]


def test_janela_favoravel_exige_chuva_zero():
    m = {"temperatura": 26.0, "umidade": 55.0}
    assert "Condições favoráveis à colheita" in titulos(medias_recentes=m, chuva_24h=0.0)
    assert "Condições favoráveis à colheita" not in titulos(medias_recentes=m, chuva_24h=2.0)
    assert "Condições favoráveis à colheita" not in titulos(medias_recentes=m, chuva_24h=None)


def test_qualidade_baixa_gera_atencao():
    assert "Qualidade dos dados abaixo do esperado" in titulos(qualidade={"geral": 80.0})


def test_fallback_para_open_meteo_gera_aviso_informativo():
    a = alertas.gerar(**{**BASE, "aviso_fonte": "INMET_TOKEN não configurado", "rotulo_fonte": "Open-Meteo"})
    assert a[0]["nivel"] == "info" and a[0]["titulo"] == "Usando Open-Meteo no lugar do INMET"


def test_clima_totalmente_indisponivel():
    assert "Dados de clima indisponíveis" in titulos(clima_erro="INMET: x · Open-Meteo: y")
