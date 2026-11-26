"""Apaga as leituras e alertas do dispositivo de teste TESTE_PASSO4.
Rode dentro da pasta Backend, com o .venv ativo:  python limpar_teste.py
Usa as mesmas variáveis DB_* do .env que a API já usa."""
from sqlalchemy import text

from app.db import get_engine

DEVICE = "TESTE_PASSO4"

with get_engine().begin() as con:
    a = con.execute(text("DELETE FROM alertas_leituras WHERE device_id = :d"), {"d": DEVICE}).rowcount
    l = con.execute(text("DELETE FROM leituras WHERE device_id = :d"), {"d": DEVICE}).rowcount
print(f"Apagados: {a} alerta(s) e {l} leitura(s) do dispositivo {DEVICE}.")
