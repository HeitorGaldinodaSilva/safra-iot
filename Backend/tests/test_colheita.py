from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app.config import get_settings
from app.db import get_engine_dep
from app.main import app
from app.ml import colheita, dados, registro, treinar
from tests.test_ml import clima_sintetico


def test_gd_dia_tres_casos_de_villa_nova():
    assert colheita.gd_dia([32.0], [20.0], 10.0)[0] == pytest.approx(16.0)             # mínima acima da base
    assert colheita.gd_dia([20.0], [4.0], 10.0)[0] == pytest.approx(100 / 32)          # mínima abaixo da base
    assert colheita.gd_dia([8.0], [2.0], 10.0)[0] == 0.0                               # máxima abaixo da base
    assert colheita.gd_dia([np.nan], [20.0], 10.0)[0] == 0.0


def test_serie_gd_preenche_dias_descartados_na_limpeza():
    d = clima_sintetico(dias=60)
    g = colheita.serie_gd(d.drop(d.index[10:13]), 10.0)
    assert len(g) == 60 and not g.isna().any()


def test_dias_para_acumular_com_clima_constante():
    clim = np.full(366, 15.0)
    assert colheita.dias_para_acumular(clim, pd.Timestamp("2026-01-01"), 1500.0) == 100
    assert colheita.dias_para_acumular(clim, pd.Timestamp("2026-01-01"), 15.0) == 1
    assert colheita.dias_para_acumular(np.full(366, 0.0), pd.Timestamp("2026-01-01"), 10.0) is None


def test_backtest_gd_vence_o_calendario_fixo_quando_ha_sazonalidade():
    r = colheita.treinar_colheita(clima_sintetico(), get_settings())
    assert r.metrica_nome == "MAE em dias" and r.amostras_teste > 20
    assert r.metrica_valor < r.baseline_valor                       # graus-dia erra menos dias que "poda + N dias"
    assert r.parametros["cultivar"] == "syrah" and set(r.parametros["por_cultivar"]) == {"syrah", "cabernet_sauvignon"}
    assert r.parametros["erro_p80_dias"] >= r.metrica_valor * 0.5 and r.parametros["gd_alvo"] == 1939.3
    assert 80 < r.precisao <= 100


def test_backtest_recusa_historico_curto():
    with pytest.raises(colheita.ColheitaErro, match="curto"):
        colheita.treinar_colheita(clima_sintetico(dias=700), get_settings())


@pytest.fixture
def historico():
    d = clima_sintetico()
    hoje = d.index[-1].date() + timedelta(days=7)       # histórico fecha 7 dias antes de "hoje" (como o ERA5)
    return d, hoje


def test_estimar_projeta_com_poda_no_futuro(historico):
    d, hoje = historico
    r = colheita.estimar_colheita(d, hoje + timedelta(days=10), "syrah", hoje, erro_dias=3.2)
    assert r["situacao"] == "projetada" and r["gd_acumulado"] == 0 and r["progresso_pct"] == 0
    dias = (date.fromisoformat(r["colheita_estimada"]) - date.fromisoformat(r["poda"])).days
    assert 90 < dias < 150                                         # ciclo plausível (~114 d no clima sintético)
    assert (date.fromisoformat(r["janela"]["fim"]) - date.fromisoformat(r["janela"]["inicio"])).days == 8   # ±ceil(3,2)=4
    assert r["dias_restantes"] == (date.fromisoformat(r["colheita_estimada"]) - hoje).days


def test_estimar_com_poda_em_andamento_soma_observado_e_projeta_o_resto(historico):
    d, hoje = historico
    r = colheita.estimar_colheita(d, hoje - timedelta(days=60), "syrah", hoje, erro_dias=3)
    assert r["situacao"] == "projetada" and 0 < r["progresso_pct"] < 100
    assert r["gd_acumulado"] == pytest.approx(colheita.serie_gd(d, 10.0).loc[pd.Timestamp(hoje - timedelta(days=60)):].sum(), abs=0.1)
    assert any("Temperaturas observadas até" in a for a in r["avisos"])


