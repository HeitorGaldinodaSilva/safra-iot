
const mostrarMensagem = Safra.avisar;


// ==========================================
// ÍCONES (SVG) — substituem os emojis
// ==========================================
const SAFRA_ICONES = {
    "bell": '<path d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9"/><path d="M10.2 20.5a2 2 0 0 0 3.6 0"/>',
    "calendar": '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    "folder": '<path d="M3 6.5h6l2 2.5h10v10.5H3z"/>',
    "trash": '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    "check": '<path d="M5 12.5l4.5 4.5L19 7"/>',
    "sprout": '<path d="M12 21V12"/><path d="M12 13c0-4 3-7 8-7 0 4-3 7-8 7z"/><path d="M12 16c0-3-2.5-5.5-7-5.5 0 3 2.5 5.5 7 5.5z"/>',
    "sliders": '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
    "home": '<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5.5h4V20"/>',
    "lock": '<rect x="5" y="11" width="14" height="9.5" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    "bar-chart": '<path d="M4 20V11M10 20V4M16 20v-6M21 20H3"/>',
    "shield": '<path d="M12 3l8 3v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>',
    "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6M18.5 14.2a6.5 6.5 0 0 1 3 5.8"/>',
    "triangle": '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
    "file-text": '<path d="M14 3H6.5v18h11V6.5z"/><path d="M14 3v3.5h3.5M9.5 12h5M9.5 16h5"/>',
    "pencil": '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
    "download": '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
    "eye": '<path d="M2 12s3.500-6.500 10-6.500S22 12 22 12s-3.500 6.500-10 6.500S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
};

function icone(nome, classe) {
    return `<svg class="ico ${classe || "ico-inline"}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SAFRA_ICONES[nome]}</svg>`;
}

/* ================= adm.alerta.js ================= */
/* Administrador > Alertas com dados reais (GET /adm/alertas no FastAPI): clima, fontes de dados,
   falhas de login e eventos de usuários. "Lido/não lido" fica salvo neste navegador. O selo do menu
   lateral mostra os não lidos e é atualizado em todas as abas do ADM. */
(() => {
    const BASE = (window.SAFRA_API_ADM || window.SAFRA_API_ANALISTA || "http://localhost:8000").replace(/\/$/, "");
    const CHAVE_LIDOS = "safra_adm_alertas_lidos";
    const INTERVALO_MS = 60000;
    const raiz = () => document.getElementById("adm.alertas");
    const q = (sel) => { const r = raiz(); return r ? r.querySelector(sel) : null; };
    const txt = (chave, v) => { const el = q(`[data-alertas="${chave}"]`); if (el) el.textContent = v; };
    const semAcento = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const ROTULO = { urgente: "Urgente", atencao: "Atenção", informativo: "Informativo" };
    const COR = { urgente: "vermelho", atencao: "amarelo", informativo: "azul" };
    const SVG = {
        urgente: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
        atencao: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
        informativo: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>'
    };
    let alertas = [], carregando = false, ultimaCarga = 0, erroCarga = null;

    /* ---------- lido / não lido (neste navegador) ---------- */
    function lerLidos() {
        try { return new Set(JSON.parse(localStorage.getItem(CHAVE_LIDOS) || "[]")); } catch (e) { return new Set(); }
    }
    function salvarLidos(conjunto) {
        // guarda só os que ainda existem, para a lista não crescer para sempre
        const ativos = new Set(alertas.map(a => a.id));
        try { localStorage.setItem(CHAVE_LIDOS, JSON.stringify([...conjunto].filter(id => ativos.has(id)))); } catch (e) { /* sem armazenamento */ }
    }

    function criar(tag, classe, texto) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    }

    function quando(iso) {
        const d = new Date(iso), hoje = new Date(), dois = (n) => String(n).padStart(2, "0");
        const hora = `${dois(d.getHours())}:${dois(d.getMinutes())}`;
        const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        const dif = Math.round((dia(hoje) - dia(d)) / 86400000);
        if (dif === 0) return `Hoje, ${hora}`;
        if (dif === 1) return `Ontem, ${hora}`;
        return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}, ${hora}`;
    }

    /* ---------- selo do menu lateral (todas as abas do ADM) ---------- */
    function atualizarSelo() {
        const lidos = lerLidos();
        const naoLidos = alertas.filter(a => !lidos.has(a.id)).length;
        document.querySelectorAll(".alerta-menu .badge").forEach(b => {
            b.textContent = naoLidos > 99 ? "99+" : String(naoLidos);
            b.style.display = naoLidos ? "" : "none";
        });
    }

    /* ---------- janela de detalhes ---------- */
    function abrirDetalhes(a) {
        const lidos = lerLidos();
        lidos.add(a.id);
        salvarLidos(lidos);
        atualizarSelo();
        desenharLista();

        const fundo = criar("div", "safra-modal-fundo"), caixa = criar("div", "safra-modal");
        const focoAnterior = document.activeElement;
        caixa.setAttribute("role", "dialog");
        caixa.setAttribute("aria-modal", "true");
        caixa.setAttribute("aria-label", a.titulo);
        caixa.appendChild(criar("h3", "", a.titulo));
        caixa.appendChild(criar("p", "", a.mensagem));
        const meta = criar("p", "", `${ROTULO[a.prioridade]} • ${a.categoria} • ${quando(a.quando)}`);
        meta.style.fontWeight = "600";
        caixa.appendChild(meta);
        if (a.detalhes.length) {
            const ul = criar("ul");
            ul.style.cssText = "margin:0 0 18px 18px;color:#31584d;font-size:14px;line-height:1.6";
            a.detalhes.forEach(t => ul.appendChild(criar("li", "", t)));
            caixa.appendChild(ul);
        }
        const botoes = criar("div", "safra-modal-botoes");
        const naoLido = criar("button", "safra-btn", "Marcar como não lido");
        const fechar = criar("button", "safra-btn primario", "Fechar");
        naoLido.type = fechar.type = "button";
        botoes.append(naoLido, fechar);
        caixa.appendChild(botoes);
        fundo.appendChild(caixa);
        document.body.appendChild(fundo);

        function sair() {
            document.removeEventListener("keydown", teclado);
            fundo.remove();
            if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
        }
        function teclado(e) { if (e.key === "Escape") sair(); }
        naoLido.addEventListener("click", () => {
            const l = lerLidos(); l.delete(a.id); salvarLidos(l);
            atualizarSelo(); desenharLista(); sair();
        });
        fechar.addEventListener("click", sair);
        fundo.addEventListener("mousedown", (e) => { if (e.target === fundo) sair(); });
        document.addEventListener("keydown", teclado);
        fechar.focus();
    }

    /* ---------- lista e filtros ---------- */
    function filtrados() {
        const lidos = lerLidos();
        const texto = semAcento((q("#buscaAlerta") || {}).value);
        const prio = semAcento((q("#prioridade") || {}).selectedOptions ? q("#prioridade").selectedOptions[0].textContent : "");
        const stat = semAcento((q("#status") || {}).selectedOptions ? q("#status").selectedOptions[0].textContent : "");
        return alertas.filter(a =>
            (!texto || semAcento(a.titulo).includes(texto) || semAcento(a.mensagem).includes(texto) || semAcento(a.categoria).includes(texto)) &&
            (prio.startsWith("todas") || !prio || semAcento(ROTULO[a.prioridade]) === prio) &&
            (stat.startsWith("todos") || !stat || (stat === "lido" ? lidos.has(a.id) : !lidos.has(a.id))));
    }

    function desenharLista() {
        const caixa = q('[data-alertas="lista"]');
        if (!caixa) return;
        const lidos = lerLidos(), lista = filtrados();
        caixa.replaceChildren();
        txt("total", `${lista.length} ${lista.length === 1 ? "alerta" : "alertas"}`);
        if (!lista.length) {
            const vazio = criar("p", "", erroCarga || (alertas.length ? "Nenhum alerta encontrado com esses filtros." : "Nenhum alerta ativo. Tudo certo por aqui!"));
            vazio.style.cssText = `padding:28px;text-align:center;color:${erroCarga ? "#c0392b" : "#5f6d68"}`;
            caixa.appendChild(vazio);
            return;
        }
        lista.forEach(a => {
            const item = criar("div", `alerta-item ${a.prioridade}`);
            if (lidos.has(a.id)) item.style.opacity = ".62";
            const ic = criar("div", `alerta-icone ${COR[a.prioridade]}`);
            ic.innerHTML = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[a.prioridade]}</svg>`;
            const cont = criar("div", "alerta-conteudo"), topo = criar("div", "alerta-titulo");
            // textContent: o conteúdo vem de fontes externas e nunca deve virar HTML
            topo.append(criar("strong", "", a.titulo), criar("span", `tag ${a.prioridade}-tag`, ROTULO[a.prioridade]));
            cont.append(topo, criar("p", "", a.mensagem), criar("small", "", `${a.categoria} • ${quando(a.quando)}${lidos.has(a.id) ? " • Lido" : ""}`));
            const btn = criar("button", "btn-alerta", "Ver detalhes");
            btn.type = "button";
            btn.addEventListener("click", () => abrirDetalhes(a));
            item.append(ic, cont, btn);
            caixa.appendChild(item);
        });
    }

    function desenharResumo(d) {
        const lidos = lerLidos(), naoLidos = (p) => alertas.filter(a => a.prioridade === p && !lidos.has(a.id)).length;
        txt("urgentes", d.cards.urgentes);
        txt("atencao", d.cards.atencao);
        txt("informativos", d.cards.informativos);
        txt("total-card", d.cards.total);
        txt("urgentes-sub", d.cards.urgentes ? `${naoLidos("urgente")} não lido(s) · atenção imediata` : "Nenhum urgente");
        txt("atencao-sub", d.cards.atencao ? `${naoLidos("atencao")} não lido(s) · precisam de análise` : "Nada a analisar");
        txt("informativos-sub", d.cards.informativos ? `${naoLidos("informativo")} não lido(s)` : "Sem novidades");
        txt("total-sub", `${alertas.filter(a => !lidos.has(a.id)).length} não lido(s)`);
        const grave = d.cards.urgentes + d.cards.atencao;
        txt("status-titulo", d.cards.urgentes ? "Existem alertas urgentes" : grave ? "Existem alertas que requerem atenção" : "Nenhum alerta que exija atenção");
        txt("status-texto", d.cards.total ? `${d.cards.total} alerta(s) ativo(s) neste momento.` : "O sistema está funcionando normalmente.");
        const h = new Date(d.atualizado_em), dois = (n) => String(n).padStart(2, "0");
        txt("atualizado", `às ${dois(h.getHours())}:${dois(h.getMinutes())}`);
    }

    async function carregar(manual) {
        if (carregando) return;
        carregando = true;
        try {
            const token = sessionStorage.getItem("safra_token") || "";
            const resp = await fetch(`${BASE}/adm/alertas`, { headers: { Authorization: `Bearer ${token}` } });
            if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
            if (resp.status === 403) throw new Error("Seu perfil não tem acesso aos alertas.");
            if (!resp.ok) throw new Error(`A API respondeu ${resp.status}.`);
            const d = await resp.json();
            alertas = d.alertas;
            erroCarga = null;
            ultimaCarga = Date.now();
            const lidos = lerLidos();
            salvarLidos(lidos);
            desenharResumo(d);
            desenharLista();
            atualizarSelo();
            if (manual && window.Safra) Safra.avisar("Alertas atualizados!");
        } catch (e) {
            const fora = e instanceof TypeError;
            erroCarga = fora ? `API fora do ar. Inicie o FastAPI (${BASE}) e recarregue a página.` : e.message;
            txt("status-titulo", fora ? "API fora do ar" : "Não foi possível atualizar");
            txt("status-texto", erroCarga);
            if (!alertas.length) desenharLista();
        } finally { carregando = false; }
    }

    document.addEventListener("DOMContentLoaded", () => {
        const r = raiz();
        if (!r) return;
        carregar(false);
        // roda em qualquer aba do ADM, para o selo do menu ficar sempre em dia
        setInterval(() => { if (!document.hidden) carregar(false); }, INTERVALO_MS);
        ["#buscaAlerta"].forEach(s => { const el = q(s); if (el) el.addEventListener("input", desenharLista); });
        ["#prioridade", "#status"].forEach(s => { const el = q(s); if (el) el.addEventListener("change", desenharLista); });
        const filtrar = q("#btnFiltrarAlertas");
        if (filtrar) filtrar.addEventListener("click", desenharLista);
        const todos = q("#btnMarcarTodos");
        if (todos) todos.addEventListener("click", () => {
            const l = lerLidos();
            alertas.forEach(a => l.add(a.id));
            salvarLidos(l);
            atualizarSelo();
            desenharLista();
            if (window.Safra) Safra.avisar("Todos os alertas foram marcados como lidos.");
        });
        new MutationObserver(() => { if (r.classList.contains("pagina-ativa") && Date.now() - ultimaCarga > 5000) carregar(false); })
            .observe(r, { attributes: true, attributeFilter: ["class"] });
    });
})();   // fim de adm.alerta.js

