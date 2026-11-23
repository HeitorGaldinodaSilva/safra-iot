"""Fontes abertas da fase 3.

* IBGE SIDRA, tabela 1613 (Produção Agrícola Municipal): rendimento médio anual (kg/ha) por município.
* ComexStat (MDIC): exportações mensais (US$ FOB e kg) por estado de origem e produto.
"""
import time
from datetime import date
from pathlib import Path
from typing import Callable

import httpx
import numpy as np
import pandas as pd

from ..config import Settings
from .dados import CACHE_DIR, DadosErro

SIDRA = "https://apisidra.ibge.gov.br/values"
COMEX = "https://api-comexstat.mdic.gov.br"

PRODUTOS = {
    # "comex": filtros em ordem de preferência (se a API recusar o primeiro formato, tenta o seguinte)
    "uva": {"nome": "Uva", "pam": "2748", "comex": [("subHeading", "080610"), ("ncm", "08061000"), ("heading", "0806")],
            "comex_desc": "uvas frescas (SH6 0806.10)", "comex_texto": ("080610", "0806.10", "8061000", "uvas frescas")},
    "manga": {"nome": "Manga", "pam": "2737", "comex": [("ncm", "08045020"), ("subHeading", "080450"), ("heading", "0804")],
              "comex_desc": "mangas frescas ou secas (NCM 0804.50.20)", "comex_texto": ("08045020", "0804.50.20", "mangas")},
}
ANO_MIN_PAM = 2001      # antes disso a manga (e outras frutas) usava outra unidade de medida no IBGE
MUNICIPIOS_CONHECIDOS = {"2611101": "Petrolina", "2918407": "Juazeiro", "2905701": "Casa Nova"}
FONTE_PAM = "IBGE SIDRA, tabela 1613 (PAM)"
FONTE_COMEX = "ComexStat/MDIC (exportações, US$ FOB por kg)"


# ----------------------------------------------------------------------------- IBGE SIDRA
def _num_sidra(v) -> float | None:
    s = str(v).strip()
    if s in ("", "-", "..", "...", "X"):                 # sem informação / sem produção / dado omitido
        return None
    try:
        return float(s.replace(",", "."))
    except ValueError:
        return None


def interpretar_sidra(linhas: list[dict]) -> pd.DataFrame:
    """Devolve ano × (area_ha, producao_t, rendimento_kg_ha), somando os municípios pedidos."""
    if not isinstance(linhas, list) or len(linhas) < 2:
        raise DadosErro("IBGE SIDRA não devolveu dados para essa consulta")
    cab = linhas[0]

    def col(prefixo: str) -> str | None:
        return next((k for k, v in cab.items() if k.startswith("D") and k.endswith("C") and str(v).startswith(prefixo)), None)

    k_ano, k_var, k_mun = col("Ano"), col("Variável"), col("Município")
    if not (k_ano and k_var and k_mun):
        raise DadosErro(f"Formato inesperado do IBGE SIDRA (colunas: {', '.join(cab)})")
    k_nome = k_mun[:-1] + "N"

    regs = []
    for r in linhas[1:]:
        cod = str(r.get(k_mun))
        esperado = MUNICIPIOS_CONHECIDOS.get(cod)
        if esperado and esperado.lower() not in str(r.get(k_nome, "")).lower():
            raise DadosErro(f"O código {cod} voltou como '{r.get(k_nome)}', não '{esperado}'")
        regs.append({"mun": cod, "ano": int(str(r[k_ano])[:4]), "var": str(r[k_var]), "v": _num_sidra(r.get("V"))})
    df = pd.DataFrame(regs).pivot_table(index=["ano", "mun"], columns="var", values="v", aggfunc="first").reset_index()
    for c in ("112", "214", "216"):
        if c not in df:
            df[c] = np.nan
    n_mun = df["mun"].nunique()
    saida = []
    for ano, g in df.groupby("ano"):
        ok = g[(g["216"] > 0) & (g["214"] > 0)]
        if len(ok) < n_mun:                              # falta algum município: ano incompleto, não arriscar
            continue
        area, prod = float(ok["216"].sum()), float(ok["214"].sum())
        rend = float(ok["112"].iloc[0]) if n_mun == 1 and pd.notna(ok["112"].iloc[0]) else prod * 1000 / area
        saida.append({"ano": int(ano), "area_ha": area, "producao_t": prod, "rendimento_kg_ha": rend})
    if not saida:
        raise DadosErro("Nenhum ano com produção encontrado no IBGE SIDRA")
    return pd.DataFrame(saida).set_index("ano").sort_index().loc[ANO_MIN_PAM:]


