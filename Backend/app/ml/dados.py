"""Histórico climático do Open-Meteo (reanálise ERA5) para treinar os modelos (RF05: limpeza em Python)."""
import time
from datetime import date, timedelta
from pathlib import Path

import httpx
import pandas as pd

from ..config import Settings

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
HORARIAS = "temperature_2m,relative_humidity_2m,precipitation,et0_fao_evapotranspiration"
ATRASO_ERA5_DIAS = 7          # o histórico fecha com alguns dias de atraso
MIN_HORAS_POR_DIA = 20        # dia com menos horas válidas é descartado
FONTE = "Open-Meteo Archive (ERA5)"
CACHE_DIR = Path(__file__).resolve().parents[2] / ".cache"


class DadosErro(Exception):
    pass


def diario_de_horario(h: pd.DataFrame) -> pd.DataFrame:
    """Agrega horas -> dias. Entrada: índice datetime local, colunas = variáveis horárias."""
    h = h.sort_index()
    g = h.resample("D")
    d = pd.DataFrame({
        "tmean": g["temperature_2m"].mean(), "tmax": g["temperature_2m"].max(), "tmin": g["temperature_2m"].min(),
        "rh": g["relative_humidity_2m"].mean(),
        "chuva": g["precipitation"].sum(min_count=1), "et0": g["et0_fao_evapotranspiration"].sum(min_count=1),
        "_horas": g["temperature_2m"].count(),
    })
    d = d[d["_horas"] >= MIN_HORAS_POR_DIA].drop(columns="_horas")
    return d.dropna()


def _parse(resposta: dict) -> pd.DataFrame:
    h = resposta.get("hourly") or {}
    if not h.get("time"):
        raise DadosErro("Open-Meteo devolveu uma resposta sem dados horários")
    df = pd.DataFrame({k: h.get(k) for k in HORARIAS.split(",")}, index=pd.to_datetime(h["time"]))
    return df.apply(pd.to_numeric, errors="coerce")


def _baixar_bloco(http: httpx.Client, cfg: Settings, ini: date, fim: date, tentativas: int = 4) -> pd.DataFrame:
    params = {"latitude": cfg.open_meteo_lat, "longitude": cfg.open_meteo_lon, "start_date": ini.isoformat(),
              "end_date": fim.isoformat(), "hourly": HORARIAS, "timezone": "America/Recife"}
    for t in range(tentativas):
        try:
            r = http.get(ARCHIVE_URL, params=params)
        except httpx.HTTPError as e:
            if t == tentativas - 1:
                raise DadosErro(f"Open-Meteo inacessível ({type(e).__name__})") from e
            time.sleep(2 * (t + 1))
            continue
        if r.status_code == 429 or r.status_code >= 500:
            if t == tentativas - 1:
                raise DadosErro(f"Open-Meteo respondeu {r.status_code} após {tentativas} tentativas")
            time.sleep(5 * (t + 1))
            continue
        if r.status_code != 200:
            raise DadosErro(f"Open-Meteo respondeu {r.status_code}: {r.text[:200]}")
        return _parse(r.json())
    raise DadosErro("falha inesperada ao baixar o histórico")   # pragma: no cover


def baixar_historico(cfg: Settings, anos: int, hoje: date | None = None, http: httpx.Client | None = None,
                     cache_dir: Path | None = None, pausa_s: float = 0.5, forcar: bool = False) -> pd.DataFrame:
    """Baixa em blocos de até 1 ano (gentil com a API gratuita) e devolve o resumo diário."""
    hoje = hoje or date.today()
    fim = hoje - timedelta(days=ATRASO_ERA5_DIAS)
    ini = fim - timedelta(days=int(365.25 * anos))
    arq = None
    if cache_dir is not None:
        cache_dir.mkdir(parents=True, exist_ok=True)
        arq = cache_dir / f"om_{cfg.open_meteo_lat}_{cfg.open_meteo_lon}_{ini}_{fim}.csv"
        if arq.exists() and not forcar:
            return pd.read_csv(arq, index_col=0, parse_dates=True)

    cliente = http or httpx.Client(timeout=60)
    try:
        blocos, cur = [], ini
        while cur <= fim:
            fim_bloco = min(cur + timedelta(days=364), fim)
            blocos.append(_baixar_bloco(cliente, cfg, cur, fim_bloco))
            cur = fim_bloco + timedelta(days=1)
            if cur <= fim and pausa_s:
                time.sleep(pausa_s)
    finally:
        if http is None:
            cliente.close()
    d = diario_de_horario(pd.concat(blocos))
    d = d[~d.index.duplicated(keep="last")]
    if arq is not None:
        d.to_csv(arq)
    return d


def carregar_cache(cfg: Settings, cache_dir: Path | None = None) -> pd.DataFrame:
    """Lê o histórico diário mais recente já baixado pelo treino (não chama a API)."""
    pasta = cache_dir or CACHE_DIR
    arquivos = sorted(pasta.glob(f"om_{cfg.open_meteo_lat}_{cfg.open_meteo_lon}_*.csv")) if pasta.exists() else []
    if not arquivos:
        raise DadosErro("Histórico climático ainda não baixado. Rode: python -m app.ml.treinar")
    return pd.read_csv(arquivos[-1], index_col=0, parse_dates=True)
