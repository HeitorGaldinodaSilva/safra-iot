"""Relatórios do Produtor: cálculos (ComexStat por mês e por país) e a rota /produtor/relatorios, sem internet."""
import httpx
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.clients import bcb
from app.main import app
from app.ml.dados import DadosErro
from app.services import produtor, relatorios


def _df_mensal(inicio="2024-01", fim="2026-10"):
    idx = pd.period_range(inicio, fim, freq="M")
    kg = np.array([(i % 12 + 1) * 10_000.0 for i in range(len(idx))])
    df = pd.DataFrame({"fob_usd": kg * 2.0, "kg": kg}, index=idx)
    df["preco_usd_kg"] = df["fob_usd"] / df["kg"]
    return df


def test_serie_mensal_traz_o_mesmo_mes_do_ano_anterior():
    s = relatorios.serie_mensal(_df_mensal(), meses=6)
    assert [x["rotulo"] for x in s] == ["Mai", "Jun", "Jul", "Ago", "Set", "Out"]
    assert s[-1]["mes"] == "2026-10" and s[-1]["ton"] == 100.0       # outubro = 10 x 10.000 kg
    assert s[-1]["ton_ano_anterior"] == 100.0 and s[-1]["usd_kg"] == 2.0


def test_serie_mensal_sem_ano_anterior_fica_nula():
    s = relatorios.serie_mensal(_df_mensal("2026-01", "2026-10"), meses=3)
    assert all(x["ton_ano_anterior"] is None for x in s)


def test_indicadores_12_meses_e_acumulado_do_ano():
    df = _df_mensal()
    i = relatorios.indicadores(df)
    assert i["fim"] == "2026-10" and i["ton_12m"] == 780.0            # 12 meses = 2 x (1+...+12) x 10 t... (nov25..out26)
    assert i["var_volume_pct"] == 0.0 and i["preco_usd_kg"] == 2.0
    assert i["ultimo_embarque"] == "2026-10"
    assert i["progresso_ano_pct"] == 100.0


def test_indicadores_variacao_quando_o_volume_cresce():
    df = _df_mensal()
    df.loc[df.index.year == 2026, ["kg", "fob_usd"]] *= 2
    assert relatorios.indicadores(df)["var_volume_pct"] > 0


def _resp_paises():
    linhas = []
    for ano, mes, pais, kg in [(2026, 9, "Países Baixos", 600_000), (2026, 10, "Países Baixos", 400_000), (2026, 10, "Estados Unidos", 300_000),
                               (2026, 10, "Reino Unido", 100_000), (2025, 10, "Países Baixos", 500_000), (2025, 10, "Estados Unidos", 600_000)]:
        linhas.append({"year": str(ano), "monthNumber": mes, "country": pais, "metricFOB": str(kg * 2), "metricKG": str(kg)})
    return {"data": {"list": linhas}}


def test_agregar_destinos_ordena_calcula_pct_e_variacao():
    df = relatorios.interpretar_destinos(_resp_paises())
    r = relatorios.agregar_destinos(df, pd.Period("2026-10", freq="M"), top=3)
    nomes = [d["pais"] for d in r["destinos"]]
    assert nomes == ["Países Baixos", "Estados Unidos", "Reino Unido"]
    nl = r["destinos"][0]
    assert nl["ton"] == 1000.0 and nl["pct"] == pytest.approx(71.4, abs=0.1) and nl["preco_usd_kg"] == 2.0
    assert nl["var_pct"] == 100.0                                       # 1000 t contra 500 t
    assert r["destinos"][1]["var_pct"] == -50.0                         # EUA: 300 t contra 600 t
    assert r["destinos"][2]["var_pct"] is None                          # destino novo
    assert r["total_paises"] == 3


def test_interpretar_destinos_formato_inesperado():
    with pytest.raises(DadosErro):
        relatorios.interpretar_destinos({"data": {"list": [{"foo": 1}]}})
    with pytest.raises(DadosErro):
        relatorios.interpretar_destinos({"data": {"list": []}})


def test_baixar_destinos_envia_detalhe_por_pais_e_guarda_cache(tmp_path):
    from app.config import get_settings
    corpos = []

    def tratar(req):
        corpos.append(__import__("json").loads(req.content))
        return httpx.Response(200, json=_resp_paises())
    fab = lambda verify: httpx.Client(transport=httpx.MockTransport(tratar))
    cfg = get_settings()
    fim = pd.Period("2026-10", freq="M")
    df, escopo = relatorios.baixar_destinos(cfg, "uva", fim, fabrica=fab, cache_dir=tmp_path, espera_s=0)
    assert corpos[0]["details"] == ["country"] and corpos[0]["period"] == {"from": "2024-11", "to": "2026-10"}
    assert corpos[0]["flow"] == "export" and escopo == "PE+BA"
    assert len(df) == 6
    n = len(corpos)
    df2, _ = relatorios.baixar_destinos(cfg, "uva", fim, fabrica=fab, cache_dir=tmp_path, espera_s=0)   # 2ª vez: cache
    assert len(corpos) == n and len(df2) == 6