def test_estimar_poda_antiga_ja_atingiu_o_alvo(historico):
    d, hoje = historico
    r = colheita.estimar_colheita(d, date(2021, 3, 1), "syrah", hoje)
    assert r["situacao"] == "atingida" and r["janela"] is None and r["dias_restantes"] < 0
    assert r["gd_acumulado"] >= r["gd_alvo"]


def test_estimar_validacoes(historico):
    d, hoje = historico
    with pytest.raises(colheita.ColheitaErro, match="anterior"):
        colheita.estimar_colheita(d, date(2010, 1, 1), "syrah", hoje)
    with pytest.raises(colheita.ColheitaErro, match="futuro"):
        colheita.estimar_colheita(d, hoje + timedelta(days=500), "syrah", hoje)
    with pytest.raises(colheita.ColheitaErro, match="desconhecida"):
        colheita.estimar_colheita(d, hoje, "malbec", hoje)
    velho = colheita.estimar_colheita(d, hoje, "syrah", hoje + timedelta(days=60))
    assert any("rode o treino" in a for a in velho["avisos"])


def test_pipeline_treina_colheita_e_registra(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path/'t.db'}")
    monkeypatch.setattr(dados, "baixar_historico", lambda *a, **k: clima_sintetico())
    res = treinar.executar(engine, get_settings(), ["colheita"], usar_cache=False)
    assert res == {"colheita": "ativo"}
    m = {x["id"]: x for x in registro.listar(engine)}["colheita"]
    assert m["metrica_nome"] == "MAE em dias" and m["versao_num"] == 1 and '"cultivares"' in m["parametros"]


# ---------- endpoint ----------
@pytest.fixture
def api(tmp_path, monkeypatch):
    cfg = get_settings()
    pasta = tmp_path / "cache"
    pasta.mkdir()
    d = clima_sintetico()
    d.index.name = "time"
    d.to_csv(pasta / f"om_{cfg.open_meteo_lat}_{cfg.open_meteo_lon}_2020-01-01_2024-12-24.csv")
    monkeypatch.setattr(dados, "CACHE_DIR", pasta)
    engine = create_engine(f"sqlite:///{tmp_path/'api.db'}")
    registro.criar_tabelas(engine)
    registro.garantir_catalogo(engine)
    app.dependency_overrides[get_engine_dep] = lambda: (lambda: engine)
    with TestClient(app) as c:
        yield c, engine, d
    app.dependency_overrides.clear()


def test_endpoint_estima_e_usa_a_incerteza_medida_no_treino(api):
    c, engine, d = api
    registro.concluir_treino(engine, "colheita", colheita.treinar_colheita(d, get_settings()))
    poda = (date.today() + timedelta(days=5)).isoformat()
    j = c.get("/analista/colheita", params={"poda": poda, "cultivar": "syrah"}).json()
    assert j["ok"] and j["colheita_estimada"] and j["janela"] and j["incerteza_dias"] > 0
    assert j["modelo"]["status"] == "ativo" and j["cultivar_nome"] == "Uva Syrah (vinho)"
    cab = c.get("/analista/colheita", params={"poda": poda, "cultivar": "cabernet_sauvignon"}).json()
    assert cab["gd_alvo"] == 2172.0 and cab["colheita_estimada"] > j["colheita_estimada"]    # exige mais soma térmica


def test_endpoint_sem_treino_ainda_estima_mas_avisa(api):
    c, _, _ = api
    j = c.get("/analista/colheita", params={"poda": (date.today() + timedelta(days=5)).isoformat()}).json()
    assert j["ok"] and j["janela"] is None and j["modelo"] is None
    assert any("sem janela de incerteza" in a for a in j["avisos"])


def test_endpoint_erros_amigaveis(api, tmp_path, monkeypatch):
    c, _, _ = api
    assert c.get("/analista/colheita", params={"poda": "2026-13-45"}).status_code == 422
    assert c.get("/analista/colheita", params={"poda": "2026-01-01", "cultivar": "malbec"}).status_code == 422
    assert c.get("/analista/colheita", params={"poda": "2010-01-01"}).json()["ok"] is False
    vazia = tmp_path / "vazia"
    monkeypatch.setattr(dados, "CACHE_DIR", vazia)
    j = c.get("/analista/colheita", params={"poda": "2026-01-01"}).json()
    assert j["ok"] is False and "python -m app.ml.treinar" in j["erro"]
