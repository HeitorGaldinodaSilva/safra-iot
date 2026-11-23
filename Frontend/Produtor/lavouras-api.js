/* ================= lavouras-api.js (Produtor > Lavouras) =================
   Deixa a tela "Minhas lavouras" funcional com dados reais do Open-Meteo, via FastAPI (GET /produtor/lavouras).
   Cada talhão mostra: fase do ciclo (graus-dia desde a poda), clima atual, umidade do solo, chuva prevista,
   evapotranspiração, data estimada de colheita e avisos. Os talhões ficam em Backend/lavouras.json.
   Não precisa mexer no HTML além de incluir este script depois do clima-api.js. */
(function () {
    const BASE = (window.SAFRA_API_PRODUTOR || window.SAFRA_API_ANALISTA || "http://localhost:8000").replace(/\/$/, "");
    const INTERVALO_MS = 10 * 60 * 1000;
    const nf = (v, c = 0) => v == null ? "--" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
    const dm = (iso) => Safra.fmt.dm(iso);
    const ESTRELA = '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z"/>';
    const UVA = '<circle cx="8.5" cy="10" r="2"/><circle cx="12" cy="10" r="2"/><circle cx="15.5" cy="10" r="2"/><circle cx="10.2" cy="14" r="2"/><circle cx="13.8" cy="14" r="2"/><circle cx="12" cy="18" r="2"/><path d="M12 8V5"/><path d="M12 5.5c1-1.8 2.8-2.5 4.5-2.2"/>';
    const NOME_STATUS = { colheita: "Em colheita", desenvolvimento: "Em desenvolvimento", preparacao: "Preparação" };

    let dados = [], resumoAtual = null;
    let filtro = "todas", ordem = "Mais recentes", busca = "", carregando = false;

    const pagina = () => document.getElementById("lavoura");
    const q = (sel) => { const p = pagina(); return p ? p.querySelector(sel) : null; };
    const qa = (sel) => { const p = pagina(); return p ? Array.from(p.querySelectorAll(sel)) : []; };

    function el(tag, cls, txt) {
        const e = document.createElement(tag);
        if (cls) e.className = cls;
        if (txt != null) e.textContent = txt;
        return e;
    }
    function svg(inner, cls) {
        const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
        s.setAttribute("stroke-width", "1.8"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
        s.setAttribute("class", cls); s.innerHTML = inner;     // inner é SVG fixo deste arquivo (sem dados externos)
        return s;
    }
    function limpar(e) { while (e.firstChild) e.removeChild(e.firstChild); }

    function injetarEstilo() {
        if (document.getElementById("lav-api-css")) return;
        const st = document.createElement("style");
        st.id = "lav-api-css";
        st.textContent = `
        .lav-clima{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 12px;margin:12px 0 4px;padding:10px 12px;border-radius:12px;background:rgba(31,122,77,.07);font-size:.82rem}
        .lav-clima span{opacity:.7;display:block}.lav-clima strong{font-size:.95rem}
        .lav-aviso{margin-top:10px;padding:8px 10px;border-radius:10px;background:#fff4dc;color:#8a5a00;font-size:.8rem}
        .lav-ok{margin-top:10px;padding:8px 10px;border-radius:10px;background:rgba(31,122,77,.08);color:#1f7a4d;font-size:.8rem}
        .lav-det{margin-top:10px;font-size:.82rem;line-height:1.5;border-top:1px dashed rgba(0,0,0,.15);padding-top:10px}
        .lav-msg{grid-column:1/-1;padding:28px;text-align:center;border-radius:16px;background:rgba(0,0,0,.03)}
        .lavoura-card.lav-oculta{display:none}
        .lav-excluir{margin-top:8px;padding:6px 12px;border-radius:8px;border:1px solid #c0392b;background:transparent;color:#c0392b;font:inherit;font-size:.8rem;cursor:pointer}`;
        document.head.appendChild(st);
    }

    function criarCard(l) {
        const card = el("article", "lavoura-card");
        card.dataset.status = l.status;
        const topo = el("div", "card-top");
        topo.appendChild(el("span", `status status-${l.status === "desenvolvimento" ? "desenvolvimento" : l.status}`, `• ${l.fase}`));
        const fav = el("button", "favorite"); fav.type = "button"; fav.appendChild(svg(ESTRELA, "ico ico-inline"));
        topo.appendChild(fav);
        const img = el("div", "lavoura-image uva"); img.appendChild(svg(UVA, "ico ico-fruta"));
        const info = el("div", "lavoura-info");
        info.appendChild(el("span", "talhao", l.talhao));
        info.appendChild(el("h2", null, l.nome));
        const det = el("div", "lavoura-details");
        [["Área", Safra.fmt.area(l.area_ha)], ["Produção estimada", Safra.fmt.peso(l.producao_t)]].forEach(([r, v]) => {
            const d = el("div"); d.append(el("span", null, r), el("strong", null, v)); det.appendChild(d);
        });
        info.appendChild(det);

        const c = l.clima;
        const grade = el("div", "lav-clima");
        [["Temperatura", c.temperatura == null ? "--" : `${nf(c.temperatura)}°C`],
         ["Umidade do ar", c.umidade == null ? "--" : `${nf(c.umidade)}%`],
         ["Umidade do solo", c.solo_pct == null ? "--" : `${nf(c.solo_pct)}%`],
         ["Chuva (7 dias)", `${nf(c.chuva_7d_mm, 1)} mm`],
         ["Evapotranspiração", c.et0_mm_dia == null ? "--" : `${nf(c.et0_mm_dia, 1)} mm/dia`],
         ["Máx. prevista", c.tmax_7d == null ? "--" : `${nf(c.tmax_7d)}°C`]].forEach(([r, v]) => {
            const d = el("div"); d.append(el("span", null, r), el("strong", null, v)); grade.appendChild(d);
        });
        info.appendChild(grade);

        const ph = el("div", "progress-header");
        ph.append(el("span", null, l.progresso_rotulo), el("strong", null, l.status === "preparacao" ? "—" : `${l.progresso_pct}%`));
        const barra = el("div", "progress"); const fill = el("div"); fill.style.width = `${l.progresso_pct}%`; barra.appendChild(fill);
        info.append(ph, barra);

        if (l.avisos.length) l.avisos.forEach(a => info.appendChild(el("div", "lav-aviso", a)));
        else if (l.status !== "preparacao") info.appendChild(el("div", "lav-ok", "Condições dentro do esperado."));

        const detalhe = el("div", "lav-det"); detalhe.hidden = true;
        const linhas = l.status === "preparacao"
            ? [`Poda prevista: ${dm(l.ciclo_inicio)}.`]
            : [`Poda em ${dm(l.ciclo_inicio)} · graus-dia acumulados: ${nf(l.gdd_acumulado)} de ${nf(l.gdd_alvo)}.`,
               l.colheita_estimada ? `Colheita estimada para ${dm(l.colheita_estimada)} (pelo ritmo de calor dos próximos 7 dias).` : "Ciclo completo: colheita no ponto."];
        linhas.forEach(t => detalhe.appendChild(el("div", null, t)));
        detalhe.appendChild(el("div", null, "Fonte: Open-Meteo (modelo meteorológico, não é sensor de campo)."));
        const ex = el("button", "lav-excluir", "Excluir lavoura"); ex.type = "button";
        ex.addEventListener("click", async () => {
            if (!confirm(`Excluir a lavoura ${l.nome} (${l.talhao})?`)) return;
            try { await enviar("DELETE", `/produtor/lavouras/${encodeURIComponent(l.id)}`); Safra.avisar("Lavoura excluída."); await carregar(); }
            catch (e) { Safra.avisar(e.message); }
        });
        detalhe.appendChild(ex);
        info.appendChild(detalhe);

        const rodape = el("div", "card-footer");
        const btn = el("button", null, "Ver detalhes →"); btn.type = "button";
        btn.addEventListener("click", () => { detalhe.hidden = !detalhe.hidden; btn.textContent = detalhe.hidden ? "Ver detalhes →" : "Ocultar detalhes ↑"; });
        rodape.append(el("span", null, "Atualizado agora"), btn);
        info.appendChild(rodape);
        card.append(topo, img, info);
        return card;
    }

    function listaVisivel() {
        const t = busca.trim().toLowerCase();
        let v = dados.filter(l => (filtro === "todas" || l.status === filtro)
            && (!t || `${l.nome} ${l.talhao} ${l.fase}`.toLowerCase().includes(t)));
        const ord = {
            "Mais recentes": (a, b) => b.ciclo_inicio.localeCompare(a.ciclo_inicio),
            "Mais antigas": (a, b) => a.ciclo_inicio.localeCompare(b.ciclo_inicio),
            "Maior área": (a, b) => b.area_ha - a.area_ha,
            "Maior produção": (a, b) => b.producao_t - a.producao_t,
        }[ordem];
        return ord ? v.sort(ord) : v;
    }

    function desenharGrade() {
        const grade = q(".lavouras-grid");
        if (!grade) return;
        limpar(grade);
        const v = listaVisivel();
        if (!v.length) { grade.appendChild(el("div", "lav-msg", dados.length ? "Nenhuma lavoura encontrada para esse filtro." : "Nenhuma lavoura cadastrada.")); return; }
        v.forEach(l => grade.appendChild(criarCard(l)));
    }

    function desenharFiltros() {
        const mapa = ["todas", "desenvolvimento", "colheita", "preparacao"];
        qa(".filter-buttons .filter").forEach((b, i) => {
            const chave = mapa[i];
            let n = b.querySelector("span");
            if (!n) { n = document.createElement("span"); b.appendChild(n); }
            n.textContent = chave === "todas" ? dados.length : dados.filter(l => l.status === chave).length;
            b.classList.toggle("active", chave === filtro);
            b.dataset.filtro = chave;
        });
    }

    function stat(i, rotulo, valor, sub, classe) {
        const c = qa(".stats-grid .stat-card")[i];
        if (!c) return;
        const s = c.querySelector(".stat-content span"), v = c.querySelector(".stat-content strong"), m = c.querySelector(".stat-content small");
        if (rotulo != null) s.textContent = rotulo;
        v.textContent = valor; m.textContent = sub; m.className = classe || "";
    }

    function desenharResumo(r) {
        resumoAtual = r;
        stat(0, "Lavouras ativas", String(r.ativas), `de ${r.cadastradas} cadastradas`);
        stat(1, "Área total", Safra.fmt.area(r.area_total_ha), `${Safra.fmt.area(r.area_producao_ha)} em ciclo`, "positive");
        stat(2, "Em colheita", String(r.em_colheita), "talhões agora");
        stat(3, "Umidade do solo", r.solo_medio_pct == null ? "--" : `${nf(r.solo_medio_pct)}%`, "média dos talhões ativos (Open-Meteo)", "positive");
        const linhas = qa(".bottom-grid .summary-card .summary-row strong");
        if (linhas[0]) linhas[0].textContent = Safra.fmt.area(r.area_producao_ha);
        if (linhas[1]) linhas[1].textContent = Safra.fmt.peso(r.producao_prevista_t);
        if (linhas[2]) linhas[2].textContent = String(r.em_colheita);
        const card = q(".irrigacao-card");
        if (card) {
            const h2 = card.querySelector("h2"), p = card.querySelector(".summary-title p");
            if (h2) h2.textContent = "Condições de irrigação";
            if (p) p.textContent = "Balanço hídrico dos próximos 7 dias (Open-Meteo).";
            const forte = card.querySelector(".irrigacao-value strong"), leg = card.querySelector(".irrigacao-value span");
            if (forte) forte.textContent = r.solo_medio_pct == null ? "--" : `${nf(r.solo_medio_pct)}%`;
            if (leg) leg.textContent = "Umidade do solo";
            const barra = card.querySelector(".irrigacao-bar div");
            if (barra) barra.style.width = `${Math.min(100, Math.max(0, (r.solo_medio_pct || 0) * 2))}%`;
            const msg = card.querySelector("p.normal");
            if (msg) {
                const falta = r.et0_media_mm_dia != null && r.chuva_7d_media_mm != null ? r.et0_media_mm_dia * 7 - r.chuva_7d_media_mm : null;
                msg.textContent = falta == null ? "● Sem dados de balanço hídrico"
                    : `● Perda de água: ${nf(r.et0_media_mm_dia * 7)} mm · chuva: ${nf(r.chuva_7d_media_mm, 1)} mm → ${falta > 0 ? `faltam ~${nf(falta)} mm para irrigar` : "chuva cobre a demanda"}`;
            }
        }
    }

    function indisponivel(msg) {
        const grade = q(".lavouras-grid");
        if (grade) { limpar(grade); grade.appendChild(el("div", "lav-msg", `Lavouras indisponíveis: ${msg}`)); }
        [0, 1, 2, 3].forEach(i => stat(i, null, "--", "Indisponível"));
    }

    async function enviar(metodo, caminho, corpo) {
        const token = sessionStorage.getItem("safra_token") || "";
        let resp;
        try {
            resp = await fetch(BASE + caminho, { method: metodo, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
        } catch (e) { throw new Error(`Não foi possível falar com a API (${BASE}). Ela está ligada?`); }
        if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
        if (resp.status === 403) throw new Error("Seu perfil não tem permissão para isso.");
        if (!resp.ok) {
            const c = await resp.json().catch(() => null), det = c && c.detail;
            throw new Error(Array.isArray(det) ? det.map((d) => `${(d.loc || []).slice(-1)[0]}: ${d.msg}`).join("; ") : det || `A API respondeu ${resp.status}.`);
        }
        return resp.status === 204 ? null : resp.json();
    }

    function novaLavoura() {
        const m2 = Safra.fmt.rotuloArea() === "m²";
        Safra.formulario({
            titulo: "Nova lavoura", subtitulo: "O talhão é salvo no cadastro e já aparece com clima e fase do ciclo (Open-Meteo).", confirmar: "Cadastrar lavoura",
            campos: [
                { nome: "nome", rotulo: "Cultura / variedade", obrigatorio: true, placeholder: "Ex.: Uva Vitória", inteira: true },
                { nome: "talhao", rotulo: "Talhão", placeholder: "Ex.: TALHÃO 05" },
                { nome: "tipo", rotulo: "Tipo", tipo: "select", opcoes: [["mesa", "Uva de mesa"], ["vinho", "Uva para vinho"]] },
                { nome: "area", rotulo: `Área (${m2 ? "m²" : "ha"})`, tipo: "numero", obrigatorio: true, placeholder: m2 ? "100000" : "10" },
                { nome: "t_ha", rotulo: "Produtividade esperada (t/ha)", tipo: "numero", obrigatorio: true, placeholder: "30" },
                { nome: "ciclo_inicio", rotulo: "Data da poda", tipo: "data", obrigatorio: true, valor: new Date().toISOString().slice(0, 10) },
                { nome: "gdd_alvo", rotulo: "Graus-dia até a colheita", tipo: "numero", valor: "1800", ajuda: "Confirme com o agrônomo" },
            ],
            aoConfirmar: async (v) => {
                await enviar("POST", "/produtor/lavouras", { nome: v.nome, talhao: v.talhao, tipo: v.tipo, area_ha: m2 ? v.area / 10000 : v.area,
                    t_ha: v.t_ha, ciclo_inicio: v.ciclo_inicio, gdd_alvo: Math.round(v.gdd_alvo || 1800) });
                Safra.avisar("Lavoura cadastrada!"); await carregar();
            },
        });
    }

    async function carregar() {
        if (carregando) return;
        carregando = true;
        try {
            const token = sessionStorage.getItem("safra_token") || "";
            const resp = await fetch(`${BASE}/produtor/lavouras`, { headers: { Authorization: `Bearer ${token}` } });
            if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
            if (resp.status === 403) throw new Error("Seu perfil não tem acesso a esta informação.");
            if (!resp.ok) {
                const corpo = await resp.json().catch(() => null);
                throw new Error((corpo && corpo.detail) || `A API respondeu ${resp.status}.`);
            }
            const d = await resp.json();
            dados = d.lavouras || [];
            desenharResumo(d.resumo);
            desenharFiltros();
            desenharGrade();
        } catch (e) {
            indisponivel(e && e.name === "TypeError" ? `não foi possível falar com a API (${BASE}). Ela está ligada?` : e.message);
        } finally {
            carregando = false;
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (!pagina()) return;
        injetarEstilo();
        const grade = q(".lavouras-grid");
        if (grade) { limpar(grade); grade.appendChild(el("div", "lav-msg", "Carregando lavouras…")); }   // não deixa o exemplo fixo parecer dado real
        qa(".filter-buttons .filter").forEach(b => b.addEventListener("click", () => { filtro = b.dataset.filtro || "todas"; desenharFiltros(); desenharGrade(); }));
        const sel = q(".order-select");
        if (sel) sel.addEventListener("change", () => { ordem = sel.value; desenharGrade(); });
        pagina().addEventListener("input", (e) => {
            if (e.target.matches("input[type=search], input[type=text], input:not([type])")) { busca = e.target.value; desenharGrade(); }
        });
        const nova = q(".btn-primary");
        if (nova) nova.addEventListener("click", (e) => { e.stopImmediatePropagation(); novaLavoura(); }, true);
        window.addEventListener("safra:preferencias", () => { if (resumoAtual) { desenharResumo(resumoAtual); desenharGrade(); } });
        carregar();
        setInterval(() => { if (!document.hidden) carregar(); }, INTERVALO_MS);
    });
})();
