import json
from datetime import date

import httpx
import numpy as np
import pytest

from app.config import get_settings
from app.ml import mercado
from app.ml.dados import DadosErro

CAB = {"NC": "Nível Territorial (Código)", "NN": "Nível Territorial", "MC": "Unidade de Medida (Código)",
       "MN": "Unidade de Medida", "V": "Valor", "D1C": "Município (Código)", "D1N": "Município",
       "D2C": "Variável (Código)", "D2N": "Variável", "D3C": "Ano (Código)", "D3N": "Ano",
       "D4C": "Produto das lavouras permanentes (Código)", "D4N": "Produto das lavouras permanentes"}


def linha(mun, nome, var, ano, v):
    return {"NC": "6", "NN": "Município", "MC": "1", "MN": "x", "V": str(v), "D1C": mun, "D1N": f"{nome} - PE",
            "D2C": var, "D2N": "x", "D3C": str(ano), "D3N": str(ano), "D4C": "2748", "D4N": "Uva"}


def sidra(anos: dict[int, tuple], mun="2611101", nome="Petrolina"):
    """anos: {ano: (rendimento, producao_t, area_ha)}"""
    out = [CAB]
    for ano, (rend, prod, area) in anos.items():
        out += [linha(mun, nome, "112", ano, rend), linha(mun, nome, "214", ano, prod), linha(mun, nome, "216", ano, area)]
    return out


def test_interpretar_sidra_um_municipio_usa_o_rendimento_do_ibge_e_ignora_antes_de_2001():
    df = mercado.interpretar_sidra(sidra({1999: (9000, 90, 10), 2001: (25000, 2500, 100), 2002: (26000, 2600, 100)}))
    assert list(df.index) == [2001, 2002]                   # 1999 fica de fora (unidades antigas)
    assert df.loc[2002, "rendimento_kg_ha"] == 26000 and df.loc[2002, "area_ha"] == 100


def test_interpretar_sidra_marcadores_de_sem_dado_e_anos_sem_producao():
    linhas = sidra({2001: (25000, 2500, 100), 2002: (26000, 2600, 100)})
    for r in linhas[1:]:
        if r["D3C"] == "2002":
            r["V"] = "-" if r["D2C"] != "216" else "..."          # sem produção / sem informação
    df = mercado.interpretar_sidra(linhas)
    assert list(df.index) == [2001]


def test_interpretar_sidra_varios_municipios_pondera_por_area_e_exige_todos():
    a = sidra({2001: (30000, 3000, 100), 2002: (30000, 3000, 100)})
    b = sidra({2001: (10000, 1000, 100)}, mun="2918407", nome="Juazeiro")           # Juazeiro sem 2002
    df = mercado.interpretar_sidra(a + b[1:])
    assert list(df.index) == [2001]                                                  # 2002 incompleto: descartado
    assert df.loc[2001, "rendimento_kg_ha"] == pytest.approx(20000)                  # (3000+1000) t / 200 ha


def test_interpretar_sidra_detecta_municipio_trocado_e_formato_estranho():
    with pytest.raises(DadosErro, match="não 'Petrolina'"):
        mercado.interpretar_sidra(sidra({2001: (1, 1, 1)}, nome="Recife"))
    with pytest.raises(DadosErro, match="Formato inesperado"):
        mercado.interpretar_sidra([{"A": "x"}, {"A": "1"}])
    with pytest.raises(DadosErro, match="não devolveu dados"):
        mercado.interpretar_sidra([CAB])


def test_baixar_pam_monta_a_url_certa_usa_cache_e_tenta_de_novo(tmp_path, monkeypatch):
    monkeypatch.setattr(mercado.time, "sleep", lambda _s: None)
    urls = []

    def handler(req: httpx.Request):
        urls.append(str(req.url))
        if len(urls) == 1:
            return httpx.Response(503)
        return httpx.Response(200, json=sidra({2001: (25000, 2500, 100), 2002: (26000, 2600, 100)}))

    http = httpx.Client(transport=httpx.MockTransport(handler))
    cfg = get_settings()
    df = mercado.baixar_pam(cfg, "uva", http=http, cache_dir=tmp_path, hoje=date(2026, 11, 15))
    assert urls[-1] == "https://apisidra.ibge.gov.br/values/t/1613/n6/2611101/v/112,214,216/p/all/c82/2748"
    assert len(urls) == 2 and df.loc[2002, "rendimento_kg_ha"] == 26000
    again = mercado.baixar_pam(cfg, "uva", http=http, cache_dir=tmp_path, hoje=date(2026, 11, 15))      # do cache
    assert len(urls) == 2 and again.loc[2002, "rendimento_kg_ha"] == 26000
    mercado.baixar_pam(cfg, "manga", http=http, cache_dir=tmp_path, hoje=date(2026, 11, 15))
    assert urls[-1].endswith("/c82/2737")


