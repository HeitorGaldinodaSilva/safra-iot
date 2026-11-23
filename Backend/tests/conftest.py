import os

os.environ.update({"AUTH_ATIVA": "false", "THINGSPEAK_CHANNEL_ID": "123", "INMET_TOKEN": "tok", "INMET_ESTACAO": "A307"})

import pytest

from app import cache


@pytest.fixture(autouse=True)
def _limpar_cache():
    cache.limpar()
    yield
    cache.limpar()
