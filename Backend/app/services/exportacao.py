"""Tela Produtor > Exportação com dados reais (nada fixo no HTML).

* ComexStat/MDIC -> volume exportado, preço US$/kg, países e regiões de destino, variação de demanda;
* BCB (PTAX)     -> converte US$ em R$;
* Open-Meteo     -> progresso de cada talhão (graus-dia), clima atual e previsão na origem, janela ideal de embarque;
* Cadastro de lavouras (lavouras.json) -> os "lotes" são os talhões do produtor (volume = área x t/ha).
Cada fonte falha sozinha: o que faltar vem como null e `fontes` explica o motivo (nunca um valor inventado).
"""
import asyncio
from datetime import datetime

import httpx
from fastapi.concurrency import run_in_threadpool

from ..clients import bcb
from ..clients.open_meteo import OpenMeteoErro
from ..config import Settings
from ..ml import mercado
from . import lavouras, lotes as lotes_mod, produtor, relatorios
from .comex_destinos import rotulo_demanda


def _status_lote(l: dict) -> str:
    return {"preparacao": "Programado", "desenvolvimento": "Em andamento", "colheita": "Em colheita",
            "concluido": "Concluído"}.get(l["status"], "Em andamento")


_STATUS_MANUAL = {"programado": ("preparacao", 0), "andamento": ("desenvolvimento", 50), "concluido": ("concluido", 100)}


def montar_manuais(itens: list[dict], preco_usd_kg, brl_usd, regiao_padrao) -> list[dict]:
    """Lotes cadastrados à mão (data/lotes.json) no mesmo formato dos lotes calculados."""
    out = []
    for m in itens:
        status, prog = _STATUS_MANUAL.get(m.get("status"), ("desenvolvimento", 50))
        preco_brl = m.get("preco_brl_kg") or (round(preco_usd_kg * brl_usd, 2) if preco_usd_kg and brl_usd else None)
        ton = float(m["volume_ton"])
        rot = {"preparacao": "Embarque programado", "desenvolvimento": "Em andamento", "concluido": "Embarque concluído"}[status]
        lote = {"id": m["id"], "manual": True, "numero": f"#{m['id'].upper()}", "talhao": "Lote cadastrado",
                "nome": " ".join(x for x in (m["produto"], m.get("variedade")) if x), "produto": m["produto"],
                "tipo": "vinho" if m["produto"].lower() == "vinho" else "uva", "status": status, "status_rotulo": _status_lote({"status": status}),
                "progresso_pct": prog, "progresso_rotulo": rot, "colheita_estimada": None, "embarque": m.get("embarque"),
                "volume_ton": ton, "destino": m.get("destino"), "regiao": m.get("regiao") or regiao_padrao,
                "demanda": None, "preco_brl_kg": preco_brl,
                "preco_usd_kg": round(preco_brl / brl_usd, 2) if preco_brl and brl_usd else preco_usd_kg,
                "receita_brl": round(ton * 1000 * preco_brl) if preco_brl else None, "clima": {}, "avisos": []}
        out.append(lote)
    return out


def montar_lotes(lista: list[dict], preco_usd_kg, brl_usd, destino: dict | None, regiao: str | None = None) -> list[dict]:
    preco_brl = round(preco_usd_kg * brl_usd, 2) if preco_usd_kg and brl_usd else None
    lotes = []
    for i, l in enumerate(sorted(lista, key=lambda x: -x["progresso_pct"]), 1):
        ton = l["producao_t"]
        lotes.append({"numero": f"#{l['id'].upper()}", "talhao": l["talhao"], "nome": l["nome"], "tipo": l["tipo"], "produto": "Vinho" if l["tipo"] == "vinho" else "Uva", "regiao": regiao, "embarque": None, "manual": False,
                      "status": l["status"], "status_rotulo": _status_lote(l), "progresso_pct": l["progresso_pct"],
                      "progresso_rotulo": l["progresso_rotulo"], "colheita_estimada": l["colheita_estimada"],
                      "volume_ton": ton, "destino": (destino or {}).get("nome"), "demanda": (destino or {}).get("demanda"),
                      "preco_brl_kg": preco_brl, "preco_usd_kg": preco_usd_kg,
                      "receita_brl": round(ton * 1000 * preco_brl) if preco_brl else None, "clima": l["clima"], "avisos": l["avisos"]})
    return lotes


