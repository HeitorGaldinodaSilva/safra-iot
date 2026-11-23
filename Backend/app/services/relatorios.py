"""Tela Produtor > Relatórios com dados reais.

Fontes:
* ComexStat/MDIC  -> exportações mensais, destinos (países) e preço médio US$/kg;
* IBGE PAM        -> área e produção prevista da safra (via `produtor.resumo`);
* BCB (PTAX)      -> converte US$ em R$;
* Cadastro de lavouras (lavouras.json) e movimentações do Financeiro do próprio produtor.
O clima (Open-Meteo) continua vindo de GET /produtor/clima, que a tela já usa.

Cada fonte falha sozinha: se o ComexStat cair, o resto do relatório continua e `fontes` diz o que faltou.
"""
import time
from datetime import date, datetime
from pathlib import Path

import httpx
import numpy as np
import pandas as pd
from fastapi.concurrency import run_in_threadpool

from ..clients import bcb
from ..config import Settings
from ..ml import mercado
from ..ml.dados import DadosErro
from . import financeiro, lavouras, produtor

ROTULO_MES = financeiro.ROTULO_MES
_SIGLA_UF = {11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB",
             26: "PE", 27: "AL", 28: "SE", 29: "BA", 31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC", 43: "RS",
             50: "MS", 51: "MT", 52: "GO", 53: "DF"}


def _nome_ufs(ufs) -> str:
    return "+".join(_SIGLA_UF.get(int(u), str(u)) for u in ufs)
_TTL_OK, _TTL_ERRO = 6 * 3600, 600
_guardado: dict[str, tuple[float, object]] = {}


# ---------------------------------------------------------------- cálculos puros (testáveis sem internet)
def _ton(kg) -> float:
    return round(float(kg) / 1000, 1)


def _var(atual: float, base: float) -> float | None:
    return round((atual / base - 1) * 100, 1) if base and base > 0 else None


def serie_mensal(df: pd.DataFrame, meses: int = 12) -> list[dict]:
    """Toneladas exportadas por mês e o mesmo mês do ano anterior (para comparar)."""
    out = []
    for p, linha in df.iloc[-meses:].iterrows():
        ant = p - 12
        preco = linha["preco_usd_kg"]
        out.append({"mes": str(p), "rotulo": ROTULO_MES[p.month - 1], "ano": p.year, "ton": _ton(linha["kg"]),
                    "ton_ano_anterior": _ton(df.loc[ant, "kg"]) if ant in df.index else None,
                    "usd_kg": None if pd.isna(preco) else round(float(preco), 2)})
    return out


def indicadores(df: pd.DataFrame) -> dict:
    """Últimos 12 meses x 12 anteriores, e o acumulado do ano x mesmo período do ano passado."""
    fim = df.index[-1]
    atual = df[(df.index > fim - 12) & (df.index <= fim)]
    anterior = df[(df.index > fim - 24) & (df.index <= fim - 12)]
    kg, fob = float(atual["kg"].sum()), float(atual["fob_usd"].sum())
    kg_ant = float(anterior["kg"].sum())
    ano = df[(df.index.year == fim.year) & (df.index <= fim)]
    ano_ant = df[(df.index.year == fim.year - 1) & (df.index.month <= fim.month)]
    ytd, ytd_ant = float(ano["kg"].sum()), float(ano_ant["kg"].sum())
    com_embarque = df[df["kg"] > 0]
    return {"fim": str(fim), "ton_12m": _ton(kg), "ton_12m_anterior": _ton(kg_ant), "var_volume_pct": _var(kg, kg_ant),
            "preco_usd_kg": round(fob / kg, 2) if kg > 0 else None,
            "ton_ano": _ton(ytd), "ton_ano_anterior": _ton(ytd_ant),
            "progresso_ano_pct": round(min(ytd / ytd_ant * 100, 100), 0) if ytd_ant > 0 else None,
            "ultimo_embarque": str(com_embarque.index[-1]) if len(com_embarque) else None}


def interpretar_destinos(dados: dict) -> pd.DataFrame:
    linhas = (dados.get("data") or {}).get("list") if isinstance(dados, dict) else None
    if not linhas:
        raise DadosErro("ComexStat não devolveu destinos para esse produto/estados")
    regs = []
    for r in linhas:
        ano = next((r[k] for k in ("year", "coAno") if k in r), None)
        mes = next((r[k] for k in ("monthNumber", "coMes", "month") if k in r), None)
        pais = next((str(r[k]) for k in ("country", "noPais", "pais") if r.get(k) not in (None, "")), None)
        if ano is None or mes is None or pais is None:
            raise DadosErro(f"Formato inesperado do ComexStat por país (colunas: {', '.join(r)})")
        try:
            periodo = pd.Period(f"{int(ano)}-{int(mes):02d}", freq="M")
        except (TypeError, ValueError) as e:
            raise DadosErro(f"Mês inválido no ComexStat: {mes!r}") from e
        regs.append({"periodo": periodo, "pais": pais,
                     "fob_usd": mercado._num_sidra(r.get("metricFOB")) or 0.0, "kg": mercado._num_sidra(r.get("metricKG")) or 0.0})
    return pd.DataFrame(regs).groupby(["periodo", "pais"], as_index=False).sum()


