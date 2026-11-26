#!/usr/bin/env python3
"""Teste automático do Passo 4 (alertas configuráveis) da API Safra.

Só usa a biblioteca padrão do Python: não precisa instalar nada.

Uso (com a API rodando):
    python teste_passo4_alertas.py --key SUA_ESP32_API_KEY
    python teste_passo4_alertas.py --key SUA_CHAVE --token SEU_TOKEN_DE_LOGIN   # se LEITURAS_GET_PUBLICO=false
    python teste_passo4_alertas.py --base http://127.0.0.1:8000 --key SUA_CHAVE

O script usa o dispositivo "TESTE_PASSO4" e devolve os limites ao valor original no final.
Para apagar as leituras de teste depois, rode no MySQL:
    DELETE FROM alertas_leituras WHERE device_id='TESTE_PASSO4';
    DELETE FROM leituras         WHERE device_id='TESTE_PASSO4';
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

ap = argparse.ArgumentParser()
ap.add_argument("--base", default="http://127.0.0.1:8000")
ap.add_argument("--key", required=True, help="valor de ESP32_API_KEY do .env")
ap.add_argument("--token", default="", help="token de login do Safra (só se LEITURAS_GET_PUBLICO não for true)")
A = ap.parse_args()
DEV = "TESTE_PASSO4"
ok_n = falha_n = 0


def req(metodo, caminho, corpo=None, chave=True, token=True):
    h = {"Content-Type": "application/json"}
    if chave:
        h["X-API-Key"] = A.key
    if token and A.token:
        h["Authorization"] = "Bearer " + A.token
    r = urllib.request.Request(A.base + caminho, method=metodo, headers=h,
                               data=None if corpo is None else json.dumps(corpo).encode())
    try:
        with urllib.request.urlopen(r, timeout=15) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read() or b"{}")
        except ValueError:
            return e.code, {}
    except urllib.error.URLError as e:
        print(f"\nNÃO FOI POSSÍVEL CONECTAR em {A.base}: {e.reason}\nA API está rodando? (uvicorn app.main:app --port 8000)")
        sys.exit(2)


def checa(nome, cond, detalhe=""):
    global ok_n, falha_n
    if cond:
        ok_n += 1
        print(f"  [OK]    {nome}")
    else:
        falha_n += 1
        print(f"  [FALHA] {nome}  {detalhe}")


def postar(t, u, device=DEV):
    return req("POST", "/api/leituras", {"device_id": device, "temperatura": t, "umidade": u})


def total_alertas():
    s, j = req("GET", "/api/alertas?limite=1")
    return s, j.get("total")


print("1) API e banco no ar")
s, j = req("GET", "/api/status")
checa("GET /api/status -> 200, api=ok, banco=ok", s == 200 and j.get("api") == "ok" and j.get("banco") == "ok", f"(recebi {s} {j})")
if s != 200 or j.get("banco") != "ok":
    print("\nCorrija o banco/.env antes de continuar."); sys.exit(2)

print("2) Limites: ler, guardar o original e validar")
s, original = req("GET", "/api/limites")
if s == 401:
    print("  A API exige login para consultas. Use --token SEU_TOKEN ou ponha LEITURAS_GET_PUBLICO=true no .env."); sys.exit(2)
checa("GET /api/limites -> 200 com temp_max, umid_min, umid_max", s == 200 and {"temp_max", "umid_min", "umid_max"} <= set(original), f"(recebi {s} {original})")
s, j = req("PUT", "/api/limites", {"temp_max": 30, "umid_min": 40, "umid_max": 80})
checa("PUT /api/limites 30 / 40 / 80 -> 200 e devolve o que salvou", s == 200 and j == {"temp_max": 30.0, "umid_min": 40.0, "umid_max": 80.0}, f"(recebi {s} {j})")
s, j = req("GET", "/api/limites")
checa("limites foram gravados no banco (GET devolve 30/40/80)", j.get("temp_max") == 30 and j.get("umid_min") == 40 and j.get("umid_max") == 80, f"({j})")
s, j = req("PUT", "/api/limites", {"temp_max": 30, "umid_min": 80, "umid_max": 40})
checa("PUT com umid_min >= umid_max -> 422", s == 422, f"(recebi {s})")
s, j = req("PUT", "/api/limites", {"temp_max": 999, "umid_min": 40, "umid_max": 80})
checa("PUT com temp_max fora da faixa (999) -> 422", s == 422, f"(recebi {s})")
s, j = req("PUT", "/api/limites", {"temp_max": "abc", "umid_min": 40, "umid_max": 80})
checa("PUT com texto no lugar de número -> 422", s == 422, f"(recebi {s})")

print("3) Detecção de limites ao receber leituras (limites 30 / 40 / 80)")
_, antes = total_alertas()
s, j = postar(25, 60)
checa("25 °C / 60 %  -> 201, nenhum alerta", s == 201 and j.get("alertas") == [], f"(recebi {s} {j.get('alertas')})")
s, j = postar(35, 60)
checa("35 °C / 60 %  -> temperatura_alta", s == 201 and j.get("alertas") == ["temperatura_alta"], f"(recebi {j.get('alertas')})")
s, j = postar(25, 20)
checa("25 °C / 20 %  -> umidade_baixa", s == 201 and j.get("alertas") == ["umidade_baixa"], f"(recebi {j.get('alertas')})")
s, j = postar(25, 95)
checa("25 °C / 95 %  -> umidade_alta", s == 201 and j.get("alertas") == ["umidade_alta"], f"(recebi {j.get('alertas')})")
s, j = postar(35, 95)
checa("35 °C / 95 %  -> dois alertas (temperatura_alta + umidade_alta)", s == 201 and sorted(j.get("alertas", [])) == ["temperatura_alta", "umidade_alta"], f"(recebi {j.get('alertas')})")
s, j = postar(30, 40)
checa("30 °C / 40 %  (exatamente no limite) -> sem alerta", s == 201 and j.get("alertas") == [], f"(recebi {j.get('alertas')})")
s, j = postar(30.1, 80.1)
checa("30,1 °C / 80,1 % (logo acima) -> dois alertas", s == 201 and len(j.get("alertas", [])) == 2, f"(recebi {j.get('alertas')})")

print("4) Alertas ficam registrados no banco")
_, depois = total_alertas()
esperado = 1 + 1 + 1 + 2 + 0 + 2
checa(f"total de alertas subiu {esperado} (de {antes} para {depois})", antes is not None and depois == antes + esperado)
s, j = req("GET", "/api/alertas?limite=3")
msgs = [a.get("mensagem", "") for a in j.get("alertas", [])]
checa("GET /api/alertas traz mensagem legível (ex.: 'Temperatura elevada: ...')", s == 200 and any("elevada" in m or "Umidade" in m for m in msgs), f"({msgs})")
checa("alerta tem data_hora_local e device_id", bool(j.get("alertas")) and all(a.get("data_hora_local") and a.get("device_id") == DEV for a in j["alertas"]), f"({j.get('alertas')})")
s, j = req("GET", "/api/alertas?periodo=24h&limite=5")
checa("GET /api/alertas?periodo=24h -> 200", s == 200 and "alertas" in j)
s, j = req("GET", "/api/alertas?periodo=999")
checa("periodo inválido -> 422", s == 422, f"(recebi {s})")

print("5) Os limites são realmente configuráveis")
req("PUT", "/api/limites", {"temp_max": 20, "umid_min": 40, "umid_max": 80})
s, j = postar(25, 60)
checa("com temp_max=20, 25 °C agora gera temperatura_alta", s == 201 and j.get("alertas") == ["temperatura_alta"], f"(recebi {j.get('alertas')})")
req("PUT", "/api/limites", {"temp_max": 40, "umid_min": 40, "umid_max": 80})
s, j = postar(35, 60)
checa("com temp_max=40, 35 °C não gera alerta", s == 201 and j.get("alertas") == [], f"(recebi {j.get('alertas')})")

print("6) Segurança e validação (não pode quebrar com o alerta)")
s, j = req("POST", "/api/leituras", {"device_id": DEV, "temperatura": 99, "umidade": 50}, chave=False)
checa("POST sem X-API-Key -> 401", s == 401, f"(recebi {s})")
s, j = postar(500, 50)
checa("temperatura 500 -> 422 e nenhum alerta é gerado", s == 422, f"(recebi {s})")
s, j = postar(25, 150)
checa("umidade 150 -> 422", s == 422, f"(recebi {s})")

print("7) Restaurando limites originais")
s, j = req("PUT", "/api/limites", {k: original[k] for k in ("temp_max", "umid_min", "umid_max")})
checa(f"limites voltaram para {original}", s == 200, f"(recebi {s})")

print(f"\nResultado: {ok_n} OK, {falha_n} falha(s).")
print("Agora abra http://127.0.0.1:8000/monitor/ e confira o alerta visual (guia visual).")
print("Limpeza opcional no MySQL:  DELETE FROM alertas_leituras WHERE device_id='TESTE_PASSO4';  DELETE FROM leituras WHERE device_id='TESTE_PASSO4';")
sys.exit(1 if falha_n else 0)
