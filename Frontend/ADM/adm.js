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
    const CHAVE_DISPENSADOS = "safra_adm_alertas_dispensados";
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
    let alertas = [], carregando = false, ultimaCarga = 0, erroCarga = null, ultimoD = null;

    /* ---------- lido / não lido (neste navegador) ---------- */
    function lerLidos() {
        try { return new Set(JSON.parse(localStorage.getItem(CHAVE_LIDOS) || "[]")); } catch (e) { return new Set(); }
    }
    function salvarLidos(conjunto) {
        // guarda só os que ainda existem, para a lista não crescer para sempre
        const ativos = new Set(alertas.map(a => a.id));
        try { localStorage.setItem(CHAVE_LIDOS, JSON.stringify([...conjunto].filter(id => ativos.has(id)))); } catch (e) { /* sem armazenamento */ }
    }

    /* ---------- dispensados (botão ×, neste navegador) ---------- */
    function lerDispensados() {
        try { return new Set(JSON.parse(localStorage.getItem(CHAVE_DISPENSADOS) || "[]")); } catch (e) { return new Set(); }
    }
    function salvarDispensados(conjunto) {
        const ativos = new Set(alertas.map(a => a.id));
        try { localStorage.setItem(CHAVE_DISPENSADOS, JSON.stringify([...conjunto].filter(id => ativos.has(id)))); } catch (e) { /* sem armazenamento */ }
    }
    // alertas que o administrador ainda não dispensou
    // (e que o tipo de aviso esteja ligado em Configurações > Notificações)
    const PREF_CATEGORIA = { "Segurança": "notif_producao", "Clima": "notif_clima", "Dados": "notif_exportacao", "Usuários": "notif_relatorios" };
    function visiveis() {
        const ds = lerDispensados();
        return alertas.filter(a => !ds.has(a.id) && (!window.Safra || !Safra.sino || Safra.sino.ligada(PREF_CATEGORIA[a.categoria])));
    }
    function redesenhar() {
        if (ultimoD) desenharResumo(ultimoD);
        desenharLista();
        atualizarSelo();
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
        if (dif === 0) return `Hoje às ${hora}`;
        if (dif === 1) return `Ontem às ${hora}`;
        return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} às ${hora}`;
    }

    /* ---------- selo do menu lateral (todas as abas do ADM) ---------- */
    function atualizarSelo() {
        const lidos = lerLidos();
        const naoLidos = visiveis().filter(a => !lidos.has(a.id)).length;
        document.querySelectorAll(".alerta-menu .badge").forEach(b => {
            b.textContent = naoLidos > 99 ? "99+" : String(naoLidos);
            b.style.display = naoLidos ? "" : "none";
        });
        atualizarSino(naoLidos);
    }

    /* ---------- sino da barra do topo (sino.js) ---------- */
    function atualizarSino(naoLidos) {
        if (!window.Safra || !Safra.sino) return;
        const lidos = lerLidos();
        Safra.sino.atualizar({
            itens: visiveis().map(a => ({ id: a.id, titulo: a.titulo, mensagem: a.mensagem, prioridade: a.prioridade, categoria: a.categoria, quando: a.quando, lido: lidos.has(a.id) })),
            naoLidos, destino: "#adm.alertas", erro: erroCarga,
            aoLer: (id) => { const l = lerLidos(); l.add(id); salvarLidos(l); redesenhar(); },
            aoLerTodos: () => { const l = lerLidos(); visiveis().forEach(a => l.add(a.id)); salvarLidos(l); redesenhar(); }
        });
    }

    /* ---------- janela de detalhes ---------- */
    function abrirDetalhes(a) {
        const lidos = lerLidos();
        lidos.add(a.id);
        salvarLidos(lidos);
        redesenhar();

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
            redesenhar(); sair();
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
        return visiveis().filter(a =>
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
            const vazio = criar("p", "alerta-vazio", erroCarga || (visiveis().length ? "Nenhum alerta encontrado com esses filtros." : "Nenhum alerta ativo. Tudo certo por aqui!"));
            if (erroCarga) vazio.style.color = "#c0392b";
            caixa.appendChild(vazio);
            return;
        }
        lista.forEach(a => {
            const lido = lidos.has(a.id);
            const item = criar("div", `alerta-item ${a.prioridade}${lido ? " lido" : ""}`);
            const ic = criar("div", `alerta-icon ${COR[a.prioridade]}`);
            ic.innerHTML = `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG[a.prioridade]}</svg>`;
            // textContent: o conteúdo vem de fontes externas e nunca deve virar HTML
            const texto = criar("div", "alerta-texto");
            texto.append(criar("strong", "", a.titulo), criar("span", "", a.mensagem), criar("small", "", `${quando(a.quando)} • ${a.categoria}`));
            const status = criar("span", `status-alerta ${a.prioridade}`, ROTULO[a.prioridade]);
            const acoes = criar("span", "alerta-acoes");
            const bDet = criar("button", "alerta-mini", "Ver detalhes");
            bDet.type = "button"; bDet.title = "Ver detalhes";
            bDet.addEventListener("click", () => abrirDetalhes(a));
            const bLido = criar("button", "alerta-mini", lido ? "Não lido" : "Lido");
            bLido.type = "button"; bLido.title = lido ? "Marcar como não lido" : "Marcar como lido";
            bLido.addEventListener("click", () => {
                const l = lerLidos();
                if (lido) l.delete(a.id); else l.add(a.id);
                salvarLidos(l);
                redesenhar();
            });
            const bX = criar("button", "alerta-mini perigo", "×");
            bX.type = "button"; bX.title = "Dispensar alerta"; bX.setAttribute("aria-label", "Dispensar alerta");
            bX.addEventListener("click", () => {
                item.classList.add("saindo");
                setTimeout(() => { const ds = lerDispensados(); ds.add(a.id); salvarDispensados(ds); redesenhar(); }, 260);
            });
            acoes.append(bDet, bLido, bX);
            item.append(ic, texto, status, acoes);
            caixa.appendChild(item);
        });
    }

    function desenharResumo(d) {
        const vis = visiveis(), lidos = lerLidos();
        const tot = (p) => vis.filter(a => a.prioridade === p).length;
        const naoLidos = (p) => vis.filter(a => a.prioridade === p && !lidos.has(a.id)).length;
        const urgentes = tot("urgente"), atencao = tot("atencao"), informativos = tot("informativo"), total = vis.length;
        txt("urgentes", urgentes);
        txt("atencao", atencao);
        txt("informativos", informativos);
        txt("total-card", total);
        txt("urgentes-sub", urgentes ? `${naoLidos("urgente")} não lido(s) · atenção imediata` : "Nenhum urgente");
        txt("atencao-sub", atencao ? `${naoLidos("atencao")} não lido(s) · precisam de análise` : "Nada a analisar");
        txt("informativos-sub", informativos ? `${naoLidos("informativo")} não lido(s)` : "Sem novidades");
        txt("total-sub", `${vis.filter(a => !lidos.has(a.id)).length} não lido(s)`);
        const grave = urgentes + atencao;
        txt("status-titulo", urgentes ? "Existem alertas urgentes" : grave ? "Existem alertas que requerem atenção" : "Nenhum alerta que exija atenção");
        txt("status-texto", total ? `${total} alerta(s) ativo(s) neste momento.` : "O sistema está funcionando normalmente.");
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
            ultimoD = d;
            erroCarga = null;
            ultimaCarga = Date.now();
            const lidos = lerLidos();
            salvarLidos(lidos);
            salvarDispensados(lerDispensados());
            redesenhar();
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
        window.addEventListener("safra:preferencias", () => redesenhar());
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
            visiveis().forEach(a => l.add(a.id));
            salvarLidos(l);
            redesenhar();
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
/* Administrador > Logs do sistema com dados reais (Node: GET /logs, lê a tabela log_sistema).
   Para trocar o endereço do Node: window.SAFRA_API_NODE = "https://..." antes do adm.js */
(() => {
    const NODE = (window.SAFRA_API_NODE || "http://localhost:3001").replace(/\/$/, "");
    const raiz = () => document.getElementById("adm.logs");
    const q = (sel) => { const r = raiz(); return r ? r.querySelector(sel) : null; };
    const txt = (chave, v) => { const el = q(`[data-log="${chave}"]`); if (el) el.textContent = v; };
    const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
    const ICO = {
        ok: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>',
        aviso: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
        erro: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.5v.01"/></svg>'
    };
    const POR_PAGINA = 10;
    let pagina = 1, total = 0, ultimos = [], carregando = false, timer = null;

    function criar(tag, classe, texto) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    }

    function filtros() {
        const v = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
        return { q: v("filtroBusca").trim(), tipo: v("filtroTipo"), periodo: v("filtroPeriodo") || "30" };
    }

    async function api(params) {
        const token = sessionStorage.getItem("safra_token") || "";
        const qs = new URLSearchParams(params).toString();
        let resp;
        try { resp = await fetch(`${NODE}/logs?${qs}`, { headers: { Authorization: `Bearer ${token}` } }); }
        catch (e) { throw new Error(`Servidor fora do ar. Inicie o Node (${NODE}) e recarregue a página.`); }
        const corpo = await resp.json().catch(() => null);
        if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
        if (!resp.ok) throw new Error((corpo && corpo.erro) || `O servidor respondeu ${resp.status}.`);
        return corpo;
    }

    function haQuanto(seg) {
        if (seg === null || seg === undefined) return "Sem atividade registrada";
        if (seg < 60) return "Última atividade agora há pouco";
        if (seg < 3600) return `Última atividade há ${Math.floor(seg / 60)} min`;
        if (seg < 86400) return `Última atividade há ${Math.floor(seg / 3600)} h`;
        return `Última atividade há ${Math.floor(seg / 86400)} dia(s)`;
    }

    function classe(e) { return e.status === "Falha" ? (e.tipo === "Login" ? "aviso" : "erro") : "sucesso"; }

    function linha(e) {
        const c = classe(e);
        const item = criar("div", "log-item");
        const ev = criar("div", "evento");
        const ic = criar("div", "evento-icone " + (c === "sucesso" ? "verde" : c === "aviso" ? "amarelo" : "roxo"));
        ic.innerHTML = c === "sucesso" ? ICO.ok : c === "aviso" ? ICO.aviso : ICO.erro;
        const info = criar("div");
        info.append(criar("strong", "", e.acao), criar("span", "", e.descricao || e.tipo));
        ev.append(ic, info);
        const user = criar("div", "usuario-log", e.usuario);
        const dt = criar("div", "data-log", `${e.hoje ? "Hoje" : e.data}, ${e.hora.slice(0, 5)}`);
        const st = criar("div");
        st.append(criar("span", "status-log " + c, e.status));
        const btn = criar("button", "btn-detalhes", "Ver");
        btn.type = "button";
        btn.addEventListener("click", () => detalhes(e));
        item.append(ev, user, dt, st, btn);
        return item;
    }

    function detalhes(e) {
        Safra.avisar(`${e.acao} — ${e.usuario} • ${e.data} ${e.hora} • ${e.status}${e.descricao ? " • " + e.descricao : ""}`);
    }

    function desenharPaginas() {
        const box = q('[data-log="paginas"]'); if (!box) return;
        const ultima = Math.max(1, Math.ceil(total / POR_PAGINA));
        box.innerHTML = "";
        const add = (rotulo, alvo, ativo) => {
            const b = criar("button", "pagina-btn" + (ativo ? " ativo" : ""), rotulo);
            b.type = "button";
            b.addEventListener("click", () => { pagina = alvo; carregar(); });
            box.append(b);
        };
        if (pagina > 1) add("‹", pagina - 1);
        const ini = Math.max(1, Math.min(pagina - 2, ultima - 4)), fim = Math.min(ultima, ini + 4);
        for (let p = ini; p <= fim; p++) add(String(p), p, p === pagina);
        if (pagina < ultima) add("›", pagina + 1);
        const ini1 = total ? (pagina - 1) * POR_PAGINA + 1 : 0, fim1 = Math.min(total, pagina * POR_PAGINA);
        txt("paginacao-texto", `Mostrando ${fmt(ini1)}–${fmt(fim1)} de ${fmt(total)} eventos`);
    }

    async function carregar() {
        if (carregando || !raiz()) return;
        carregando = true;
        const lista = document.getElementById("listaLogs");
        try {
            const d = await api(Object.assign(filtros(), { pagina, por_pagina: POR_PAGINA }));
            total = d.total; ultimos = d.eventos;
            lista.innerHTML = "";
            if (!d.eventos.length) {
                const vazio = criar("div", "log-item");
                const ev = criar("div", "evento"); const i = criar("div");
                i.append(criar("strong", "", "Nenhum evento encontrado"), criar("span", "", "Ajuste os filtros para ver outros registros."));
                ev.append(i); vazio.append(ev); lista.append(vazio);
            } else d.eventos.forEach(e => lista.append(linha(e)));
            txt("total", `${fmt(total)} evento${total === 1 ? "" : "s"}`);
            const r = d.resumo;
            txt("hoje", fmt(r.hoje)); txt("acessos", fmt(r.acessos24h));
            txt("avisos", fmt(r.avisos24h)); txt("erros", fmt(r.erros24h));
            txt("ultima", haQuanto(r.segundos_ultimo));
            const falhas = r.avisos24h + r.erros24h;
            txt("status-titulo", falhas ? "Atenção: há falhas registradas" : "Sistema operando normalmente");
            txt("status-texto", falhas ? `${fmt(falhas)} falha(s) nas últimas 24 h.` : "Nenhuma falha nas últimas 24 h.");
            desenharPaginas();
        } catch (erro) {
            lista.innerHTML = "";
            const item = criar("div", "log-item"); const ev = criar("div", "evento"); const i = criar("div");
            i.append(criar("strong", "", "Não foi possível carregar os logs"), criar("span", "", erro.message));
            ev.append(i); item.append(ev); lista.append(item);
            txt("status-titulo", "Não foi possível atualizar"); txt("status-texto", erro.message);
        } finally { carregando = false; }
    }

    function celula(v) { return `"${String(v ?? "").replace(/"/g, '""')}"`; }

    async function exportar() {
        try {
            const d = await api(Object.assign(filtros(), { todos: 1, pagina: 1 }));
            if (!d.eventos.length) { Safra.avisar("Não existem logs para exportar."); return; }
            let csv = "Usuário;Ação;Tipo;Descrição;Data;Hora;Status\n";
            d.eventos.forEach(e => { csv += [e.usuario, e.acao, e.tipo, e.descricao, e.data, e.hora, e.status].map(celula).join(";") + "\n"; });
            const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
            const a = document.createElement("a");
            a.href = url; a.download = "safra-logs.csv";
            document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
            Safra.avisar("Logs exportados com sucesso!");
        } catch (erro) { Safra.avisar(erro.message); }
    }

    function filtrar() { pagina = 1; carregar(); }

    function iniciar() {
        const r = raiz(); if (!r) return;
        const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
        on("btnFiltrarLogs", "click", filtrar);
        on("btnExportar", "click", exportar);
        on("filtroTipo", "change", filtrar);
        on("filtroPeriodo", "change", filtrar);
        on("filtroBusca", "keydown", (e) => { if (e.key === "Enter") filtrar(); });
        // recarrega quando a página de logs é aberta e a cada 30 s enquanto ela estiver visível
        const ver = () => { if (location.hash === "#adm.logs") { carregar(); if (!timer) timer = setInterval(carregar, 30000); } else if (timer) { clearInterval(timer); timer = null; } };
        window.addEventListener("hashchange", ver);
        ver();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
})();   // fim de adm.logs.js

