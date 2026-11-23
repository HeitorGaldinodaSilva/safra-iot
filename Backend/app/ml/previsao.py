"""Modelos de previsão do dia seguinte (fase 1): temperatura média (clima) e evapotranspiração ET0 (irrigação).

Avaliação honesta: o modelo é testado no último ano (que não viu no treino) e comparado com duas linhas de base,
"amanhã = hoje" e a climatologia (média histórica daquela data). Só vale como 'ativo' se vencer as duas."""
import time
from typing import Callable

import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from .dados import FONTE
from .registro import ResultadoTreino

VARIAVEIS = ["tmean", "tmax", "tmin", "rh", "chuva", "et0"]
ALGORITMO = "Regressão Ridge (scikit-learn)"


class DadosInsuficientes(Exception):
    pass


def montar_features(d: pd.DataFrame) -> pd.DataFrame:
    x = pd.DataFrame(index=d.index)
    for c in VARIAVEIS:
        x[c] = d[c]
        x[f"{c}_l1"] = d[c].shift(1)
        x[f"{c}_l2"] = d[c].shift(2)
    x["tmean_m7"] = d["tmean"].rolling(7).mean()
    x["et0_m7"] = d["et0"].rolling(7).mean()
    ang = 2 * np.pi * d.index.dayofyear / 365.25
    x["sen_ano"], x["cos_ano"] = np.sin(ang), np.cos(ang)
    return x


def _climatologia(y_treino: pd.Series, dia_alvo_treino: pd.DatetimeIndex, dia_alvo_teste: pd.DatetimeIndex) -> np.ndarray:
    por_dia = y_treino.groupby(dia_alvo_treino.dayofyear).mean().reindex(range(1, 367))
    arr = por_dia.interpolate(limit_direction="both").to_numpy()
    suave = np.convolve(np.r_[arr[-7:], arr, arr[:7]], np.ones(15) / 15, mode="valid")   # janela circular de 15 dias
    return suave[dia_alvo_teste.dayofyear - 1]


def _mape(y: np.ndarray, p: np.ndarray) -> float:
    ok = np.abs(y) > 1e-6
    return float(np.mean(np.abs(y[ok] - p[ok]) / np.abs(y[ok])) * 100)


def treinar_alvo(d: pd.DataFrame, alvo: str, dias_teste: int = 365,
                 progresso: Callable[[int], None] | None = None) -> ResultadoTreino:
    t0 = time.time()
    avisa = progresso or (lambda _p: None)
    x = montar_features(d)
    df = x.assign(_y=d[alvo].shift(-1), _hoje=d[alvo]).dropna()
    if len(df) < dias_teste + 400:
        raise DadosInsuficientes(f"{len(df)} dias úteis; preciso de pelo menos {dias_teste + 400}")
    treino, teste = df.iloc[:-dias_teste], df.iloc[-dias_teste:]
    feats = [c for c in df.columns if not c.startswith("_")]
    avisa(55)

    modelo = make_pipeline(StandardScaler(), Ridge(alpha=1.0)).fit(treino[feats], treino["_y"])
    avisa(75)

    y = teste["_y"].to_numpy()
    prev = modelo.predict(teste[feats])
    mae = float(np.mean(np.abs(y - prev)))
    mae_pers = float(np.mean(np.abs(y - teste["_hoje"].to_numpy())))
    clim = _climatologia(treino["_y"], treino.index + pd.Timedelta(days=1), teste.index + pd.Timedelta(days=1))
    mae_clim = float(np.mean(np.abs(y - clim)))
    mape = _mape(y, prev)
    avisa(90)

    return ResultadoTreino(
        precisao=round(max(0.0, 100 - mape), 1), metrica_nome="MAE", metrica_valor=round(mae, 3),
        baseline_valor=round(min(mae_pers, mae_clim), 3), amostras_treino=len(treino), amostras_teste=len(teste),
        algoritmo=ALGORITMO, fonte_dados=FONTE, duracao_s=round(time.time() - t0, 2),
        parametros={"alvo": alvo, "mape_pct": round(mape, 2), "mae_persistencia": round(mae_pers, 3),
                    "mae_climatologia": round(mae_clim, 3), "dias_teste": dias_teste,
                    "periodo": f"{df.index[0].date()} a {df.index[-1].date()}"})


def lamina_irrigacao(et0_mm: float, chuva_mm: float, kc: float, eficiencia_chuva: float = 0.8) -> float:
    """Balanço hídrico simples (mm/dia): Kc × ET0 − chuva efetiva, nunca negativa.
    Kc é um parâmetro agronômico PROVISÓRIO (KC_CULTURA no .env): valide com a orientação."""
    return round(max(0.0, kc * et0_mm - eficiencia_chuva * chuva_mm), 2)
