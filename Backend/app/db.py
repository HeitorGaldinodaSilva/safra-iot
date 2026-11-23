"""Conexão com o MySQL (mesmas variáveis DB_* do Backend Node)."""
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import URL, Engine

from .config import get_settings


class BancoNaoConfigurado(Exception):
    pass


@lru_cache
def get_engine() -> Engine:
    cfg = get_settings()
    if not (cfg.db_host and cfg.db_user and cfg.db_name):
        raise BancoNaoConfigurado("DB_HOST, DB_USER e DB_NAME precisam estar no .env")
    url = URL.create("mysql+pymysql", username=cfg.db_user, password=cfg.db_password, host=cfg.db_host,
                     port=cfg.db_port, database=cfg.db_name, query={"charset": "utf8mb4"})
    return create_engine(url, pool_pre_ping=True, pool_recycle=280, connect_args={"connect_timeout": 10})


def get_engine_dep():
    """Dependência do FastAPI: devolve a FUNÇÃO que abre o engine (a rota a chama dentro do try,
    assim um .env sem DB_* vira aviso na tela e não um erro 500). Nos testes dá para trocá-la."""
    return get_engine
