"""Tela Financeiro do Produtor: livro de lançamentos (receitas e despesas) salvo em Backend/data/financeiro.json.

* Receita conta quando status = recebido; despesa quando status = pago. "pendente" fica em "a receber" / "a pagar".
* Na primeira execução o arquivo é criado com lançamentos de EXEMPLO (marcados com exemplo=true): exclua-os na tela.
* Arquivo único = uma propriedade. Para várias propriedades/usuários o ideal é migrar para o MySQL.
"""
import json
import os
import threading
import uuid
from datetime import date, timedelta
from pathlib import Path

ARQUIVO = Path(__file__).resolve().parents[2] / "data" / "financeiro.json"
_LOCK = threading.Lock()
CATEGORIAS = {"receita": ["Venda", "Exportação", "Outras receitas"],
              "despesa": ["Insumos", "Mão de obra", "Logística", "Outros"]}
STATUS = {"receita": ("recebido", "pendente"), "despesa": ("pago", "pendente")}
ROTULO_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]


def _semente(hoje: date) -> list[dict]:
    def i(dias, tipo, cat, desc, det, valor, status):
        return {"id": uuid.uuid4().hex[:10], "tipo": tipo, "categoria": cat, "descricao": desc, "detalhe": det,
                "data": (hoje + timedelta(days=dias)).isoformat(), "status": status, "valor": valor, "exemplo": True}
    return [
        i(-100, "receita", "Venda", "Venda de Syrah (vinícola)", "Lote #035", 52400, "recebido"),
        i(-75, "receita", "Exportação", "Exportação Lote #024", "Europa", 66300, "recebido"),
        i(-70, "receita", "Venda", "Venda de Uva Vitória", "Lote #024", 21250, "recebido"),
        i(-40, "receita", "Venda", "Venda de Uva Itália", "Lote #031", 38900, "recebido"),
        i(-25, "receita", "Exportação", "Exportação Lote #031", "Estados Unidos", 84500, "recebido"),
        i(5, "receita", "Venda", "Venda de Uva Vitória", "Lote #037", 45000, "pendente"),
        i(12, "receita", "Exportação", "Exportação Lote #036", "Europa", 120000, "pendente"),
        i(-95, "despesa", "Mão de obra", "Poda e manejo", "Equipe de campo", 21400, "pago"),
        i(-74, "despesa", "Logística", "Transporte da produção", "Fazenda → Porto", 4280, "pago"),
        i(-72, "despesa", "Insumos", "Compra de fertilizantes", "Fornecedor agrícola", 8450, "pago"),
        i(-45, "despesa", "Insumos", "Defensivos agrícolas", "Fornecedor agrícola", 12900, "pago"),
        i(-30, "despesa", "Mão de obra", "Folha da colheita", "Equipe de campo", 18700, "pago"),
        i(-26, "despesa", "Logística", "Frete refrigerado", "Fazenda → Porto", 9800, "pago"),
        i(-15, "despesa", "Outros", "Manutenção de equipamentos", None, 5200, "pago"),
        i(-8, "despesa", "Insumos", "Energia da irrigação", None, 7300, "pendente"),
    ]


def _ler() -> list[dict]:
    if not ARQUIVO.exists():
        itens = _semente(date.today())
        _gravar(itens)
        return itens
    try:
        return json.loads(ARQUIVO.read_text(encoding="utf-8")).get("movimentacoes", [])
    except ValueError as e:
        raise ValueError(f"{ARQUIVO.name} está corrompido ({e}). Corrija ou apague o arquivo.") from e


