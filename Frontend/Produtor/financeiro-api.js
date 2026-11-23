/* ================= financeiro-api.js (Produtor > Financeiro) =================
   Deixa a tela Financeiro funcional: cards, fluxo mensal, despesas por categoria e movimentações vêm da API
   (GET /produtor/financeiro) e o botão "Nova movimentação" grava de verdade (POST /produtor/financeiro/movimentacoes).
   A "Receita potencial da safra" em R$ junta a ComexStat (US$) com a cotação PTAX do Banco Central.
   Inclua este script depois do lavouras-api.js no produtor.html. */
(function () {
    const BASE = (window.SAFRA_API_PRODUTOR || window.SAFRA_API_ANALISTA || "http://localhost:8000").replace(/\/$/, "");
    const BRL = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const nf = (v, c = 1) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
    const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
    const PERIODOS = ["6m", "12m", "ano"];
    const ROTULO_STATUS = { recebido: "Recebido", pago: "Pago", pendente: "Pendente" };
    const CLASSE_STATUS = { recebido: "completed", pago: "paid", pendente: "pending" };
    const CORES = ["#69a85d", "#6fa9cb", "#e3b545", "#9b7db1"];
    const ICONES = {
        receita: '<path d="M12 19V5"/><path d="M5 12l7-7 7 7"/>',
        despesa: '<path d="M12 5v14"/><path d="M19 12l-7 7-7-7"/>',
    };

    let periodo = "6m", todas = false, busca = "", dados = null, categorias = { receita: [], despesa: [] };

    const pagina = () => document.getElementById("financeiro");
    const q = (s) => { const p = pagina(); return p ? p.querySelector(s) : null; };
    const qa = (s) => { const p = pagina(); return p ? Array.from(p.querySelectorAll(s)) : []; };
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const limpar = (e) => { while (e.firstChild) e.removeChild(e.firstChild); };
    function compacto(v) {
        const a = Math.abs(v);
        if (a >= 1e6) return `R$ ${nf(v / 1e6, 2)} mi`;
        if (a >= 1e3) return `R$ ${nf(v / 1e3, 0)} mil`;
        return BRL(v);
    }
    function svg(inner) {
        const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
        s.setAttribute("stroke-width", "1.8"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
        s.setAttribute("class", "ico"); s.innerHTML = inner;      // inner = SVG fixo deste arquivo
        return s;
    }
    function aviso(msg) { if (window.Safra && Safra.avisar) Safra.avisar(msg); else alert(msg); }

    async function api(caminho, opcoes = {}) {
        const token = sessionStorage.getItem("safra_token") || "";
        let resp;
        try {
            resp = await fetch(`${BASE}${caminho}`, { ...opcoes, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opcoes.headers || {}) } });
        } catch (e) {
            throw new Error(`não foi possível falar com a API (${BASE}). Ela está ligada?`);
        }
        if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
        if (resp.status === 403) throw new Error("Seu perfil não tem acesso a esta informação.");
        if (!resp.ok) {
            const corpo = await resp.json().catch(() => null);
            let d = corpo && corpo.detail;
            if (Array.isArray(d)) d = d.map(x => `${(x.loc || []).slice(1).join(".")}: ${x.msg}`).join("; ");
            throw new Error(d || `A API respondeu ${resp.status}.`);
        }
        return resp.status === 204 ? null : resp.json();
    }

    function injetarEstilo() {
        if (document.getElementById("fin-api-css")) return;
        const st = document.createElement("style");
        st.id = "fin-api-css";
        st.textContent = `
        .fin-acoes{display:inline-flex;gap:10px;margin-left:8px}
        .fin-acoes button{background:none;border:0;padding:0;cursor:pointer;font-size:.75rem;text-decoration:underline;color:#1f7a4d}
        .fin-acoes button.fin-del{color:#b5483a}
        .fin-ex{display:inline-block;margin-left:6px;padding:1px 7px;border-radius:8px;background:#eef1ee;color:#7a8a85;font-size:.68rem;font-weight:600}
        .fin-vazio{padding:26px;text-align:center;color:#7a8a85}
        .fin-overlay{position:fixed;inset:0;background:rgba(10,30,25,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px}
        .fin-modal{background:#fff;border-radius:18px;padding:24px;width:min(460px,100%);max-height:92vh;overflow:auto;box-shadow:0 20px 60px rgba(0,0,0,.25)}
        .fin-modal h2{margin:0 0 4px}.fin-modal p{margin:0 0 14px;color:#7a8a85;font-size:.85rem}
        .fin-modal label{display:block;margin-top:12px;font-size:.8rem;font-weight:600;color:#38514b}
        .fin-modal input,.fin-modal select{width:100%;box-sizing:border-box;margin-top:4px;padding:10px 12px;border:1px solid #d6dfda;border-radius:10px;font:inherit}
        .fin-modal .fin-linha{display:grid;grid-template-columns:1fr 1fr;gap:12px}
        .fin-erro{margin-top:12px;padding:8px 10px;border-radius:10px;background:#fdeceb;color:#a12f22;font-size:.82rem}
        .fin-btns{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
        .fin-btns button{padding:10px 18px;border-radius:10px;border:1px solid #d6dfda;background:#fff;cursor:pointer;font:inherit}
        .fin-btns button.fin-ok{background:#1f7a4d;color:#fff;border-color:#1f7a4d;font-weight:600}
        .fin-btns button:disabled{opacity:.6;cursor:wait}`;
        document.head.appendChild(st);
    }

    // ---------- cards ----------
    function desenharCards(c) {
        const cards = qa(".financial-cards .financial-card");
        const set = (i, rotulo, valor, sub, cls) => {
            const k = cards[i]; if (!k) return;
            k.querySelector("span").textContent = rotulo;
            k.querySelector("strong").textContent = valor;
            const s = k.querySelector("small"); s.textContent = sub; s.className = cls || ""; s.style.color = cls === "negative" ? "#b5483a" : "";
        };
        const comp = (v, txt) => v == null ? "sem período anterior para comparar"
            : `${v >= 0 ? "↑" : "↓"} ${nf(Math.abs(v))}% ${txt}`;
        set(0, "Receita recebida", BRL(c.receita), comp(c.receita_var_pct, "em relação ao período anterior"), c.receita_var_pct != null && c.receita_var_pct < 0 ? "negative" : "positive");
        set(1, "Despesas pagas", BRL(c.despesas), c.despesas_pct_receita == null ? "sem receita no período" : `${nf(c.despesas_pct_receita)}% da receita`, "");
        set(2, "Resultado líquido", BRL(c.resultado), c.resultado_var_pct == null ? "receita − despesas do período" : comp(c.resultado_var_pct, "no período"), c.resultado < 0 ? "negative" : "positive");
        set(3, "A receber", BRL(c.a_receber_30d), c.a_receber_qtd ? `${c.a_receber_qtd} recebimento(s) nos próximos 30 dias` : "Nada previsto nos próximos 30 dias", "");
    }

    // ---------- fluxo ----------
    function desenharFluxo(d) {
        const c = d.cards;
        const res = qa(".fluxo-card .chart-summary strong");
        if (res[0]) res[0].textContent = compacto(c.receita);
        if (res[1]) res[1].textContent = compacto(c.despesas);
        const bars = q(".fluxo-card .bars"); if (!bars) return;
        limpar(bars);
        const max = Math.max(1, ...d.serie.map(s => Math.max(s.receita, s.despesa)));
        d.serie.forEach(s => {
            const m = el("div", "month"), g = el("div", "bar-group");
            const r = el("div", "bar receita"), x = el("div", "bar despesa");
            r.style.height = `${s.receita ? Math.max(3, s.receita / max * 140) : 0}px`;
            x.style.height = `${s.despesa ? Math.max(3, s.despesa / max * 140) : 0}px`;
            r.title = `Receita ${s.rotulo}: ${BRL(s.receita)}`; x.title = `Despesas ${s.rotulo}: ${BRL(s.despesa)}`;
            g.append(r, x); m.append(g, el("span", null, s.rotulo)); bars.appendChild(m);
        });
    }

    // ---------- despesas por categoria ----------
    function desenharDespesas(d) {
        const total = d.cards.despesas;
        const donut = q(".expenses-card .donut");
        if (donut) {
            let acc = 0; const partes = [];
            d.despesas_por_categoria.forEach((x, i) => {
                const ini = acc; acc += total ? x.valor / total * 360 : 0;
                if (x.valor > 0) partes.push(`${CORES[i % CORES.length]} ${ini}deg ${acc}deg`);
            });
            donut.style.background = partes.length ? `conic-gradient(${partes.join(", ")})` : "#e8eee9";
            const cen = donut.querySelector(".donut-center");
            if (cen) { cen.querySelector("strong").textContent = compacto(total).replace("R$ ", "R$ "); cen.querySelector("span").textContent = "total"; }
        }
        const lista = q(".expenses-card .expense-list"); if (!lista) return;
        limpar(lista);
        d.despesas_por_categoria.forEach((x, i) => {
            const it = el("div", "expense-item"), esq = el("div");
            const dot = el("i", "dot"); dot.style.background = CORES[i % CORES.length];
            esq.append(dot, document.createTextNode(` ${x.categoria}`));
            it.append(esq, el("strong", null, `${nf(x.pct, 0)}%`));
            it.title = BRL(x.valor); lista.appendChild(it);
        });
    }

    // ---------- movimentações ----------
    function linha(m) {
        const row = el("div", "transaction-row");
        const desc = el("div", "transaction-description");
        const ic = el("div", `transaction-icon ${m.tipo === "receita" ? (m.categoria === "Exportação" ? "export" : "revenue") : (m.categoria === "Logística" ? "transport" : "expense")}`);
        ic.appendChild(svg(ICONES[m.tipo]));
        const txt = el("div"), tit = el("strong", null, m.descricao);
        if (m.exemplo) tit.appendChild(el("span", "fin-ex", "exemplo"));
        const sub = el("small", null, m.detalhe || "");
        const acoes = el("span", "fin-acoes");
        if (m.status === "pendente") {
            const ok = el("button", null, m.tipo === "receita" ? "Marcar como recebido" : "Marcar como pago"); ok.type = "button";
            ok.addEventListener("click", () => mudarStatus(m, m.tipo === "receita" ? "recebido" : "pago"));
            acoes.appendChild(ok);
        }
        const del = el("button", "fin-del", "Excluir"); del.type = "button";
        del.addEventListener("click", () => excluir(m));
        acoes.appendChild(del); sub.appendChild(acoes);
        txt.append(tit, sub); desc.append(ic, txt);
        const st = el("span", `status ${CLASSE_STATUS[m.status]}`, `• ${ROTULO_STATUS[m.status]}`);
        const val = el("strong", `value ${m.tipo === "receita" ? "positive-value" : "negative-value"}`, `${m.tipo === "receita" ? "+" : "−"} ${BRL(m.valor)}`);
        row.append(desc, el("span", null, m.categoria), el("span", null, dataBR(m.data)), st, val);
        return row;
    }

    function desenharMovs() {
        const card = q(".transactions-card"); if (!card || !dados) return;
        card.querySelectorAll(".transaction-row:not(.header), .fin-vazio").forEach(n => n.remove());
        const t = busca.trim().toLowerCase();
        const lista = dados.movimentacoes.filter(m => !t || `${m.descricao} ${m.detalhe || ""} ${m.categoria}`.toLowerCase().includes(t));
        if (!lista.length) card.appendChild(el("div", "fin-vazio", t ? "Nenhuma movimentação encontrada." : "Nenhuma movimentação cadastrada. Use “Nova movimentação”."));
        else lista.forEach(m => card.appendChild(linha(m)));
        const link = q(".transactions-section .section-title a");
        if (link) link.textContent = todas ? "Ver menos ↑" : `Ver todas (${dados.total_movimentacoes}) →`;
    }

    // ---------- avisos de baixo ----------
    function desenharInfos(d) {
        const c = d.cards, infos = qa(".bottom-grid .info-card");
        if (infos[0]) {
            infos[0].querySelector("strong").textContent = c.resultado >= 0 ? "Resultado positivo" : "Resultado negativo";
            infos[0].querySelector("p").textContent = c.resultado_var_pct == null
                ? `Resultado líquido de ${BRL(c.resultado)} no período.`
                : `Seu resultado líquido ${c.resultado_var_pct >= 0 ? "aumentou" : "caiu"} ${nf(Math.abs(c.resultado_var_pct))}% em relação ao período anterior (${BRL(c.resultado)}).`;
        }
        if (infos[1]) {
            infos[1].querySelector("p").textContent = (c.a_receber_qtd ? `Você tem ${BRL(c.a_receber_30d)} a receber nos próximos 30 dias.` : "Nenhum recebimento previsto para os próximos 30 dias.")
                + (c.a_pagar_qtd ? ` Há também ${BRL(c.a_pagar_30d)} a pagar.` : "");
        }
    }

    async function carregarPrevisao() {
        const base = qa(".bottom-grid .info-card")[1]; if (!base) return;
        let card = document.getElementById("fin-previsao");
        if (!card) { card = base.cloneNode(true); card.id = "fin-previsao"; base.parentNode.appendChild(card); }
        card.querySelector("strong").textContent = "Receita potencial da safra";
        card.querySelector("p").textContent = "Calculando com a ComexStat e o câmbio do Banco Central…";
        try {
            const p = await api("/produtor/financeiro/previsao");
            card.querySelector("strong").textContent = `Receita potencial da safra ${p.ano}: ${BRL(p.brl)}`;
            card.querySelector("p").textContent = `US$ ${Math.round(p.usd).toLocaleString("pt-BR")} (preço de exportação US$ ${nf(p.preco_usd_kg, 2)}/kg) × PTAX R$ ${nf(p.cambio, 4)} de ${dataBR(p.cambio_data)}. É um teto teórico: supõe que toda a produção seja exportada.`;
        } catch (e) {
            card.querySelector("p").textContent = `Indisponível: ${e.message}`;
        }
    }

    function erroTela(msg) {
        const card = q(".transactions-card");
        if (card) { card.querySelectorAll(".transaction-row:not(.header), .fin-vazio").forEach(n => n.remove()); card.appendChild(el("div", "fin-vazio", `Financeiro indisponível: ${msg}`)); }
        qa(".financial-cards .financial-card strong").forEach(s => { s.textContent = "--"; });
    }

    async function carregar() {
        try {
            dados = await api(`/produtor/financeiro?periodo=${periodo}&todas=${todas}`);
            categorias = dados.categorias;
            desenharCards(dados.cards); desenharFluxo(dados); desenharDespesas(dados); desenharMovs(); desenharInfos(dados);
        } catch (e) { erroTela(e.message); }
    }

    async function mudarStatus(m, status) {
        try { await api(`/produtor/financeiro/movimentacoes/${m.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await carregar(); }
        catch (e) { aviso(e.message); }
    }
    async function excluir(m) {
        if (!confirm(`Excluir "${m.descricao}" (${BRL(m.valor)})?`)) return;
        try { await api(`/produtor/financeiro/movimentacoes/${m.id}`, { method: "DELETE" }); await carregar(); }
        catch (e) { aviso(e.message); }
    }

    // ---------- modal: nova movimentação ----------
    function abrirModal() {
        const hoje = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
        const ov = el("div", "fin-overlay"), md = el("div", "fin-modal");
        md.appendChild(el("h2", null, "Nova movimentação")); md.appendChild(el("p", null, "Registre uma receita ou despesa da propriedade."));
        const campo = (rotulo, input) => { const l = el("label", null, rotulo); l.appendChild(input); return l; };
        const sel = (opcoes) => { const s = document.createElement("select"); opcoes.forEach(([v, t]) => { const o = el("option", null, t); o.value = v; s.appendChild(o); }); return s; };
        const tipo = sel([["receita", "Receita"], ["despesa", "Despesa"]]);
        const descricao = document.createElement("input"); descricao.maxLength = 120; descricao.placeholder = "Ex.: Venda de Uva Vitória";
        const categoria = sel([]);
        const valor = document.createElement("input"); valor.inputMode = "decimal"; valor.placeholder = "0,00";
        const data = document.createElement("input"); data.type = "date"; data.value = hoje;
        const status = sel([]);
        const detalhe = document.createElement("input"); detalhe.maxLength = 120; detalhe.placeholder = "Ex.: Lote #038 (opcional)";
        const opcoesPorTipo = () => {
            const t = tipo.value;
            categoria.replaceChildren(...categorias[t].map(c => { const o = el("option", null, c); o.value = c; return o; }));
            status.replaceChildren(...(t === "receita" ? [["recebido", "Recebido"], ["pendente", "A receber (pendente)"]] : [["pago", "Pago"], ["pendente", "A pagar (pendente)"]])
                .map(([v, tx]) => { const o = el("option", null, tx); o.value = v; return o; }));
        };
        tipo.addEventListener("change", opcoesPorTipo); opcoesPorTipo();
        const l1 = el("div", "fin-linha"); l1.append(campo("Tipo", tipo), campo("Categoria", categoria));
        const l2 = el("div", "fin-linha"); l2.append(campo("Valor (R$)", valor), campo("Data", data));
        md.append(l1, campo("Descrição", descricao), l2, campo("Situação", status), campo("Detalhe", detalhe));
        const erro = el("div", "fin-erro"); erro.hidden = true; md.appendChild(erro);
        const btns = el("div", "fin-btns"), cancelar = el("button", null, "Cancelar"), salvar = el("button", "fin-ok", "Salvar");
        cancelar.type = salvar.type = "button"; btns.append(cancelar, salvar); md.appendChild(btns); ov.appendChild(md); document.body.appendChild(ov);
        const fechar = () => ov.remove();
        cancelar.addEventListener("click", fechar);
        ov.addEventListener("click", (e) => { if (e.target === ov) fechar(); });
        descricao.focus();
        salvar.addEventListener("click", async () => {
            const num = parseFloat(valor.value.trim().replace(/\./g, "").replace(",", "."));
            const falha = (m) => { erro.textContent = m; erro.hidden = false; };
            if (!descricao.value.trim()) return falha("Informe a descrição.");
            if (!(num > 0)) return falha("Informe um valor maior que zero (ex.: 1.250,50).");
            if (!data.value) return falha("Informe a data.");
            salvar.disabled = true; erro.hidden = true;
            try {
                await api("/produtor/financeiro/movimentacoes", { method: "POST", body: JSON.stringify({
                    tipo: tipo.value, categoria: categoria.value, descricao: descricao.value.trim(), detalhe: detalhe.value.trim() || null,
                    data: data.value, status: status.value, valor: num }) });
                fechar(); await carregar(); aviso("Movimentação registrada.");
            } catch (e) { falha(e.message); salvar.disabled = false; }
        });
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (!pagina()) return;
        injetarEstilo();
        const sel = q(".fluxo-card select");
        if (sel) sel.addEventListener("change", () => { periodo = PERIODOS[sel.selectedIndex] || "6m"; carregar(); });
        const nova = q(".page-header .btn-primary");
        if (nova) nova.addEventListener("click", abrirModal);
        const link = q(".transactions-section .section-title a");
        if (link) link.addEventListener("click", (e) => { e.preventDefault(); todas = !todas; carregar(); });
        pagina().addEventListener("input", (e) => {
            if (!e.target.matches("input[type=search], input[type=text], input:not([type])") || e.target.closest(".fin-modal")) return;
            busca = e.target.value;
            if (busca.trim() && !todas) { todas = true; carregar(); } else desenharMovs();
        });
        const card = q(".transactions-card");
        if (card) { card.querySelectorAll(".transaction-row:not(.header)").forEach(n => n.remove()); card.appendChild(el("div", "fin-vazio", "Carregando movimentações…")); }
        carregar().then(carregarPrevisao);
    });
})();