/* ================= adm.permissoes.js ================= */
/* Administrador > Permissões com dados reais (Node: GET /permissoes e PUT /permissoes/:perfil).
   A matriz fica na tabela perfil_permissao do MySQL; os menus e as telas de cada perfil são
   bloqueados pelo comum.js (GET /permissoes/minhas). Para trocar o endereço do Node:
   window.SAFRA_API_NODE = "https://..." antes do adm.js */
(() => {
    const NODE = (window.SAFRA_API_NODE || "http://localhost:3001").replace(/\/$/, "");
    const raiz = () => document.getElementById("adm.permissoes");
    const q = (sel) => { const r = raiz(); return r ? r.querySelector(sel) : null; };
    const txt = (chave, v) => { const el = q(`[data-perm="${chave}"]`); if (el) el.textContent = v; };
    const ICONES = {
        produtor: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></svg>`,
        analista: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5v3.5M15 2.5v3.5M9 18v3.5M15 18v3.5M2.5 9H6M2.5 15H6M18 9h3.5M18 15h3.5"/></svg>`,
        administrador: `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/></svg>`
    };
    const CHECK = '<svg class="ico ico-inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
    let dados = null, carregando = false, ultimaCarga = 0;

    function criar(tag, classe, texto) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    }

    async function api(caminho, opcoes) {
        const token = sessionStorage.getItem("safra_token") || "";
        const o = opcoes || {};
        let resp;
        try {
            resp = await fetch(NODE + caminho, Object.assign({}, o, {
                headers: Object.assign({ "Content-Type": "application/json", Authorization: `Bearer ${token}` }, o.headers || {})
            }));
        } catch (e) { throw new Error(`Servidor fora do ar. Inicie o Node (${NODE}) e recarregue a página.`); }
        const corpo = await resp.json().catch(() => null);
        if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
        if (!resp.ok) throw new Error((corpo && corpo.erro) || `O servidor respondeu ${resp.status}.`);
        return corpo;
    }

    function aviso(msg) {
        const el = q('[data-perm="aviso"]');
        if (!el) return;
        el.textContent = msg || "";
        el.style.display = msg ? "" : "none";
    }

    /* ---------- tela ---------- */
    function desenhar() {
        if (!dados) return;
        const c = dados.cards, perfis = dados.perfis;
        txt("c1", c.perfis); txt("c1-sub", "Perfis de acesso");
        txt("c2", c.usuarios_ativos); txt("c2-sub", `${c.usuarios_total} usuários cadastrados`);
        txt("c3", c.permissoes_ativas); txt("c3-sub", `de ${c.permissoes_total} possíveis`);
        txt("c4", c.alteracoes_7d); txt("c4-sub", "Últimos 7 dias");
        txt("contador", `${perfis.length} ${perfis.length === 1 ? "perfil" : "perfis"}`);

        const lista = q('[data-perm="perfis"]');
        lista.replaceChildren();
        perfis.forEach(p => {
            const card = criar("div", "perfil-card");
            const ic = criar("div", `perfil-icone ${p.chave}`);
            ic.innerHTML = ICONES[p.chave] || "";
            const info = criar("div", "perfil-info");
            info.append(criar("strong", "", p.nome), criar("span", "", p.descricao));
            const ac = criar("div", "perfil-acesso");
            ac.append(criar("b", "", String(p.usuarios)), criar("span", "", p.usuarios === 1 ? "usuário" : "usuários"));
            const bt = criar("button", "btn-gerenciar", "Gerenciar");
            bt.type = "button";
            bt.addEventListener("click", () => abrirGerenciar(p.chave));
            card.append(ic, info, ac, bt);
            lista.appendChild(card);
        });

        const cab = q('[data-perm="matriz-cab"]');
        cab.replaceChildren(criar("th", "", "Recurso"));
        perfis.forEach(p => cab.appendChild(criar("th", "", p.curto)));
        const corpo = q('[data-perm="matriz-corpo"]');
        corpo.replaceChildren();
        dados.recursos.forEach(r => {
            const tr = criar("tr");
            tr.appendChild(criar("td", "", r.rotulo));
            perfis.forEach(p => {
                const td = criar("td");
                if (!p.aplica.includes(r.chave)) {
                    const s = criar("span", "bloqueado", "—");
                    s.title = "Este perfil não tem essa tela";
                    td.appendChild(s);
                } else if (dados.matriz[p.chave][r.chave]) {
                    const s = criar("span", "permitido");
                    s.innerHTML = CHECK;
                    td.appendChild(s);
                } else {
                    td.appendChild(criar("span", "perm-bloq", "Bloqueado"));
                }
                tr.appendChild(td);
            });
            corpo.appendChild(tr);
        });
    }

    /* ---------- janelas ---------- */
    function abrirJanela(titulo, descricao) {
        const fundo = criar("div", "safra-modal-fundo"), caixa = criar("div", "safra-modal perm-modal");
        const focoAnterior = document.activeElement;
        caixa.setAttribute("role", "dialog");
        caixa.setAttribute("aria-modal", "true");
        caixa.setAttribute("aria-label", titulo);
        caixa.appendChild(criar("h3", "", titulo));
        caixa.appendChild(criar("p", "", descricao));
        fundo.appendChild(caixa);
        document.body.appendChild(fundo);
        function sair() {
            document.removeEventListener("keydown", teclado);
            fundo.remove();
            if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
        }
        function teclado(e) { if (e.key === "Escape") sair(); }
        fundo.addEventListener("mousedown", (e) => { if (e.target === fundo) sair(); });
        document.addEventListener("keydown", teclado);
        return { caixa, sair };
    }

    function abrirEscolha() {
        const { caixa, sair } = abrirJanela("Editar permissões", "Escolha o perfil que você quer ajustar.");
        const lista = criar("div", "perm-lista");
        dados.perfis.forEach(p => {
            const bt = criar("button", "safra-btn perm-escolha", p.nome);
            bt.type = "button";
            bt.addEventListener("click", () => { sair(); abrirGerenciar(p.chave); });
            lista.appendChild(bt);
        });
        caixa.appendChild(lista);
        const botoes = criar("div", "safra-modal-botoes");
        const fechar = criar("button", "safra-btn", "Fechar");
        fechar.type = "button";
        fechar.addEventListener("click", sair);
        botoes.appendChild(fechar);
        caixa.appendChild(botoes);
    }

    function abrirGerenciar(chave) {
        const p = dados && dados.perfis.find(x => x.chave === chave);
        if (!p) return;
        const { caixa, sair } = abrirJanela(`Permissões: ${p.nome}`,
            "Marque o que este perfil pode acessar. A mudança vale na próxima vez que a pessoa abrir ou recarregar o sistema.");
        const lista = criar("div", "perm-lista"), caixas = {};
        dados.recursos.filter(r => p.aplica.includes(r.chave)).forEach(r => {
            const linha = criar("label", "perm-linha");
            const cb = criar("input");
            cb.type = "checkbox";
            cb.checked = !!dados.matriz[p.chave][r.chave];
            const travada = p.travadas.includes(r.chave);
            if (travada) { cb.checked = true; cb.disabled = true; }
            caixas[r.chave] = cb;
            linha.append(cb, criar("span", "", r.rotulo));
            if (travada) linha.appendChild(criar("small", "", "obrigatória para o administrador"));
            lista.appendChild(linha);
        });
        caixa.appendChild(lista);
        const erro = criar("p", "safra-modal-erro");
        caixa.appendChild(erro);
        const botoes = criar("div", "safra-modal-botoes");
        const cancelar = criar("button", "safra-btn", "Cancelar");
        const salvar = criar("button", "safra-btn primario", "Salvar");
        cancelar.type = salvar.type = "button";
        botoes.append(cancelar, salvar);
        caixa.appendChild(botoes);
        cancelar.addEventListener("click", sair);
        salvar.addEventListener("click", async () => {
            const recursos = {};
            Object.keys(caixas).forEach(k => { recursos[k] = caixas[k].checked; });
            salvar.disabled = true;
            salvar.textContent = "Salvando…";
            try {
                await api(`/permissoes/${p.chave}`, { method: "PUT", body: JSON.stringify({ recursos }) });
                sair();
                if (window.Safra && Safra.avisar) Safra.avisar(`Permissões de ${p.nome} atualizadas.`);
                if (window.Safra && Safra.recarregarPermissoes) Safra.recarregarPermissoes();
                await carregar(false);
            } catch (e) {
                erro.textContent = e.message;
                salvar.disabled = false;
                salvar.textContent = "Salvar";
            }
        });
        const primeira = lista.querySelector("input:not(:disabled)");
        if (primeira) primeira.focus();
    }

    /* ---------- carga ---------- */
    async function carregar() {
        if (carregando) return;
        carregando = true;
        try {
            dados = await api("/permissoes");
            ultimaCarga = Date.now();
            aviso("");
            desenhar();
        } catch (e) {
            aviso(`Permissões indisponíveis: ${e.message}`);
        } finally { carregando = false; }
    }

    document.addEventListener("DOMContentLoaded", () => {
        const r = raiz();
        if (!r) return;
        const nova = q("#btnNovaPermissao");
        if (nova) nova.addEventListener("click", () => { if (dados) abrirEscolha(); else carregar(); });
        // recarrega sempre que a aba Permissões é aberta
        new MutationObserver(() => { if (r.classList.contains("pagina-ativa") && Date.now() - ultimaCarga > 3000) carregar(); })
            .observe(r, { attributes: true, attributeFilter: ["class"] });
        if (r.classList.contains("pagina-ativa")) carregar();
    });
})();   // fim de adm.permissoes.js

