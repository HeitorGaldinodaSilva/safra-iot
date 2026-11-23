"""Tela Produtor > Alertas com dados reais, calculados a partir de:
* Open-Meteo      -> clima da previsão e condições de cada talhão (calor, solo seco, chuva na colheita, umidade alta);
* Lavouras        -> fase/progresso do ciclo (graus-dia) e data estimada de colheita;
* ComexStat + PTAX -> demanda por região de destino, janela de embarque e disponibilidade das fontes.
Reaproveita `exportacao.montar` (que já junta tudo) e só transforma em alertas. Limiares em constantes (PROVISÓRIOS).
"""
from datetime import date, datetime

import httpx

from ..config import Settings
from . import exportacao

SEV = {"urgente": 0, "atencao": 1, "informativo": 2}
DEMANDA_QUEDA_PCT = -5.0
DEMANDA_ALTA_PCT = 10.0
COLHEITA_PROXIMA_DIAS = 7


def _dm(iso: str) -> str:
    return f"{iso[8:10]}/{iso[5:7]}"


def _al(id_, titulo, mensagem, sev, cat, quando):
    return {"id": id_, "titulo": titulo, "mensagem": mensagem, "prioridade": sev, "categoria": cat, "quando": quando}


def _de_aviso(aviso: str) -> tuple[str, str]:
    """Os avisos dos talhões vêm como 'Título: ação'. Separa para virar título + mensagem."""
    if ": " in aviso:
        t, m = aviso.split(": ", 1)
        return t, m[:1].upper() + m[1:]
    return aviso, ""


