"""Administrador > Alertas: ocorrências ativas calculadas com dados REAIS:
clima (Open-Meteo), saúde das fontes de dados, falhas de login e eventos de usuários (banco)."""
import asyncio
from datetime import datetime, timezone

import httpx

from ..clients import open_meteo
from ..config import Settings
from . import adm, dados, produtor

SEVERIDADE = {"critico": "urgente", "atencao": "atencao", "info": "informativo"}
ORDEM = {"urgente": 0, "atencao": 1, "informativo": 2}
ACOES_USUARIO = ("Usuário criado", "Usuário editado", "Usuário ativado", "Usuário desativado", "Usuário excluído")
LIMITE_FALHAS_URGENTE = 5   # falhas de login em 24 h


def _utc(dt) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def _al(id_, titulo, mensagem, prioridade, categoria, quando, detalhes=None) -> dict:
    return {"id": id_, "titulo": titulo, "mensagem": mensagem, "prioridade": prioridade, "categoria": categoria,
            "quando": quando.isoformat() if isinstance(quando, datetime) else quando, "detalhes": detalhes or []}


def _logs(obter_engine) -> dict:
    """Lê do MySQL (em thread: é bloqueante). Cada consulta é independente: uma falha não derruba as outras."""
    from sqlalchemy import text
    from ..db import BancoNaoConfigurado
    saida = {"ok": False, "falhas": None, "eventos": [], "pendentes": None}
    try:
        eng = obter_engine()
    except BancoNaoConfigurado:
        return saida

    def consulta(sql, params=None):
        try:
            with eng.connect() as c:
                return c.execute(text(sql), params or {}).all()
        except Exception:
            return None

    teste = consulta("SELECT 1")
    if teste is None:
        return saida
    saida["ok"] = True
    contagem = consulta("SELECT COUNT(*), MAX(data_hora) FROM log_sistema "
                        "WHERE status = 'Falha' AND data_hora >= NOW() - INTERVAL 24 HOUR")
    ultimas = consulta("SELECT descricao, data_hora FROM log_sistema WHERE status = 'Falha' "
                       "AND data_hora >= NOW() - INTERVAL 24 HOUR ORDER BY data_hora DESC LIMIT 3")
    if contagem and contagem[0][0]:
        saida["falhas"] = {"n": int(contagem[0][0]), "ultima": _utc(contagem[0][1]),
                           "detalhes": [f"{_utc(r[1]).astimezone(adm.RECIFE).strftime('%d/%m %H:%M')} · {r[0]}" for r in (ultimas or [])]}
    marcas = ", ".join(f":a{i}" for i in range(len(ACOES_USUARIO)))
    eventos = consulta(f"SELECT acao, descricao, data_hora FROM log_sistema WHERE tipo = 'Usuário' AND acao IN ({marcas}) "
                       "AND data_hora >= NOW() - INTERVAL 7 DAY ORDER BY data_hora DESC LIMIT 5",
                       {f"a{i}": a for i, a in enumerate(ACOES_USUARIO)})
    saida["eventos"] = [{"acao": r[0], "descricao": r[1], "quando": _utc(r[2])} for r in (eventos or [])]
    pend = consulta("SELECT COUNT(*) FROM usuario u WHERE NOT EXISTS (SELECT 1 FROM log_sistema l "
                    "WHERE l.usuario_id = u.id AND l.acao = 'Login realizado') "
                    "AND LOWER(CAST(u.status AS CHAR)) NOT IN ('inativo','inativa','desativado','desativada','bloqueado','bloqueada','0','false')")
    saida["pendentes"] = int(pend[0][0]) if pend else None
    return saida


