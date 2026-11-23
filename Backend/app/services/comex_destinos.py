"""Exportações por país (destinos) - correção do erro "ComexStat recusou a consulta por país".

Estratégia em camadas (para nunca depender de um único formato da API):
  1) API ComexStat /general com details=["country"], em janelas de 12 meses (a consulta de 24 meses era a que voltava vazia),
     testando os filtros de produto e de estado em vários formatos;
  2) Dados abertos oficiais do MDIC (arquivos EXP_<ano>_MUN.csv + PAIS.csv), baixados UMA vez em segundo plano e guardados
     em .cache. Enquanto baixa, a tela mostra "carregando destinos"; nas próximas vezes é instantâneo.
Também agrupa países em regiões (Europa, Estados Unidos, Canadá...) para a seção "Mercado internacional".
"""
import io
import threading
import unicodedata
from pathlib import Path

import httpx
import pandas as pd

from ..ml import mercado
from ..ml.dados import CACHE_DIR, DadosErro

BASE_MDIC = "https://balanca.economia.gov.br/balanca/bd"
_SIGLA_UF = {26: "PE", 29: "BA", 31: "MG", 35: "SP", 23: "CE", 24: "RN", 25: "PB", 27: "AL", 28: "SE", 22: "PI", 21: "MA", 17: "TO",
             41: "PR", 42: "SC", 43: "RS", 33: "RJ", 32: "ES", 52: "GO", 51: "MT", 50: "MS", 53: "DF", 15: "PA", 13: "AM"}

# ------------------------------------------------------------------ regiões
_EUROPA = {"alemanha", "austria", "belgica", "bulgaria", "croacia", "dinamarca", "eslovaquia", "eslovenia", "espanha", "estonia",
           "finlandia", "franca", "grecia", "holanda", "paises baixos", "hungria", "irlanda", "islandia", "italia", "letonia",
           "lituania", "luxemburgo", "malta", "noruega", "polonia", "portugal", "reino unido", "republica tcheca", "tchequia",
           "romenia", "russia", "suecia", "suica", "ucrania", "chipre", "albania", "servia", "montenegro", "bosnia", "macedonia",
           "moldavia", "belarus", "bielorrussia", "gibraltar", "monaco", "andorra", "liechtenstein", "kosovo"}
_ORIENTE = {"emirados arabes", "arabia saudita", "catar", "qatar", "kuwait", "oma", "bahrein", "israel", "turquia", "iraque", "ira",
            "jordania", "libano", "egito", "siria", "iemen"}
_ASIA = {"china", "japao", "india", "coreia", "singapura", "tailandia", "vietna", "malasia", "indonesia", "filipinas", "hong kong",
         "taiwan", "formosa", "paquistao", "bangladesh", "sri lanka", "camboja", "mianmar", "nepal"}
_AMERICA_LATINA = {"argentina", "chile", "uruguai", "paraguai", "bolivia", "peru", "colombia", "venezuela", "equador", "mexico",
                   "panama", "costa rica", "guatemala", "honduras", "el salvador", "cuba", "jamaica", "trinidad", "suriname",
                   "guiana", "republica dominicana", "barbados", "bahamas", "porto rico", "curacao", "aruba"}


def _norm(txt: str) -> str:
    s = unicodedata.normalize("NFKD", str(txt)).encode("ascii", "ignore").decode().lower()
    return s


def regiao_do_pais(nome: str) -> str:
    n = _norm(nome)
    if n.startswith("estados unidos") or n in ("eua", "usa"):
        return "Estados Unidos"
    if n.startswith("canada"):
        return "Canadá"
    for chave in _EUROPA:
        if chave in n:
            return "Europa"
    for chave in _ORIENTE:
        if n.startswith(chave) or chave in n:
            return "Oriente Médio"
    for chave in _ASIA:
        if chave in n:
            return "Ásia"
    for chave in _AMERICA_LATINA:
        if chave in n:
            return "América Latina"
    return "Outros"