/* ================= adm.dados.js ================= */
/* Administrador > Dados com dados reais (GET /adm/dados no FastAPI): sensor ESP32/ThingSpeak, Open-Meteo,
   banco de dados e produção IBGE/PAM. Para trocar o endereço da API: window.SAFRA_API_ADM = "https://..." */
(() => {
    const BASE = (window.SAFRA_API_ADM || window.SAFRA_API_ANALISTA || "http://localhost:8000").replace(/\/$/, "");
    const INTERVALO_MS = 60000;
    const raiz = () => document.getElementById("adm.dados");
    const q = (sel) => { const r = raiz(); return r ? r.querySelector(sel) : null; };
    const txt = (chave, v) => { const el = q(`[data-dados="${chave}"]`); if (el) el.textContent = v; };
    const nf = (v, c = 1) => v === null || v === undefined ? "—"
        : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
    const CORES = ["verde", "azul", "amarelo", "roxo"];
    const SVG = {
        ok: '<path d="M5 12.5l4.5 4.5L19 7"/>',
        alerta: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>',
        banco: '<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
        chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>'
    };
    const ICONE_TIPO = { sensor: "chip", clima: "ok", previsao: "ok", banco: "banco", producao: "ok", alerta: "alerta" };
    let carregando = false, ultimaCarga = 0;

    function criar(tag, classe, texto) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    }

    function quando(iso) {
        const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
        return min < 1 ? "Agora" : min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
    }

    function desenharQualidade(lista) {
        const caixa = q('[data-dados="qualidade"]');
        if (!caixa) return;
        caixa.replaceChildren();
        lista.forEach(i => {
            const item = criar("div", "qualidade-item"), topo = criar("div", "qualidade-topo");
            const nome = criar("strong", "", i.nome);
            nome.title = i.detalhe || "";
            topo.append(nome, criar("span", "", i.valor === null ? "Indisponível" : `${nf(i.valor)}%`));
            const barra = criar("div", "barra"), prog = criar("div");
            prog.style.width = `${Math.max(0, Math.min(100, i.valor || 0))}%`;
            if (i.valor !== null && i.valor < 70) prog.style.background = "#c0392b";
            else if (i.valor !== null && i.valor < 90) prog.style.background = "#d98e04";
            barra.appendChild(prog);
            item.append(topo, barra);
            caixa.appendChild(item);
        });
    }

    function desenharFontes(lista) {
        const caixa = q('[data-dados="fontes"]');
        if (!caixa) return;
        caixa.replaceChildren();
        lista.forEach((f, i) => {
            const item = criar("div", "fonte");
            item.appendChild(criar("div", `fonte-icone ${CORES[i % CORES.length]}`, f.sigla));
            const info = criar("div", "fonte-info");
            info.append(criar("strong", "", f.nome), criar("span", "", f.detalhe || f.descricao));
            const b = criar("b", "", f.estado);
            if (f.estado !== "Online") b.style.color = "#c0392b";
            item.append(info, b);
            item.title = f.descricao;
            caixa.appendChild(item);
        });
    }

    function desenharAtividades(lista) {
        const caixa = q('[data-dados="atividades"]');
        if (!caixa) return;
        caixa.replaceChildren();
        if (!lista.length) lista = [{ tipo: "ok", titulo: "Sem atividades", descricao: "Nenhuma fonte respondeu ainda", quando: new Date().toISOString() }];
        lista.forEach((a, i) => {
            const item = criar("div", "atividade");
            const ic = criar("div", `atividade-icone ${CORES[i % CORES.length]}`);
            ic.innerHTML = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[ICONE_TIPO[a.tipo]] || SVG.ok}</svg>`;
            const info = criar("div", "atividade-info");
            // textContent: o conteúdo vem de fontes externas e nunca deve virar HTML
            info.append(criar("strong", "", a.titulo), criar("span", "", a.descricao));
            item.append(ic, info, criar("small", "", quando(a.quando)));
            caixa.appendChild(item);
        });
    }

    function preencher(d) {
        const c = d.cards, ok = d.geral === "ok";
        txt("status-titulo", ok ? "Sistema de dados funcionando normalmente" : "Algumas fontes de dados precisam de atenção");
        txt("status-texto", ok ? "Todas as fontes de dados estão respondendo." : `${c.fontes.online} de ${c.fontes.total} fontes online.`);
        const h = new Date(d.atualizado_em);
        txt("atualizado", `às ${String(h.getHours()).padStart(2, "0")}:${String(h.getMinutes()).padStart(2, "0")}`);

        txt("processados", nf(c.processados.valor, 0));
        txt("processados-sub", `${nf(c.processados.sensor, 0)} do sensor · ${nf(c.processados.clima, 0)} do Open-Meteo (24 h)`);
        txt("integridade", c.integridade.valor === null ? "—" : `${nf(c.integridade.valor)}%`);
        txt("integridade-sub", c.integridade.rotulo || "Sem dados");
        txt("q-geral", c.integridade.valor === null ? "—" : `${nf(c.integridade.valor)}%`);
        txt("fontes-online", nf(c.fontes.online, 0));
        txt("fontes-sub", c.fontes.online === c.fontes.total ? "Todas online" : `de ${c.fontes.total} · ${c.fontes.total - c.fontes.online} com problema`);
        txt("fontes-estado", ok ? "• Online" : "• Parcial");
        txt("atencao", nf(c.atencao.valor, 0));
        txt("atencao-sub", c.atencao.valor ? "Requer análise" : "Nada a revisar");
        const cardAtencao = q('[data-dados="atencao"]');
        if (cardAtencao) cardAtencao.closest(".card").title = c.atencao.itens.join("\n");

        desenharQualidade(d.qualidade || []);
        desenharFontes(d.fontes || []);
        desenharAtividades(d.atividades || []);
    }

    async function carregar(manual) {
        if (carregando || !raiz()) return;
        carregando = true;
        const btn = document.getElementById("btnAtualizar");
        if (btn) btn.disabled = true;
        try {
            const token = sessionStorage.getItem("safra_token") || "";
            const resp = await fetch(`${BASE}/adm/dados`, { headers: { Authorization: `Bearer ${token}` } });
            if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
            if (resp.status === 403) throw new Error("Seu perfil não tem acesso a esta dashboard.");
            if (!resp.ok) throw new Error(`A API respondeu ${resp.status}.`);
            preencher(await resp.json());
            ultimaCarga = Date.now();
            if (manual && window.Safra) Safra.avisar("Dados atualizados!");
        } catch (erro) {
            const fora = erro instanceof TypeError;
            txt("status-titulo", fora ? "API fora do ar" : "Não foi possível atualizar");
            txt("status-texto", fora ? `Inicie o FastAPI (${BASE}) e recarregue a página.` : erro.message);
        } finally {
            carregando = false;
            if (btn) btn.disabled = false;
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        const r = raiz();
        if (!r) return;
        carregar(false);
        setInterval(() => { if (!document.hidden && r.classList.contains("pagina-ativa")) carregar(false); }, INTERVALO_MS);
        const btn = document.getElementById("btnAtualizar");
        if (btn) btn.addEventListener("click", () => carregar(true));
        new MutationObserver(() => { if (r.classList.contains("pagina-ativa") && Date.now() - ultimaCarga > 5000) carregar(false); })
            .observe(r, { attributes: true, attributeFilter: ["class"] });
    });
})();   // fim de adm.dados.js

/* ================= adm.inicial.js ================= */
/* Administrador > Inicial com dados reais do Open-Meteo (GET /adm/inicial no FastAPI).
   Para trocar o endereço da API: <script>window.SAFRA_API_ADM = "https://minha-api";</script> antes do adm.js */
(() => {
    const BASE = (window.SAFRA_API_ADM || window.SAFRA_API_ANALISTA || "http://localhost:8000").replace(/\/$/, "");
    const INTERVALO_MS = 60000;
    const raiz = () => document.getElementById("adm.inicial");
    const q = (sel) => { const r = raiz(); return r ? r.querySelector(sel) : null; };
    const txt = (sel, v) => { const el = q(sel); if (el) el.textContent = v; };
    const nf = (v, c = 1) => v === null || v === undefined ? "—"
        : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
    let carregando = false;

    function quando(iso) {
        const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
        return min < 1 ? "Agora" : min < 60 ? `${min} min` : min < 1440 ? `${Math.round(min / 60)} h` : `${Math.round(min / 1440)} d`;
    }

    const ICONE = {
        dados: '<path d="M5 12.5l4.5 4.5L19 7"/>',
        modelo: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/>',
        permissao: '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/>'
    };

    function saudacao() {
        try {
            const nome = (JSON.parse(sessionStorage.getItem("safra_usuario") || "null") || {}).nome || "";
            const p = nome.trim().split(/\s+/)[0];
            txt('[data-adm="saudacao"]', p ? `Olá, ${p}!` : "Olá!");
        } catch (e) { /* mantém o texto padrão */ }
    }

    function desenharAtividades(lista) {
        const caixa = q('[data-adm="atividades"]');
        if (!caixa) return;
        caixa.replaceChildren();
        if (!lista.length) lista = [{ tipo: "dados", titulo: "Sem atividades", descricao: "Nada para mostrar agora", quando: new Date().toISOString() }];
        lista.forEach(a => {
            const tipo = ICONE[a.tipo] ? a.tipo : "dados";
            const el = document.createElement("div");
            el.className = "atividade";
            el.innerHTML = `<div class="atividade-icone ${tipo}"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONE[tipo]}</svg></div>` +
                '<div class="atividade-texto"><strong></strong><span></span></div><small></small>';
            // textContent: o conteúdo vem de fonte externa e nunca deve virar HTML
            el.querySelector("strong").textContent = a.titulo;
            el.querySelector("span").textContent = a.descricao;
            el.querySelector("small").textContent = quando(a.quando);
            caixa.appendChild(el);
        });
    }

    function desenharStatus(lista) {
        const itens = (raiz() ? raiz().querySelectorAll(".status-lista .status-item") : []);
        lista.forEach((s, i) => {
            const it = itens[i];
            if (!it) return;
            it.querySelector("strong").textContent = s.nome;
            it.querySelector("div > span").textContent = s.descricao;
            const b = it.querySelector("b");
            b.textContent = s.valor;
            b.style.color = s.valor === "Offline" ? "#c0392b" : "";
        });
    }

    function preencher(d) {
        const c = d.cards, ok = d.geral === "ok";
        txt('[data-adm="status-titulo"]', ok ? "Sistema funcionando normalmente" : "Sistema com dados parciais");
        const erros = [d.fontes.observacao.erro, d.fontes.previsao.erro].filter(Boolean).join(" · ");
        txt('[data-adm="status-texto"]', ok ? "Open-Meteo (observação e previsão) respondendo normalmente." : erros);
        txt('[data-adm="atualizado"]', "há instantes");
        txt('[data-adm="online"]', ok ? "● Online" : "● Parcial");

        const t = c.temperatura || {};
        txt("#usuariosAtivosInicial", t.temperatura == null ? "—" : `${nf(t.temperatura)}°C`);
        const partes = [t.condicao, t.sensacao != null ? `sensação ${nf(t.sensacao, 0)}°C` : null,
                        t.umidade != null ? `umidade ${nf(t.umidade, 0)}%` : null].filter(Boolean);
        txt('[data-adm="temp-sub"]', partes.join(" · ") || "—");

        txt("#integridade", c.integridade.valor == null ? "—" : `${nf(c.integridade.valor)}%`);
        txt('[data-adm="integridade-sub"]', c.integridade.rotulo ? `${c.integridade.rotulo} · ${c.integridade.validos}/${c.integridade.esperados} pontos` : "Sem dados");
        txt("#dadosProcessados", nf(c.dados_processados.valor, 0));
        txt('[data-adm="processados-sub"]', `de ${nf(c.dados_processados.esperados, 0)} pontos esperados · 24 h`);
        txt("#alertasSistema", nf(c.alertas.total, 0));
        txt('[data-adm="alertas-sub"]', c.alertas.critico ? `${c.alertas.critico} urgente(s)`
            : c.alertas.atencao ? `${c.alertas.atencao} de atenção` : c.alertas.total ? "Informativos" : "Nenhum alerta");

        desenharAtividades(d.atividades || []);
        desenharStatus(d.status || []);
        txt("#rodapeStatus", ok ? "Sistema atualizado" : "Atualização parcial");
    }


    /* Usuários por perfil: contagem real do banco (Backend Node: GET /usuarios/resumo) */
    async function carregarResumoUsuarios() {
        const NODE = window.SAFRA_API_NODE || "http://localhost:3001";
        try {
            const resp = await fetch(`${NODE}/usuarios/resumo`, { headers: { Authorization: `Bearer ${sessionStorage.getItem("safra_token") || ""}` } });
            if (!resp.ok) return;
            const d = await resp.json();
            const ordem = ["produtor", "analista", "administrador", "exportador"];
            const bs = raiz() ? raiz().querySelectorAll(".usuarios-grid .perfil > b") : [];
            ordem.forEach((k, i) => { if (bs[i]) bs[i].textContent = nf(d.perfis[k] || 0, 0); });
        } catch (e) { /* sem o Node: mantém o que estava na tela */ }
    }

    async function carregar(manual) {
        if (carregando || !raiz()) return;
        carregando = true;
        carregarResumoUsuarios();
        const btn = document.getElementById("btnAtualizarInicial");
        if (btn) btn.disabled = true;
        try {
            const token = sessionStorage.getItem("safra_token") || "";
            const resp = await fetch(`${BASE}/adm/inicial`, { headers: { Authorization: `Bearer ${token}` } });
            if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
            if (resp.status === 403) throw new Error("Seu perfil não tem acesso a esta dashboard.");
            if (!resp.ok) throw new Error(resp.status === 503 ? "Open-Meteo indisponível no momento." : `A API respondeu ${resp.status}.`);
            preencher(await resp.json());
            if (manual && window.Safra) Safra.avisar("Informações do sistema atualizadas!");
        } catch (erro) {
            const fora = erro instanceof TypeError;
            txt('[data-adm="status-titulo"]', fora ? "API fora do ar" : "Não foi possível atualizar");
            txt('[data-adm="status-texto"]', fora ? `Inicie o FastAPI (${BASE}) e recarregue a página.` : erro.message);
            txt('[data-adm="online"]', "● Offline");
        } finally {
            carregando = false;
            if (btn) btn.disabled = false;
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        saudacao();
        carregar(false);
        setInterval(() => { if (!document.hidden) carregar(false); }, INTERVALO_MS);
        const btn = document.getElementById("btnAtualizarInicial");
        if (btn) btn.addEventListener("click", () => carregar(true));
    });
})();   // fim de adm.inicial.js

/* ================= adm.logs.js ================= */
(() => {
    // ==========================================
    // SAFRA - ADMINISTRADOR
    // SISTEMA LOG
    // ==========================================

    // ==========================================
    // DADOS DOS LOGS
    // ==========================================

    let logs = [

        {
            id: 1,
            usuario: "Administrador",
            acao: "Login realizado",
            tipo: "Login",
            descricao: "Usuário administrador realizou login no sistema.",
            data: "16/09/2026",
            hora: "08:42",
            status: "Sucesso"
        },

        {
            id: 2,
            usuario: "Maria Alves",
            acao: "Atualização de dados",
            tipo: "Dados",
            descricao: "Dados da produção foram atualizados.",
            data: "16/09/2026",
            hora: "09:15",
            status: "Sucesso"
        },

        {
            id: 3,
            usuario: "Administrador",
            acao: "Alteração de permissão",
            tipo: "Permissão",
            descricao: "Permissão do perfil Analista de Dados foi alterada.",
            data: "16/09/2026",
            hora: "09:37",
            status: "Sucesso"
        },

        {
            id: 4,
            usuario: "João Silva",
            acao: "Login realizado",
            tipo: "Login",
            descricao: "Produtor realizou login no sistema.",
            data: "16/09/2026",
            hora: "10:02",
            status: "Sucesso"
        },

        {
            id: 5,
            usuario: "Administrador",
            acao: "Usuário cadastrado",
            tipo: "Usuário",
            descricao: "Novo usuário foi cadastrado no sistema.",
            data: "16/09/2026",
            hora: "10:21",
            status: "Sucesso"
        },

        {
            id: 6,
            usuario: "Carlos Santos",
            acao: "Tentativa de login",
            tipo: "Segurança",
            descricao: "Tentativa de acesso com senha incorreta.",
            data: "16/09/2026",
            hora: "10:45",
            status: "Falha"
        },

        {
            id: 7,
            usuario: "Administrador",
            acao: "Relatório gerado",
            tipo: "Relatório",
            descricao: "Relatório geral do sistema foi gerado.",
            data: "16/09/2026",
            hora: "11:03",
            status: "Sucesso"
        }

    ];


    // ==========================================
    // ELEMENTOS DA PÁGINA
    // ==========================================

    const listaLogs =
        document.querySelector("#listaLogs");

    const buscarLog =
        document.querySelector("#buscarLog");

    const filtroTipoLog =
        document.querySelector("#filtroTipoLog");

    const filtroUsuarioLog =
        document.querySelector("#filtroUsuarioLog");


    // ==========================================
    // RENDERIZAR LOGS
    // ==========================================

    function renderizarLogs(lista = logs) {

        if (!listaLogs) return;

        listaLogs.innerHTML = "";


        if (lista.length === 0) {

            listaLogs.innerHTML = `

                <div class="nenhum-log">

                    <p>
                        Nenhum registro encontrado.
                    </p>

                </div>

            `;

            return;
        }


        lista.forEach(log => {

            const item =
                document.createElement("div");


            item.classList.add(
                "item-log"
            );


            const classeStatus =
                log.status === "Sucesso"
                    ? "log-sucesso"
                    : "log-falha";


            item.innerHTML = `

                <div class="icone-log">

                    ${obterIconeLog(log.tipo)}

                </div>


                <div class="informacoes-log">

                    <div class="cabecalho-log">

                        <strong>
                            ${log.acao}
                        </strong>

                        <span class="${classeStatus}">
                            ${log.status}
                        </span>

                    </div>


                    <p>
                        ${log.descricao}
                    </p>


                    <div class="detalhes-log">

                        <span>
                            ${icone("user")} ${log.usuario}
                        </span>

                        <span>
                            ${icone("calendar")} ${log.data}
                        </span>

                        <span>
                            ${icone("clock")} ${log.hora}
                        </span>

                    </div>

                </div>


                <button
                    class="btn-detalhes-log"
                    onclick="visualizarLog(${log.id})"
                >
                    Ver detalhes
                </button>

            `;


            listaLogs.appendChild(item);

        });

    }


    // ==========================================
    // ÍCONES DOS LOGS
    // ==========================================

    function obterIconeLog(tipo) {

        switch (tipo) {

            case "Login":
                return icone("lock", "ico-card");

            case "Dados":
                return icone("bar-chart", "ico-card");

            case "Permissão":
                return icone("shield", "ico-card");

            case "Usuário":
                return icone("user", "ico-card");

            case "Segurança":
                return icone("triangle", "ico-card");

            case "Relatório":
                return icone("file-text", "ico-card");

            default:
                return icone("file-text", "ico-card");

        }

    }


    // ==========================================
    // BUSCAR LOGS
    // ==========================================

    function pesquisarLogs() {

        const texto =
            buscarLog
                ? buscarLog.value
                    .toLowerCase()
                    .trim()
                : "";


        const tipo =
            filtroTipoLog
                ? filtroTipoLog.value
                : "Todos";


        const usuario =
            filtroUsuarioLog
                ? filtroUsuarioLog.value
                : "Todos";


        const resultado =
            logs.filter(log => {

                const correspondeTexto =

                    log.usuario
                        .toLowerCase()
                        .includes(texto)

                    ||

                    log.acao
                        .toLowerCase()
                        .includes(texto)

                    ||

                    log.descricao
                        .toLowerCase()
                        .includes(texto);


                const correspondeTipo =

                    tipo === "Todos" ||

                    log.tipo === tipo;


                const correspondeUsuario =

                    usuario === "Todos" ||

                    log.usuario === usuario;


                return (

                    correspondeTexto &&

                    correspondeTipo &&

                    correspondeUsuario

                );

            });


        renderizarLogs(resultado);

    }


    // ==========================================
    // EVENTOS DE PESQUISA
    // ==========================================

    if (buscarLog) {

        buscarLog.addEventListener(
            "input",
            pesquisarLogs
        );

    }


    if (filtroTipoLog) {

        filtroTipoLog.addEventListener(
            "change",
            pesquisarLogs
        );

    }


    if (filtroUsuarioLog) {

        filtroUsuarioLog.addEventListener(
            "change",
            pesquisarLogs
        );

    }


    // ==========================================
    // VISUALIZAR LOG
    // ==========================================

    function visualizarLog(id) {

        const log =
            logs.find(
                item => item.id === id
            );


        if (!log) return;


        alert(`

    DETALHES DO REGISTRO

    Usuário:
    ${log.usuario}

    Ação:
    ${log.acao}

    Tipo:
    ${log.tipo}

    Descrição:
    ${log.descricao}

    Data:
    ${log.data}

    Horário:
    ${log.hora}

    Status:
    ${log.status}

        `);

    }


    // ==========================================
    // LIMPAR FILTROS
    // ==========================================

    function limparFiltrosLogs() {

        if (buscarLog) {

            buscarLog.value = "";

        }


        if (filtroTipoLog) {

            filtroTipoLog.value = "Todos";

        }


        if (filtroUsuarioLog) {

            filtroUsuarioLog.value = "Todos";

        }


        renderizarLogs();

    }


    // ==========================================
    // ATUALIZAR LOGS
    // ==========================================

    function atualizarLogs() {

        renderizarLogs();


        mostrarMensagemLog(
            "Sistema de logs atualizado!"
        );

    }


    // ==========================================
    // CONTADORES
    // ==========================================

    function atualizarContadoresLogs() {

        const totalLogs =
            document.querySelector(
                "#totalLogs"
            );


        const logsSucesso =
            document.querySelector(
                "#logsSucesso"
            );


        const logsFalha =
            document.querySelector(
                "#logsFalha"
            );


        const logins =
            document.querySelector(
                "#totalLogins"
            );


        const sucesso =
            logs.filter(
                log =>
                    log.status === "Sucesso"
            ).length;


        const falhas =
            logs.filter(
                log =>
                    log.status === "Falha"
            ).length;


        const quantidadeLogins =
            logs.filter(
                log =>
                    log.tipo === "Login"
            ).length;


        if (totalLogs) {

            totalLogs.textContent =
                logs.length;

        }


        if (logsSucesso) {

            logsSucesso.textContent =
                sucesso;

        }


        if (logsFalha) {

            logsFalha.textContent =
                falhas;

        }


        if (logins) {

            logins.textContent =
                quantidadeLogins;

        }

    }


    // ==========================================
    // EXPORTAR LOGS
    // ==========================================

    function exportarLogs() {

        if (logs.length === 0) {

            alert(
                "Não existem logs para exportar."
            );

            return;
        }


        let csv =
            "Usuário;Ação;Tipo;Descrição;Data;Hora;Status\n";


        logs.forEach(log => {

            csv +=

                `${log.usuario};` +
                `${log.acao};` +
                `${log.tipo};` +
                `${log.descricao};` +
                `${log.data};` +
                `${log.hora};` +
                `${log.status}\n`;

        });


        const arquivo =
            new Blob(
                [csv],
                {
                    type:
                        "text/csv;charset=utf-8;"
                }
            );


        const url =
            URL.createObjectURL(arquivo);


        const link =
            document.createElement("a");


        link.href = url;

        link.download =
            "safra-logs.csv";


        document.body.appendChild(link);

        link.click();

        document.body.removeChild(link);

        URL.revokeObjectURL(url);


        mostrarMensagemLog(
            "Logs exportados com sucesso!"
        );

    }


    // ==========================================
    // MENSAGEM DO SISTEMA
    // ==========================================

    function mostrarMensagemLog(texto) {

        let mensagem =
            document.querySelector(
                "#mensagemLog"
            );


        if (!mensagem) {

            mensagem =
                document.createElement("div");

            mensagem.id =
                "mensagemLog";

            mensagem.className =
                "mensagem-log";

            document.body.appendChild(
                mensagem
            );

        }


        mensagem.textContent =
            texto;


        mensagem.classList.add(
            "mostrar"
        );


        setTimeout(() => {

            mensagem.classList.remove(
                "mostrar"
            );

        }, 2500);

    }


    // ==========================================
    // INICIALIZAÇÃO
    // ==========================================

    document.addEventListener(
        "DOMContentLoaded",
        function () {

            renderizarLogs();

            atualizarContadoresLogs();

        }
    );
})();   // fim de adm.logs.js

/* ================= adm.permissoes.js ================= */
(() => {
    // ==========================================
    // SAFRA - ADMIN
    // PÁGINA DE PERMISSÕES
    // ==========================================

    let permissoes = [
        {
            id: 1,
            perfil: "Administrador",
            descricao: "Acesso completo ao sistema",
            usuarios: 2,
            dashboard: true,
            usuariosSistema: true,
            permissoes: true,
            dados: true,
            logs: true,
            relatorios: true,
            alertas: true,
            configuracoes: true
        },

        {
            id: 2,
            perfil: "Analista de Dados",
            descricao: "Acesso aos dados e análises",
            usuarios: 5,
            dashboard: true,
            usuariosSistema: false,
            permissoes: false,
            dados: true,
            logs: true,
            relatorios: true,
            alertas: true,
            configuracoes: false
        },

        {
            id: 3,
            perfil: "Produtor",
            descricao: "Acesso aos dados da produção",
            usuarios: 17,
            dashboard: true,
            usuariosSistema: false,
            permissoes: false,
            dados: true,
            logs: false,
            relatorios: true,
            alertas: true,
            configuracoes: false
        }
    ];


    // ==========================================
    // ELEMENTOS
    // ==========================================

    const listaPermissoes =
        document.querySelector("#listaPermissoes");

    const busca =
        document.querySelector("#buscarPermissao");

    const filtro =
        document.querySelector("#filtroPermissao");

    const btnSalvar =
        document.querySelector("#salvarPermissoes");


    // ==========================================
    // MOSTRAR PERMISSÕES
    // ==========================================

    function mostrarPermissoes(lista = permissoes) {

        if (!listaPermissoes) return;

        listaPermissoes.innerHTML = "";

        lista.forEach(item => {

            const card = document.createElement("div");

            card.classList.add("card-permissao");

            card.innerHTML = `

                <div class="cabecalho-permissao">

                    <div>

                        <h3>
                            ${item.perfil}
                        </h3>

                        <p>
                            ${item.descricao}
                        </p>

                    </div>

                    <span>
                        ${item.usuarios} usuários
                    </span>

                </div>


                <div class="permissoes-grid">

                    ${criarPermissao(
                        item.id,
                        "dashboard",
                        "Dashboard"
                    )}

                    ${criarPermissao(
                        item.id,
                        "usuariosSistema",
                        "Usuários"
                    )}

                    ${criarPermissao(
                        item.id,
                        "permissoes",
                        "Permissões"
                    )}

                    ${criarPermissao(
                        item.id,
                        "dados",
                        "Dados"
                    )}

                    ${criarPermissao(
                        item.id,
                        "logs",
                        "Logs do sistema"
                    )}

                    ${criarPermissao(
                        item.id,
                        "relatorios",
                        "Relatórios"
                    )}

                    ${criarPermissao(
                        item.id,
                        "alertas",
                        "Alertas"
                    )}

                    ${criarPermissao(
                        item.id,
                        "configuracoes",
                        "Configurações"
                    )}

                </div>

            `;

            listaPermissoes.appendChild(card);

        });
    }


    // ==========================================
    // CRIAR PERMISSÃO
    // ==========================================

    function criarPermissao(
        id,
        nome,
        titulo
    ) {

        const perfil = permissoes.find(
            item => item.id === id
        );

        const ativada = perfil[nome];

        return `

            <div class="permissao-item">

                <div class="permissao-info">

                    <span>
                        ${titulo}
                    </span>

                    <small>
                        ${
                            ativada
                                ? "Acesso permitido"
                                : "Acesso bloqueado"
                        }
                    </small>

                </div>


                <label class="switch">

                    <input
                        type="checkbox"
                        ${
                            ativada
                                ? "checked"
                                : ""
                        }

                        onchange="
                            alterarPermissao(
                                ${id},
                                '${nome}',
                                this.checked
                            )
                        "
                    >

                    <span class="slider"></span>

                </label>

            </div>

        `;
    }


    // ==========================================
    // ALTERAR PERMISSÃO
    // ==========================================

    function alterarPermissao(
        id,
        permissao,
        valor
    ) {

        const perfil = permissoes.find(
            item => item.id === id
        );

        if (!perfil) return;

        perfil[permissao] = valor;

        mostrarPermissoes();

    }


    // ==========================================
    // BUSCAR
    // ==========================================

    function pesquisarPermissoes() {

        const texto =
            busca.value
                .toLowerCase()
                .trim();

        const perfilSelecionado =
            filtro.value;


        const resultado =
            permissoes.filter(item => {

                const correspondeNome =
                    item.perfil
                        .toLowerCase()
                        .includes(texto);

                const correspondeFiltro =
                    perfilSelecionado === "Todos" ||
                    item.perfil === perfilSelecionado;

                return (
                    correspondeNome &&
                    correspondeFiltro
                );

            });


        mostrarPermissoes(resultado);

    }


    if (busca) {

        busca.addEventListener(
            "input",
            pesquisarPermissoes
        );

    }


    if (filtro) {

        filtro.addEventListener(
            "change",
            pesquisarPermissoes
        );

    }


    // ==========================================
    // SALVAR
    // ==========================================

    if (btnSalvar) {

        btnSalvar.addEventListener(
            "click",
            function () {

                localStorage.setItem(
                    "safraPermissoes",
                    JSON.stringify(permissoes)
                );

                alert(
                    "Permissões salvas com sucesso!"
                );

            }
        );

    }


    // ==========================================
    // CARREGAR DADOS SALVOS
    // ==========================================

    function carregarPermissoes() {

        const dados =
            localStorage.getItem(
                "safraPermissoes"
            );

        if (!dados) return;

        try {

            permissoes = JSON.parse(dados);

        } catch (erro) {

            console.error(
                "Erro ao carregar permissões:",
                erro
            );

        }

    }


    // ==========================================
    // INICIALIZAÇÃO
    // ==========================================

    document.addEventListener(
        "DOMContentLoaded",
        function () {

            carregarPermissoes();

            mostrarPermissoes();

        }
    );
})();   // fim de adm.permissoes.js

/* ================= adm.relatorios.js ================= */
(() => {
    // ==========================================
    // RELATÓRIOS - PAINEL ADMINISTRADOR
    // ==========================================

    // Dados dos relatórios
    let relatorios = [
        {
            id: 1,
            nome: "Relatório Geral do Sistema",
            tipo: "Sistema",
            descricao: "Resumo geral dos usuários, propriedades e produção.",
            periodo: "Mensal",
            data: "10/09/2026",
            responsavel: "Administrador",
            status: "Disponível"
        },
        {
            id: 2,
            nome: "Relatório de Usuários",
            tipo: "Usuários",
            descricao: "Informações sobre usuários cadastrados e acessos ao sistema.",
            periodo: "Mensal",
            data: "09/09/2026",
            responsavel: "Administrador",
            status: "Disponível"
        },
        {
            id: 3,
            nome: "Relatório de Produção",
            tipo: "Produção",
            descricao: "Dados da produção agrícola registrada no sistema.",
            periodo: "Trimestral",
            data: "08/09/2026",
            responsavel: "Administrador",
            status: "Disponível"
        },
        {
            id: 4,
            nome: "Relatório de Propriedades",
            tipo: "Propriedades",
            descricao: "Resumo das propriedades cadastradas e suas áreas cultivadas.",
            periodo: "Mensal",
            data: "07/09/2026",
            responsavel: "Administrador",
            status: "Disponível"
        },
        {
            id: 5,
            nome: "Relatório de Atividades",
            tipo: "Atividades",
            descricao: "Registro das principais atividades realizadas pelos usuários.",
            periodo: "Semanal",
            data: "06/09/2026",
            responsavel: "Administrador",
            status: "Disponível"
        }
    ];


    // ==========================================
    // INICIALIZAÇÃO
    // ==========================================

    document.addEventListener("DOMContentLoaded", function () {

        renderizarRelatorios();

        // Pesquisa
        const campoBusca = document.getElementById("buscarRelatorio");

        if (campoBusca) {
            campoBusca.addEventListener("input", renderizarRelatorios);
        }

        // Filtro por tipo
        const filtroTipo = document.getElementById("filtroTipoRelatorio");

        if (filtroTipo) {
            filtroTipo.addEventListener("change", renderizarRelatorios);
        }

        // Filtro por período
        const filtroPeriodo = document.getElementById("filtroPeriodoRelatorio");

        if (filtroPeriodo) {
            filtroPeriodo.addEventListener("change", renderizarRelatorios);
        }

        atualizarIndicadores();
    });


    // ==========================================
    // RENDERIZAR RELATÓRIOS
    // ==========================================

    function renderizarRelatorios() {

        const lista = document.getElementById("listaRelatorios");

        if (!lista) return;

        const busca = document
            .getElementById("buscarRelatorio")
            ?.value
            .toLowerCase() || "";

        const tipo = document
            .getElementById("filtroTipoRelatorio")
            ?.value || "todos";

        const periodo = document
            .getElementById("filtroPeriodoRelatorio")
            ?.value || "todos";


        const filtrados = relatorios.filter(relatorio => {

            const correspondeBusca =
                relatorio.nome.toLowerCase().includes(busca) ||
                relatorio.tipo.toLowerCase().includes(busca) ||
                relatorio.descricao.toLowerCase().includes(busca);

            const correspondeTipo =
                tipo === "todos" ||
                relatorio.tipo === tipo;

            const correspondePeriodo =
                periodo === "todos" ||
                relatorio.periodo === periodo;

            return (
                correspondeBusca &&
                correspondeTipo &&
                correspondePeriodo
            );
        });


        lista.innerHTML = "";


        if (filtrados.length === 0) {

            lista.innerHTML = `
                <div class="sem-relatorios">
                    <p>${icone("file-text")} Nenhum relatório encontrado.</p>
                </div>
            `;

            return;
        }


        filtrados.forEach(relatorio => {

            const card = document.createElement("div");

            card.className = "card-relatorio";

            card.innerHTML = `
                <div class="icone-relatorio">
                    ${obterIconeRelatorio(relatorio.tipo)}
                </div>

                <div class="informacoes-relatorio">

                    <h3>${relatorio.nome}</h3>

                    <p>${relatorio.descricao}</p>

                    <div class="dados-relatorio">

                        <span>
                            ${icone("bar-chart")} ${relatorio.tipo}
                        </span>

                        <span>
                            ${icone("calendar")} ${relatorio.data}
                        </span>

                        <span>
                            ${icone("clock")} ${relatorio.periodo}
                        </span>

                    </div>

                    <small>
                        Responsável: ${relatorio.responsavel}
                    </small>

                </div>

                <div class="acoes-relatorio">

                    <span class="status-relatorio">
                        ${icone("check")} ${relatorio.status}
                    </span>

                    <button
                        onclick="visualizarRelatorio(${relatorio.id})">
                        ${icone("eye")} Visualizar
                    </button>

                    <button
                        onclick="baixarRelatorio(${relatorio.id})">
                        ${icone("download")} Baixar
                    </button>

                </div>
            `;

            lista.appendChild(card);
        });
    }


    // ==========================================
    // ÍCONE DE CADA TIPO DE RELATÓRIO
    // ==========================================

    function obterIconeRelatorio(tipo) {

        switch (tipo) {

            case "Sistema":
                return icone("sliders", "ico-card");

            case "Usuários":
                return icone("users", "ico-card");

            case "Produção":
                return icone("sprout", "ico-card");

            case "Propriedades":
                return icone("home", "ico-card");

            case "Atividades":
                return icone("file-text", "ico-card");

            default:
                return icone("file-text", "ico-card");
        }
    }


    // ==========================================
    // VISUALIZAR RELATÓRIO
    // ==========================================

    function visualizarRelatorio(id) {

        const relatorio = relatorios.find(
            item => item.id === id
        );

        if (!relatorio) return;


        alert(
            `RELATÓRIO\n\n` +
            `Nome: ${relatorio.nome}\n` +
            `Tipo: ${relatorio.tipo}\n` +
            `Período: ${relatorio.periodo}\n` +
            `Data: ${relatorio.data}\n` +
            `Responsável: ${relatorio.responsavel}\n\n` +
            `${relatorio.descricao}`
        );
    }


    // ==========================================
    // BAIXAR RELATÓRIO
    // ==========================================

    function baixarRelatorio(id) {

        const relatorio = relatorios.find(
            item => item.id === id
        );

        if (!relatorio) return;


        const conteudo = [
            ["RELATÓRIO"],
            [],
            ["Nome", relatorio.nome],
            ["Tipo", relatorio.tipo],
            ["Descrição", relatorio.descricao],
            ["Período", relatorio.periodo],
            ["Data", relatorio.data],
            ["Responsável", relatorio.responsavel],
            ["Status", relatorio.status]
        ];


        const csv = conteudo
            .map(linha =>
                linha
                    .map(campo => `"${campo}"`)
                    .join(";")
            )
            .join("\n");


        const blob = new Blob(
            ["\ufeff" + csv],
            {
                type: "text/csv;charset=utf-8;"
            }
        );


        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;

        link.download =
            relatorio.nome
                .replace(/\s+/g, "_")
                .toLowerCase() + ".csv";

        link.click();

        URL.revokeObjectURL(url);


        mostrarMensagemRelatorio(
            "Relatório baixado com sucesso!"
        );
    }


    // ==========================================
    // GERAR NOVO RELATÓRIO
    // ==========================================

    function gerarRelatorio() {

        const tipo = prompt(
            "Digite o tipo do relatório:\n\n" +
            "Sistema\n" +
            "Usuários\n" +
            "Produção\n" +
            "Propriedades\n" +
            "Atividades"
        );

        if (!tipo) return;


        const nome = prompt(
            "Digite o nome do relatório:"
        );

        if (!nome) return;


        const novoRelatorio = {

            id: relatorios.length > 0
                ? Math.max(...relatorios.map(r => r.id)) + 1
                : 1,

            nome: nome,

            tipo: tipo,

            descricao:
                "Relatório gerado pelo administrador.",

            periodo: "Mensal",

            data:
                new Date().toLocaleDateString("pt-BR"),

            responsavel: "Administrador",

            status: "Disponível"
        };


        relatorios.push(novoRelatorio);


        salvarRelatorios();

        renderizarRelatorios();

        atualizarIndicadores();


        mostrarMensagemRelatorio(
            "Novo relatório gerado com sucesso!"
        );
    }


    // ==========================================
    // FILTRAR POR PERÍODO
    // ==========================================

    function filtrarPeriodoRelatorio(periodo) {

        const filtro =
            document.getElementById(
                "filtroPeriodoRelatorio"
            );

        if (filtro) {
            filtro.value = periodo;
        }

        renderizarRelatorios();
    }


    // ==========================================
    // LIMPAR FILTROS
    // ==========================================

    function limparFiltrosRelatorios() {

        const busca =
            document.getElementById(
                "buscarRelatorio"
            );

        const tipo =
            document.getElementById(
                "filtroTipoRelatorio"
            );

        const periodo =
            document.getElementById(
                "filtroPeriodoRelatorio"
            );


        if (busca) busca.value = "";

        if (tipo) tipo.value = "todos";

        if (periodo) periodo.value = "todos";


        renderizarRelatorios();
    }


    // ==========================================
    // INDICADORES DO DASHBOARD
    // ==========================================

    function atualizarIndicadores() {

        const total =
            document.getElementById("totalRelatorios");

        const disponiveis =
            document.getElementById("relatoriosDisponiveis");

        const mensais =
            document.getElementById("relatoriosMensais");

        const trimestrais =
            document.getElementById("relatoriosTrimestrais");


        if (total) {
            total.textContent =
                relatorios.length;
        }


        if (disponiveis) {
            disponiveis.textContent =
                relatorios.filter(
                    r => r.status === "Disponível"
                ).length;
        }


        if (mensais) {
            mensais.textContent =
                relatorios.filter(
                    r => r.periodo === "Mensal"
                ).length;
        }


        if (trimestrais) {
            trimestrais.textContent =
                relatorios.filter(
                    r => r.periodo === "Trimestral"
                ).length;
        }
    }


    // ==========================================
    // SALVAR NO LOCALSTORAGE
    // ==========================================

    function salvarRelatorios() {

        localStorage.setItem(
            "relatoriosADM",
            JSON.stringify(relatorios)
        );
    }


    // ==========================================
    // CARREGAR RELATÓRIOS SALVOS
    // ==========================================

    function carregarRelatorios() {

        const dadosSalvos =
            localStorage.getItem(
                "relatoriosADM"
            );

        if (dadosSalvos) {

            relatorios =
                JSON.parse(dadosSalvos);

            renderizarRelatorios();

            atualizarIndicadores();
        }
    }


    // ==========================================
    // MENSAGEM
    // ==========================================

    function mostrarMensagemRelatorio(mensagem) {

        const elemento =
            document.getElementById(
                "mensagemRelatorio"
            );

        if (!elemento) {
            console.log(mensagem);
            return;
        }


        elemento.textContent = mensagem;

        elemento.style.display = "block";


        setTimeout(() => {

            elemento.style.display = "none";

        }, 3000);
    }


    // ==========================================
    // ATUALIZAR MANUALMENTE
    // ==========================================

    function atualizarRelatorios() {

        renderizarRelatorios();

        atualizarIndicadores();

        mostrarMensagemRelatorio(
            "Relatórios atualizados!"
        );
    }


    // ==========================================
    // CARREGAR DADOS SALVOS AO ABRIR
    // ==========================================

    carregarRelatorios();
})();   // fim de adm.relatorios.js

/* ================= adm.usuarios.js ================= */
/* Administrador > Usuários: lista, cria, edita, ativa/desativa e exclui usuários direto no banco
   (Backend Node: /usuarios). Só o perfil Administrador tem acesso. */
(() => {
    const API = window.SAFRA_API_NODE || "http://localhost:3001";
    const POR_PAGINA = 8;
    const PERFIS = [
        { chave: "produtor", rotulo: "Produtor", cor: "verde" },
        { chave: "analista", rotulo: "Analista de Dados", cor: "roxo" },
        { chave: "administrador", rotulo: "Administrador", cor: "amarelo" },
        { chave: "exportador", rotulo: "Exportador", cor: "azul" }
    ];
    const STATUS = { ativo: "Ativo", pendente: "Pendente", inativo: "Inativo" };
    const SVG_LAPIS = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
    const SVG_MAIS = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M12 5.5v.01M12 12v.01M12 18.5v.01"/></svg>';

    let usuarios = [], pagina = 1, carregando = false, ultimaCarga = 0, temDataCadastro = false;

    const raiz = () => document.getElementById("adm.usuarios");
    const q = (sel) => { const r = raiz(); return r ? r.querySelector(sel) : null; };
    const token = () => sessionStorage.getItem("safra_token") || "";
    const meuId = () => { try { return (JSON.parse(sessionStorage.getItem("safra_usuario") || "null") || {}).id; } catch (e) { return null; } };
    const semAcento = (t) => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const infoPerfil = (chave) => PERFIS.find(p => p.chave === chave) || { chave, rotulo: chave || "—", cor: "verde" };

    function criar(tag, classe, texto) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    }

    /* ---------- estilos extras (janela, menu) ---------- */
    (function estilos() {
        const st = document.createElement("style");
        st.textContent =
            ".safra-modal select{display:block;width:100%;height:46px;margin-top:6px;padding:0 14px;border:1px solid #d7dcd5;border-radius:10px;background:#fff;color:#173f35;font:inherit;font-weight:400}" +
            ".safra-modal select:focus{outline:none;border-color:#2f8f5b;box-shadow:0 0 0 3px rgba(47,143,91,.18)}" +
            ".safra-modal select:disabled{background:#f1f3ef;color:#7a8a85}" +
            ".safra-modal .linha-dupla{display:grid;grid-template-columns:1fr 1fr;gap:12px}" +
            ".safra-modal .dica{display:block;margin-top:5px;color:#7a8a85;font-size:12px;font-weight:400}" +
            "@media(max-width:520px){.safra-modal .linha-dupla{grid-template-columns:1fr}}" +
            ".menu-opcoes-usuario{position:fixed;z-index:9998;min-width:200px;padding:6px;background:#fff;border:1px solid #e1e6df;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,.16)}" +
            ".menu-opcoes-usuario button{display:block;width:100%;padding:10px 12px;border:0;border-radius:8px;background:none;color:#173f35;font:inherit;font-size:14px;text-align:left;cursor:pointer}" +
            ".menu-opcoes-usuario button:hover:not(:disabled){background:#f1f6f2}" +
            ".menu-opcoes-usuario button.perigo{color:#c0392b}" +
            ".menu-opcoes-usuario button:disabled{color:#a3aeaa;cursor:not-allowed}";
        document.head.appendChild(st);
    })();

    /* ---------- aviso (toast) e janela ---------- */
    function avisar(texto, tipo = "sucesso") {
        let area = document.getElementById("safraAvisos");
        if (!area) {
            area = criar("div", "safra-avisos");
            area.id = "safraAvisos";
            area.setAttribute("aria-live", "polite");
            document.body.appendChild(area);
        }
        const aviso = criar("div", `safra-aviso ${tipo}`, texto);
        area.appendChild(aviso);
        setTimeout(() => { aviso.classList.add("saindo"); setTimeout(() => aviso.remove(), 300); }, 3500);
    }

    function abrirJanela({ titulo, texto, conteudo, confirmar = "Confirmar", perigo = false, aoConfirmar }) {
        const fundo = criar("div", "safra-modal-fundo");
        const caixa = criar("div", "safra-modal");
        const focoAnterior = document.activeElement;
        caixa.setAttribute("role", "dialog");
        caixa.setAttribute("aria-modal", "true");
        caixa.setAttribute("aria-label", titulo);
        caixa.appendChild(criar("h3", "", titulo));
        if (texto) caixa.appendChild(criar("p", "", texto));
        if (conteudo) caixa.appendChild(conteudo);
        const erro = criar("p", "safra-modal-erro");
        erro.setAttribute("role", "alert");
        caixa.appendChild(erro);
        const botoes = criar("div", "safra-modal-botoes");
        const cancelar = criar("button", "safra-btn", "Cancelar");
        const ok = criar("button", `safra-btn ${perigo ? "perigo" : "primario"}`, confirmar);
        cancelar.type = ok.type = "button";
        botoes.append(cancelar, ok);
        caixa.appendChild(botoes);
        fundo.appendChild(caixa);
        document.body.appendChild(fundo);

        function fechar() {
            document.removeEventListener("keydown", teclado);
            fundo.remove();
            if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
        }
        async function confirmarAcao() {
            erro.textContent = "";
            ok.disabled = cancelar.disabled = true;
            const original = ok.textContent;
            ok.textContent = "Aguarde...";
            try { await aoConfirmar(); fechar(); }
            catch (e) { erro.textContent = e.message; ok.disabled = cancelar.disabled = false; ok.textContent = original; }
        }
        function teclado(e) {
            if (e.key === "Escape") fechar();
            if (e.key === "Enter" && e.target.tagName === "INPUT") { e.preventDefault(); confirmarAcao(); }
        }
        cancelar.addEventListener("click", fechar);
        ok.addEventListener("click", confirmarAcao);
        fundo.addEventListener("mousedown", (e) => { if (e.target === fundo) fechar(); });
        document.addEventListener("keydown", teclado);
        (caixa.querySelector("input") || ok).focus();
    }

    /* ---------- comunicação com o servidor ---------- */
    async function api(metodo, caminho, corpo) {
        let resposta;
        try {
            resposta = await fetch(API + caminho, {
                method: metodo,
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token()}` },
                body: corpo !== undefined ? JSON.stringify(corpo) : undefined
            });
        } catch (e) {
            throw new Error("Não foi possível conectar ao servidor. Inicie o Backend (Node).");
        }
        let dados = {};
        try { dados = await resposta.json(); } catch (e) { /* sem JSON */ }
        if (resposta.status === 401) {
            avisar("Sua sessão expirou. Entre novamente.", "erro");
            setTimeout(() => window.location.replace("/Frontend/Login/login.html"), 1500);
            throw new Error("Sessão expirada.");
        }
        if (!resposta.ok || dados.sucesso === false) throw new Error(dados.erro || "Algo deu errado. Tente novamente.");
        return dados;
    }

    /* ---------- formatação ---------- */
    function iniciais(nome) {
        const p = String(nome || "").trim().split(/\s+/).filter(Boolean);
        if (!p.length) return "?";
        return (p.length === 1 ? p[0].slice(0, 2) : p[0][0] + p[p.length - 1][0]).toUpperCase();
    }

    function ultimoAcesso(iso) {
        if (!iso) return "Nunca acessou";
        const d = new Date(iso), hoje = new Date();
        const dois = (n) => String(n).padStart(2, "0");
        const hora = `${dois(d.getHours())}:${dois(d.getMinutes())}`;
        const dia = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()).getTime();
        const dif = Math.round((dia(hoje) - dia(d)) / 86400000);
        if (dif === 0) return `Hoje, ${hora}`;
        if (dif === 1) return `Ontem, ${hora}`;
        return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}, ${hora}`;
    }

    function mascaraTelefone(t) {
        const d = t.replace(/\D/g, "").slice(0, 11);
        if (!d) return "";
        if (d.length <= 2) return `(${d}`;
        if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
        if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }

    /* ---------- lista, filtros e paginação ---------- */
    function filtrados() {
        const texto = semAcento((q("#buscaUsuario") || {}).value);
        const perfil = (q("#filtroPerfil") || {}).value || "todos";
        const status = (q("#filtroStatus") || {}).value || "todos";
        return usuarios.filter(u =>
            (!texto || semAcento(u.nome).includes(texto) || semAcento(u.email).includes(texto)) &&
            (perfil === "todos" || u.perfil === perfil) &&
            (status === "todos" || u.status === status));
    }

    function criarLinha(u) {
        const tr = criar("tr");
        tr.dataset.id = u.id;
        const p = infoPerfil(u.perfil);

        const td1 = criar("td"), caixa = criar("div", "usuario-tabela"), info = criar("div");
        caixa.appendChild(criar("div", `avatar-tabela ${p.cor}`, iniciais(u.nome)));
        info.append(criar("strong", "", u.nome), criar("span", "", u.email));
        caixa.appendChild(info);
        td1.appendChild(caixa);

        const td2 = criar("td");
        td2.appendChild(criar("span", `perfil ${p.chave}`, p.rotulo));

        const td3 = criar("td"), st = criar("span", `status ${u.status}`);
        st.append(criar("i"), document.createTextNode(" " + (STATUS[u.status] || u.status)));
        td3.appendChild(st);

        const td4 = criar("td", "", ultimoAcesso(u.ultimo_acesso));

        const td5 = criar("td");
        const editar = criar("button", "btn-acao"), mais = criar("button", "btn-acao");
        editar.type = mais.type = "button";
        editar.title = "Editar"; editar.dataset.acao = "editar"; editar.innerHTML = SVG_LAPIS;
        mais.title = "Mais opções"; mais.dataset.acao = "opcoes"; mais.innerHTML = SVG_MAIS;
        td5.append(editar, mais);

        tr.append(td1, td2, td3, td4, td5);
        return tr;
    }

    function desenharIndicadores() {
        const t = (sel, v) => { const el = q(sel); if (el) el.textContent = v; };
        const total = usuarios.length;
        const ativos = usuarios.filter(u => u.status !== "inativo").length;
        const pendentes = usuarios.filter(u => u.status === "pendente").length;
        t("#totalUsuarios", total);
        t("#usuariosAtivos", ativos);
        t("#porcentagemAtivos", total ? `${((ativos / total) * 100).toFixed(1).replace(".", ",")}% do total` : "—");
        t("#aguardandoAcesso", pendentes);
        if (temDataCadastro) {
            const hoje = new Date();
            const novos = usuarios.filter(u => { const d = u.criado_em && new Date(u.criado_em); return d && d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear(); }).length;
            t("#novosUsuarios", novos);
            t("#novosUsuariosSub", "Neste mês");
        } else {
            t("#novosUsuarios", "—");
            t("#novosUsuariosSub", "Sem data de cadastro no banco");
        }
        t("#contadorUsuarios", `${total} ${total === 1 ? "usuário" : "usuários"}`);
    }

    function desenharTabela() {
        const corpo = q("#listaUsuarios");
        if (!corpo) return;
        const lista = filtrados();
        const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
        if (pagina > paginas) pagina = paginas;
        const ini = (pagina - 1) * POR_PAGINA, fatia = lista.slice(ini, ini + POR_PAGINA);

        corpo.replaceChildren();
        if (!fatia.length) {
            const tr = criar("tr"), td = criar("td", "", usuarios.length ? "Nenhum usuário encontrado." : "Nenhum usuário cadastrado.");
            td.colSpan = 5;
            td.style.cssText = "padding:28px;text-align:center;color:#5f6d68";
            tr.appendChild(td);
            corpo.appendChild(tr);
        } else {
            fatia.forEach(u => corpo.appendChild(criarLinha(u)));
        }

        const pg = q("#paginacaoUsuarios");
        if (pg) {
            pg.querySelector("span").textContent = lista.length
                ? `Mostrando ${ini + 1}–${ini + fatia.length} de ${lista.length} usuários` : "Nenhum usuário para mostrar";
            const caixa = pg.querySelector(".paginas");
            caixa.replaceChildren();
            const de = Math.max(1, Math.min(pagina - 3, paginas - 6)), ate = Math.min(paginas, de + 6);
            for (let i = de; i <= ate; i++) {
                const b = criar("button", `pagina${i === pagina ? " ativa" : ""}`, String(i));
                b.type = "button";
                b.addEventListener("click", () => { pagina = i; desenharTabela(); });
                caixa.appendChild(b);
            }
            if (pagina < paginas) {
                const prox = criar("button", "pagina", "→");
                prox.type = "button";
                prox.addEventListener("click", () => { pagina += 1; desenharTabela(); });
                caixa.appendChild(prox);
            }
        }
    }

    async function carregar(forcar) {
        if (carregando || !raiz()) return;
        if (!forcar && Date.now() - ultimaCarga < 3000) return;
        carregando = true;
        try {
            const d = await api("GET", "/usuarios");
            usuarios = d.usuarios;
            temDataCadastro = !!d.tem_data_cadastro;
            ultimaCarga = Date.now();
            desenharIndicadores();
            desenharTabela();
        } catch (e) {
            const corpo = q("#listaUsuarios");
            if (corpo && !usuarios.length) {
                corpo.replaceChildren();
                const tr = criar("tr"), td = criar("td", "", e.message);
                td.colSpan = 5;
                td.style.cssText = "padding:28px;text-align:center;color:#c0392b";
                tr.appendChild(td);
                corpo.appendChild(tr);
            } else avisar(e.message, "erro");
        } finally { carregando = false; }
    }

    /* ---------- formulário (novo / editar) ---------- */
    function abrirFormulario(u) {
        const editando = !!u, ehEu = editando && u.id === meuId();
        const conteudo = criar("div");

        function campo(rotulo, nome, tipo, valor, extra) {
            const label = criar("label", "", rotulo);
            const input = criar("input");
            input.type = tipo; input.name = nome; input.value = valor || "";
            if (extra && extra.auto) input.autocomplete = extra.auto;
            label.appendChild(input);
            if (extra && extra.dica) label.appendChild(criar("small", "dica", extra.dica));
            return { label, input };
        }

        const nome = campo("Nome completo", "nome", "text", u && u.nome, { auto: "off" });
        const email = campo("E-mail", "email", "email", u && u.email, { auto: "off" });
        const tel = campo("Telefone (opcional)", "telefone", "tel", u && u.telefone, { auto: "off" });
        tel.input.addEventListener("input", () => { tel.input.value = mascaraTelefone(tel.input.value); });

        const lp = criar("label", "", "Perfil de acesso");
        const sel = criar("select");
        PERFIS.forEach(p => { const o = criar("option", "", p.rotulo); o.value = p.chave; sel.appendChild(o); });
        sel.value = (u && u.perfil) || "produtor";
        if (ehEu) { sel.disabled = true; lp.appendChild(sel); lp.appendChild(criar("small", "dica", "Você não pode alterar o seu próprio perfil.")); }
        else lp.appendChild(sel);

        const senha = campo(editando ? "Nova senha (opcional)" : "Senha inicial (mínimo 6 caracteres)", "senha", "password", "",
            { auto: "new-password", dica: editando ? "Deixe em branco para manter a senha atual." : "O usuário poderá alterá-la depois em Configurações." });

        conteudo.append(nome.label, email.label, tel.label, lp, senha.label);

        abrirJanela({
            titulo: editando ? "Editar usuário" : "Novo usuário",
            texto: editando ? "Altere os dados de acesso deste usuário." : "Cadastre alguém para acessar o sistema Safra.",
            conteudo,
            confirmar: editando ? "Salvar" : "Cadastrar",
            aoConfirmar: async () => {
                const corpo = { nome: nome.input.value.trim(), email: email.input.value.trim(),
                                telefone: tel.input.value.trim(), perfil: sel.value, senha: senha.input.value };
                if (corpo.nome.length < 3) throw new Error("Digite o nome completo (mínimo 3 letras).");
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(corpo.email)) throw new Error("Digite um e-mail válido.");
                if (corpo.telefone) { const dg = corpo.telefone.replace(/\D/g, ""); if (dg.length < 10 || dg.length > 11) throw new Error("Digite um telefone válido com DDD."); }
                if (!editando && corpo.senha.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
                if (editando && corpo.senha && corpo.senha.length < 6) throw new Error("A nova senha precisa ter pelo menos 6 caracteres.");
                if (editando) await api("PUT", `/usuarios/${u.id}`, corpo);
                else await api("POST", "/usuarios", corpo);
                avisar(editando ? "Usuário atualizado!" : "Usuário cadastrado com sucesso!");
                await carregar(true);
            }
        });
    }

    /* ---------- menu ⋮ (ativar/desativar, excluir) ---------- */
    function fecharMenu() { document.querySelectorAll(".menu-opcoes-usuario").forEach(m => m.remove()); }

    function abrirMenu(botao, u) {
        fecharMenu();
        const menu = criar("div", "menu-opcoes-usuario");
        const euMesmo = u.id === meuId();
        const alternar = criar("button", "", u.status === "inativo" ? "Ativar usuário" : "Desativar usuário");
        const excluir = criar("button", "perigo", "Excluir usuário");
        alternar.type = excluir.type = "button";
        if (euMesmo) { alternar.disabled = excluir.disabled = true; alternar.title = excluir.title = "Você não pode alterar a sua própria conta."; }

        alternar.addEventListener("click", async () => {
            fecharMenu();
            const ativar = u.status === "inativo";
            try {
                await api("PUT", `/usuarios/${u.id}/status`, { ativo: ativar });
                avisar(ativar ? "Usuário ativado." : "Usuário desativado. As sessões dele foram encerradas.");
                await carregar(true);
            } catch (e) { avisar(e.message, "erro"); }
        });
        excluir.addEventListener("click", () => {
            fecharMenu();
            abrirJanela({
                titulo: "Excluir usuário",
                texto: `Deseja realmente excluir ${u.nome}? Esta ação não pode ser desfeita.`,
                confirmar: "Excluir", perigo: true,
                aoConfirmar: async () => { await api("DELETE", `/usuarios/${u.id}`); avisar("Usuário excluído."); await carregar(true); }
            });
        });
        menu.append(alternar, excluir);
        document.body.appendChild(menu);
        const r = botao.getBoundingClientRect();
        menu.style.top = `${Math.min(r.bottom + 4, window.innerHeight - menu.offsetHeight - 8)}px`;
        menu.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
    }

    /* ---------- eventos ---------- */
    document.addEventListener("DOMContentLoaded", () => {
        const r = raiz();
        if (!r) return;
        const busca = q("#buscaUsuario");
        if (busca) busca.addEventListener("input", () => { pagina = 1; desenharTabela(); });
        ["#filtroPerfil", "#filtroStatus"].forEach(sel => { const el = q(sel); if (el) el.addEventListener("change", () => { pagina = 1; desenharTabela(); }); });
        const novo = q("#btnNovoUsuario");
        if (novo) novo.addEventListener("click", () => abrirFormulario(null));

        r.addEventListener("click", (e) => {
            const btn = e.target.closest("button[data-acao]");
            if (!btn) return;
            const tr = btn.closest("tr");
            const u = usuarios.find(x => String(x.id) === (tr && tr.dataset.id));
            if (!u) return;
            e.stopPropagation();
            if (btn.dataset.acao === "editar") { fecharMenu(); abrirFormulario(u); }
            else abrirMenu(btn, u);
        });
        document.addEventListener("click", (e) => { if (!e.target.closest(".menu-opcoes-usuario") && !e.target.closest('[data-acao="opcoes"]')) fecharMenu(); });
        window.addEventListener("scroll", fecharMenu, true);

        // recarrega sempre que a aba Usuários é aberta
        new MutationObserver(() => { if (r.classList.contains("pagina-ativa")) carregar(false); })
            .observe(r, { attributes: true, attributeFilter: ["class"] });
        carregar(true);
    });
})();   // fim de adm.usuarios.js