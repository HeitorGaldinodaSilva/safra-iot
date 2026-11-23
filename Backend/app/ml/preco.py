"""Fase 3 – previsão do preço médio de exportação (US$/kg FOB) para os próximos 3 meses (ComexStat).

Método direto por horizonte h: previsão(t+h) = nível(t) + desvio sazonal médio do mês-alvo, onde
  * nível(t) = média dos últimos 12 meses (em log) e
  * desvio sazonal(h, mês) = média histórica de [preço(mês) − nível h meses antes], nos últimos 36 meses.
Teste: origem móvel nos últimos 24 meses, comparado com "igual ao último preço" e "igual ao mesmo mês do ano passado".
ATENÇÃO: é preço de EXPORTAÇÃO (mistura de destinos, variedades e épocas), não preço de mercado interno."""
import time
from typing import Callable

import numpy as np
import pandas as pd

from ..config import Settings
from .mercado import FONTE_COMEX, PRODUTOS
from .previsao import DadosInsuficientes
from .registro import ResultadoTreino

HORIZONTES = (1, 2, 3)
N_TESTE = 24
JANELA_SAZ = 36
MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]


def _desvios(y: pd.Series, nivel: pd.Series, h: int, fim: int) -> tuple[dict[int, float], float]:
    meses = y.index.month
    por_mes: dict[int, list[float]] = {}
    for u in range(max(h, fim - JANELA_SAZ + 1), fim + 1):
        if np.isnan(y.iloc[u]) or np.isnan(nivel.iloc[u - h]):
            continue
        por_mes.setdefault(int(meses[u]), []).append(float(y.iloc[u] - nivel.iloc[u - h]))
    todos = [d for v in por_mes.values() for d in v]
    geral = float(np.mean(todos)) if todos else float("nan")
    return {m: float(np.mean(v)) if len(v) >= 2 else geral for m, v in por_mes.items()}, geral


def _prever(y: pd.Series, nivel: pd.Series, t: int, h: int) -> float:
    dev, geral = _desvios(y, nivel, h, t)
    mes = (int(y.index[t].month) - 1 + h) % 12 + 1
    return float(nivel.iloc[t] + dev.get(mes, geral))


def avaliar(preco: pd.Series) -> dict:
    y = np.log(preco.astype(float))
    nivel = y.rolling(12, min_periods=6).mean()
    n = len(y)
    if y.notna().sum() < N_TESTE + 36 + 6:
        raise DadosInsuficientes(f"{int(y.notna().sum())} meses com exportação; preciso de pelo menos {N_TESTE + 42}")
    pos_obs = [i for i in range(n) if not np.isnan(y.iloc[i])]
    alvos = pos_obs[-N_TESTE:]
    out = {}
    for h in HORIZONTES:
        e_mod, e_naive, e_sn, e_log, comp = [], [], [], [], []
        for u in alvos:
            t = u - h
            if t < 12 or np.isnan(nivel.iloc[t]) or u - 12 < 0 or np.isnan(y.iloc[u - 12]):
                continue
            ult = y.iloc[: t + 1].dropna()
            if ult.empty:
                continue
            real = float(np.exp(y.iloc[u]))
            pred = _prever(y, nivel, t, h)
            if np.isnan(pred):
                continue
            e_mod.append(abs(np.exp(pred) - real))
            e_naive.append(abs(float(np.exp(ult.iloc[-1])) - real))
            e_sn.append(abs(float(np.exp(y.iloc[u - 12])) - real))
            e_log.append(abs(pred - y.iloc[u]))
            comp.append(real)
        if len(e_mod) < 8:
            raise DadosInsuficientes(f"só {len(e_mod)} meses avaliáveis no horizonte de {h} mês(es)")
        out[h] = {"mae": float(np.mean(e_mod)), "mae_naive": float(np.mean(e_naive)), "mae_sazonal": float(np.mean(e_sn)),
                  "mae_base": min(float(np.mean(e_naive)), float(np.mean(e_sn))), "p80_log": float(np.percentile(e_log, 80)),
                  "mape": float(np.mean(np.array(e_mod) / np.array(comp)) * 100), "n": len(e_mod)}
    T = n - 1                                   # a previsão parte do mês mais recente da série, não do último com exportação
    previsoes = []
    for h in HORIZONTES:
        p = _prever(y, nivel, T, h)
        if np.isnan(p):
            raise DadosInsuficientes("sem preço recente para projetar (últimos 6 meses sem exportação)")
        q = out[h]["p80_log"]
        per = preco.index[T] + h
        previsoes.append({"periodo": str(per), "mes": MESES[per.month - 1], "ano": per.year, "h": h,
                          "valor": float(np.exp(p)), "faixa": [float(np.exp(p - q)), float(np.exp(p + q))]})
    return {"por_horizonte": out, "previsoes": previsoes, "n_obs": len(pos_obs), "ultimo": str(preco.index[T]),
            "periodo": f"{preco.index[pos_obs[0]]} a {preco.index[T]}"}


def treinar_preco(series: dict[str, pd.DataFrame], cfg: Settings,
                  progresso: Callable[[int], None] | None = None) -> ResultadoTreino:
    t0 = time.time()
    avisa = progresso or (lambda _p: None)
    padrao = cfg.produto_padrao if cfg.produto_padrao in series else next(iter(series))
    res, previsoes = {}, []
    for i, (prod, df) in enumerate(series.items()):
        r = avaliar(df["preco_usd_kg"])
        res[prod] = r
        for p in r["previsoes"]:
            previsoes.append({"rotulo": f"{PRODUTOS[prod]['nome']} · {p['mes']}/{p['ano']}", "valor": round(p["valor"], 2),
                              "unidade": "US$/kg", "faixa": [round(p["faixa"][0], 2), round(p["faixa"][1], 2)], "produto": prod})
        avisa(55 + 35 * (i + 1) // len(series))
    h1 = res[padrao]["por_horizonte"][1]
    return ResultadoTreino(
        precisao=round(max(0.0, 100 - h1["mape"]), 1), metrica_nome="MAE US$/kg", metrica_valor=round(h1["mae"], 3),
        baseline_valor=round(h1["mae_base"], 3), amostras_treino=res[padrao]["n_obs"], amostras_teste=h1["n"],
        algoritmo="Nível de 12 meses + desvio sazonal (método direto, 1 a 3 meses)", fonte_dados=FONTE_COMEX,
        duracao_s=round(time.time() - t0, 2),
        parametros={"produto": padrao, "periodo": res[padrao]["periodo"], "ufs": list(cfg.comex_ufs),
                    "por_produto": {p: {str(h): {k: (round(v, 4) if isinstance(v, float) else v) for k, v in m.items()}
                                        for h, m in r["por_horizonte"].items()} for p, r in res.items()},
                    "produtos_desc": {p: PRODUTOS[p]["comex_desc"] for p in res}, "previsoes": previsoes})
