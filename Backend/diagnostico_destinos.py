"""Descobre por que os destinos (países) do ComexStat não carregam.
Rode na pasta Backend:   python diagnostico_destinos.py
Depois me envie TUDO que aparecer no terminal."""
import json
import httpx

def tenta(nome, fn):
    try:
        print(f"{nome:55s}", fn())
    except Exception as e:                       # noqa: BLE001
        print(f"{nome:55s} ERRO {type(e).__name__}: {str(e)[:160]}")

def head(url):
    for verify in (True, False):
        try:
            with httpx.stream("GET", url, timeout=30, verify=verify, follow_redirects=True) as r:
                return f"HTTP {r.status_code}, tamanho={r.headers.get('content-length')}, ssl_verificado={verify}"
        except httpx.ConnectError:
            continue
    return "sem conexão"

B = "https://balanca.economia.gov.br/balanca/bd"
print("=== 1) Arquivos abertos do MDIC ===")
for u in (f"{B}/tabelas/PAIS.csv", f"{B}/comexstat-bd/mun/EXP_2026_MUN.csv", f"{B}/comexstat-bd/mun/EXP_2025_MUN.csv"):
    tenta(u.replace(B, "..."), lambda u=u: head(u))

print("\n=== 2) API ComexStat por país (1 mês, Brasil, uva 0806) ===")
def api(filtros, detalhes):
    corpo = {"flow": "export", "monthDetail": True, "period": {"from": "2026-09", "to": "2026-09"}, "filters": filtros,
             "details": detalhes, "metrics": ["metricFOB", "metricKG"]}
    for verify in (True, False):
        try:
            r = httpx.post("https://api-comexstat.mdic.gov.br/general", params={"language": "pt"}, json=corpo, timeout=120, verify=verify)
            lista = (r.json().get("data") or {}).get("list") or []
            return f"HTTP {r.status_code}, {len(lista)} linhas {json.dumps(lista[0], ensure_ascii=False) if lista else r.text[:200]}"
        except httpx.ConnectError:
            continue
    return "sem conexão"
for nome, f, d in (("sem produto, por país", [], ["country"]),
                   ("heading 0806, por país", [{"filter": "heading", "values": ["0806"]}], ["country"]),
                   ("heading 0806, por país (pt-BR 'countries')", [{"filter": "heading", "values": ["0806"]}], ["countries"]),
                   ("heading 0806, sem país", [{"filter": "heading", "values": ["0806"]}], [])):
    tenta(nome, lambda f=f, d=d: api(f, d))