def baixar_pam(cfg: Settings, produto: str, http: httpx.Client | None = None, cache_dir: Path | None = CACHE_DIR,
               forcar: bool = False, hoje: date | None = None) -> pd.DataFrame:
    hoje = hoje or date.today()
    if produto not in PRODUTOS:
        raise DadosErro(f"Produto desconhecido: {produto}")
    munis = cfg.pam_municipios
    if not munis:
        raise DadosErro("PAM_MUNICIPIOS vazio no .env")
    arq = None
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        arq = cache_dir / f"pam_{produto}_{'-'.join(munis)}_{hoje.year}.csv"
        if arq.exists() and not forcar:
            return pd.read_csv(arq, index_col=0)
    url = f"{SIDRA}/t/1613/n6/{','.join(munis)}/v/112,214,216/p/all/c82/{PRODUTOS[produto]['pam']}"
    cliente = http or httpx.Client(timeout=120)
    try:
        for t in range(3):
            try:
                r = cliente.get(url)
            except httpx.HTTPError as e:
                if t == 2:
                    raise DadosErro(f"IBGE SIDRA inacessível ({type(e).__name__})") from e
                time.sleep(3 * (t + 1))
                continue
            if r.status_code >= 500 and t < 2:
                time.sleep(3 * (t + 1))
                continue
            if r.status_code != 200:
                raise DadosErro(f"IBGE SIDRA respondeu {r.status_code}")
            try:
                dados = r.json()
            except ValueError as e:
                raise DadosErro("IBGE SIDRA devolveu algo que não é JSON") from e
            df = interpretar_sidra(dados)
            if arq is not None:
                df.to_csv(arq)
            return df
    finally:
        if http is None:
            cliente.close()
    raise DadosErro("falha inesperada no IBGE SIDRA")        # pragma: no cover


# ----------------------------------------------------------------------------- ComexStat
_VERIFY = {"ssl": True}      # o certificado do MDIC (ICP-Brasil) costuma falhar no Python: cai para sem verificação

Fabrica = Callable[[bool], httpx.Client]


def _fabrica_padrao(verify: bool) -> httpx.Client:
    return httpx.Client(timeout=120, verify=verify)


def _post_comex(corpo: dict, fabrica: Fabrica, espera_s: float) -> httpx.Response:
    ultimo: Exception | None = None
    for t in range(4):
        try:
            with fabrica(_VERIFY["ssl"]) as c:
                r = c.post(f"{COMEX}/general", params={"language": "pt"}, json=corpo,
                           headers={"Accept": "application/json", "User-Agent": "safra-modelos"})
        except httpx.ConnectError as e:
            txt = str(e).upper()
            if _VERIFY["ssl"] and ("CERTIFICATE" in txt or "SSL" in txt):
                print("  aviso: certificado do ComexStat não verificado; seguindo sem verificação (dados públicos).")
                _VERIFY["ssl"] = False
                continue
            ultimo = e
            time.sleep(espera_s)
        except httpx.HTTPError as e:
            ultimo = e
            time.sleep(espera_s)
        else:
            if r.status_code in (429, 500, 502, 503, 504) and t < 3:       # a API pede ~10 s de pausa no 429
                time.sleep(espera_s)
                continue
            return r
    raise DadosErro(f"ComexStat inacessível ({type(ultimo).__name__ if ultimo else 'sem resposta'})")


def _mes_atras(hoje: date, n: int) -> str:
    k = hoje.year * 12 + hoje.month - 1 - n
    return f"{k // 12}-{k % 12 + 1:02d}"


def interpretar_comex(dados: dict, fim: pd.Period | None = None) -> pd.DataFrame:
    linhas = (dados.get("data") or {}).get("list") if isinstance(dados, dict) else None
    if not linhas:
        raise DadosErro("ComexStat não devolveu exportações para esse produto/estados")
    regs = []
    for r in linhas:
        ano = next((r[k] for k in ("year", "coAno") if k in r), None)
        mes = next((r[k] for k in ("monthNumber", "coMes", "month") if k in r), None)
        if ano is None or mes is None:
            raise DadosErro(f"Formato inesperado do ComexStat (colunas: {', '.join(r)})")
        regs.append({"periodo": pd.Period(f"{int(ano)}-{int(mes):02d}", freq="M"),
                     "fob_usd": _num_sidra(r.get("metricFOB")) or 0.0, "kg": _num_sidra(r.get("metricKG")) or 0.0})
    df = pd.DataFrame(regs).groupby("periodo").sum()
    ultimo = max(df.index.max(), fim) if fim is not None else df.index.max()      # série até o mês pedido
    df = df.reindex(pd.period_range(df.index.min(), ultimo, freq="M"), fill_value=0.0)
    df["preco_usd_kg"] = np.where(df["kg"] > 0, df["fob_usd"] / df["kg"].where(df["kg"] > 0), np.nan)
    return df


