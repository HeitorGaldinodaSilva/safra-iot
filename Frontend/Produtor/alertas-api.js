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
    const CHAVE_DISPENSADOS = "safra_alertas_dispensados";
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
    function dispensados() { try { return new Set(JSON.parse(localStorage.getItem(CHAVE_DISPENSADOS) || "[]")); } catch (e) { return new Set(); } }
    function salvarDispensados(s) { try { localStorage.setItem(CHAVE_DISPENSADOS, JSON.stringify([...s].slice(-500))); } catch (e) { /* sem storage */ } }
    const todosAlertas = () => (dados ? [...dados.clima, ...dados.producao, ...dados.exportacao] : []);
    // só conta no sino/menu o que o usuário deixou ligado em Configurações > Notificações
    const alertasAtivos = () => (dados ? ["clima", "producao", "exportacao"].filter(prefLigada).flatMap((c) => dados[c]) : []);

    function css() {
        if (document.getElementById("alt-api-css")) return;
        const s = el("style"); s.id = "alt-api-css";
        s.textContent = `
          #alt-aviso{margin:0 0 14px;padding:10px 14px;border-radius:12px;background:rgba(227,181,69,.18);border:1px solid rgba(227,181,69,.5);font-size:14px}
          #alt-aviso:empty{display:none}
          #alertas .alerta-item{min-height:63px;padding:12px 0;display:flex;align-items:center;flex-wrap:wrap;gap:10px;border-bottom:1px solid #eeeeea;transition:opacity .2s ease,transform .26s ease}
          #alertas .alerta-item:last-child{border-bottom:none}
          #alertas .alerta-item.lido{opacity:.55}
          #alertas .alerta-item.saindo{opacity:0;transform:translateX(16px)}
          #alertas .alerta-icon{width:34px;height:34px;flex-shrink:0;display:flex;align-items:center;justify-content:center;border-radius:9px}
          #alertas .alerta-icon .ico{width:18px;height:18px}
          #alertas .alerta-icon.amarelo{background:#fae9b8;color:#a87516}
          #alertas .alerta-icon.vermelho{background:#f5d9d5;color:#b44a40}
          #alertas .alerta-icon.azul{background:#dcecf5;color:#397498}
          #alertas .alerta-texto{flex:1;min-width:180px}
          #alertas .alerta-texto strong{display:block;color:#31584d;font-size:var(--fs-xs,13px)}
          #alertas .alerta-texto span{display:block;margin-top:4px;color:#84908b;font-size:var(--fs-xs,13px)}
          #alertas .alerta-texto small{display:block;margin-top:5px;color:#9aa39f;font-size:var(--fs-xs,13px)}
          #alertas .status-alerta{padding:6px 9px;border-radius:20px;font-size:var(--fs-xs,13px);font-weight:700;white-space:nowrap}
          #alertas .status-alerta.urgente{background:#f8dcd8;color:#b23b2e}
          #alertas .status-alerta.atencao{background:#fff1d3;color:#b78327}
          #alertas .status-alerta.informativo{background:#dcecf4;color:#397f9f}
          #alertas .alerta-acoes{display:inline-flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end}
          #alertas .alerta-mini{height:30px;padding:0 10px;border:1px solid #dce1da;border-radius:8px;background:#fff;color:#356255;font-family:var(--fonte-texto);font-size:12px;font-weight:700;cursor:pointer;transition:all .15s ease}
          #alertas .alerta-mini:hover{background:#e1f1dc;border-color:#218149;color:#1d6b3c}
          #alertas .alerta-mini.perigo{width:30px;padding:0;font-size:18px;line-height:1;color:#b23b2e;border-color:#efc9c4}
          #alertas .alerta-mini.perigo:hover{background:#c9483a;border-color:#c9483a;color:#fff}
          #alertas .alerta-vazio{padding:22px 8px;text-align:center;color:#6b7a70;font-size:var(--fs-sm,15px)}
          @media(max-width:700px){#alertas .alerta-acoes{margin-left:0;justify-content:flex-start;width:100%}}`;
        document.head.appendChild(s);
    }

    const SVG = (d) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const ICONE_ALERTA = SVG('<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>');
    const ICONE_INFO = SVG('<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>');
    const COR_ICONE = { urgente: "vermelho", atencao: "amarelo", informativo: "azul" };
    const CATEGORIA = { clima: "Clima", producao: "Produção", exportacao: "Exportação" };
    const ACAO = {
        clima: { rotulo: "Ver lavouras", destino: "lavoura" },
        producao: { rotulo: "Ver lavouras", destino: "lavoura" },
        exportacao: { rotulo: "Ver exportação", destino: "exportacao" }
    };

    function quandoTexto(iso) {
        const d = new Date(iso); if (!iso || isNaN(d)) return "";
        const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
        const dia = new Date(d); dia.setHours(0, 0, 0, 0);
        const dif = Math.round((hoje - dia) / 86400000);
        const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        if (dif === 0) return `Hoje às ${hora}`;
        if (dif === 1) return `Ontem às ${hora}`;
        return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${hora}`;
    }

    function irPara(destino) {
        const link = document.querySelector(`a.menu-item[href="#${destino}"]`);
        if (link) link.click(); else location.hash = destino;
    }

    function linha(a, ja, cat) {
        const item = el("div", "alerta-item" + (ja ? " lido" : ""));
        const icone = el("div", "alerta-icon " + (COR_ICONE[a.prioridade] || "azul"));
        icone.innerHTML = a.prioridade === "informativo" ? ICONE_INFO : ICONE_ALERTA;
        const texto = el("div", "alerta-texto");
        texto.appendChild(el("strong", null, a.titulo));
        if (a.mensagem) texto.appendChild(el("span", null, a.mensagem));
        const quando = quandoTexto(a.quando);
        const rodape = [quando, CATEGORIA[cat]].filter(Boolean).join(" • ");
        if (rodape) texto.appendChild(el("small", null, rodape));
        const status = el("span", "status-alerta " + a.prioridade, ROTULO[a.prioridade]);
        const acoes = el("span", "alerta-acoes");
        const go = ACAO[cat];
        if (go) {
            const bGo = el("button", "alerta-mini", go.rotulo); bGo.type = "button"; bGo.title = go.rotulo;
            bGo.addEventListener("click", () => irPara(go.destino));
            acoes.appendChild(bGo);
        }
        const bLido = el("button", "alerta-mini", ja ? "Não lido" : "Lido"); bLido.type = "button";
        bLido.title = ja ? "Marcar como não lido" : "Marcar como lido";
        bLido.addEventListener("click", () => { const s = lidos(); if (ja) s.delete(a.id); else s.add(a.id); salvarLidos(s); desenhar(); });
        const bX = el("button", "alerta-mini perigo", "×"); bX.type = "button"; bX.title = "Dispensar alerta"; bX.setAttribute("aria-label", "Dispensar alerta");
        bX.addEventListener("click", () => {
            item.classList.add("saindo");
            setTimeout(() => { const s = dispensados(); s.add(a.id); salvarDispensados(s); desenhar(); }, 260);
        });
        acoes.appendChild(bLido); acoes.appendChild(bX);
        item.appendChild(icone); item.appendChild(texto); item.appendChild(status); item.appendChild(acoes);
        return item;
    }

    function desenhar() {
        const ls = lidos(), ds = dispensados();
        ["clima", "producao", "exportacao"].forEach((cat) => {
            const caixa = raiz().querySelector(`[data-alertas="${cat}"]`); if (!caixa) return;
            const card = caixa.closest(".config-card"); if (card) card.style.display = prefLigada(cat) ? "" : "none";
            limpar(caixa);
            const lista = dados[cat].filter((a) => !ds.has(a.id));
            if (!lista.length) { caixa.appendChild(el("div", "alerta-vazio", "Nenhum alerta no momento. Tudo dentro dos limites.")); return; }
            lista.forEach((a) => caixa.appendChild(linha(a, ls.has(a.id), cat)));
        });
        contador();
    }

    function contador() {
        const ls = lidos(), ds = dispensados();
        const n = alertasAtivos().filter((a) => a.prioridade !== "informativo" && !ls.has(a.id) && !ds.has(a.id)).length;
        document.querySelectorAll('.menu-item[href="#alertas"] .badge, .tb-badge').forEach((b) => { b.textContent = String(n); b.style.display = n ? "" : "none"; });
        if (window.Safra && Safra.sino) {
            const itens = dados ? ["clima", "producao", "exportacao"].filter(prefLigada).flatMap((c) =>
                dados[c].filter((a) => !ds.has(a.id)).map((a) => ({ id: a.id, titulo: a.titulo, mensagem: a.mensagem, prioridade: a.prioridade, categoria: CATEGORIA[c], quando: a.quando, lido: ls.has(a.id) }))) : [];
            Safra.sino.atualizar({
                itens, naoLidos: n, destino: "#alertas",
                aoLer: (id) => { const s = lidos(); s.add(id); salvarLidos(s); desenhar(); },
                aoLerTodos: () => { const s = lidos(); itens.forEach((a) => s.add(a.id)); salvarLidos(s); desenhar(); }
            });
        }
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
        raiz().querySelectorAll("[data-alertas]").forEach((c) => { limpar(c); c.appendChild(el("div", "alerta-vazio", "Carregando…")); });
        window.addEventListener("safra:preferencias", () => { if (dados) desenhar(); });
        carregar();
        setInterval(carregar, 5 * 60 * 1000);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();