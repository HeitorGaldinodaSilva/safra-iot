"""Treina os modelos e grava as métricas no registro (MySQL).

    python -m app.ml.treinar                       # os 5 modelos implementados
    python -m app.ml.treinar --modelo preco        # só um (clima, irrigacao, colheita, produtividade, preco)
    python -m app.ml.treinar --sem-cache           # baixa tudo de novo (e regrava o cache)

Cada fonte falha sozinha: se o ComexStat estiver fora do ar, os modelos de clima continuam sendo treinados.
"""
import argparse
import sys
import time

from ..config import get_settings
from ..db import get_engine
from . import colheita, dados, mercado, preco, previsao, produtividade, registro

ALVOS = {"clima": "tmean", "irrigacao": "et0"}                  # previsão do dia seguinte (Open-Meteo)
CLIMA = [*ALVOS, "colheita"]                                    # usam o histórico climático
MODELOS = [*CLIMA, "produtividade", "preco"]


def _resumo(r) -> str:
    return f"{r.metrica_nome} {r.metrica_valor} (base {r.baseline_valor}) | precisão {r.precisao}%"


def executar(engine, cfg, ids: list[str], usar_cache: bool = True, http=None, pausa_s: float = 0.5) -> dict[str, str]:
    registro.criar_tabelas(engine)
    registro.garantir_catalogo(engine)
    for i in ids:
        registro.iniciar_treino(engine, i, 5)
    resultado: dict[str, str] = {}

    def falhou(i: str, e: Exception) -> None:
        registro.falhar_treino(engine, i, f"{type(e).__name__}: {e}")
        resultado[i] = "falhou"
        print(f"  {i}: FALHOU - {e}")

    d = None
    if any(i in CLIMA for i in ids):
        try:
            print("Baixando histórico climático do Open-Meteo...")
            d = dados.baixar_historico(cfg, cfg.anos_treino, http=http, cache_dir=dados.CACHE_DIR, pausa_s=pausa_s,
                                       forcar=not usar_cache)
            print(f"  {len(d)} dias ({d.index[0].date()} a {d.index[-1].date()})")
            for i in ids:
                if i in CLIMA:
                    registro.atualizar_progresso(engine, i, 40)
        except Exception as e:                  # falha de clima derruba só os modelos que dependem dele
            for i in ids:
                if i in CLIMA:
                    falhou(i, e)

    for i in ids:
        if i in resultado:
            continue
        avanca = lambda p, i=i: registro.atualizar_progresso(engine, i, p)
        try:
            if i in ALVOS:
                r = previsao.treinar_alvo(d, ALVOS[i], progresso=avanca)
                if i == "irrigacao":
                    r.parametros.update({"kc": cfg.kc_cultura, "formula": "lâmina = Kc × ET0 − 0,8 × chuva"})
            elif i == "colheita":
                r = colheita.treinar_colheita(d, cfg, progresso=avanca)
            elif i == "produtividade":
                print("Baixando produtividade do IBGE (SIDRA)...")
                series = {}
                for p in mercado.PRODUTOS:
                    series[p] = mercado.baixar_pam(cfg, p, forcar=not usar_cache)
                    time.sleep(pausa_s)
                avanca(40)
                r = produtividade.treinar_produtividade(series, cfg, progresso=avanca)
            else:
                print("Baixando exportações do ComexStat (pode levar 1-2 min)...")
                series = {}
                for p in mercado.PRODUTOS:
                    series[p] = mercado.baixar_comex(cfg, p, forcar=not usar_cache)
                    time.sleep(pausa_s * 4)           # a API limita requisições
                avanca(40)
                r = preco.treinar_preco(series, cfg, progresso=avanca)
            resultado[i] = registro.concluir_treino(engine, i, r)
            print(f"  {i}: {resultado[i]} | {_resumo(r)}")
        except Exception as e:
            falhou(i, e)
    return resultado


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--modelo", choices=["todos", *MODELOS], default="todos")
    p.add_argument("--sem-cache", action="store_true")
    a = p.parse_args(argv)
    ids = list(MODELOS) if a.modelo == "todos" else [a.modelo]
    res = executar(get_engine(), get_settings(), ids, usar_cache=not a.sem_cache)
    return 1 if "falhou" in res.values() else 0


if __name__ == "__main__":
    sys.exit(main())
