import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine

from app.config import get_settings
from app.db import get_engine_dep
from app.main import app
from app.ml import dados, mercado, preco, previsao, produtividade, registro, treinar
from tests.test_ml import clima_sintetico


def rendimentos(n=25, ini=2001, slope=400.0, ruido=500.0, seed=3) -> pd.DataFrame:
    r = np.random.default_rng(seed)
    anos = np.arange(ini, ini + n)
    y = 24000 + slope * (anos - ini) + r.normal(0, ruido, n)
    return pd.DataFrame({"rendimento_kg_ha": y, "area_ha": 100.0, "producao_t": y / 10}, index=pd.Index(anos, name="ano"))


def precos(meses=96, seed=5) -> pd.DataFrame:
    r = np.random.default_rng(seed)
    idx = pd.period_range("2018-11", periods=meses, freq="M")
    m = np.array([p.month for p in idx])
    an = np.zeros(meses)
    for i in range(1, meses):
        an[i] = 0.55 * an[i - 1] + r.normal(0, 0.04)
    y = np.log(2.8) + 0.15 * np.sin(2 * np.pi * (m - 4) / 12) + an
    return pd.DataFrame({"preco_usd_kg": np.exp(y)}, index=idx)


# ------------------------------------------------------------ produtividade
def test_produtividade_com_tendencia_vence_as_linhas_de_base_e_preve_o_proximo_ano():
    r = produtividade.avaliar(produtividade._serie_continua(rendimentos(slope=600, ruido=300)))
    assert r["mae"] < r["mae_base"] and r["n_teste"] == 8 and r["ultimo_ano"] == 2025
    assert abs(r["previsao"] - (24000 + 600 * 25)) < 1500          # ~ valor esperado para 2026
    assert r["p80"] > 0


def test_produtividade_sem_tendencia_perde_para_a_linha_de_base():
    r = produtividade.avaliar(produtividade._serie_continua(rendimentos(slope=0, ruido=1500)))
    assert r["mae"] > r["mae_base"]            # resultado honesto: o registro marcará "atenção"


def test_serie_continua_preenche_lacuna_curta_e_corta_antes_de_lacuna_longa():
    df = rendimentos()
    df.loc[2010, "rendimento_kg_ha"] = np.nan                      # 1 ano: interpola
    assert not produtividade._serie_continua(df).isna().any() and produtividade._serie_continua(df).index[0] == 2001
    df.loc[2014:2017, "rendimento_kg_ha"] = np.nan                 # 4 anos: só vale a parte contínua mais recente
    assert produtividade._serie_continua(df).index[0] == 2018


def test_produtividade_exige_historico_minimo():
    with pytest.raises(previsao.DadosInsuficientes):
        produtividade.avaliar(produtividade._serie_continua(rendimentos(n=15)))


def test_treinar_produtividade_monta_previsoes_por_produto():
    cfg = get_settings()
    r = produtividade.treinar_produtividade({"uva": rendimentos(), "manga": rendimentos(seed=9)}, cfg)
    assert r.metrica_nome == "MAE kg/ha" and r.parametros["produto"] == "uva"
    rot = [p["rotulo"] for p in r.parametros["previsoes"]]
    assert rot == ["Uva · safra 2026", "Manga · safra 2026"]
    p = r.parametros["previsoes"][0]
    assert p["unidade"] == "kg/ha" and p["faixa"][0] < p["valor"] < p["faixa"][1]


# ------------------------------------------------------------------- preço
def test_preco_vence_as_linhas_de_base_nos_tres_horizontes():
    a = preco.avaliar(precos()["preco_usd_kg"])
    for h in (1, 2, 3):
        v = a["por_horizonte"][h]
        assert v["mae"] < v["mae_base"] and v["n"] >= 8
    assert a["por_horizonte"][3]["mae"] >= a["por_horizonte"][1]["mae"] * 0.9       # mais longe, não mais fácil


def test_preco_previsoes_sao_os_3_meses_seguintes_com_faixa():
    d = precos()
    a = preco.avaliar(d["preco_usd_kg"])
    assert [p["h"] for p in a["previsoes"]] == [1, 2, 3]
    assert a["previsoes"][0]["periodo"] == str(d.index[-1] + 1)
    for p in a["previsoes"]:
        assert p["faixa"][0] < p["valor"] < p["faixa"][1] and 1.5 < p["valor"] < 4.5