def _var(atual: float, base: float):
    return round((atual / base - 1) * 100, 1) if base and base > 0 else None


def rotulo_demanda(var_pct) -> str:
    """Rótulo derivado da variação REAL do volume exportado (12 meses x 12 meses anteriores)."""
    if var_pct is None:
        return "Sem base de comparação"
    if var_pct >= 10:
        return "Alta demanda"
    if var_pct >= -5:
        return "Demanda estável"
    return "Demanda em queda"


def agregar_regioes(df: pd.DataFrame, fim: pd.Period, top: int = 4) -> list[dict]:
    d = df.copy()
    d["regiao"] = d["pais"].map(regiao_do_pais)
    atual = d[(d["periodo"] > fim - 12) & (d["periodo"] <= fim)].groupby("regiao")[["kg", "fob_usd"]].sum()
    ant = d[(d["periodo"] > fim - 24) & (d["periodo"] <= fim - 12)].groupby("regiao")["kg"].sum()
    atual = atual[atual["kg"] > 0].sort_values("kg", ascending=False)
    total = float(atual["kg"].sum())
    out = []
    for reg, l in atual.head(top).iterrows():
        kg = float(l["kg"])
        v = _var(kg, float(ant.get(reg, 0.0)))
        out.append({"regiao": reg, "ton": round(kg / 1000, 1), "pct": round(kg / total * 100, 1) if total else None,
                    "preco_usd_kg": round(float(l["fob_usd"]) / kg, 2), "var_pct": v, "demanda": rotulo_demanda(v)})
    return out


# ------------------------------------------------------------------ camada 1: API ComexStat em janelas de 12 meses
def _linhas_api(r: httpx.Response) -> list[dict]:
    try:
        return (r.json().get("data") or {}).get("list") or []
    except ValueError:
        return []


def _via_api(cfg, produto: str, fim: pd.Period, fabrica, espera_s: float) -> tuple[pd.DataFrame, str] | None:
    from .relatorios import interpretar_destinos
    ufs = list(cfg.comex_ufs)
    variantes = []
    for filtro, valor in mercado.PRODUTOS[produto]["comex"]:
        variantes += [(filtro, valor), (filtro, int(valor))]
    escopos = [("uf", [{"filter": "state", "values": ufs}]), ("uf", [{"filter": "state", "values": [str(u) for u in ufs]}]),
               ("br", [])]
    janelas = [(fim - 23, fim - 12), (fim - 11, fim)]
    for escopo, filtros_uf in escopos:
        for filtro, valor in variantes:
            linhas = []
            for ini, f in janelas:
                corpo = {"flow": "export", "monthDetail": True, "period": {"from": str(ini), "to": str(f)},
                         "filters": [{"filter": filtro, "values": [valor]}] + filtros_uf,
                         "details": ["country"], "metrics": ["metricFOB", "metricKG"]}
                try:
                    r = mercado._post_comex(corpo, fabrica, espera_s)
                except DadosErro:
                    break
                if r.status_code != 200:
                    break
                linhas += _linhas_api(r)
            if linhas:
                try:
                    return interpretar_destinos({"data": {"list": linhas}}), ("UF" if escopo == "uf" else "Brasil")
                except DadosErro:
                    continue
    return None


# ------------------------------------------------------------------ camada 2: arquivos abertos do MDIC (segundo plano)
_trava = threading.Lock()
_rodando: dict[str, str] = {}      # chave -> mensagem de andamento
_erros: dict[str, tuple[float, str]] = {}   # chave -> (quando, erro); evita reiniciar o download em loop


def _ler_csv_bytes(b: bytes, **kw) -> pd.DataFrame:
    for enc in ("utf-8", "latin-1"):
        try:
            return pd.read_csv(io.BytesIO(b), sep=";", encoding=enc, **kw)
        except UnicodeDecodeError:
            continue
    raise DadosErro("Arquivo do MDIC com codificação desconhecida")


