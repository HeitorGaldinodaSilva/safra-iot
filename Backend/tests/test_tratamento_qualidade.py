from datetime import datetime, timedelta, timezone

from app.services import qualidade, tratamento
from app.services.tratamento import Leitura

AGORA = datetime(2026, 11, 13, 15, 30, tzinfo=timezone.utc)


def L(min_atras, t, u):
    return Leitura(AGORA - timedelta(minutes=min_atras), t, u)


def test_interpretar_feeds_aceita_virgula_nan_e_vazio():
    feeds = [{"created_at": "2026-11-13T15:00:00Z", "field1": "28,5", "field2": "60"},
             {"created_at": "2026-11-13T15:01:00Z", "field1": "nan", "field2": ""},
             {"created_at": "lixo", "field1": "1"}]
    ls = tratamento.interpretar_feeds(feeds, "field1", "field2")
    assert len(ls) == 2 and ls[0].temperatura == 28.5 and ls[0].umidade == 60
    assert ls[1].temperatura is None and ls[1].umidade is None


def test_tratar_separa_duplicadas_incompletas_e_fora_da_faixa():
    r = tratamento.tratar([L(5, 28, 60), L(5, 28, 60), L(4, None, 50), L(3, 99, 50), L(2, 30, 120), L(1, 29, 61)])
    assert (r.total_brutas, r.duplicadas, r.incompletas, r.invalidas, len(r.validas)) == (6, 1, 1, 2, 2)


def test_qualidade_cobertura_horaria_e_geral():
    ls = [Leitura(AGORA - timedelta(hours=h), 28, 60) for h in range(12)]  # 12 das últimas 24 h
    q = qualidade.calcular(tratamento.tratar(ls), AGORA)
    assert q["completos"] == 100 and q["validos"] == 100 and q["atualizados"] == 50.0
    assert q["geral"] == 83.3 and q["rotulo"] == "Qualidade regular"


def test_qualidade_sem_dados_nao_divide_por_zero():
    q = qualidade.calcular(tratamento.tratar([]), AGORA)
    assert q["geral"] == 0.0 and q["rotulo"] == "Qualidade baixa"