/* ================= adm.relatorios.js ================= */
/* Administrador > Relatórios com dados reais (Node: GET /relatorios/resumo e GET /relatorios/:tipo).
   Ver relatório abre a tabela na tela; baixar gera PDF (impressão), Excel ou CSV.
   Para trocar o endereço do Node: window.SAFRA_API_NODE = "https://..." antes do adm.js */
(() => {
    const NODE = (window.SAFRA_API_NODE || "http://localhost:3001").replace(/\/$/, "");
    const raiz = () => document.getElementById("adm.relatorios");
    const q = (sel) => { const r = raiz(); return r ? r.querySelector(sel) : null; };
    const txt = (chave, v) => { const el = q(`[data-rel="${chave}"]`); if (el) el.textContent = v; };
    const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
    const val = (id) => { const el = document.getElementById(id); return el ? el.value : ""; };
    const NOMES = { usuarios: "Relatório de usuários", dados: "Relatório de dados", atividades: "Relatório de atividades",
        sistema: "Relatório do sistema", alertas: "Relatório de alertas", geral: "Relatório geral" };
    const CORES = { usuarios: "verde", dados: "azul", atividades: "amarelo", sistema: "roxo", alertas: "amarelo", geral: "verde" };
    let carregando = false, ultimoResumo = null;

    function criar(tag, classe, texto) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    }

    async function api(caminho) {
        const token = sessionStorage.getItem("safra_token") || "";
        let resp;
        try { resp = await fetch(NODE + caminho, { headers: { Authorization: `Bearer ${token}` } }); }
        catch (e) { throw new Error(`Servidor fora do ar. Inicie o Node (${NODE}) e recarregue a página.`); }
        const corpo = await resp.json().catch(() => null);
        if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
        if (!resp.ok) throw new Error((corpo && corpo.erro) || `O servidor respondeu ${resp.status}.`);
        return corpo;
    }

    const dias = () => val("periodo") || "30";

    // ---------- tela principal ----------
    async function carregar() {
        if (carregando || !raiz()) return;
        carregando = true;
        try {
            const d = await api(`/relatorios/resumo?dias=${dias()}`);
            ultimoResumo = d;
            const c = d.contagens;
            txt("gerados", fmt(d.gerados_mes));
            txt("analisados", fmt(c.eventos)); txt("analisados-sub", d.periodo);
            txt("ativos", fmt(c.ativos));
            txt("ativos-sub", c.usuarios ? `${(c.ativos / c.usuarios * 100).toFixed(1).replace(".", ",")}% do total` : "Sem usuários");
            txt("alertas", fmt(c.alertas)); txt("alertas-sub", c.alertas ? "Requerem análise" : "Nenhuma falha");
            txt("r-usuarios", fmt(c.usuarios)); txt("r-dispositivos", fmt(c.dispositivos));
            txt("r-eventos", fmt(c.eventos)); txt("r-alertas", fmt(c.alertas));
            txt("resumo-periodo", d.periodo);
            txt("info-usuarios", `${fmt(c.usuarios)} usuários`);
            txt("info-dados", `${fmt(c.dispositivos)} dispositivos`);
            txt("info-atividades", `${fmt(c.eventos)} eventos`);
            const h = Math.floor(d.sistema_online_s / 3600), m = Math.floor(d.sistema_online_s % 3600 / 60);
            txt("info-sistema", `Online há ${h} h ${m} min`);
            txt("info-alertas", `${fmt(c.alertas)} alertas`);
            txt("info-geral", "Dados completos");
            const selo = q('[data-rel="selo-alertas"]');
            if (selo) { selo.textContent = c.alertas ? "Atenção" : "Disponível"; selo.className = c.alertas ? "status-atencao" : "status-disponivel"; }
            raiz().querySelectorAll(".relatorio-info span").forEach(s => { s.textContent = "Atualizado agora"; });
            txt("status-titulo", "Relatórios atualizados");
            txt("status-texto", "Os números abaixo vêm do banco de dados em tempo real.");
            txt("atualizado", "agora há pouco");
            desenharRecentes(d.recentes);
            aplicarTipo();
        } catch (erro) {
            txt("status-titulo", "Não foi possível atualizar"); txt("status-texto", erro.message);
        } finally { carregando = false; }
    }

    function aplicarTipo() {
        const tipo = val("tipoRelatorio") || "todos";
        let n = 0;
        raiz().querySelectorAll("[data-rel-card]").forEach(c => {
            const mostrar = tipo === "todos" || c.dataset.relCard === tipo;
            c.style.display = mostrar ? "" : "none";
            if (mostrar) n++;
        });
        txt("total-cards", `${n} relatório${n === 1 ? "" : "s"}`);
    }

    function desenharRecentes(lista) {
        const box = document.getElementById("relRecentes"); if (!box) return;
        box.innerHTML = "";
        if (!lista.length) {
            const v = criar("div", "relatorio-recente"); const i = criar("div");
            i.append(criar("strong", "", "Nenhum relatório gerado ainda"), criar("span", "", "Gere um relatório para ele aparecer aqui."));
            v.append(i); box.append(v); return;
        }
        lista.forEach(r => {
            const item = criar("div", "relatorio-recente");
            item.append(criar("div", "mini-icone " + (CORES[r.tipo] || "verde"), (r.formato || "tela").toUpperCase().slice(0, 3)));
            const i = criar("div");
            i.append(criar("strong", "", NOMES[r.tipo] || "Relatório"), criar("span", "", `Gerado ${r.quando}`));
            item.append(i);
            const b = criar("button", "", "↓"); b.type = "button"; b.title = "Baixar novamente";
            b.addEventListener("click", () => baixar(r.tipo, ["pdf", "xls", "csv"].includes(r.formato) ? r.formato : "csv", r.dias));
            item.append(b); box.append(item);
        });
    }

    // ---------- exportação ----------
    const esc = (t) => String(t ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
    const nomeArquivo = (rel, ext) => `safra-${rel.tipo}-${new Date().toISOString().slice(0, 10)}.${ext}`;

    function salvar(conteudo, mime, nome) {
        const url = URL.createObjectURL(new Blob([conteudo], { type: mime }));
        const a = document.createElement("a");
        a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function tabelaHtml(rel) {
        return `<table border="1" cellspacing="0" cellpadding="5"><thead><tr>${rel.colunas.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
            rel.linhas.map(l => `<tr>${l.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("") + "</tbody></table>";
    }

    function exportar(rel, formato) {
        if (formato === "csv") {
            const cel = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
            const csv = [rel.colunas, ...rel.linhas].map(l => l.map(cel).join(";")).join("\n");
            salvar("﻿" + csv, "text/csv;charset=utf-8;", nomeArquivo(rel, "csv"));
        } else if (formato === "xls") {
            const html = `<html><head><meta charset="utf-8"></head><body><h3>${esc(rel.titulo)}</h3><p>${esc(rel.periodo)} • ${esc(rel.resumo)}</p>${tabelaHtml(rel)}</body></html>`;
            salvar(html, "application/vnd.ms-excel;charset=utf-8;", nomeArquivo(rel, "xls"));
        } else {
            const w = window.open("", "_blank");
            if (!w) { Safra.avisar("Permita pop-ups para gerar o PDF."); return; }
            w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(rel.titulo)}</title>
<style>body{font-family:Arial,sans-serif;color:#222;margin:28px}h1{font-size:20px;margin:0 0 4px}p{color:#555;font-size:12px;margin:2px 0}
table{border-collapse:collapse;width:100%;margin-top:14px;font-size:11px}th{background:#218149;color:#fff;text-align:left}th,td{border:1px solid #ccc;padding:5px 7px}tr:nth-child(even) td{background:#f4f8f5}</style></head>
<body><h1>Safra • ${esc(rel.titulo)}</h1><p>${esc(rel.periodo)} • ${esc(rel.resumo)}</p><p>Gerado em ${new Date(rel.gerado_em).toLocaleString("pt-BR")}</p>${tabelaHtml(rel)}</body></html>`);
            w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
        }
    }

    async function buscar(tipo, d, formato) {
        return api(`/relatorios/${tipo}?dias=${d}${formato ? `&registrar=1&formato=${formato}` : ""}`);
    }

    async function baixar(tipo, formato, d) {
        try {
            const rel = await buscar(tipo, d || dias(), formato);
            if (!rel.linhas.length) { Safra.avisar("Não há dados neste relatório para o período."); return; }
            exportar(rel, formato);
            Safra.avisar(`${rel.titulo} gerado (${formato.toUpperCase()}).`);
            carregar();
        } catch (erro) { Safra.avisar(erro.message); }
    }

    // ---------- visualização na tela ----------
    function fecharModal() { const m = document.getElementById("relModal"); if (m) m.remove(); }

    async function ver(tipo) {
        fecharModal();
        const fundo = criar("div"); fundo.id = "relModal";
        fundo.style.cssText = "position:fixed;inset:0;background:rgba(20,35,30,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px";
        const caixa = criar("div");
        caixa.style.cssText = "background:#fff;border-radius:14px;max-width:1000px;width:100%;max-height:88vh;display:flex;flex-direction:column;padding:22px;box-shadow:0 20px 50px rgba(0,0,0,.25)";
        caixa.append(criar("strong", "", "Carregando relatório…"));
        fundo.append(caixa);
        fundo.addEventListener("click", (e) => { if (e.target === fundo) fecharModal(); });
        document.body.append(fundo);
        try {
            const rel = await buscar(tipo, dias());
            caixa.innerHTML = "";
            const topo = criar("div"); topo.style.cssText = "display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px";
            const t = criar("div"); t.append(criar("h2", "", rel.titulo), criar("span", "", `${rel.periodo} • ${rel.resumo}`));
            t.querySelector("span").style.cssText = "color:#647872;font-size:13px";
            const acoes = criar("div"); acoes.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
            [["PDF", "pdf"], ["Excel", "xls"], ["CSV", "csv"]].forEach(([nome, f]) => {
                const b = criar("button", "btn-gerar", "↓ " + nome); b.type = "button"; b.style.height = "38px";
                b.addEventListener("click", () => baixar(tipo, f)); acoes.append(b);
            });
            const x = criar("button", "btn-ver", "Fechar"); x.type = "button"; x.addEventListener("click", fecharModal); acoes.append(x);
            topo.append(t, acoes);
            const rolagem = criar("div"); rolagem.style.cssText = "overflow:auto;border:1px solid #e1e9e5;border-radius:10px";
            const tab = criar("table"); tab.style.cssText = "width:100%;border-collapse:collapse;font-size:13px";
            const cab = criar("tr"); rel.colunas.forEach(c => { const th = criar("th", "", c); th.style.cssText = "text-align:left;padding:9px 12px;background:#f0f6f2;position:sticky;top:0"; cab.append(th); });
            tab.append(cab);
            const MAX = 300;
            rel.linhas.slice(0, MAX).forEach(l => { const tr = criar("tr"); l.forEach(c => { const td = criar("td", "", String(c ?? "")); td.style.cssText = "padding:8px 12px;border-top:1px solid #eef3f0"; tr.append(td); }); tab.append(tr); });
            if (!rel.linhas.length) { const tr = criar("tr"); const td = criar("td", "", "Nenhum registro no período."); td.colSpan = rel.colunas.length; td.style.padding = "16px"; tr.append(td); tab.append(tr); }
            rolagem.append(tab);
            caixa.append(topo, rolagem);
            if (rel.linhas.length > MAX) { const aviso = criar("small", "", `Mostrando ${MAX} de ${fmt(rel.linhas.length)} linhas. O arquivo baixado contém todas.`); aviso.style.marginTop = "8px"; caixa.append(aviso); }
        } catch (erro) { caixa.innerHTML = ""; caixa.append(criar("strong", "", erro.message)); }
    }

    function iniciar() {
        const r = raiz(); if (!r) return;
        r.querySelectorAll("[data-rel-ver]").forEach(b => b.addEventListener("click", () => ver(b.dataset.relVer)));
        const on = (id, ev, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(ev, fn); };
        on("btnFiltrarRelatorios", "click", carregar);
        on("periodo", "change", carregar);
        on("tipoRelatorio", "change", aplicarTipo);
        on("btnGerar", "click", () => {
            const t = val("tipoRelatorio");
            baixar(!t || t === "todos" ? "geral" : t, val("formato") || "pdf");
        });
        document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharModal(); });
        const ver_ = () => { if (location.hash === "#adm.relatorios") carregar(); };
        window.addEventListener("hashchange", ver_);
        ver_();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();
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