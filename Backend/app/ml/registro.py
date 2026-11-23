"""Registro dos modelos (RF04/RF06): cada treino real grava aqui suas métricas.
A dashboard só lê esta tabela, então nenhum número de modelo é inventado."""
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Double, Integer, MetaData, String, Table, Text, insert, select, update
from sqlalchemy.engine import Engine

metadata = MetaData()

modelo_registro = Table(
    "modelo_registro", metadata,
    Column("id", String(40), primary_key=True),
    Column("nome", String(80), nullable=False),
    Column("tipo", String(30), nullable=False),
    Column("descricao", Text),
    Column("status", String(20), nullable=False, default="planejado"),
    Column("versao_num", Integer, nullable=False, default=0),
    Column("algoritmo", String(120)),
    Column("fonte_dados", String(160)),
    Column("metrica_nome", String(30)),
    Column("metrica_valor", Double),
    Column("baseline_valor", Double),
    Column("precisao", Double),
    Column("amostras_treino", Integer),
    Column("amostras_teste", Integer),
    Column("progresso", Integer, nullable=False, default=0),
    Column("treinado_em", DateTime),
    Column("duracao_s", Double),
    Column("observacao", Text),
    Column("erro", Text),
    Column("parametros", Text),
)

modelo_execucao = Table(
    "modelo_execucao", metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("modelo_id", String(40), nullable=False, index=True),
    Column("executado_em", DateTime, nullable=False),
    Column("versao_num", Integer),
    Column("status", String(20)),
    Column("precisao", Double),
    Column("metrica_valor", Double),
    Column("baseline_valor", Double),
    Column("erro", Text),
)

# Catálogo exibido na tela. Só "clima" e "irrigacao" têm treino implementado na fase 1.
CATALOGO = [
    ("produtividade", "Previsão de produtividade", "produtividade",
     "Prevê o rendimento (kg/ha) da próxima safra de uva e manga a partir da série histórica do IBGE (PAM)."),
    ("clima", "Previsão climática", "clima",
     "Prevê a temperatura média do dia seguinte a partir do histórico climático da região."),
    ("colheita", "Estimativa de colheita", "colheita",
     "Estima a data da colheita pela soma de graus-dia desde a poda (uva de vinho, parâmetros da Embrapa Semiárido)."),
    ("preco", "Previsão de preço", "preco",
     "Prevê o preço médio de exportação (US$/kg) de uva e manga nos próximos 3 meses, com dados do ComexStat."),
    ("qualidade", "Qualidade da produção", "qualidade",
     "Identifica padrões de qualidade e possíveis alterações na produção agrícola."),
    ("irrigacao", "Necessidade de irrigação", "irrigacao",
     "Prevê a evapotranspiração do dia seguinte e estima a lâmina de irrigação necessária."),
]


@dataclass
class ResultadoTreino:
    precisao: float
    metrica_nome: str
    metrica_valor: float
    baseline_valor: float
    amostras_treino: int
    amostras_teste: int
    algoritmo: str
    fonte_dados: str
    duracao_s: float = 0.0
    parametros: dict = field(default_factory=dict)


def agora_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)    # DATETIME do MySQL não guarda fuso


def criar_tabelas(engine: Engine) -> None:
    metadata.create_all(engine)


def garantir_catalogo(engine: Engine) -> None:
    with engine.begin() as con:
        existentes = {r[0]: r[1] for r in con.execute(select(modelo_registro.c.id, modelo_registro.c.descricao))}
        for id_, nome, tipo, desc in CATALOGO:
            if id_ not in existentes:
                con.execute(insert(modelo_registro).values(id=id_, nome=nome, tipo=tipo, descricao=desc,
                                                           status="planejado", versao_num=0, progresso=0))
            elif existentes[id_] != desc:          # texto do catálogo mudou: atualiza (métricas não são tocadas)
                con.execute(update(modelo_registro).where(modelo_registro.c.id == id_).values(descricao=desc))


def iniciar_treino(engine: Engine, modelo_id: str, progresso: int = 0) -> None:
    with engine.begin() as con:
        con.execute(update(modelo_registro).where(modelo_registro.c.id == modelo_id)
                    .values(status="treinando", progresso=progresso, erro=None))


def atualizar_progresso(engine: Engine, modelo_id: str, progresso: int) -> None:
    with engine.begin() as con:
        con.execute(update(modelo_registro).where(modelo_registro.c.id == modelo_id).values(progresso=progresso))


def concluir_treino(engine: Engine, modelo_id: str, r: ResultadoTreino, agora: datetime | None = None) -> str:
    """Grava o resultado. 'ativo' só se o modelo supera a linha de base; senão 'atencao'."""
    agora = agora or agora_utc()
    supera = r.metrica_valor < r.baseline_valor
    status = "ativo" if supera else "atencao"
    obs = None if supera else (f"{r.metrica_nome} do modelo ({r.metrica_valor:.3f}) não é menor que o da "
                               f"linha de base ({r.baseline_valor:.3f}).")
    with engine.begin() as con:
        atual = con.execute(select(modelo_registro.c.versao_num).where(modelo_registro.c.id == modelo_id)).scalar() or 0
        nova = atual + 1
        con.execute(update(modelo_registro).where(modelo_registro.c.id == modelo_id).values(
            status=status, versao_num=nova, algoritmo=r.algoritmo, fonte_dados=r.fonte_dados,
            metrica_nome=r.metrica_nome, metrica_valor=r.metrica_valor, baseline_valor=r.baseline_valor,
            precisao=r.precisao, amostras_treino=r.amostras_treino, amostras_teste=r.amostras_teste,
            progresso=100, treinado_em=agora, duracao_s=r.duracao_s, observacao=obs, erro=None,
            parametros=json.dumps(r.parametros, ensure_ascii=False)))
        con.execute(insert(modelo_execucao).values(
            modelo_id=modelo_id, executado_em=agora, versao_num=nova, status=status, precisao=r.precisao,
            metrica_valor=r.metrica_valor, baseline_valor=r.baseline_valor, erro=None))
    return status


def falhar_treino(engine: Engine, modelo_id: str, erro: str, agora: datetime | None = None) -> None:
    agora = agora or agora_utc()
    with engine.begin() as con:
        con.execute(update(modelo_registro).where(modelo_registro.c.id == modelo_id)
                    .values(status="atencao", progresso=0, erro=erro[:1000]))
        con.execute(insert(modelo_execucao).values(modelo_id=modelo_id, executado_em=agora, status="falhou",
                                                   erro=erro[:1000]))


def listar(engine: Engine) -> list[dict]:
    with engine.connect() as con:
        ordem = {m[0]: i for i, m in enumerate(CATALOGO)}
        linhas = [dict(r) for r in con.execute(select(modelo_registro)).mappings()]
    return sorted(linhas, key=lambda m: ordem.get(m["id"], 99))


def execucoes(engine: Engine) -> list[dict]:
    with engine.connect() as con:
        return [dict(r) for r in con.execute(select(modelo_execucao).order_by(modelo_execucao.c.executado_em)).mappings()]
