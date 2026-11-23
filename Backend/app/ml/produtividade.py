"""Fase 3 – previsão de produtividade (kg/ha) da próxima safra, a partir da série anual do IBGE (PAM).

Modelo: tendência linear (mínimos quadrados) sobre as últimas 8 safras, projetada 1 ano à frente.
Teste: origem móvel nas últimas 8 safras (cada previsão só enxerga os anos anteriores), comparada com duas
linhas de base: "este ano = ano passado" e "média das últimas 3 safras"."""
import time
from typing import Callable

import numpy as np
import pandas as pd

from ..config import Settings
from .mercado import FONTE_PAM, MUNICIPIOS_CONHECIDOS, PRODUTOS
from .previsao import DadosInsuficientes
from .registro import ResultadoTreino

JANELA = 8
N_TESTE = 8
MIN_TREINO = 12


def _tendencia(y: np.ndarray, janela: int = JANELA) -> float:
    y = np.asarray(y, float)[-janela:]
    x = np.arange(len(y))
    b, a = np.polyfit(x, y, 1)
    return float(a + b * len(y))


def _serie_continua(df: pd.DataFrame) -> pd.Series:
    """Rendimento por ano sem buracos: preenche lacunas curtas (até 2 anos) e recusa o resto."""
    y = df["rendimento_kg_ha"].reindex(range(int(df.index.min()), int(df.index.max()) + 1))
    y = y.interpolate(limit=2, limit_area="inside")
    ult = y.last_valid_index()
    corte = y[y.isna()].index.max() if y.isna().any() else None
    if corte is not None:
        y = y.loc[corte + 1:]               # só a parte contínua mais recente
    return y.loc[:ult]


def avaliar(y: pd.Series) -> dict:
    v = y.to_numpy(float)
    if len(v) < N_TESTE + MIN_TREINO:
        raise DadosInsuficientes(f"{len(v)} safras contínuas; preciso de pelo menos {N_TESTE + MIN_TREINO}")
    e_mod, e_pers, e_ma3, comp = [], [], [], []
    for i in range(len(v) - N_TESTE, len(v)):
        real, passado = v[i], v[:i]
        e_mod.append(abs(_tendencia(passado) - real))
        e_pers.append(abs(passado[-1] - real))
        e_ma3.append(abs(passado[-3:].mean() - real))
        comp.append(abs(real))
    mae, mae_p, mae_m = float(np.mean(e_mod)), float(np.mean(e_pers)), float(np.mean(e_ma3))
    return {"mae": mae, "mae_base": min(mae_p, mae_m), "mae_persistencia": mae_p, "mae_media3": mae_m,
            "p80": float(np.percentile(e_mod, 80)), "mape": float(np.mean(np.array(e_mod) / np.array(comp)) * 100),
            "n_treino": len(v) - N_TESTE, "n_teste": N_TESTE, "ultimo_ano": int(y.index[-1]),
            "previsao": _tendencia(v), "periodo": f"{int(y.index[0])} a {int(y.index[-1])}"}


def treinar_produtividade(series: dict[str, pd.DataFrame], cfg: Settings,
                          progresso: Callable[[int], None] | None = None) -> ResultadoTreino:
    t0 = time.time()
    avisa = progresso or (lambda _p: None)
    padrao = cfg.produto_padrao if cfg.produto_padrao in series else next(iter(series))
    por_produto, previsoes = {}, []
    for i, (prod, df) in enumerate(series.items()):
        r = avaliar(_serie_continua(df))
        por_produto[prod] = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in r.items() if k != "previsao"}
        ano = r["ultimo_ano"] + 1
        previsoes.append({"rotulo": f"{PRODUTOS[prod]['nome']} · safra {ano}", "valor": round(r["previsao"], 0),
                          "unidade": "kg/ha", "faixa": [round(r["previsao"] - r["p80"], 0), round(r["previsao"] + r["p80"], 0)],
                          "produto": prod})
        avisa(55 + 35 * (i + 1) // len(series))
    h = por_produto[padrao]
    munis = ", ".join(MUNICIPIOS_CONHECIDOS.get(m, m) for m in cfg.pam_municipios)
    return ResultadoTreino(
        precisao=round(max(0.0, 100 - h["mape"]), 1), metrica_nome="MAE kg/ha", metrica_valor=round(h["mae"], 1),
        baseline_valor=round(h["mae_base"], 1), amostras_treino=h["n_treino"], amostras_teste=h["n_teste"],
        algoritmo=f"Tendência linear das últimas {JANELA} safras", fonte_dados=f"{FONTE_PAM}; {munis}",
        duracao_s=round(time.time() - t0, 2),
        parametros={"produto": padrao, "periodo": h["periodo"], "janela_safras": JANELA, "erro_p80_kg_ha": round(h["p80"], 0),
                    "mae_persistencia": h["mae_persistencia"], "mae_media3": h["mae_media3"],
                    "por_produto": por_produto, "previsoes": previsoes})
