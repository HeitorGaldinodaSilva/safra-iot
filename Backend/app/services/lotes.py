"""Lotes de exportação cadastrados pelo produtor (tela Exportação > + Novo lote).

Ficam em Backend/data/lotes.json. Eles se somam aos lotes calculados a partir dos talhões (lavouras.json).
"""
import json
import os
import threading
from pathlib import Path

ARQUIVO = Path(__file__).resolve().parents[2] / "data" / "lotes.json"
_LOCK = threading.Lock()


def _ler() -> list[dict]:
    if not ARQUIVO.exists():
        return []
    try:
        return json.loads(ARQUIVO.read_text(encoding="utf-8")).get("lotes", [])
    except ValueError as e:
        raise ValueError(f"{ARQUIVO.name} está corrompido ({e}). Corrija ou apague o arquivo.") from e


def _gravar(itens: list[dict]) -> None:
    ARQUIVO.parent.mkdir(parents=True, exist_ok=True)
    tmp = ARQUIVO.with_suffix(".tmp")
    tmp.write_text(json.dumps({"lotes": itens}, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, ARQUIVO)


def listar() -> list[dict]:
    with _LOCK:
        return _ler()


def criar(d: dict) -> dict:
    with _LOCK:
        itens = _ler()
        n = max([int(x["id"][1:]) for x in itens if str(x.get("id", ""))[1:].isdigit()] or [0]) + 1
        novo = {"id": f"l{n:03d}", **d}
        itens.append(novo)
        _gravar(itens)
        return novo


def excluir(id_: str) -> bool:
    with _LOCK:
        itens = _ler()
        resto = [x for x in itens if x.get("id") != id_]
        if len(resto) == len(itens):
            return False
        _gravar(resto)
        return True
