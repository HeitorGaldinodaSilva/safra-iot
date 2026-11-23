"""Fase 2 – estimativa de colheita por graus-dia (soma térmica), uva de vinho.

Ideia: a videira precisa acumular uma soma térmica (graus-dia, base 10 °C) entre a poda e a colheita. Com a data da
poda, somamos os graus-dia já observados e projetamos o que falta com a média histórica de cada dia do ano.

Parâmetros: literatura da Embrapa Semiárido (Vale do São Francisco). São de ensaios de poucos ciclos e de uma cultivar
cada: VALIDE com o seu parceiro agrônomo antes de usar como resultado.
"""
import math
import time
from datetime import date, timedelta
from typing import Callable

import numpy as np
import pandas as pd

from ..config import Settings
from .dados import FONTE
from .registro import ResultadoTreino

CULTIVARES = {
    "syrah": {"nome": "Uva Syrah (vinho)", "tbase": 10.0, "gd_colheita": 1939.3, "dias_ref": 118,
              "fonte": "Moura et al. (2007), Embrapa Semiárido: 118 dias, 1.939,3 GD (base 10 °C)"},
    "cabernet_sauvignon": {"nome": "Uva Cabernet Sauvignon (vinho)", "tbase": 10.0, "gd_colheita": 2172.0, "dias_ref": 135,
                           "fonte": "Moura et al., Embrapa Semiárido: média de 2 ciclos (2.137 e 2.207 GD; 132 e 138 dias)"},
}


class ColheitaErro(Exception):
    pass


def gd_dia(tmax, tmin, tbase: float) -> np.ndarray:
    """Graus-dia pelo método de Villa Nova et al. (1972), usado nos estudos da Embrapa."""
    tmax, tmin = np.asarray(tmax, float), np.asarray(tmin, float)
    with np.errstate(divide="ignore", invalid="ignore"):
        meio = (tmax - tbase) ** 2 / (2 * (tmax - tmin))            # mínima abaixo da base, máxima acima
    gd = np.where(tmin >= tbase, (tmax + tmin) / 2 - tbase, np.where(tmax > tbase, meio, 0.0))
    return np.where(np.isfinite(gd), gd, 0.0)


def serie_gd(d: pd.DataFrame, tbase: float) -> pd.Series:
    """Série diária contínua (dias descartados na limpeza são preenchidos pela média daquele dia do ano)."""
    g = pd.Series(gd_dia(d["tmax"], d["tmin"], tbase), index=d.index).asfreq("D")
    if g.isna().any():
        g = g.fillna(g.groupby(g.index.dayofyear).transform("mean")).fillna(g.mean())
    return g


def climatologia_gd(g: pd.Series) -> np.ndarray:
    """Graus-dia médios para cada dia do ano (366 valores, suavizados numa janela circular de 15 dias)."""
    por = g.groupby(g.index.dayofyear).mean().reindex(range(1, 367)).interpolate(limit_direction="both").to_numpy()
    return np.convolve(np.r_[por[-7:], por, por[:7]], np.ones(15) / 15, mode="valid")


def dias_para_acumular(clim: np.ndarray, inicio: pd.Timestamp, restante: float, horizonte: int = 500) -> int | None:
    """Quantos dias (contando 'inicio' como dia 1) a climatologia leva para somar 'restante' graus-dia."""
    doy = (inicio + pd.to_timedelta(np.arange(horizonte), unit="D")).dayofyear.to_numpy()
    k = int(np.searchsorted(np.cumsum(clim[doy - 1]), restante, side="left"))
    return k + 1 if k < horizonte else None


def _erros_cultivar(g: pd.Series, cult: dict, dias_teste: int, passo: int) -> dict:
    v = g.to_numpy()
    n = len(v)
    P = np.r_[0.0, np.cumsum(v)]                    # P[k] = soma dos primeiros k dias
    alvo = cult["gd_colheita"]

    def fim_real(s: int) -> int | None:
        k = int(np.searchsorted(P, P[s] + alvo, side="left"))
        return k - 1 if k <= n else None

    ciclos = [(s, j) for s in range(0, n, passo) if (j := fim_real(s)) is not None]
    if len(ciclos) < 30:
        raise ColheitaErro(f"Histórico curto demais: só {len(ciclos)} ciclos completos")
    ultimo_s = ciclos[-1][0]
    corte = ultimo_s - dias_teste                   # os ciclos de teste começam depois do corte
    treino = [(s, j) for s, j in ciclos if j < corte]
    teste = [(s, j) for s, j in ciclos if s > corte]
    if corte < 730 or len(treino) < 20 or len(teste) < 10:
        raise ColheitaErro(f"Histórico curto demais ({len(treino)} ciclos de treino, {len(teste)} de teste)")

    clim = climatologia_gd(g.iloc[:corte])          # só enxerga o passado do teste
    ciclo_medio = float(np.mean([j - s + 1 for s, j in treino]))
    dia = lambda i: g.index[0] + pd.Timedelta(days=int(i))

    e0, eb, e50, comp = [], [], [], []
    for s, j in teste:
        t0 = dias_para_acumular(clim, dia(s), alvo)                     # previsão no dia da poda
        k = int(np.searchsorted(P, P[s] + 0.5 * alvo, side="left"))
        c = k - 1                                                        # metade da soma térmica já observada
        restante = alvo - (P[c + 1] - P[s])
        t50 = 0 if restante <= 0 else dias_para_acumular(clim, dia(c + 1), restante)
        if t0 is None or t50 is None:
            continue
        e0.append(s + t0 - 1 - j)
        e50.append(c + t50 - j)
        eb.append(s + round(ciclo_medio) - 1 - j)                        # linha de base: poda + N dias fixos
        comp.append(j - s + 1)
    a0, ab, a50 = np.abs(e0), np.abs(eb), np.abs(e50)
    return {"mae": float(a0.mean()), "mae_base": float(ab.mean()), "mae_meio": float(a50.mean()),
            "p80": float(np.percentile(a0, 80)), "mape": float(np.mean(a0 / np.array(comp)) * 100),
            "ciclo_medio": ciclo_medio, "n_treino": len(treino), "n_teste": len(e0),
            "periodo": f"{g.index[0].date()} a {g.index[-1].date()}"}