def _baixar_para_disco(url: str, destino: Path, progresso=None) -> None:
    ultimo = "sem resposta"
    for u in (url, url.replace("https://", "http://")):
        for verify in (True, False):          # o certificado do governo costuma falhar no Python
            try:
                with httpx.stream("GET", u, timeout=httpx.Timeout(60, read=600), verify=verify, follow_redirects=True) as r:
                    if r.status_code != 200:
                        ultimo = f"HTTP {r.status_code} em {u}"
                        break
                    baixado = 0
                    with open(destino, "wb") as f:
                        for pedaco in r.iter_bytes(1 << 20):
                            f.write(pedaco)
                            baixado += len(pedaco)
                            if progresso:
                                progresso(baixado // (1 << 20))
                return
            except httpx.HTTPError as e:
                ultimo = f"{type(e).__name__}: {e} ({u})"
                continue
    raise DadosErro(f"não consegui baixar {url.rsplit('/', 1)[-1]} - {ultimo}")


def _tabela_paises(cache_dir: Path) -> dict[int, str]:
    arq = cache_dir / "mdic_PAIS.csv"
    if not arq.exists():
        _baixar_para_disco(f"{BASE_MDIC}/tabelas/PAIS.csv", arq)
    df = _ler_csv_bytes(arq.read_bytes(), dtype=str)
    return {int(c): n for c, n in zip(df["CO_PAIS"], df["NO_PAIS"]) if str(c).strip().isdigit()}


def processar_mun(arquivo: Path, sh4: str, siglas: set[str], paises: dict[int, str]) -> pd.DataFrame:
    """Lê EXP_<ano>_MUN.csv em pedaços e devolve periodo/pais/fob_usd/kg só do produto e dos estados pedidos."""
    partes = []
    for ch in pd.read_csv(arquivo, sep=";", encoding="latin-1", dtype=str, chunksize=500_000):
        ch.columns = [c.strip().upper() for c in ch.columns]
        col_sh = "SH4" if "SH4" in ch else next((c for c in ch if c.startswith("SH")), None)
        col_uf = next((c for c in ch if c.startswith("SG_UF")), None)
        if not col_sh or not col_uf:
            raise DadosErro(f"Colunas inesperadas no arquivo do MDIC: {', '.join(ch.columns)}")
        m = ch[col_sh].str.strip().str.zfill(4).eq(sh4)
        if siglas:
            m &= ch[col_uf].str.strip().isin(siglas)
        if m.any():
            partes.append(ch[m])
    if not partes:
        return pd.DataFrame(columns=["periodo", "pais", "fob_usd", "kg"])
    d = pd.concat(partes)
    d["periodo"] = [pd.Period(f"{int(a)}-{int(m):02d}", freq="M") for a, m in zip(d["CO_ANO"], d["CO_MES"])]
    d["pais"] = [paises.get(int(c), f"País {c}") for c in d["CO_PAIS"]]
    d["fob_usd"] = pd.to_numeric(d["VL_FOB"], errors="coerce").fillna(0.0)
    d["kg"] = pd.to_numeric(d["KG_LIQUIDO"], errors="coerce").fillna(0.0)
    return d.groupby(["periodo", "pais"], as_index=False)[["fob_usd", "kg"]].sum()


def _job_bulk(cfg, produto: str, fim: pd.Period, arq_final: Path, chave: str, ao_terminar) -> None:
    try:
        cache_dir = arq_final.parent
        sh4 = str(mercado.PRODUTOS[produto]["comex"][0][1])[:4].zfill(4)
        siglas = {_SIGLA_UF[int(u)] for u in cfg.comex_ufs if int(u) in _SIGLA_UF}
        paises = _tabela_paises(cache_dir)
        tabelas = []
        for ano in sorted({(fim - 23).year, fim.year}):
            tmp = cache_dir / f"mdic_EXP_{ano}_MUN.csv"
            _rodando[chave] = f"baixando dados oficiais do MDIC ({ano})"
            _baixar_para_disco(f"{BASE_MDIC}/comexstat-bd/mun/EXP_{ano}_MUN.csv", tmp,
                               lambda mb, ano=ano: _rodando.__setitem__(chave, f"baixando EXP_{ano}_MUN.csv ({mb} MB)"))
            _rodando[chave] = f"filtrando EXP_{ano}_MUN.csv"
            try:
                tabelas.append(processar_mun(tmp, sh4, siglas, paises))
            finally:
                tmp.unlink(missing_ok=True)
        df = pd.concat(tabelas, ignore_index=True)
        df = df[(df["periodo"] >= fim - 23) & (df["periodo"] <= fim)]
        if df.empty:
            raise DadosErro("arquivos do MDIC sem exportações desse produto nos estados configurados")
        d = df.copy()
        d["periodo"] = d["periodo"].astype(str)
        d.to_csv(arq_final, index=False)
        _rodando.pop(chave, None)
        ao_terminar()
    except Exception as e:                                       # noqa: BLE001 - o job nunca pode derrubar a API
        import time, traceback
        traceback.print_exc()
        print(f"[destinos MDIC] FALHOU: {e}")
        _rodando.pop(chave, None)
        _erros[chave] = (time.time(), f"{type(e).__name__}: {e}")


def _bulk_em_segundo_plano(cfg, produto, fim, arq_final: Path, ao_terminar) -> str:
    chave = arq_final.name
    with _trava:
        import time
        estado = _rodando.get(chave)
        falha = _erros.get(chave)
        if estado is None and falha and time.time() - falha[0] < 900:
            return (f"Falha ao baixar a base oficial do MDIC: {falha[1]}. Rode 'python diagnostico_destinos.py' na pasta Backend "
                    "e me envie o resultado (nova tentativa automática em até 15 min).")
        if estado is None:
            _erros.pop(chave, None)
            _rodando[chave] = "iniciando download dos dados oficiais do MDIC"
            threading.Thread(target=_job_bulk, args=(cfg, produto, fim, arq_final, chave, ao_terminar), daemon=True).start()
            return "Carregando destinos pela base oficial do MDIC (primeira vez, pode levar alguns minutos). Atualize a página depois."
        return f"Carregando destinos: {estado}. Atualize a página em alguns minutos."


# ------------------------------------------------------------------ função pública
def baixar_destinos(cfg, produto: str, fim: pd.Period, fabrica=None, cache_dir: Path | None = None, espera_s: float = 10.0,
                    ao_terminar=lambda: None) -> tuple[pd.DataFrame, str]:
    cache_dir = cache_dir or CACHE_DIR
    cache_dir.mkdir(parents=True, exist_ok=True)
    nome_ufs = "-".join(map(str, cfg.comex_ufs))
    siglas = "+".join(_SIGLA_UF.get(int(u), str(u)) for u in cfg.comex_ufs)
    for sufixo, rot in ((nome_ufs, siglas), ("br", "Brasil")):
        arq = cache_dir / f"comex_destinos_{produto}_{sufixo}_{fim}.csv"
        if arq.exists():
            d = pd.read_csv(arq)
            d["periodo"] = pd.PeriodIndex(d["periodo"], freq="M")
            return d, rot
    # 1) API
    r = _via_api(cfg, produto, fim, fabrica or mercado._fabrica_padrao, espera_s)
    if r is not None:
        df, escopo = r
        d = df.copy()
        d["periodo"] = d["periodo"].astype(str)
        d.to_csv(cache_dir / f"comex_destinos_{produto}_{nome_ufs if escopo == 'UF' else 'br'}_{fim}.csv", index=False)
        return df, siglas if escopo == "UF" else "Brasil"
    # 2) base oficial em segundo plano
    raise DadosErro(_bulk_em_segundo_plano(cfg, produto, fim, cache_dir / f"comex_destinos_{produto}_{nome_ufs}_{fim}.csv", ao_terminar))