async def montar(http: httpx.AsyncClient, cfg: Settings, obter_engine, agora: datetime | None = None) -> dict:
    agora = (agora or datetime.now(timezone.utc)).astimezone(timezone.utc)
    d, prev, log = await asyncio.gather(
        dados.montar(http, cfg, obter_engine, agora), open_meteo.buscar_previsao(http, cfg),
        asyncio.to_thread(_logs, obter_engine), return_exceptions=True)
    for r in (d, log):
        if isinstance(r, Exception):
            raise r
    if isinstance(prev, Exception) and not isinstance(prev, open_meteo.OpenMeteoErro):
        raise prev
    dia = agora.astimezone(adm.RECIFE).date().isoformat()
    al = []

    # ---------- Clima (previsão Open-Meteo) ----------
    if not isinstance(prev, Exception):
        c = prev["current"]
        g = produtor._g
        atual = {"umidade": produtor._r(g([c.get("relative_humidity_2m")], 0), 0)}
        for a in produtor.gerar_alertas(atual, produtor.montar_dias(prev)):
            al.append(_al(f"clima:{a['tipo']}:{dia}", a["titulo"], a["mensagem"], SEVERIDADE.get(a["severidade"], "informativo"),
                          "Clima", agora, ["Fonte: Open-Meteo."]))

    # ---------- Fontes de dados ----------
    fontes = {f["id"]: f for f in d["fontes"]}
    if fontes["thingspeak"]["estado"] != "Online":
        al.append(_al(f"dados:thingspeak:{dia}", "ThingSpeak indisponível", "Não foi possível ler os dados do sensor.",
                      "atencao", "Dados", agora, [fontes["thingspeak"]["detalhe"]]))
    elif fontes["esp32"]["estado"] != "Online":
        s = d["sensor"]
        mins = s["minutos_sem_dados"]
        msg = "O ESP32 nunca enviou leituras." if mins is None else f"O ESP32 está sem enviar dados há {dados._quanto(mins)}."
        det = ["Verifique energia, Wi-Fi e a publicação no canal do ThingSpeak."]
        if s["ultima_leitura"]:
            det.insert(0, "Última leitura: " + datetime.fromisoformat(s["ultima_leitura"]).astimezone(adm.RECIFE).strftime("%d/%m/%Y %H:%M"))
        al.append(_al(f"dados:esp32:{s['ultima_leitura'] or 'nunca'}", "Sensor ESP32 offline", msg,
                      "urgente" if mins is None or mins > 1440 else "atencao", "Dados",
                      s["ultima_leitura"] or agora, det))
    if fontes["banco"]["estado"] != "Online":
        al.append(_al(f"dados:banco:{dia}", "Banco de dados inacessível", "O sistema não conseguiu consultar o banco de dados.",
                      "urgente", "Sistema", agora, [fontes["banco"]["detalhe"]]))
    for chave, nome in (("om_obs", "Open-Meteo (observação)"), ("om_prev", "Open-Meteo (previsão)")):
        if fontes[chave]["estado"] != "Online":
            al.append(_al(f"dados:{chave}:{dia}", f"{nome} indisponível", "Os dados climáticos não puderam ser atualizados.",
                          "atencao", "Dados", agora, [fontes[chave]["detalhe"]]))
    if fontes["pam"]["estado"] != "Online":
        al.append(_al(f"dados:pam:{dia}", "Produção IBGE sem cache local", "Os arquivos de produção agrícola não foram encontrados.",
                      "informativo", "Dados", agora, ["Rode o treino dos modelos para baixar os dados do IBGE."]))
    esp_off = fontes["esp32"]["estado"] != "Online"
    for q in d["qualidade"]:
        if q["valor"] is not None and q["valor"] < 70 and not (q["id"] == "sensor" and esp_off):
            al.append(_al(f"dados:qual:{q['id']}:{dia}", "Qualidade dos dados abaixo do esperado",
                          f"{q['nome']}: {q['valor']:.1f}% de integridade.", "atencao", "Dados", agora, [q["detalhe"]]))

    # ---------- Segurança e usuários (banco) ----------
    if log["falhas"]:
        f = log["falhas"]
        al.append(_al(f"seg:falhas:{f['ultima'].isoformat()}", "Falhas de login detectadas",
                      f"{f['n']} tentativa(s) de login com falha nas últimas 24 h.",
                      "urgente" if f["n"] >= LIMITE_FALHAS_URGENTE else "atencao", "Segurança", f["ultima"],
                      f["detalhes"] + ["Veja o histórico completo em Logs do sistema."]))
    for e in log["eventos"]:
        al.append(_al(f"usr:{e['quando'].isoformat()}:{e['acao']}:{e['descricao']}", e["acao"], e["descricao"] or "—",
                      "informativo", "Usuários", e["quando"], []))
    if log["pendentes"]:
        n = log["pendentes"]
        al.append(_al(f"usr:pendentes:{n}", "Usuários aguardando o primeiro acesso",
                      f"{n} usuário(s) ativo(s) ainda não entraram no sistema.", "informativo", "Usuários", agora, []))

    al.sort(key=lambda a: (ORDEM[a["prioridade"]], -datetime.fromisoformat(a["quando"]).timestamp()))
    cont = {p: sum(a["prioridade"] == p for a in al) for p in ORDEM}
    return {"atualizado_em": agora.isoformat(),
            "cards": {"urgentes": cont["urgente"], "atencao": cont["atencao"], "informativos": cont["informativo"], "total": len(al)},
            "alertas": al}
