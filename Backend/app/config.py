"""Configuração central. Todas as chaves vêm do ambiente/.env (RNF02)."""
import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


def _txt(nome: str, padrao: str | None = None) -> str | None:
    valor = os.getenv(nome)
    return valor.strip() if valor and valor.strip() else padrao


def _num(nome: str, padrao: float) -> float:
    try:
        return float(os.getenv(nome, padrao))
    except ValueError:
        return padrao


@dataclass(frozen=True)
class Settings:
    # ThingSpeak
    thingspeak_canal: str | None
    thingspeak_read_key: str | None
    thingspeak_campo_temp: str
    thingspeak_campo_umid: str
    thingspeak_offline_min: int
    # INMET
    inmet_estacao: str
    inmet_token: str | None
    # Open-Meteo (fallback quando não há token do INMET)
    open_meteo_lat: float
    open_meteo_lon: float
    # Banco de dados (os mesmos DB_* do Backend Node)
    db_host: str | None
    db_port: int
    db_user: str | None
    db_password: str | None
    db_name: str | None
    # Modelos
    kc_cultura: float
    modelo_validade_dias: int
    anos_treino: int
    colheita_cultivar: str
    # Autenticação
    auth_ativa: bool
    node_api_url: str
    perfis_permitidos: frozenset[str]
    perfis_produtor: frozenset[str]
    cors_origins: tuple[str, ...]
    # Limiares de alerta
    limite_divergencia_temp: float
    limite_qualidade_geral: float
    janela_temp: tuple[float, float]
    janela_umid: tuple[float, float]
    # Administrador
    perfis_adm: frozenset[str] = frozenset({"administrador"})
    # Fase 3 (IBGE PAM + ComexStat)
    produto_padrao: str = "uva"
    pam_municipios: tuple[str, ...] = ("2611101",)     # Petrolina
    comex_ufs: tuple[int, ...] = (26, 29)              # PE e BA


@lru_cache
def get_settings() -> Settings:
    return Settings(
        thingspeak_canal=_txt("THINGSPEAK_CHANNEL_ID"),
        thingspeak_read_key=_txt("THINGSPEAK_READ_KEY"),
        thingspeak_campo_temp=_txt("THINGSPEAK_FIELD_TEMP", "field1"),
        thingspeak_campo_umid=_txt("THINGSPEAK_FIELD_UMID", "field2"),
        thingspeak_offline_min=int(_num("THINGSPEAK_OFFLINE_MIN", 15)),
        inmet_estacao=(_txt("INMET_ESTACAO", "A307") or "A307").upper(),
        inmet_token=_txt("INMET_TOKEN"),
        open_meteo_lat=_num("OPEN_METEO_LAT", -9.39),
        open_meteo_lon=_num("OPEN_METEO_LON", -40.5),
        db_host=_txt("DB_HOST"),
        db_port=int(_num("DB_PORT", 3306)),
        db_user=_txt("DB_USER"),
        db_password=_txt("DB_PASSWORD"),
        db_name=_txt("DB_NAME"),
        kc_cultura=_num("KC_CULTURA", 0.8),
        modelo_validade_dias=int(_num("MODELO_VALIDADE_DIAS", 14)),
        anos_treino=int(_num("ANOS_TREINO", 5)),
        colheita_cultivar=(_txt("COLHEITA_CULTIVAR", "syrah") or "syrah").lower(),
        auth_ativa=(_txt("AUTH_ATIVA", "true") or "true").lower() != "false",
        node_api_url=(_txt("NODE_API_URL", "http://localhost:3001") or "").rstrip("/"),
        perfis_permitidos=frozenset(
            p.strip().lower() for p in (_txt("PERFIS_PERMITIDOS", "analista") or "").split(",") if p.strip()
        ),
        perfis_produtor=frozenset(
            p.strip().lower() for p in (_txt("PERFIS_PRODUTOR", "produtor") or "").split(",") if p.strip()
        ),
        cors_origins=tuple(o.strip() for o in (_txt("CORS_ORIGINS", "") or "").split(",") if o.strip()),
        limite_divergencia_temp=_num("LIMITE_DIVERGENCIA_TEMP", 5),
        limite_qualidade_geral=_num("LIMITE_QUALIDADE_GERAL", 90),
        janela_temp=(_num("JANELA_TEMP_MIN", 18), _num("JANELA_TEMP_MAX", 32)),
        janela_umid=(_num("JANELA_UMID_MIN", 40), _num("JANELA_UMID_MAX", 75)),
        perfis_adm=frozenset(
            p.strip().lower() for p in (_txt("PERFIS_ADM", "administrador") or "").split(",") if p.strip()
        ),
        produto_padrao=(_txt("PRODUTO_PADRAO", "uva") or "uva").lower(),
        pam_municipios=tuple(m.strip() for m in (_txt("PAM_MUNICIPIOS", "2611101") or "").split(",") if m.strip()),
        comex_ufs=tuple(int(u) for u in (_txt("COMEX_UFS", "26,29") or "").split(",") if u.strip().isdigit()),
    )
