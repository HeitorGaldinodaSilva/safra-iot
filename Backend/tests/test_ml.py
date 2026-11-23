from datetime import date

import httpx
import numpy as np
import pandas as pd
import pytest
from sqlalchemy import create_engine

from app.config import get_settings
from app.ml import dados, previsao, registro, treinar


def clima_sintetico(dias=365 * 5, semente=1) -> pd.DataFrame:
    """5 anos de clima com sazonalidade + 'tempo' persistente (AR1), parecido com a vida real."""
    rng = np.random.default_rng(semente)
    idx = pd.date_range("2020-01-01", periods=dias, freq="D")
    sazonal = np.sin(2 * np.pi * idx.dayofyear / 365.25)
    ruido = np.zeros(dias)
    for i in range(1, dias):
        ruido[i] = 0.6 * ruido[i - 1] + rng.normal(0, 0.8)
    tmean = 27 + 3 * sazonal + ruido
    return pd.DataFrame({"tmean": tmean, "tmax": tmean + 5, "tmin": tmean - 5,
                         "rh": 55 - 10 * sazonal - 3 * ruido, "chuva": np.maximum(0, rng.normal(0.5, 2, dias)),
                         "et0": 5.5 + 1.0 * sazonal + 0.4 * ruido}, index=idx)


def test_treinar_alvo_supera_linhas_de_base_e_reporta_metricas():
    r = previsao.treinar_alvo(clima_sintetico(), "tmean")
    assert r.metrica_nome == "MAE" and r.amostras_teste == 365 and r.amostras_treino > 1000
    assert r.metrica_valor < r.baseline_valor            # vence "amanhã = hoje" e a climatologia
    assert 80 < r.precisao <= 100
    assert {"mae_persistencia", "mae_climatologia", "mape_pct"} <= set(r.parametros)


def test_progresso_e_dados_insuficientes():
    etapas = []
    previsao.treinar_alvo(clima_sintetico(), "et0", progresso=etapas.append)
    assert etapas == sorted(etapas) and etapas[-1] >= 90
    with pytest.raises(previsao.DadosInsuficientes):
        previsao.treinar_alvo(clima_sintetico(dias=500), "tmean")


def test_lamina_de_irrigacao():
    assert previsao.lamina_irrigacao(6.0, 0.0, 0.8) == 4.8
    assert previsao.lamina_irrigacao(6.0, 10.0, 0.8) == 0.0          # chuva forte zera a necessidade
    assert previsao.lamina_irrigacao(5.0, 2.0, 1.0) == 3.4


def _horas(ini: str, n_dias: int, buracos=()):
    idx = pd.date_range(ini, periods=24 * n_dias, freq="h")
    df = pd.DataFrame({"temperature_2m": 25.0 + (idx.hour / 3), "relative_humidity_2m": 50.0,
                       "precipitation": 0.1, "et0_fao_evapotranspiration": 0.25}, index=idx)
    for i in buracos:
        df.iloc[i, 0] = np.nan
    return df


def test_diario_de_horario_agrega_e_descarta_dias_incompletos():
    h = _horas("2026-01-01", 3, buracos=range(48, 48 + 10))      # 3º dia perde 10 horas (<20 válidas)
    d = dados.diario_de_horario(h)
    assert len(d) == 2
    assert d["chuva"].iloc[0] == pytest.approx(2.4) and d["et0"].iloc[0] == pytest.approx(6.0)
    assert d["tmax"].iloc[0] > d["tmean"].iloc[0] > d["tmin"].iloc[0]


def _resposta(ini: date, fim: date):
    idx = pd.date_range(ini, fim + pd.Timedelta(days=1), freq="h", inclusive="left")
    return {"hourly": {"time": [t.strftime("%Y-%m-%dT%H:%M") for t in idx],
                       "temperature_2m": [27.0] * len(idx), "relative_humidity_2m": [50.0] * len(idx),
                       "precipitation": [0.0] * len(idx), "et0_fao_evapotranspiration": [0.2] * len(idx)}}


def test_baixar_historico_em_blocos_com_retry_em_429():
    chamadas = []

    def handler(req: httpx.Request) -> httpx.Response:
        q = req.url.params
        chamadas.append((q["start_date"], q["end_date"]))
        if len(chamadas) == 1:
            return httpx.Response(429, text="limite")
        return httpx.Response(200, json=_resposta(date.fromisoformat(q["start_date"]), date.fromisoformat(q["end_date"])))

    dados.time.sleep = lambda _s: None               # sem esperas nos testes
    http = httpx.Client(transport=httpx.MockTransport(handler))
    d = dados.baixar_historico(get_settings(), anos=2, hoje=date(2026, 11, 14), http=http, pausa_s=0)
    inicios = sorted({c[0] for c in chamadas})
    assert len(inicios) == 3                            # ~2 anos em blocos de até 365 dias
    assert len(chamadas) == 4                           # +1 retry do 429
    assert d.index.max().date() == date(2026, 11, 7)    # fecha com 7 dias de atraso
    assert d["et0"].iloc[0] == pytest.approx(4.8)


def test_baixar_historico_falha_com_mensagem_clara():
    dados.time.sleep = lambda _s: None
    http = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(500)))
    with pytest.raises(dados.DadosErro, match="500"):
        dados.baixar_historico(get_settings(), anos=1, hoje=date(2026, 11, 14), http=http, pausa_s=0)


def test_pipeline_completo_grava_no_registro(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path/'t.db'}")
    d = clima_sintetico()
    monkeypatch.setattr(dados, "baixar_historico", lambda *a, **k: d)
    res = treinar.executar(engine, get_settings(), ["clima", "irrigacao"], usar_cache=False)
    assert res == {"clima": "ativo", "irrigacao": "ativo"}
    m = {x["id"]: x for x in registro.listar(engine)}
    assert m["clima"]["versao_num"] == 1 and m["clima"]["progresso"] == 100 and m["clima"]["precisao"] > 80
    assert m["irrigacao"]["parametros"] and '"kc"' in m["irrigacao"]["parametros"]
    assert m["colheita"]["status"] == "planejado"                  # só entra quando pedido explicitamente
    treinar.executar(engine, get_settings(), ["clima"], usar_cache=False)
    assert {x["id"]: x for x in registro.listar(engine)}["clima"]["versao_num"] == 2
    assert len([e for e in registro.execucoes(engine) if e["modelo_id"] == "clima"]) == 2


def test_falha_de_dados_marca_atencao_sem_apagar_metricas_anteriores(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path/'t.db'}")
    monkeypatch.setattr(dados, "baixar_historico", lambda *a, **k: clima_sintetico())
    treinar.executar(engine, get_settings(), ["clima"], usar_cache=False)

    def quebra(*a, **k):
        raise dados.DadosErro("Open-Meteo respondeu 429 após 4 tentativas")
    monkeypatch.setattr(dados, "baixar_historico", quebra)
    assert treinar.executar(engine, get_settings(), ["clima"], usar_cache=False) == {"clima": "falhou"}
    m = {x["id"]: x for x in registro.listar(engine)}["clima"]
    assert m["status"] == "atencao" and "429" in m["erro"]
    assert m["precisao"] is not None and m["versao_num"] == 1       # métricas do último treino bom continuam