async def montar(http: httpx.AsyncClient, cfg: Settings) -> dict:
    produto = cfg.produto_padrao if cfg.produto_padrao in mercado.PRODUTOS else "uva"
    exp_t = run_in_threadpool(relatorios._com_cache, f"exp:{produto}", lambda: relatorios.exportacao(cfg, produto))
    lav_t, clima_t, fx_t = lavouras.montar(http, cfg), produtor.montar(http, cfg), bcb.ptax(http)
    exp, lav, clima, fx = await asyncio.gather(exp_t, lav_t, clima_t, fx_t, return_exceptions=True)

    erros = {}
    exp_ok = isinstance(exp, dict) and "erro" not in exp
    if not exp_ok:
        erros["comex"] = exp.get("erro") if isinstance(exp, dict) else str(exp)
    elif exp.get("erro_destinos"):
        erros["comex"] = exp["erro_destinos"]
    if isinstance(fx, Exception):
        erros["bcb"], fx = str(fx), None
    if isinstance(lav, Exception):
        erros["open_meteo"], lav = str(lav), None
    if isinstance(clima, Exception):
        erros["open_meteo"] = erros.get("open_meteo") or str(clima)
        clima = None

    brl = fx["brl_por_usd"] if fx else None
    preco_usd = exp.get("preco_usd_kg") if exp_ok else None
    regioes = (exp.get("regioes") or []) if exp_ok else []
    paises = (exp.get("destinos") or {}) if exp_ok else {}
    top_pais = (paises.get("destinos") or [None])[0]
    destino = None
    if top_pais:
        destino = {"nome": top_pais["pais"], "demanda": rotulo_demanda(top_pais.get("var_pct"))}
    elif regioes:
        destino = {"nome": regioes[0]["regiao"], "demanda": regioes[0]["demanda"]}

    regiao_padrao = regioes[0]["regiao"] if regioes else None
    lotes = montar_lotes(lav["lavouras"], preco_usd, brl, destino, regiao_padrao) if lav else []
    try:
        manuais = montar_manuais(lotes_mod.listar(), preco_usd, brl, regiao_padrao)
    except ValueError as e:
        erros["lotes"], manuais = str(e), []
    lotes = lotes + manuais
    tem_lotes = lav is not None or bool(manuais)
    ativos = [l for l in lotes if l["status"] not in ("preparacao", "concluido")]
    vol_ativo = round(sum(l["volume_ton"] for l in ativos), 1)
    receitas = [l["receita_brl"] for l in ativos if l["receita_brl"]]
    receita = sum(receitas) if receitas else None

    return {
        "atualizado_em": datetime.now().astimezone().isoformat(), "produto": produto,
        "fontes": {"comex": {"ok": "comex" not in erros, "erro": erros.get("comex"), "rotulo": mercado.FONTE_COMEX},
                   "bcb": {"ok": fx is not None, "erro": erros.get("bcb"), "rotulo": "Banco Central (PTAX)"},
                   "lotes": {"ok": "lotes" not in erros, "erro": erros.get("lotes"), "rotulo": "Lotes cadastrados"},
                   "open_meteo": {"ok": "open_meteo" not in erros, "erro": erros.get("open_meteo"), "rotulo": "Open-Meteo"}},
        "cambio": fx,
        "cards": {"lotes_ativos": len(ativos) if tem_lotes else None, "lotes_total": len(lotes) if tem_lotes else None,
                  "em_colheita": sum(1 for l in lotes if l["status"] == "colheita") if tem_lotes else None,
                  "volume_ton": vol_ativo if tem_lotes else None,
                  "paises": paises.get("total_paises"), "regioes": [r["regiao"] for r in regioes[:3]],
                  "receita_brl": receita, "preco_usd_kg": preco_usd, "preco_brl_kg": round(preco_usd * brl, 2) if preco_usd and brl else None,
                  "var_volume_pct": exp.get("var_volume_pct") if exp_ok else None},
        "exportacao": None if not exp_ok else {"ton_12m": exp["ton_12m"], "ton_ano": exp["ton_ano"], "ton_ano_anterior": exp["ton_ano_anterior"],
                                               "ultimo_embarque": exp["ultimo_embarque"], "fim": exp["fim"],
                                               "escopo_destinos": exp.get("escopo_destinos")},
        "lotes": lotes, "mercados": regioes, "paises": paises.get("destinos") or [],
        "clima": None if not clima else {"atual": clima["atual"], "dias": clima["dias"], "janela_ideal": clima["janela_ideal"],
                                         "alertas": clima["alertas"], "max_proximas_24h": clima.get("max_proximas_24h")},
    }