def test_preco_aceita_meses_sem_exportacao_e_recusa_pouco_historico():
    d = precos()
    d.loc[d.index.month.isin([1, 2]), "preco_usd_kg"] = np.nan
    assert preco.avaliar(d["preco_usd_kg"])["por_horizonte"][1]["n"] >= 8
    with pytest.raises(previsao.DadosInsuficientes):
        preco.avaliar(precos(meses=50)["preco_usd_kg"])
    recente_vazio = precos()
    recente_vazio.iloc[-8:, 0] = np.nan                                              # 8 meses sem exportar
    with pytest.raises(previsao.DadosInsuficientes, match="sem preço recente"):
        preco.avaliar(recente_vazio["preco_usd_kg"])


def test_treinar_preco_formata_rotulos_em_portugues():
    r = preco.treinar_preco({"uva": precos(), "manga": precos(seed=8)}, get_settings())
    assert r.metrica_nome == "MAE US$/kg" and r.parametros["produto"] == "uva" and len(r.parametros["previsoes"]) == 6
    p = r.parametros["previsoes"][0]
    assert p["rotulo"].startswith("Uva · ") and "/" in p["rotulo"] and p["unidade"] == "US$/kg"
    assert set(r.parametros["por_produto"]["uva"]) == {"1", "2", "3"}


# --------------------------------------------------------- pipeline e API
@pytest.fixture
def engine(tmp_path):
    return create_engine(f"sqlite:///{tmp_path/'f3.db'}")


def test_pipeline_fase3_grava_previsoes_no_registro(engine, monkeypatch):
    monkeypatch.setattr(mercado, "baixar_pam", lambda cfg, p, **k: rendimentos(seed=3 if p == "uva" else 9))
    monkeypatch.setattr(mercado, "baixar_comex", lambda cfg, p, **k: precos(seed=5 if p == "uva" else 8))
    res = treinar.executar(engine, get_settings(), ["produtividade", "preco"], usar_cache=False, pausa_s=0)
    assert set(res) == {"produtividade", "preco"} and "falhou" not in res.values()
    m = {x["id"]: x for x in registro.listar(engine)}
    assert '"previsoes"' in m["produtividade"]["parametros"] and '"previsoes"' in m["preco"]["parametros"]
    assert m["preco"]["status"] in ("ativo", "atencao") and m["preco"]["versao_num"] == 1


def test_uma_fonte_fora_do_ar_nao_derruba_as_outras(engine, monkeypatch):
    monkeypatch.setattr(dados, "baixar_historico", lambda *a, **k: clima_sintetico())
    monkeypatch.setattr(mercado, "baixar_pam", lambda cfg, p, **k: rendimentos())

    def quebra(cfg, p, **k):
        raise dados.DadosErro("ComexStat inacessível (ConnectError)")
    monkeypatch.setattr(mercado, "baixar_comex", quebra)
    res = treinar.executar(engine, get_settings(), ["clima", "produtividade", "preco"], usar_cache=False, pausa_s=0)
    assert res["clima"] == "ativo" and res["produtividade"] in ("ativo", "atencao") and res["preco"] == "falhou"
    m = {x["id"]: x for x in registro.listar(engine)}
    assert "ComexStat" in m["preco"]["erro"] and m["clima"]["erro"] is None


def test_falha_do_clima_nao_derruba_os_modelos_de_mercado(engine, monkeypatch):
    def quebra(*a, **k):
        raise dados.DadosErro("Open-Meteo respondeu 500")
    monkeypatch.setattr(dados, "baixar_historico", quebra)
    monkeypatch.setattr(mercado, "baixar_pam", lambda cfg, p, **k: rendimentos())
    monkeypatch.setattr(mercado, "baixar_comex", lambda cfg, p, **k: precos())
    res = treinar.executar(engine, get_settings(), ["clima", "colheita", "produtividade", "preco"], usar_cache=False, pausa_s=0)
    assert res["clima"] == "falhou" and res["colheita"] == "falhou"
    assert res["produtividade"] != "falhou" and res["preco"] != "falhou"


def test_endpoint_modelos_entrega_previsoes_para_a_tela(engine, monkeypatch):
    monkeypatch.setattr(mercado, "baixar_pam", lambda cfg, p, **k: rendimentos())
    monkeypatch.setattr(mercado, "baixar_comex", lambda cfg, p, **k: precos())
    treinar.executar(engine, get_settings(), ["produtividade", "preco"], usar_cache=False, pausa_s=0)
    app.dependency_overrides[get_engine_dep] = lambda: (lambda: engine)
    try:
        with TestClient(app) as c:
            j = c.get("/analista/modelos").json()
    finally:
        app.dependency_overrides.clear()
    m = {x["id"]: x for x in j["modelos"]}
    assert m["preco"]["parametros"]["previsoes"][0]["unidade"] == "US$/kg"
    assert m["produtividade"]["parametros"]["previsoes"][0]["unidade"] == "kg/ha"
    assert j["resumo"]["planejados"] == 4          # aqui só produtividade e preço foram treinados