def test_baixar_destinos_cai_para_brasil_e_avisa(tmp_path):
    from app.config import get_settings

    def tratar(req):
        c = __import__("json").loads(req.content)
        tem_uf = any(f["filter"] == "state" for f in c["filters"])
        return httpx.Response(200, json={"data": {"list": []}} if tem_uf else _resp_paises())
    fab = lambda verify: httpx.Client(transport=httpx.MockTransport(tratar))
    _, escopo = relatorios.baixar_destinos(get_settings(), "uva", pd.Period("2026-10", freq="M"), fabrica=fab, cache_dir=tmp_path, espera_s=0)
    assert escopo == "Brasil"


def test_baixar_destinos_erro_claro(tmp_path):
    from app.config import get_settings
    fab = lambda verify: httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(400, text="bad")))
    with pytest.raises(DadosErro, match="recusou"):
        relatorios.baixar_destinos(get_settings(), "uva", pd.Period("2026-10", freq="M"), fabrica=fab, cache_dir=tmp_path, espera_s=0)


# ---------------------------------------------------------------- rota
@pytest.fixture
def client():
    relatorios.limpar_cache()
    with TestClient(app) as c:
        yield c
    relatorios.limpar_cache()


def _resumo():
    return {"produto": "Uva", "local": "Petrolina",
            "fontes": {"pam": {"ok": True, "erro": None, "rotulo": "IBGE"}, "comex": {"ok": True, "erro": None, "rotulo": "ComexStat"}},
            "area": {"ano": 2025, "ha": 120.5, "variacao_pct": 3.0}, "producao": {"ano": 2026, "toneladas": 900.0, "variacao_pct": 5.0},
            "produtividade": {"ano": 2026, "kg_ha": 31000}, "receita": {"ano": 2026, "usd": 2_000_000, "preco_usd_kg": 2.2, "preco_periodo": "x"}}


def _exp():
    df = _df_mensal()
    dest = relatorios.agregar_destinos(relatorios.interpretar_destinos(_resp_paises()), df.index[-1])
    return {"serie": relatorios.serie_mensal(df, 12), **relatorios.indicadores(df), "destinos": dest, "erro_destinos": None, "escopo_destinos": "PE+BA"}


async def _ptax(http):
    return {"brl_por_usd": 5.0, "data": "2026-11-17"}


def test_rota_relatorios_junta_as_fontes(client, monkeypatch):
    monkeypatch.setattr(produtor, "resumo", lambda cfg: _resumo())
    monkeypatch.setattr(relatorios, "exportacao", lambda cfg, produto, meses=12: _exp())
    monkeypatch.setattr(bcb, "ptax", _ptax)
    r = client.get("/produtor/relatorios")
    assert r.status_code == 200
    j = r.json()
    assert j["producao"]["toneladas"] == 900.0 and j["producao"]["receita_brl"] == 10_000_000
    assert j["exportacao"]["preco_usd_kg"] == 2.0 and j["exportacao"]["preco_brl_kg"] == 10.0
    assert j["exportacao"]["destinos"]["destinos"][0]["pais"] == "Países Baixos"
    assert j["fontes"]["comex"]["ok"] and j["fontes"]["bcb"]["ok"]
    assert len(j["exportacao"]["serie"]) == 12 and "cards" in j["financeiro"]


def test_rota_relatorios_sobrevive_sem_comex_e_sem_cambio(client, monkeypatch):
    monkeypatch.setattr(produtor, "resumo", lambda cfg: _resumo())

    def cai(cfg, produto, meses=12):
        raise DadosErro("ComexStat inacessível")

    async def sem_cambio(http):
        raise bcb.CambioErro("BCB fora do ar")
    monkeypatch.setattr(relatorios, "exportacao", cai)
    monkeypatch.setattr(bcb, "ptax", sem_cambio)
    r = client.get("/produtor/relatorios")
    assert r.status_code == 200
    j = r.json()
    assert j["exportacao"] is None and not j["fontes"]["comex"]["ok"] and "inacessível" in j["fontes"]["comex"]["erro"]
    assert not j["fontes"]["bcb"]["ok"] and j["producao"]["receita_brl"] is None and j["producao"]["receita_usd"] == 2_000_000
