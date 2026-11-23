from app.clients import inmet


def test_interpretar_converte_hora_utc_e_numeros():
    obs = inmet.interpretar([
        {"DT_MEDICAO": "2026-11-13", "HR_MEDICAO": "1500", "TEM_INS": "31.2", "UMD_INS": "45", "CHUVA": "0.0"},
        {"DT_MEDICAO": "2026-11-13", "HR_MEDICAO": "0", "TEM_INS": None, "UMD_INS": "", "CHUVA": "1,4"},
        {"DT_MEDICAO": "x"},
    ])
    assert [o.momento.hour for o in obs] == [0, 15]
    assert obs[0].temperatura is None and obs[0].chuva_mm == 1.4
    assert obs[1].temperatura == 31.2 and obs[1].umidade == 45