def agregar_destinos(df: pd.DataFrame, fim: pd.Period, top: int = 4) -> dict:
    """Maiores países de destino nos últimos 12 meses e a variação do volume contra os 12 anteriores."""
    atual = df[(df["periodo"] > fim - 12) & (df["periodo"] <= fim)].groupby("pais")[["kg", "fob_usd"]].sum()
    anterior = df[(df["periodo"] > fim - 24) & (df["periodo"] <= fim - 12)].groupby("pais")["kg"].sum()
    atual = atual[atual["kg"] > 0].sort_values("kg", ascending=False)
    total = float(atual["kg"].sum())
    if total <= 0:
        raise DadosErro("ComexStat sem exportações por país nos últimos 12 meses")
    destinos = []
    for pais, l in atual.head(top).iterrows():
        kg = float(l["kg"])
        destinos.append({"pais": pais, "ton": _ton(kg), "pct": round(kg / total * 100, 1),
                         "preco_usd_kg": round(float(l["fob_usd"]) / kg, 2),
                         "var_pct": _var(kg, float(anterior.get(pais, 0.0)))})
    return {"total_paises": int(len(atual)), "total_ton": _ton(total), "destinos": destinos,
            "var_total_pct": _var(total, float(anterior.sum()))}


# ---------------------------------------------------------------- ComexStat por país (rede + cache em disco)
def baixar_destinos(cfg: Settings, produto: str, fim: pd.Period, fabrica=None, cache_dir: Path | None = None,
                    espera_s: float = 10.0) -> tuple[pd.DataFrame, str]:
    """Exportações por país (API ComexStat em janelas de 12 meses + base oficial do MDIC como reserva). Ver comex_destinos.py."""
    from . import comex_destinos
    return comex_destinos.baixar_destinos(cfg, produto, fim, fabrica, cache_dir, espera_s, ao_terminar=limpar_cache)


def exportacao(cfg: Settings, produto: str, meses: int = 12) -> dict:
    """Bloqueante (CSV/HTTP): chame via run_in_threadpool."""
    df = mercado.baixar_comex(cfg, produto)
    out = {"serie": serie_mensal(df, meses), **indicadores(df), "destinos": None, "regioes": [], "erro_destinos": None, "escopo_destinos": None}
    try:
        dest, escopo = baixar_destinos(cfg, produto, df.index[-1])
        out["destinos"] = agregar_destinos(dest, df.index[-1])
        from . import comex_destinos
        out["regioes"] = comex_destinos.agregar_regioes(dest, df.index[-1])
        out["escopo_destinos"] = escopo
    except DadosErro as e:
        out["erro_destinos"] = str(e)
    return out


def _com_cache(chave: str, produzir):
    agora = time.monotonic()
    g = _guardado.get(chave)
    if g and g[0] > agora:
        return g[1]
    try:
        valor = produzir()
        ok = not (isinstance(valor, dict) and valor.get("erro_destinos"))
    except DadosErro as e:
        valor, ok = {"erro": str(e)}, False
    _guardado[chave] = (agora + (_TTL_OK if ok else _TTL_ERRO), valor)
    return valor


def limpar_cache() -> None:
    _guardado.clear()


# ---------------------------------------------------------------- montagem do relatório
def _producao_por_lavoura(filtro: str | None) -> list[dict]:
    itens = []
    for c in lavouras.carregar_cadastro():
        area, t_ha = c.get("area_ha"), c.get("t_ha")
        if area and t_ha:
            itens.append({"nome": c.get("nome"), "talhao": c.get("talhao"), "area_ha": area, "ton": round(area * t_ha, 1)})
    if filtro:
        itens = [i for i in itens if i["nome"] == filtro]
    return sorted(itens, key=lambda i: -i["ton"])


async def montar(http: httpx.AsyncClient, cfg: Settings) -> dict:
    produto = cfg.produto_padrao if cfg.produto_padrao in mercado.PRODUTOS else "uva"
    resumo = await run_in_threadpool(produtor.resumo, cfg)
    exp = await run_in_threadpool(_com_cache, f"exp:{produto}", lambda: exportacao(cfg, produto))
    exp_ok = "erro" not in exp
    cambio, erro_cambio = None, None
    try:
        cambio = await bcb.ptax(http)
    except bcb.CambioErro as e:
        erro_cambio = str(e)

    brl = cambio["brl_por_usd"] if cambio else None
    rec = resumo.get("receita")
    prod, area, produt = resumo.get("producao"), resumo.get("area"), resumo.get("produtividade")
    preco_usd = exp.get("preco_usd_kg") if exp_ok else (rec or {}).get("preco_usd_kg")
    fin = financeiro.resumo("6m", limite=1)

    return {
        "atualizado_em": datetime.now().astimezone().isoformat(),
        "produto": resumo.get("produto"), "local": resumo.get("local"),
        "fontes": {"pam": resumo["fontes"]["pam"], "comex": {"ok": exp_ok and not exp.get("erro_destinos"),
                  "erro": exp.get("erro") or exp.get("erro_destinos"), "rotulo": mercado.FONTE_COMEX},
                  "bcb": {"ok": cambio is not None, "erro": erro_cambio, "rotulo": "Banco Central (PTAX)"}},
        "cambio": cambio,
        "producao": {
            "ano": (prod or {}).get("ano"), "toneladas": (prod or {}).get("toneladas"), "variacao_pct": (prod or {}).get("variacao_pct"),
            "area_ha": (area or {}).get("ha"), "area_ano": (area or {}).get("ano"),
            "produtividade_kg_ha": (produt or {}).get("kg_ha"),
            "receita_usd": (rec or {}).get("usd"), "receita_brl": round(rec["usd"] * brl) if rec and brl else None,
            "por_lavoura": _producao_por_lavoura(None)},
        "exportacao": None if not exp_ok else {
            **{k: v for k, v in exp.items() if k not in ("erro_destinos",)},
            "preco_brl_kg": round(preco_usd * brl, 2) if preco_usd and brl else None,
            "erro_destinos": exp.get("erro_destinos")},
        "financeiro": {"periodo": fin["periodo"], "meses": fin["meses"], "cards": fin["cards"],
                       "total_movimentacoes": fin["total_movimentacoes"]},
    }
