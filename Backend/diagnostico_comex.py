"""Descobre qual formato de filtro a ComexStat aceita para UVA FRESCA (NCM 0806.10.00).
Rode na pasta Backend:   python diagnostico_comex.py
Depois me envie TUDO que aparecer no terminal."""
import json
import httpx

URL = "https://api-comexstat.mdic.gov.br"


def post(corpo):
    for verify in (True, False):
        try:
            with httpx.Client(timeout=120, verify=verify) as c:
                return c.post(f"{URL}/general", params={"language": "pt"}, json=corpo,
                              headers={"Accept": "application/json", "User-Agent": "safra-diag"})
        except httpx.ConnectError:
            continue
    raise SystemExit("não consegui conectar na ComexStat")


def get(caminho, params=None):
    for verify in (True, False):
        try:
            with httpx.Client(timeout=60, verify=verify) as c:
                return c.get(f"{URL}{caminho}", params=params or {}, headers={"Accept": "application/json"})
        except httpx.ConnectError:
            continue
    return None


def base(filtros, detalhes=(), de="2025-11", ate="2026-10"):
    return {"flow": "export", "monthDetail": True, "period": {"from": de, "to": ate}, "filters": filtros,
            "details": list(detalhes), "metrics": ["metricFOB", "metricKG"]}


print("=== 1) Valores de filtro conhecidos pela API (para descobrir o formato do código) ===")
for filtro, busca in (("ncm", "08061000"), ("subHeading", "080610"), ("heading", "0806")):
    r = get(f"/general/filters/{filtro}", {"language": "pt", "search": busca})
    print(f"\n[{filtro}] busca={busca} -> HTTP {r.status_code if r is not None else 'sem resposta'}")
    if r is not None and r.status_code == 200:
        print(r.text[:500])

print("\n=== 2) Consultas de teste (mostra quantas linhas voltam) ===")
testes = {
    "ncm texto 08061000": [{"filter": "ncm", "values": ["08061000"]}],
    "ncm número 8061000": [{"filter": "ncm", "values": [8061000]}],
    "subHeading texto 080610": [{"filter": "subHeading", "values": ["080610"]}],
    "subHeading número 80610": [{"filter": "subHeading", "values": [80610]}],
    "heading texto 0806": [{"filter": "heading", "values": ["0806"]}],
    "heading número 806": [{"filter": "heading", "values": [806]}],
}
for nome, filtros in testes.items():
    r = post(base(filtros))
    try:
        lista = (r.json().get("data") or {}).get("list") or []
    except ValueError:
        lista = []
    print(f"{nome:28s} -> HTTP {r.status_code}, {len(lista)} linhas", (json.dumps(lista[0], ensure_ascii=False) if lista else r.text[:150]))

print("\n=== 3) Sem filtro de produto, detalhando por subposição (PE e BA) ===")
r = post(base([{"filter": "state", "values": [26, 29]}], ["subHeading"], de="2026-09"))
try:
    lista = (r.json().get("data") or {}).get("list") or []
except ValueError:
    lista = []
print(f"HTTP {r.status_code}, {len(lista)} linhas")
for x in lista[:3]:
    print(json.dumps(x, ensure_ascii=False))
uva = [x for x in lista if "0806" in json.dumps(x, ensure_ascii=False) or "uva" in json.dumps(x, ensure_ascii=False).lower()]
print(f"linhas que parecem uva: {len(uva)}")
for x in uva[:3]:
    print(json.dumps(x, ensure_ascii=False))