def test_baixar_pam_erros_claros(tmp_path):
    http = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(404)))
    with pytest.raises(DadosErro, match="404"):
        mercado.baixar_pam(get_settings(), "uva", http=http, cache_dir=None)
    with pytest.raises(DadosErro, match="desconhecido"):
        mercado.baixar_pam(get_settings(), "abacaxi", http=http, cache_dir=None)


# ---------------------------------------------------------------- ComexStat
def comex(linhas):
    return {"data": {"list": linhas, "count": len(linhas)}}


def test_interpretar_comex_preenche_meses_sem_exportacao_e_soma_duplicados():
    df = mercado.interpretar_comex(comex([
        {"year": "2025", "monthNumber": "01", "metricFOB": "3000", "metricKG": "1000"},
        {"year": "2025", "monthNumber": "01", "metricFOB": "1000", "metricKG": "500"},     # outro estado/linha: soma
        {"year": "2025", "monthNumber": "04", "metricFOB": "2000", "metricKG": "1000"},
    ]))
    assert len(df) == 4 and str(df.index[0]) == "2025-01"
    assert df.loc["2025-01", "preco_usd_kg"] == pytest.approx(4000 / 1500)
    assert np.isnan(df.loc["2025-02", "preco_usd_kg"]) and df.loc["2025-04", "preco_usd_kg"] == 2.0


def test_interpretar_comex_estende_a_serie_ate_o_mes_pedido():
    df = mercado.interpretar_comex(comex([{"year": "2025", "monthNumber": "01", "metricFOB": "100", "metricKG": "50"}]),
                                   fim=mercado.pd.Period("2025-04", freq="M"))
    assert str(df.index[-1]) == "2025-04" and np.isnan(df["preco_usd_kg"].iloc[-1])      # sem exportação ≠ sem consulta


def test_interpretar_comex_erros():
    with pytest.raises(DadosErro, match="não devolveu exportações"):
        mercado.interpretar_comex(comex([]))
    with pytest.raises(DadosErro, match="Formato inesperado"):
        mercado.interpretar_comex(comex([{"ano": "x"}]))


def _resp(status=200, linhas=None):
    linhas = linhas if linhas is not None else [{"year": "2025", "monthNumber": "01", "metricFOB": "100", "metricKG": "50"}]
    return httpx.Response(status, json=comex(linhas) if status == 200 else {"message": "erro"})


def _fabrica(handler):
    return lambda verify: httpx.Client(transport=httpx.MockTransport(handler))


def test_baixar_comex_corpo_da_requisicao(tmp_path):
    corpos = []

    def handler(req):
        corpos.append(json.loads(req.content))
        assert req.url.params["language"] == "pt"
        return _resp()

    mercado.baixar_comex(get_settings(), "uva", anos=7, fabrica=_fabrica(handler), cache_dir=tmp_path,
                         hoje=date(2026, 11, 15), espera_s=0)
    c = corpos[0]
    assert c["flow"] == "export" and c["monthDetail"] is True and c["details"] == []
    assert c["period"] == {"from": "2019-11", "to": "2026-10"}
    assert {"filter": "subHeading", "values": ["080610"]} in c["filters"]
    assert {"filter": "state", "values": [26, 29]} in c["filters"]
    assert c["metrics"] == ["metricFOB", "metricKG"]


