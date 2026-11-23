from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app.db import BancoNaoConfigurado, get_engine_dep
from app.main import app
from app.ml import registro
from app.ml.registro import ResultadoTreino

AGORA = datetime(2026, 11, 14, 12, 0)


def _res(mae=0.5, base=0.9, precisao=98.1):
    return ResultadoTreino(precisao=precisao, metrica_nome="MAE", metrica_valor=mae, baseline_valor=base,
                           amostras_treino=1400, amostras_teste=365, algoritmo="Ridge", fonte_dados="Open-Meteo")


@pytest.fixture
def engine(tmp_path):
    e = create_engine(f"sqlite:///{tmp_path/'api.db'}")
    registro.criar_tabelas(e)
    registro.garantir_catalogo(e)
    return e


@pytest.fixture
def client(engine):
    app.dependency_overrides[get_engine_dep] = lambda: (lambda: engine)
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


def test_catalogo_novo_so_tem_planejados(client):
    j = client.get("/analista/modelos").json()
    assert j["ok"] and j["resumo"]["total"] == 6 and j["resumo"]["planejados"] == 6
    assert j["resumo"]["precisao_media"] is None and j["resumo"]["situacao"] == "Nenhum modelo treinado ainda"
    assert all(m["precisao"] is None and m["versao"] is None for m in j["modelos"])
    assert [m["id"] for m in j["modelos"]] == ["produtividade", "clima", "colheita", "preco", "qualidade", "irrigacao"]


def test_modelo_treinado_vira_ativo_com_metricas_reais(client, engine):
    registro.concluir_treino(engine, "clima", _res(), agora=registro.agora_utc())
    j = client.get("/analista/modelos").json()
    m = next(x for x in j["modelos"] if x["id"] == "clima")
    assert m["status"] == "ativo" and m["versao"] == "v1.1" and m["precisao"] == 98.1 and m["desempenho"] == "Excelente"
    assert m["metrica"] == {"nome": "MAE", "valor": 0.5, "baseline": 0.9, "melhora_pct": 44.4}
    assert m["treinado_em"].endswith("Z") and m["amostras"] == {"treino": 1400, "teste": 365}
    r = j["resumo"]
    assert (r["ativos"], r["planejados"], r["precisao_media"], r["atualizados_7d"]) == (1, 5, 98.1, 1)
    assert r["situacao"] == "Todos em operação" and r["variacao_mes"] is None


def test_nao_supera_linha_de_base_fica_em_atencao(client, engine):
    registro.concluir_treino(engine, "irrigacao", _res(mae=1.2, base=0.9, precisao=96.0), agora=registro.agora_utc())
    m = next(x for x in client.get("/analista/modelos").json()["modelos"] if x["id"] == "irrigacao")
    assert m["status"] == "atencao" and m["desempenho"] == "Não supera a linha de base" and m["observacao"]


def test_treino_antigo_pede_retreino(client, engine):
    registro.concluir_treino(engine, "clima", _res(), agora=registro.agora_utc() - timedelta(days=20))
    m = next(x for x in client.get("/analista/modelos").json()["modelos"] if x["id"] == "clima")
    assert m["status"] == "atencao" and m["desempenho"] == "Retreino recomendado"


def test_treinando_mostra_progresso_real(client, engine):
    registro.iniciar_treino(engine, "clima", 40)
    j = client.get("/analista/modelos").json()
    m = next(x for x in j["modelos"] if x["id"] == "clima")
    assert m["status"] == "treinando" and m["progresso"] == 40 and j["resumo"]["treinando"] == 1


def test_falha_sem_metricas_previas(client, engine):
    registro.falhar_treino(engine, "clima", "DadosErro: Open-Meteo respondeu 500")
    m = next(x for x in client.get("/analista/modelos").json()["modelos"] if x["id"] == "clima")
    assert m["status"] == "atencao" and m["desempenho"] == "Sem treino válido" and "500" in m["erro"]


def test_variacao_em_relacao_a_30_dias_atras(client, engine):
    registro.concluir_treino(engine, "clima", _res(precisao=95.0), agora=registro.agora_utc() - timedelta(days=40))
    registro.concluir_treino(engine, "clima", _res(precisao=97.0), agora=registro.agora_utc())
    assert client.get("/analista/modelos").json()["resumo"]["variacao_mes"] == 2.0


def test_tabelas_inexistentes_viram_aviso_e_nao_erro_500(tmp_path):
    vazio = create_engine(f"sqlite:///{tmp_path/'vazio.db'}")
    app.dependency_overrides[get_engine_dep] = lambda: (lambda: vazio)
    try:
        with TestClient(app) as c:
            r = c.get("/analista/modelos")
            j = r.json()
            assert r.status_code == 200 and j["ok"] is False and j["modelos"] == []
            assert "python -m app.ml.treinar" in j["erro"]
    finally:
        app.dependency_overrides.clear()


def test_env_sem_credenciais_do_banco_vira_aviso_e_nao_erro_500():
    def sem_banco():
        raise BancoNaoConfigurado("DB_HOST, DB_USER e DB_NAME precisam estar no .env")
    app.dependency_overrides[get_engine_dep] = lambda: sem_banco
    try:
        with TestClient(app) as c:
            r = c.get("/analista/modelos")
            assert r.status_code == 200 and r.json()["ok"] is False and "DB_HOST" in r.json()["erro"]
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("mae,esperado", [(0.60, "Excelente"), (0.80, "Bom"), (0.88, "Regular")])
def test_rotulo_mede_ganho_sobre_a_linha_de_base_e_nao_so_a_precisao(client, engine, mae, esperado):
    # a precisão é 99% nos três casos; o rótulo muda conforme a melhora sobre a linha de base (0,9)
    registro.concluir_treino(engine, "clima", _res(mae=mae, base=0.9, precisao=99.0), agora=registro.agora_utc())
    m = next(x for x in client.get("/analista/modelos").json()["modelos"] if x["id"] == "clima")
    assert m["desempenho"] == esperado and m["status"] == "ativo"


def test_catalogo_atualiza_descricao_antiga_sem_apagar_metricas(engine):
    from sqlalchemy import update as sql_update
    registro.concluir_treino(engine, "colheita", _res(), agora=registro.agora_utc())
    with engine.begin() as con:
        con.execute(sql_update(registro.modelo_registro).where(registro.modelo_registro.c.id == "colheita")
                    .values(descricao="texto antigo"))
    registro.garantir_catalogo(engine)
    m = {x["id"]: x for x in registro.listar(engine)}["colheita"]
    assert "graus-dia" in m["descricao"] and m["precisao"] == 98.1 and m["versao_num"] == 1