def _gravar(itens: list[dict]) -> None:
    ARQUIVO.parent.mkdir(parents=True, exist_ok=True)
    tmp = ARQUIVO.with_suffix(".tmp")
    tmp.write_text(json.dumps({"movimentacoes": itens}, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(tmp, ARQUIVO)


def _validar(d: dict) -> dict:
    tipo = d.get("tipo")
    if tipo not in CATEGORIAS:
        raise ValueError("tipo deve ser 'receita' ou 'despesa'")
    if d.get("categoria") not in CATEGORIAS[tipo]:
        raise ValueError(f"categoria inválida para {tipo}: use {', '.join(CATEGORIAS[tipo])}")
    if d.get("status") not in STATUS[tipo]:
        raise ValueError(f"status inválido para {tipo}: use {' ou '.join(STATUS[tipo])}")
    return d


def listar() -> list[dict]:
    with _LOCK:
        return sorted(_ler(), key=lambda m: (m["data"], m["id"]), reverse=True)


def criar(d: dict) -> dict:
    d = _validar(d)
    item = {"id": uuid.uuid4().hex[:10], "tipo": d["tipo"], "categoria": d["categoria"], "descricao": d["descricao"].strip(),
            "detalhe": (d.get("detalhe") or "").strip() or None, "data": str(d["data"]), "status": d["status"],
            "valor": round(float(d["valor"]), 2), "exemplo": False}
    with _LOCK:
        itens = _ler()
        itens.append(item)
        _gravar(itens)
    return item


def excluir(id_: str) -> bool:
    with _LOCK:
        itens = _ler()
        novos = [m for m in itens if m["id"] != id_]
        if len(novos) == len(itens):
            return False
        _gravar(novos)
        return True


def alterar_status(id_: str, status: str) -> dict | None:
    with _LOCK:
        itens = _ler()
        for m in itens:
            if m["id"] == id_:
                if status not in STATUS[m["tipo"]]:
                    raise ValueError(f"status inválido para {m['tipo']}: use {' ou '.join(STATUS[m['tipo']])}")
                m["status"] = status
                _gravar(itens)
                return m
    return None


def _var(atual: float, anterior: float) -> float | None:
    return round((atual - anterior) / anterior * 100, 1) if anterior > 0 else None


def resumo(periodo: str = "6m", limite: int = 8, hoje: date | None = None) -> dict:
    """periodo: '6m', '12m' ou 'ano' (de janeiro até hoje). Compara com o mesmo número de meses imediatamente antes."""
    hoje = hoje or date.today()
    n = {"6m": 6, "12m": 12}.get(periodo) or hoje.month
    fim_idx = hoje.year * 12 + hoje.month - 1
    ini_idx = fim_idx - (n - 1)
    ant_idx = ini_idx - n
    itens = listar()

    def idx(m):
        return int(m["data"][:4]) * 12 + int(m["data"][5:7]) - 1

    def soma(tipo, status, de, ate):
        return round(sum(m["valor"] for m in itens if m["tipo"] == tipo and m["status"] == status and de <= idx(m) <= ate), 2)

    receita, despesa = soma("receita", "recebido", ini_idx, fim_idx), soma("despesa", "pago", ini_idx, fim_idx)
    receita_ant, despesa_ant = soma("receita", "recebido", ant_idx, ini_idx - 1), soma("despesa", "pago", ant_idx, ini_idx - 1)
    resultado, resultado_ant = round(receita - despesa, 2), round(receita_ant - despesa_ant, 2)

    limite30 = (hoje + timedelta(days=30)).isoformat()
    receber = [m for m in itens if m["tipo"] == "receita" and m["status"] == "pendente" and m["data"] <= limite30]
    pagar = [m for m in itens if m["tipo"] == "despesa" and m["status"] == "pendente" and m["data"] <= limite30]

    serie = []
    for k in range(ini_idx, fim_idx + 1):
        a, mm = divmod(k, 12)
        serie.append({"mes": f"{a}-{mm + 1:02d}", "rotulo": ROTULO_MES[mm],
                      "receita": soma("receita", "recebido", k, k), "despesa": soma("despesa", "pago", k, k)})

    por_cat = {c: 0.0 for c in CATEGORIAS["despesa"]}
    for m in itens:
        if m["tipo"] == "despesa" and m["status"] == "pago" and ini_idx <= idx(m) <= fim_idx:
            por_cat[m["categoria"]] = por_cat.get(m["categoria"], 0.0) + m["valor"]
    total_desp = sum(por_cat.values())
    distrib = [{"categoria": c, "valor": round(v, 2), "pct": round(v / total_desp * 100, 1) if total_desp else 0.0}
               for c, v in por_cat.items()]

    return {"periodo": periodo, "meses": n,
            "cards": {"receita": receita, "receita_var_pct": _var(receita, receita_ant),
                      "despesas": despesa, "despesas_pct_receita": round(despesa / receita * 100, 1) if receita else None,
                      "resultado": resultado, "resultado_var_pct": _var(resultado, resultado_ant),
                      "a_receber_30d": round(sum(m["valor"] for m in receber), 2), "a_receber_qtd": len(receber),
                      "a_pagar_30d": round(sum(m["valor"] for m in pagar), 2), "a_pagar_qtd": len(pagar)},
            "serie": serie, "despesas_por_categoria": distrib,
            "movimentacoes": itens[:limite] if limite else itens, "total_movimentacoes": len(itens),
            "categorias": CATEGORIAS}