def test_baixar_comex_recua_o_mes_final_e_tenta_ncm_como_numero():
    corpos = []

    def handler(req):
        c = json.loads(req.content)
        corpos.append(c)
        ncm = next(f for f in c["filters"] if f["filter"] == "ncm")["values"][0]
        if c["period"]["to"] == "2026-10" or isinstance(ncm, str):
            return _resp(400)                         # mês ainda não publicado / NCM só aceito como número
        return _resp()

    df = mercado.baixar_comex(get_settings(), "manga", fabrica=_fabrica(handler), cache_dir=None,
                              hoje=date(2026, 11, 15), espera_s=0)
    ultimo = corpos[-1]
    assert ultimo["period"]["to"] == "2026-09"                       # 2026-10 ainda não publicado: recuou 1 mês
    assert str(df.index[-1]) == "2026-09"                            # a série vai até o mês consultado
    assert next(f for f in ultimo["filters"] if f["filter"] == "ncm")["values"] == [8045020]


def test_baixar_comex_alterna_filtro_do_produto_e_detalhe_por_estado():
    corpos = []

    def handler(req):
        c = json.loads(req.content)
        corpos.append(c)
        if c["filters"][0]["filter"] == "subHeading" or c["details"] == []:      # só aceita NCM com detalhe por estado
            return _resp(400)
        return _resp(200, [{"year": "2025", "monthNumber": "01", "state": "Pernambuco", "metricFOB": "100", "metricKG": "50"},
                           {"year": "2025", "monthNumber": "01", "state": "Bahia", "metricFOB": "300", "metricKG": "100"}])

    df = mercado.baixar_comex(get_settings(), "uva", fabrica=_fabrica(handler), cache_dir=None,
                              hoje=date(2026, 11, 15), espera_s=0)
    ultimo = corpos[-1]
    assert ultimo["filters"][0] == {"filter": "ncm", "values": ["08061000"]} and ultimo["details"] == ["state"]
    assert df.loc["2025-01", "preco_usd_kg"] == pytest.approx(400 / 150)           # os estados são somados


def test_baixar_comex_429_ssl_e_recusa_total(monkeypatch):
    monkeypatch.setattr(mercado.time, "sleep", lambda _s: None)
    chamadas = {"n": 0}

    def handler(req):
        chamadas["n"] += 1
        return _resp(429) if chamadas["n"] == 1 else _resp()

    mercado.baixar_comex(get_settings(), "uva", fabrica=_fabrica(handler), cache_dir=None, hoje=date(2026, 11, 15), espera_s=0)
    assert chamadas["n"] == 2                                         # 429 → espera → ok

    estados = []

    def fab(verify):
        estados.append(verify)

        def handler2(req):
            if verify:
                raise httpx.ConnectError("[SSL: CERTIFICATE_VERIFY_FAILED] unable to get local issuer certificate")
            return _resp()
        return httpx.Client(transport=httpx.MockTransport(handler2))

    mercado._VERIFY["ssl"] = True
    mercado.baixar_comex(get_settings(), "uva", fabrica=fab, cache_dir=None, hoje=date(2026, 11, 15), espera_s=0)
    assert estados[:2] == [True, False] and mercado._VERIFY["ssl"] is False
    mercado._VERIFY["ssl"] = True

    with pytest.raises(DadosErro, match="recusou a consulta"):
        mercado.baixar_comex(get_settings(), "uva", fabrica=_fabrica(lambda r: _resp(400)), cache_dir=None,
                             hoje=date(2026, 11, 15), espera_s=0)


def test_baixar_comex_cache_mensal(tmp_path):
    n = {"v": 0}

    def handler(req):
        n["v"] += 1
        return _resp()

    f = _fabrica(handler)
    mercado.baixar_comex(get_settings(), "uva", fabrica=f, cache_dir=tmp_path, hoje=date(2026, 11, 15), espera_s=0)
    d = mercado.baixar_comex(get_settings(), "uva", fabrica=f, cache_dir=tmp_path, hoje=date(2026, 11, 20), espera_s=0)
    assert n["v"] == 1 and d.loc["2025-01", "preco_usd_kg"] == 2.0           # mesmo mês: lê do cache
    mercado.baixar_comex(get_settings(), "uva", fabrica=f, cache_dir=tmp_path, hoje=date(2026, 12, 2), espera_s=0)
    assert n["v"] == 2                                                         # mês novo: baixa de novo
