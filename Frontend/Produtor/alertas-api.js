/* ================= alertas-api.js (Produtor > Alertas) =================
   Troca os alertas fixos por alertas calculados com dados reais:
     GET /produtor/alertas -> clima (Open-Meteo, previsão e cada talhão), produção (ciclo/colheita dos talhões),
                              exportação (ComexStat por região, PTAX e embarques)
   Inclua este script no produtor.html, depois do exportacao-api.js.
   "Marcar todos como lidos" fica guardado neste navegador; o número do sino/menu conta os NÃO lidos urgentes + atenção. */
(function () {
    "use strict";
    const BASE = (window.SAFRA_API_PRODUTOR || window.SAFRA_API_ANALISTA || "http://localhost:8000").replace(/\/$/, "");
    const CHAVE_LIDOS = "safra_alertas_lidos";
    const ROTULO = { urgente: "Urgente", atencao: "Atenção", informativo: "Informativo" };
    const COR = { urgente: "#c0392b", atencao: "#b7791f", informativo: "#2f7d57" };
    const PREF = { clima: "notif_clima", producao: "notif_producao", exportacao: "notif_exportacao" };
    let dados = null;

    const raiz = () => document.getElementById("alertas");
    const limpar = (e) => { while (e.firstChild) e.removeChild(e.firstChild); };
    function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

    function lidos() { try { return new Set(JSON.parse(localStorage.getItem(CHAVE_LIDOS) || "[]")); } catch (e) { return new Set(); } }
    function salvarLidos(s) { try { localStorage.setItem(CHAVE_LIDOS, JSON.stringify([...s].slice(-500))); } catch (e) { /* sem storage: segue sem lembrar */ } }
    function prefLigada(cat) {
        try { const p = JSON.parse(sessionStorage.getItem("safra_preferencias") || "{}"); return p[PREF[cat]] !== false; } catch (e) { return true; }
    }
    const todosAlertas = () => (dados ? [...dados.clima, ...dados.producao, ...dados.exportacao] : []);
    // só conta no sino/menu o que o usuário deixou ligado em Configurações > Notificações
    const alertasAtivos = () => (dados ? ["clima", "producao", "exportacao"].filter(prefLigada).flatMap((c) => dados[c]) : []);

    function css() {
        if (document.getElementById("alt-api-css")) return;
        const s = el("style"); s.id = "alt-api-css";
        s.textContent = `
          #alt-aviso{margin:0 0 14px;padding:10px 14px;border-radius:12px;background:rgba(227,181,69,.18);border:1px solid rgba(227,181,69,.5);font-size:14px}
          #alt-aviso:empty{display:none}
          .alt-chip{display:inline-block;margin-right:8px;padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;color:#fff;vertical-align:middle}
          .opcao.alt-lido{opacity:.55}
          .opcao.alt-lido strong::after{content:" · lido";font-weight:400;font-size:12px}`;
        document.head.appendChild(s);
    }

    function linha(a, ja) {
        const op = el("div", "opcao" + (ja ? " alt-lido" : ""));
        const c = el("div"), t = el("strong");
        const chip = el("span", "alt-chip", ROTULO[a.prioridade]); chip.style.background = COR[a.prioridade];
        t.appendChild(chip); t.appendChild(document.createTextNode(a.titulo));
        c.appendChild(t); if (a.mensagem) c.appendChild(el("span", null, a.mensagem));
        op.appendChild(c); op.style.cursor = "pointer"; op.title = "Clique para marcar como lido";
        op.addEventListener("click", () => { const s = lidos(); s.add(a.id); salvarLidos(s); desenhar(); });
        return op;
    }

    function desenhar() {
        const ls = lidos();
        ["clima", "producao", "exportacao"].forEach((cat) => {
            const caixa = raiz().querySelector(`[data-alertas="${cat}"]`); if (!caixa) return;
            const card = caixa.closest(".config-card"); if (card) card.style.display = prefLigada(cat) ? "" : "none";
            limpar(caixa);
            const lista = dados[cat];
            if (!lista.length) { caixa.appendChild(linha({ id: "vazio:" + cat, prioridade: "informativo", titulo: "Nenhum alerta no momento", mensagem: "Tudo dentro dos limites." }, true)); return; }
            lista.forEach((a) => caixa.appendChild(linha(a, ls.has(a.id))));
        });
        contador();
    }

    function contador() {
        const ls = lidos();
        const n = alertasAtivos().filter((a) => a.prioridade !== "informativo" && !ls.has(a.id)).length;
        document.querySelectorAll('.menu-item[href="#alertas"] .badge, .tb-badge').forEach((b) => { b.textContent = String(n); b.style.display = n ? "" : "none"; });
        document.querySelectorAll(".tb-sino").forEach((b) => b.setAttribute("aria-label", `Notificações: ${n} novas`));
    }

    function avisar(msg) {
        let box = document.getElementById("alt-aviso");
        if (!box) { box = el("div"); box.id = "alt-aviso"; const cab = raiz().querySelector(".cabecalho"); cab.parentNode.insertBefore(box, cab.nextSibling); }
        box.textContent = msg || "";
    }

    function marcarTodos() {
        const s = lidos(); todosAlertas().forEach((a) => s.add(a.id)); salvarLidos(s); desenhar();
        if (window.Safra && Safra.avisar) Safra.avisar("Alertas marcados como lidos.");
    }

    async function api(caminho) {
        const token = sessionStorage.getItem("safra_token") || "";
        let resp;
        try { resp = await fetch(BASE + caminho, { headers: { Authorization: `Bearer ${token}` } }); }
        catch (e) { throw new Error(`não foi possível falar com a API (${BASE}). Ela está ligada?`); }
        if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
        if (resp.status === 403) throw new Error("Seu perfil não tem acesso a esta informação.");
        if (!resp.ok) { const c = await resp.json().catch(() => null); throw new Error((c && c.detail) || `A API respondeu ${resp.status}.`); }
        return resp.json();
    }

    async function carregar() {
        try { dados = await api("/produtor/alertas"); avisar(""); desenhar(); }
        catch (e) {
            avisar(`Alertas indisponíveis: ${e.message}`);
            raiz().querySelectorAll("[data-alertas]").forEach((c) => { if (!dados) limpar(c); });
        }
    }

    function iniciar() {
        if (!raiz()) return;
        css();
        const bt = raiz().querySelector(".cabecalho .btn-secundario");
        if (bt && !bt.dataset.alt) { bt.dataset.alt = "1"; bt.addEventListener("click", (e) => { e.stopImmediatePropagation(); marcarTodos(); }, true); }
        raiz().querySelectorAll("[data-alertas]").forEach((c) => { limpar(c); c.appendChild(el("div", "opcao")).appendChild(el("span", null, "Carregando…")); });
        window.addEventListener("safra:preferencias", () => { if (dados) desenhar(); });
        carregar();
        setInterval(carregar, 5 * 60 * 1000);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