def treinar_colheita(d: pd.DataFrame, cfg: Settings, dias_teste: int = 365, passo: int = 7,
                     progresso: Callable[[int], None] | None = None) -> ResultadoTreino:
    """Avalia o método com ciclos reais do passado: 'se a poda fosse em X, em que dia o modelo diria que colhe?'
    O erro (em dias) é comparado com a linha de base 'poda + N dias fixos' (N = ciclo médio do treino)."""
    t0 = time.time()
    avisa = progresso or (lambda _p: None)
    padrao = cfg.colheita_cultivar if cfg.colheita_cultivar in CULTIVARES else "syrah"
    por_cultivar = {}
    for i, (cid, cult) in enumerate(CULTIVARES.items()):
        g = serie_gd(d, cult["tbase"])
        por_cultivar[cid] = _erros_cultivar(g, cult, dias_teste, passo)
        avisa(55 + 30 * (i + 1) // len(CULTIVARES))
    r = por_cultivar[padrao]
    cult = CULTIVARES[padrao]
    return ResultadoTreino(
        precisao=round(max(0.0, 100 - r["mape"]), 1), metrica_nome="MAE em dias", metrica_valor=round(r["mae"], 2),
        baseline_valor=round(r["mae_base"], 2), amostras_treino=r["n_treino"], amostras_teste=r["n_teste"],
        algoritmo="Graus-dia (soma térmica) + média histórica diária", fonte_dados=f"{FONTE}; parâmetros Embrapa Semiárido",
        duracao_s=round(time.time() - t0, 2),
        parametros={"cultivar": padrao, "gd_alvo": cult["gd_colheita"], "tbase": cult["tbase"],
                    "erro_p80_dias": round(r["p80"], 1), "mae_meio_ciclo_dias": round(r["mae_meio"], 2),
                    "ciclo_medio_dias": round(r["ciclo_medio"], 1), "periodo": r["periodo"], "dias_teste": dias_teste,
                    "cultivares": {c: v["nome"] for c, v in CULTIVARES.items()},
                    "por_cultivar": {c: {"mae": round(x["mae"], 2), "mae_base": round(x["mae_base"], 2),
                                         "erro_p80_dias": round(x["p80"], 1)} for c, x in por_cultivar.items()}})


def estimar_colheita(d: pd.DataFrame, poda: date, cultivar: str, hoje: date, erro_dias: float | None = None) -> dict:
    """Data estimada de colheita para uma poda: graus-dia observados + média histórica para o que falta."""
    if cultivar not in CULTIVARES:
        raise ColheitaErro(f"Cultivar desconhecida: {cultivar}")
    cult = CULTIVARES[cultivar]
    g = serie_gd(d, cult["tbase"])
    primeiro, ultimo = g.index[0].date(), g.index[-1].date()
    if poda < primeiro:
        raise ColheitaErro(f"A poda é anterior ao histórico disponível (começa em {primeiro:%d/%m/%Y}).")
    if poda > hoje + timedelta(days=365):
        raise ColheitaErro("A data da poda está distante demais no futuro.")
    alvo = cult["gd_colheita"]
    avisos = []

    observado, estimada, situacao = 0.0, None, "projetada"
    if poda <= ultimo:
        acum = g.loc[pd.Timestamp(poda):].cumsum()
        observado = float(acum.iloc[-1])
        if observado >= alvo:
            estimada, situacao = acum.index[int((acum.to_numpy() >= alvo).argmax())].date(), "atingida"
    if estimada is None:
        clim = climatologia_gd(g)
        inicio = max(poda, ultimo + timedelta(days=1))
        t = dias_para_acumular(clim, pd.Timestamp(inicio), alvo - observado)
        if t is None:
            raise ColheitaErro("Não foi possível projetar a colheita com a média histórica.")
        estimada = inicio + timedelta(days=t - 1)

    defasagem = (hoje - ultimo).days
    if poda <= ultimo:
        avisos.append(f"Temperaturas observadas até {ultimo:%d/%m/%Y}; depois disso usamos a média histórica de cada dia.")
    if defasagem > 30:
        avisos.append(f"O histórico baixado tem {defasagem} dias: rode o treino para atualizar.")
    janela = None
    if erro_dias is not None and situacao == "projetada":
        delta = math.ceil(erro_dias)
        janela = {"inicio": (estimada - timedelta(days=delta)).isoformat(), "fim": (estimada + timedelta(days=delta)).isoformat()}
    elif situacao == "projetada":
        avisos.append("Modelo ainda não treinado para esta cultivar: sem janela de incerteza.")

    return {"cultivar": cultivar, "cultivar_nome": cult["nome"], "fonte_parametros": cult["fonte"],
            "poda": poda.isoformat(), "tbase": cult["tbase"], "gd_alvo": alvo, "gd_acumulado": round(observado, 1),
            "progresso_pct": round(min(100.0, observado / alvo * 100), 1), "situacao": situacao,
            "colheita_estimada": estimada.isoformat(), "janela": janela, "incerteza_dias": erro_dias,
            "dias_restantes": (estimada - hoje).days, "dados_ate": ultimo.isoformat(), "avisos": avisos}