def baixar_comex(cfg: Settings, produto: str, anos: int = 7, fabrica: Fabrica | None = None,
                 cache_dir: Path | None = CACHE_DIR, forcar: bool = False, hoje: date | None = None,
                 espera_s: float = 10.0) -> pd.DataFrame:
    hoje = hoje or date.today()
    if produto not in PRODUTOS:
        raise DadosErro(f"Produto desconhecido: {produto}")
    if not cfg.comex_ufs:
        raise DadosErro("COMEX_UFS vazio no .env")
    arq = None
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        arq = cache_dir / f"comex_{produto}_{'-'.join(map(str, cfg.comex_ufs))}_{hoje.year}-{hoje.month:02d}.csv"
        if arq.exists() and not forcar:
            d = pd.read_csv(arq, index_col=0)
            d.index = pd.PeriodIndex(d.index, freq="M")
            return d
    ini = f"{hoje.year - anos}-{hoje.month:02d}"
    fabrica = fabrica or _fabrica_padrao
    variantes = []
    for filtro, valor in PRODUTOS[produto]["comex"]:
        variantes.append((filtro, valor))
        variantes.append((filtro, int(valor)))                     # a API pode guardar o código como número (sem o zero à esquerda)
    erro = "sem resposta"
    ufs = list(cfg.comex_ufs)
    # 1) descobre o último mês já publicado (pedir um mês ainda não publicado devolve lista vazia)
    fim_ok = None
    for recuo in range(1, 9):
        sonda = {"flow": "export", "monthDetail": True, "period": {"from": _mes_atras(hoje, recuo), "to": _mes_atras(hoje, recuo)},
                 "filters": [], "details": [], "metrics": ["metricFOB"]}
        r = _post_comex(sonda, fabrica, espera_s)
        if r.status_code == 200:
            try:
                if (r.json().get("data") or {}).get("list"):
                    fim_ok = _mes_atras(hoje, recuo)
                    break
            except ValueError:
                pass
    if fim_ok is None:
        raise DadosErro("ComexStat sem dados publicados nos últimos meses (ou API fora do ar)")
    # 2) consulta o produto até esse mês; testa formatos do filtro de estado e, por fim, o Brasil todo
    estados = [("uf", [{"filter": "state", "values": ufs}]),
               ("uf-txt", [{"filter": "state", "values": [str(u) for u in ufs]}]),
               ("brasil", [])]
    for rotulo_uf, filtros_uf in estados:
        for filtro, valor in variantes:
            corpo = {"flow": "export", "monthDetail": True, "period": {"from": ini, "to": fim_ok},
                     "filters": [{"filter": filtro, "values": [valor]}] + filtros_uf,
                     "details": [], "metrics": ["metricFOB", "metricKG"]}
            r = _post_comex(corpo, fabrica, espera_s)
            if r.status_code != 200:
                erro = f"HTTP {r.status_code}: {r.text[:200]}"
                continue
            try:
                df = interpretar_comex(r.json(), fim=pd.Period(fim_ok, freq="M"))
            except ValueError as e:
                raise DadosErro("ComexStat devolveu algo que não é JSON") from e
            except DadosErro as e:
                erro = f"{filtro}={valor} [{rotulo_uf}, até {fim_ok}]: {e}"
                continue
            if arq is not None:
                df.to_csv(arq)
            return df
    # Fallback: pede os produtos de PE/BA detalhados por subposição (sem filtro de produto) e filtra aqui.
    for filtros_uf in ([{"filter": "state", "values": ufs}], [{"filter": "state", "values": [str(u) for u in ufs]}]):
        corpo = {"flow": "export", "monthDetail": True,
                 "period": {"from": _mes_atras(hoje, 14), "to": fim_ok}, "filters": filtros_uf,
                 "details": ["subHeading"], "metrics": ["metricFOB", "metricKG"]}
        try:
            r = _post_comex(corpo, fabrica, espera_s)
            if r.status_code != 200:
                erro = f"fallback HTTP {r.status_code}: {r.text[:150]}"
                continue
            linhas = (r.json().get("data") or {}).get("list") or []
        except (ValueError, DadosErro) as e:
            erro = f"fallback: {e}"
            continue
        alvo = [x for x in linhas if any(t in " ".join(str(v) for k, v in x.items() if not str(k).startswith("metric")).lower()
                                         for t in PRODUTOS[produto].get("comex_texto", ()))]
        if not alvo:
            erro = f"fallback: {len(linhas)} linhas, nenhuma de {produto} (exemplo: {linhas[0] if linhas else 'vazio'})"
            continue
        try:
            df = interpretar_comex({"data": {"list": alvo}}, fim=pd.Period(fim_ok, freq="M"))
        except DadosErro as e:
            erro = f"fallback: {e}"
            continue
        if arq is not None:
            df.to_csv(arq)
        return df
    # última tentativa: usa o cache de um mês anterior, se existir
    if cache_dir is not None:
        antigos = sorted(cache_dir.glob(f"comex_{produto}_{'-'.join(map(str, cfg.comex_ufs))}_*.csv"))
        if antigos:
            d = pd.read_csv(antigos[-1], index_col=0)
            d.index = pd.PeriodIndex(d.index, freq="M")
            return d
    raise DadosErro(f"ComexStat recusou a consulta ({erro})")