def gerar(d: dict, hoje: date, agora: str) -> dict:
    dia = hoje.isoformat()
    clima, producao, expo = [], [], []
    c = d.get("clima")

    # ---------- Clima: previsão geral (Open-Meteo) ----------
    if c:
        for a in c["alertas"]:
            sev = {"critico": "urgente", "atencao": "atencao"}.get(a.get("severidade"), "informativo")
            clima.append(_al(f"clima:{a['tipo']}:{dia}", a["titulo"], a["mensagem"], sev, "clima", agora))
        j = c.get("janela_ideal")
        if j:
            clima.append(_al(f"clima:janela:{j['inicio']}", "Janela ideal de colheita",
                             f"{_dm(j['inicio'])} a {_dm(j['fim'])} ({j['dias']} dia{'s' if j['dias'] > 1 else ''}) com temperatura e umidade na faixa ideal.",
                             "informativo", "clima", agora))
    else:
        clima.append(_al(f"clima:fonte:{dia}", "Open-Meteo indisponível", d["fontes"]["open_meteo"].get("erro") or "Sem resposta da fonte de clima.",
                         "informativo", "clima", agora))

    # ---------- Clima por talhão + Produção ----------
    for l in d["lotes"]:
        for i, av in enumerate(l.get("avisos") or []):
            t, m = _de_aviso(av)
            clima.append(_al(f"clima:{l['id'] if 'id' in l else l['numero']}:{i}:{dia}", f"{t} — {l['talhao'].title()}", m, "atencao", "clima", agora))
        est = l.get("colheita_estimada")
        dias = (date.fromisoformat(est) - hoje).days if est else None
        nome = f"{l['nome']} ({l['talhao'].title()})"
        if l["status"] == "colheita":
            if dias is not None and dias <= 0:
                producao.append(_al(f"prod:{l['numero']}:ponto", "Ponto de colheita atingido", f"{nome}: ciclo em {l['progresso_pct']}%. Programe a colheita.", "urgente", "producao", agora))
            else:
                quando = f"estimada para {_dm(est)}" if est else "em breve"
                producao.append(_al(f"prod:{l['numero']}:colheita", "Colheita se aproximando", f"{nome}: ciclo em {l['progresso_pct']}%, colheita {quando}.",
                                    "atencao" if dias is not None and dias <= COLHEITA_PROXIMA_DIAS else "informativo", "producao", agora))
        elif l["status"] == "desenvolvimento":
            quando = f" Colheita estimada em {_dm(est)}." if est else ""
            producao.append(_al(f"prod:{l['numero']}:dev", "Ciclo em desenvolvimento", f"{nome}: {l['progresso_pct']}% dos graus-dia acumulados.{quando}", "informativo", "producao", agora))
        else:
            producao.append(_al(f"prod:{l['numero']}:prep", "Ciclo ainda não iniciado", f"{nome}: {l['progresso_rotulo']}.", "informativo", "producao", agora))
    if not d["lotes"]:
        producao.append(_al(f"prod:fonte:{dia}", "Talhões indisponíveis", d["fontes"]["open_meteo"].get("erro") or "Não foi possível ler o cadastro de lavouras.", "informativo", "producao", agora))

    # ---------- Exportação e logística ----------
    em_col = [l for l in d["lotes"] if l["status"] == "colheita"]
    for l in em_col:
        destino = f" Destino principal: {l['destino']}." if l.get("destino") else ""
        est = l.get("colheita_estimada")
        expo.append(_al(f"exp:{l['numero']}:embarque", f"Embarque a programar — {l['nome']}",
                        f"{l['volume_ton']:.1f} t previstas{(' (colheita ' + _dm(est) + ')') if est else ''}.{destino}", "atencao", "exportacao", agora))
    for m in d.get("mercados") or []:
        v = m.get("var_pct")
        if v is None:
            continue
        if v <= DEMANDA_QUEDA_PCT:
            expo.append(_al(f"exp:mercado:{m['regiao']}:queda:{dia[:7]}", f"Demanda em queda — {m['regiao']}",
                            f"Volume exportado {abs(v):.1f}% menor que nos 12 meses anteriores ({m['ton']:.0f} t, US$ {m['preco_usd_kg']:.2f}/kg).", "atencao", "exportacao", agora))
        elif v >= DEMANDA_ALTA_PCT:
            expo.append(_al(f"exp:mercado:{m['regiao']}:alta:{dia[:7]}", f"Demanda em alta — {m['regiao']}",
                            f"Volume exportado {v:.1f}% maior que nos 12 meses anteriores ({m['ton']:.0f} t, US$ {m['preco_usd_kg']:.2f}/kg).", "informativo", "exportacao", agora))
    e = d.get("exportacao")
    if e and e.get("ton_ano_anterior"):
        var = (e["ton_ano"] / e["ton_ano_anterior"] - 1) * 100
        if var <= DEMANDA_QUEDA_PCT * 2:
            expo.append(_al(f"exp:ano:{dia[:7]}", "Exportações do ano abaixo do ano anterior",
                            f"{e['ton_ano']:.0f} t no ano contra {e['ton_ano_anterior']:.0f} t no mesmo período do ano passado ({var:.1f}%).", "atencao", "exportacao", agora))
    f = d["fontes"]
    if not f["comex"]["ok"]:
        expo.append(_al(f"exp:fonte:comex:{dia}", "Destinos do ComexStat indisponíveis", f["comex"].get("erro") or "Sem resposta.", "informativo", "exportacao", agora))
    if not f["bcb"]["ok"]:
        expo.append(_al(f"exp:fonte:bcb:{dia}", "Câmbio (PTAX) indisponível", f["bcb"].get("erro") or "Sem resposta.", "informativo", "exportacao", agora))

    def ordenar(l):
        return sorted(l, key=lambda a: SEV[a["prioridade"]])
    grupos = {"clima": ordenar(clima), "producao": ordenar(producao), "exportacao": ordenar(expo)}
    todos = [a for g in grupos.values() for a in g]
    return {"atualizado_em": agora, **grupos,
            "contagem": {"urgente": sum(a["prioridade"] == "urgente" for a in todos),
                         "atencao": sum(a["prioridade"] == "atencao" for a in todos),
                         "informativo": sum(a["prioridade"] == "informativo" for a in todos)},
            "fontes": f}


async def montar(http: httpx.AsyncClient, cfg: Settings) -> dict:
    d = await exportacao.montar(http, cfg)
    return gerar(d, date.today(), datetime.now().astimezone().isoformat())
