"""Monta o payload de /analista/modelos a partir do registro (nada aqui é inventado)."""
import json
from datetime import datetime, timedelta, timezone

from sqlalchemy.engine import Engine

from ..config import Settings
from ..ml import registro

ROTULOS = {"ativo": "Ativo", "atencao": "Atenção", "treinando": "Treinamento", "planejado": "Planejado"}


def _iso(dt: datetime | None) -> str | None:
    return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z") if dt else None


def _melhora(m: dict) -> float | None:
    """Quanto o modelo reduz o erro em relação à melhor linha de base (%)."""
    base, val = m["baseline_valor"], m["metrica_valor"]
    return round((base - val) / base * 100, 1) if base and val is not None else None


def _faixa(melhora: float | None, precisao: float) -> str:
    """O rótulo mede GANHO sobre a linha de base, não só a precisão (que fica alta mesmo num modelo medíocre)."""
    if melhora is None:
        return "Excelente" if precisao >= 95 else "Bom" if precisao >= 90 else "Regular"
    return "Excelente" if melhora >= 25 else "Bom" if melhora >= 10 else "Regular"


def _modelo(m: dict, agora: datetime, validade: timedelta) -> dict:
    status, obs, precisao = m["status"], m["observacao"], m["precisao"]
    treinado = m["treinado_em"]
    if status == "planejado":
        desempenho = "Em planejamento"
    elif status == "treinando":
        desempenho = "Treinamento"
    elif precisao is None:
        status, desempenho = "atencao", "Sem treino válido"
    elif m["metrica_valor"] is not None and m["baseline_valor"] is not None and m["metrica_valor"] >= m["baseline_valor"]:
        status, desempenho = "atencao", "Não supera a linha de base"
    elif treinado and agora - treinado > validade:
        status, desempenho = "atencao", "Retreino recomendado"
        obs = f"Último treino há mais de {validade.days} dias."
    else:
        desempenho = _faixa(_melhora(m), precisao)
    try:
        params = json.loads(m["parametros"]) if m["parametros"] else {}
    except ValueError:
        params = {}
    return {
        "id": m["id"], "nome": m["nome"], "tipo": m["tipo"], "descricao": m["descricao"],
        "status": status, "status_rotulo": ROTULOS[status],
        "versao": f"v1.{m['versao_num']}" if m["versao_num"] else None,
        "precisao": precisao, "desempenho": desempenho, "progresso": m["progresso"] if status == "treinando" else None,
        "treinado_em": _iso(treinado), "algoritmo": m["algoritmo"], "fonte_dados": m["fonte_dados"],
        "metrica": {"nome": m["metrica_nome"], "valor": m["metrica_valor"], "baseline": m["baseline_valor"],
                    "melhora_pct": _melhora(m)},
        "amostras": {"treino": m["amostras_treino"], "teste": m["amostras_teste"]},
        "parametros": params, "observacao": obs, "erro": m["erro"],
    }


def _variacao_mes(modelos: list[dict], execs: list[dict], agora: datetime) -> float | None:
    """Média atual da precisão menos a média de 30 dias atrás, só nos modelos que existem nos dois momentos."""
    corte = agora - timedelta(days=30)
    antes: dict[str, float] = {}
    for e in execs:                       # já vem ordenado por data
        if e["executado_em"] <= corte and e["precisao"] is not None:
            antes[e["modelo_id"]] = e["precisao"]
    pares = [(m["precisao"], antes[m["id"]]) for m in modelos if m["precisao"] is not None and m["id"] in antes]
    if not pares:
        return None
    return round(sum(a for a, _ in pares) / len(pares) - sum(b for _, b in pares) / len(pares), 1)


def montar(engine: Engine, cfg: Settings, agora: datetime | None = None) -> dict:
    agora = (agora or registro.agora_utc()).replace(tzinfo=None)
    validade = timedelta(days=cfg.modelo_validade_dias)
    brutos = registro.listar(engine)
    modelos = [_modelo(m, agora, validade) for m in brutos]
    com_metrica = [m for m in modelos if m["precisao"] is not None]
    cont = {s: sum(1 for m in modelos if m["status"] == s) for s in ROTULOS}
    recentes = sum(1 for m in brutos if m["treinado_em"] and not m["erro"] and agora - m["treinado_em"] <= timedelta(days=7))

    if not com_metrica:
        situacao = "Nenhum modelo treinado ainda"
    elif cont["atencao"]:
        situacao = f"{cont['atencao']} em atenção"
    else:
        situacao = "Todos em operação"

    return {
        "ok": True, "erro": None, "gerado_em": agora.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z"),
        "resumo": {
            "total": len(modelos), "ativos": cont["ativo"], "em_atencao": cont["atencao"],
            "treinando": cont["treinando"], "planejados": cont["planejado"], "atualizados_7d": recentes,
            "precisao_media": round(sum(m["precisao"] for m in com_metrica) / len(com_metrica), 1) if com_metrica else None,
            "variacao_mes": _variacao_mes(com_metrica, registro.execucoes(engine), agora), "situacao": situacao,
        },
        "modelos": modelos,
    }
