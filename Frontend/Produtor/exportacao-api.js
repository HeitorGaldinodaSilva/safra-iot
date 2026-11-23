/* ================= exportacao-api.js (Produtor > Exportação) =================
   Troca os números fixos da tela Exportação por dados reais:
     GET /produtor/exportacao -> ComexStat (volume, preço, países/regiões de destino), PTAX/Banco Central (US$ -> R$),
                                 Open-Meteo (progresso dos talhões, clima e janela de embarque) e cadastro de lavouras.
   Inclua este script no produtor.html, depois do relatorios-api.js.
   Fonte fora do ar => o card mostra "—" e um aviso aparece no topo (nunca um valor inventado). */
(function () {
    "use strict";
    const BASE = (window.SAFRA_API_PRODUTOR || window.SAFRA_API_ANALISTA || "http://localhost:8000").replace(/\/$/, "");
    const nf = (v, c = 1) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
    const BRL = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
    const BRL2 = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const ton = (v) => Safra.fmt.peso(v);
    const preco = (v) => Safra.fmt.preco(v);
    const data = (v) => Safra.fmt.data(v);
    const seta = (v) => (v == null ? "" : `${v >= 0 ? "↑" : "↓"} ${nf(Math.abs(v), 1)}%`);
    const SIGLA = { "Europa": "UE", "Estados Unidos": "EUA", "Canadá": "CA", "Ásia": "AS", "Oriente Médio": "OM", "América Latina": "AL", "Outros": "··" };
    const DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

    let dados = null, filtroStatus = "Todos", filtroProduto = "Todos", filtroDestino = "Todos";

    const raiz = () => document.getElementById("exportacao");
    const q = (s, e) => (e || raiz()).querySelector(s);
    const qa = (s, e) => Array.from((e || raiz()).querySelectorAll(s));
    const limpar = (e) => { while (e.firstChild) e.removeChild(e.firstChild); };
    function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    const dash = "—";

    function css() {
        if (document.getElementById("exp-api-css")) return;
        const s = el("style"); s.id = "exp-api-css";
        s.textContent = `
          #exp-aviso{margin:0 0 14px;padding:10px 14px;border-radius:12px;background:rgba(227,181,69,.18);border:1px solid rgba(227,181,69,.5);font-size:14px}
          #exp-aviso:empty{display:none}
          .exp-fonte{margin:14px 2px 0;font-size:12px;opacity:.65}
          .exp-vazio{padding:18px;border:1px dashed rgba(128,128,128,.4);border-radius:12px;font-size:14px;opacity:.8}
          #exp-clima{margin:22px 0}
          #exp-clima .exp-atual{display:flex;flex-wrap:wrap;gap:8px 24px;margin:10px 0;font-size:14px}
          #exp-clima .exp-janela{margin:8px 0;font-size:14px}
          #exp-clima ul{margin:8px 0 0;padding-left:18px;font-size:14px}
          .exp-tab-wrap{overflow-x:auto;margin-top:10px}
          .exp-tab{width:100%;border-collapse:collapse;font-size:14px}
          .exp-tab th,.exp-tab td{padding:8px 10px;text-align:left;border-bottom:1px solid rgba(128,128,128,.22);white-space:nowrap}`;
        document.head.appendChild(s);
    }

    /* ---------- avisos / fonte ---------- */
    function avisos(extra) {
        let box = document.getElementById("exp-aviso");
        if (!box) { box = el("div"); box.id = "exp-aviso"; const cab = q(".cabecalho"); cab.parentNode.insertBefore(box, cab.nextSibling); }
        limpar(box);
        const itens = [...extra];
        if (dados) Object.values(dados.fontes).forEach((f) => { if (!f.ok && f.erro) itens.push([f.rotulo, f.erro]); });
        itens.forEach(([quem, msg], i) => { if (i) box.appendChild(document.createElement("br")); box.appendChild(el("b", null, `${quem}: `)); box.appendChild(document.createTextNode(msg)); });
    }

    /* ---------- 4 cards ---------- */
    function cards() {
        const c = dados.cards, cs = qa(".cards .card-indicador");
        const set = (i, rotulo, valor, sub, positivo) => {
            const b = cs[i]; if (!b) return;
            const sp = q("span", b), st = q("strong", b), sm = q("small", b);
            if (rotulo) sp.textContent = rotulo;
            st.textContent = valor;
            if (sm) { sm.textContent = sub || ""; sm.classList.toggle("positivo", !!positivo); }
        };
        set(0, "Lotes ativos", c.lotes_ativos == null ? dash : String(c.lotes_ativos),
            c.lotes_total == null ? "Open-Meteo indisponível" : `${c.em_colheita} em colheita · ${c.lotes_total} talhões cadastrados`, c.em_colheita > 0);
        set(1, "Volume previsto", c.volume_ton == null ? dash : ton(c.volume_ton), "Produção prevista dos talhões ativos");
        set(2, "Destinos ativos (12 meses)", c.paises == null ? dash : String(c.paises),
            c.regioes && c.regioes.length ? c.regioes.join(", ") : "ComexStat sem destinos no momento");
        const sub = c.preco_brl_kg ? `${preco(c.preco_brl_kg)} (US$ ${nf(c.preco_usd_kg, 2)} × PTAX ${nf(dados.cambio.brl_por_usd, 2)})` : "Preço ou câmbio indisponível";
        set(3, "Receita estimada", c.receita_brl == null ? dash : BRL(c.receita_brl), sub, c.var_volume_pct != null && c.var_volume_pct >= 0);
    }

    /* ---------- lote em destaque + grade ---------- */
    function lotesFiltrados() {
        return dados.lotes.filter((l) => {
            if (filtroStatus !== "Todos" && l.status_rotulo !== filtroStatus) return false;
            if (filtroProduto !== "Todos" && !`${l.produto || ""} ${l.nome}`.toLowerCase().includes(filtroProduto.toLowerCase())) return false;
            if (filtroDestino !== "Todos" && l.regiao !== filtroDestino) return false;
            return true;
        });
    }
    function detalhe(l) {
        const c = l.clima || {};
        const t = [`${l.nome} (${l.manual ? l.numero : l.talhao})`, `Volume previsto: ${ton(l.volume_ton)}`, `${l.progresso_rotulo}: ${l.progresso_pct}%`];
        if (l.embarque) t.push(`Embarque: ${data(l.embarque)}`);
        if (l.colheita_estimada) t.push(`Colheita estimada: ${data(l.colheita_estimada)}`);
        if (c.temperatura != null && c.umidade != null) t.push(`Clima agora: ${nf(c.temperatura, 1)} °C, umidade ${nf(c.umidade, 0)}%, chuva 7 dias ${nf(c.chuva_7d_mm, 0)} mm`);
        if (l.avisos && l.avisos.length) t.push(...l.avisos);
        window.Safra && Safra.avisar ? Safra.avisar(t.slice(0, 3).join(" · ")) : alert(t.join("\n"));
    }
    function destaque(l) {
        const sec = q(".lote-destaque"); if (!sec) return;
        if (!l) { sec.style.display = "none"; return; }
        sec.style.display = "";
        q(".tag.andamento", sec).textContent = l.status_rotulo.toUpperCase();
        q(".tag.produto", sec).textContent = String(l.produto || (l.tipo === "vinho" ? "Vinho" : "Uva")).toUpperCase();
        q("h2", sec).textContent = `${l.nome} · ${l.numero}`;
        q(".lote-topo p", sec).textContent = l.embarque ? `Embarque previsto em ${data(l.embarque)}.` : l.colheita_estimada ? `Colheita estimada em ${data(l.colheita_estimada)} (graus-dia, Open-Meteo).` : `${l.progresso_rotulo}.`;
        q(".percentual", sec).textContent = `${l.progresso_pct}%`;
        const barra = q(".progresso-preenchido", sec); barra.style.width = `${l.progresso_pct}%`;
        const sp = q(".progresso > span", sec); if (sp) sp.textContent = l.progresso_rotulo;
        const infos = qa(".info", sec), v = [l.nome, ton(l.volume_ton), l.destino || dash, l.demanda || dash,
            l.preco_brl_kg ? `${preco(l.preco_brl_kg)}` : dash];
        infos.forEach((i, k) => { if (v[k] != null) q("strong", i).textContent = v[k]; });
        const rot = q("span", infos[1]); if (rot) rot.textContent = "Volume previsto";
        const rd = q("span", infos[2]); if (rd) rd.textContent = "Principal destino (ComexStat)";
        const bt = q(".btn-lote", sec);
        if (bt) {
            bt._lote = l;
            if (!bt.dataset.exp) { bt.dataset.exp = "1"; bt.addEventListener("click", (e) => { e.stopImmediatePropagation(); detalhe(bt._lote); }, true); }
        }
    }
    function grade(lista) {
        const g = q(".lotes-grid"); limpar(g);
        if (!lista.length) { g.appendChild(el("div", "exp-vazio", "Nenhum lote para esses filtros.")); return; }
        lista.forEach((l) => {
            const a = el("article", "lote-card");
            const topo = el("div", "lote-card-topo"), d1 = el("div");
            d1.appendChild(el("span", "numero-lote", l.numero)); d1.appendChild(el("h3", null, l.nome)); topo.appendChild(d1);
            topo.appendChild(el("span", "status " + (l.status === "preparacao" ? "programado" : "andamento-status"), l.status_rotulo));
            a.appendChild(topo);
            const dados_ = el("div", "lote-dados");
            [["Volume", ton(l.volume_ton)], ["Destino", l.destino || dash], ["Preço", l.preco_brl_kg ? `${preco(l.preco_brl_kg)}` : dash]].forEach(([r, val]) => {
                const d = el("div"); d.appendChild(el("span", null, r)); d.appendChild(el("strong", null, val)); dados_.appendChild(d);
            });
            a.appendChild(dados_);
            const mp = el("div", "mini-progresso"), t = el("div");
            t.appendChild(el("span", null, l.progresso_rotulo)); t.appendChild(el("strong", null, `${l.progresso_pct}%`)); mp.appendChild(t);
            const b = el("div", "barra"), f = el("div", "barra-fill"); f.style.width = `${l.progresso_pct}%`; b.appendChild(f); mp.appendChild(b);
            a.appendChild(mp);
            const bt = el("button", "btn-card", "Ver detalhes"); bt.type = "button"; bt.addEventListener("click", () => detalhe(l)); a.appendChild(bt);
            if (l.manual) {
                const ex = el("button", "btn-card", "Excluir lote"); ex.type = "button"; ex.style.marginTop = "8px";
                ex.addEventListener("click", () => excluirLote(l)); a.appendChild(ex);
            }
            g.appendChild(a);
        });
    }

    /* ---------- mercado internacional (ComexStat por país) ---------- */
    function mercados() {
        const g = q(".mercados-grid"); limpar(g);
        let m = dados.mercados || [];
        if (filtroDestino !== "Todos") m = m.filter((x) => x.regiao === filtroDestino);
        if (!m.length) {
            const motivo = dados.fontes.comex.erro || "ComexStat sem destinos para o período.";
            g.appendChild(el("div", "exp-vazio", `Destinos indisponíveis: ${motivo}`)); return;
        }
        m.forEach((x) => {
            const b = el("div", "mercado"), ic = el("div", "mercado-icone");
            ic.appendChild(el("span", "ico-sigla", SIGLA[x.regiao] || "··")); b.appendChild(ic);
            const d = el("div");
            d.appendChild(el("span", null, x.regiao)); d.appendChild(el("strong", null, x.demanda));
            const sm = el("small", x.var_pct != null && x.var_pct >= 0 ? "crescimento" : "",
                `${x.var_pct != null ? seta(x.var_pct) + " vs 12 meses anteriores · " : ""}${ton(x.ton)} · US$ ${nf(x.preco_usd_kg, 2)}/kg`);
            d.appendChild(sm); b.appendChild(d); g.appendChild(b);
        });
    }

    /* ---------- clima na origem (Open-Meteo) ---------- */
    function clima() {
        let box = document.getElementById("exp-clima");
        const ref = q(".mercados");
        if (!box) { box = el("section"); box.id = "exp-clima"; ref.parentNode.insertBefore(box, ref); }
        limpar(box);
        const h = el("div", "secao-titulo"), t = el("div");
        t.appendChild(el("h2", null, "Condições na origem para embarque")); t.appendChild(el("p", null, "Open-Meteo · Petrolina/Juazeiro · próximos 7 dias")); h.appendChild(t); box.appendChild(h);
        const c = dados.clima;
        if (!c) { box.appendChild(el("div", "exp-vazio", `Open-Meteo indisponível: ${dados.fontes.open_meteo.erro || "sem resposta"}`)); return; }
        const a = c.atual, at = el("div", "exp-atual");
        [`Agora: ${nf(a.temperatura, 1)} °C (${a.condicao})`, `Umidade ${nf(a.umidade, 0)}%`, `Vento ${nf(a.vento_kmh, 0)} km/h`, `Chuva ${nf(a.chuva_mm, 1)} mm`].forEach((x) => at.appendChild(el("span", null, x)));
        box.appendChild(at);
        const j = c.janela_ideal;
        box.appendChild(el("p", "exp-janela", j ? `Janela ideal de colheita/embarque: ${data(j.inicio)} a ${data(j.fim)} (${j.dias} dia${j.dias > 1 ? "s" : ""}).` : "Nenhuma janela ideal clara nos próximos dias."));
        if (c.alertas && c.alertas.length) { const ul = el("ul"); c.alertas.forEach((x) => ul.appendChild(el("li", null, x.mensagem || x.titulo || ""))); box.appendChild(ul); }
        const wrap = el("div", "exp-tab-wrap"), tb = el("table", "exp-tab"), hd = el("tr");
        ["Dia", "Mín/Máx (°C)", "Chuva (mm)", "Umidade"].forEach((x) => hd.appendChild(el("th", null, x))); tb.appendChild(hd);
        (c.dias || []).forEach((d) => {
            const tr = el("tr"); const dt = new Date(d.data + "T12:00:00");
            const um = d.umidade_media;
            [`${DIA[dt.getDay()]} ${d.data.slice(8, 10)}/${d.data.slice(5, 7)}`, `${d.tmin}/${d.tmax}`, d.chuva_mm, um != null ? `${nf(um, 0)}%` : dash].forEach((x) => tr.appendChild(el("td", null, String(x))));
            tb.appendChild(tr);
        });
        wrap.appendChild(tb); box.appendChild(wrap);
    }

    function rodape() {
        let r = document.getElementById("exp-fonte");
        if (!r) { r = el("p", "exp-fonte"); r.id = "exp-fonte"; q("main.conteudo").appendChild(r); }
        const e = dados.exportacao;
        r.textContent = `Fontes: ComexStat/MDIC${e ? ` (${e.escopo_destinos || "destinos indisponíveis"}; último mês publicado ${e.fim})` : ""}, Banco Central PTAX${dados.cambio ? ` de ${dados.cambio.data}` : ""} e Open-Meteo. Lotes = talhões do cadastro de lavouras; volume = área × t/ha; preço = média FOB dos últimos 12 meses.`;
    }

    /* ---------- filtros ---------- */
    function filtros() {
        const [sStatus, sProd, sDest] = qa(".filtros .campo select");
        const refazer = (sel, opcoes) => {
            if (!sel) return;
            const atual = sel.value; limpar(sel);
            opcoes.forEach((o) => sel.appendChild(el("option", null, o)));
            sel.value = opcoes.includes(atual) ? atual : "Todos";
        };
        refazer(sStatus, ["Todos", "Programado", "Em andamento", "Em colheita", "Concluído"]);
        refazer(sProd, ["Todos", "Uva", "Manga", "Vinho"]);
        const regioes = [...new Set([...(dados.mercados || []).map((m) => m.regiao), ...dados.lotes.map((l) => l.regiao).filter(Boolean)])];
        refazer(sDest, ["Todos", ...regioes]);
        const aplicar = () => {
            filtroStatus = sStatus.value; filtroProduto = sProd.value; filtroDestino = sDest.value;
            if (dados) desenhar();
        };
        const bt = q(".btn-filtro");
        if (bt && !bt.dataset.exp) {
            bt.dataset.exp = "1";
            bt.addEventListener("click", (e) => { e.stopImmediatePropagation(); aplicar(); }, true);
            [sStatus, sProd, sDest].forEach((sel) => sel && sel.addEventListener("change", aplicar));
        }
    }

    /* ---------- novo lote / excluir lote ---------- */
    async function enviar(metodo, caminho, corpo) {
        const token = sessionStorage.getItem("safra_token") || "";
        let resp;
        try {
            resp = await fetch(BASE + caminho, { method: metodo, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
        } catch (e) { throw new Error(`Não foi possível falar com a API (${BASE}). Ela está ligada?`); }
        if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
        if (resp.status === 403) throw new Error("Seu perfil não tem permissão para isso.");
        if (!resp.ok) {
            const c = await resp.json().catch(() => null);
            const det = c && c.detail;
            throw new Error(Array.isArray(det) ? det.map((d) => `${(d.loc || []).slice(-1)[0]}: ${d.msg}`).join("; ") : det || `A API respondeu ${resp.status}.`);
        }
        return resp.status === 204 ? null : resp.json();
    }
    function novoLote() {
        const kg = Safra.fmt.rotuloPeso() === "kg";
        Safra.formulario({
            titulo: "Novo lote de exportação", subtitulo: "O lote entra nos cards, filtros e no resumo da tela Inicial.", confirmar: "Criar lote",
            campos: [
                { nome: "produto", rotulo: "Produto", tipo: "select", opcoes: [["Uva", "Uva"], ["Manga", "Manga"], ["Vinho", "Vinho"]], obrigatorio: true },
                { nome: "variedade", rotulo: "Variedade", placeholder: "Ex.: Vitória" },
                { nome: "volume", rotulo: `Volume (${kg ? "kg" : "t"})`, tipo: "numero", obrigatorio: true, placeholder: kg ? "2500" : "2,5" },
                { nome: "preco", rotulo: "Preço (R$/kg)", tipo: "numero", ajuda: "Vazio = média ComexStat × PTAX" },
                { nome: "destino", rotulo: "País de destino", placeholder: "Ex.: Países Baixos" },
                { nome: "regiao", rotulo: "Região de destino", tipo: "select", opcoes: ["Europa", "Estados Unidos", "Canadá", "Ásia", "Oriente Médio", "América Latina", "Outros"].map((x) => [x, x]) },
                { nome: "status", rotulo: "Status", tipo: "select", opcoes: [["programado", "Programado"], ["andamento", "Em andamento"], ["concluido", "Concluído"]] },
                { nome: "embarque", rotulo: "Data de embarque", tipo: "data" },
            ],
            aoConfirmar: async (v) => {
                await enviar("POST", "/produtor/exportacao/lotes", {
                    produto: v.produto, variedade: v.variedade, volume_ton: kg ? v.volume / 1000 : v.volume,
                    preco_brl_kg: v.preco, destino: v.destino, regiao: v.regiao, status: v.status, embarque: v.embarque });
                Safra.avisar("Lote criado!"); await carregar();
            },
        });
    }
    async function excluirLote(l) {
        if (!confirm(`Excluir o lote ${l.numero} (${l.nome})?`)) return;
        try { await enviar("DELETE", `/produtor/exportacao/lotes/${l.id}`); Safra.avisar("Lote excluído."); await carregar(); }
        catch (e) { Safra.avisar(e.message); }
    }

    /* ---------- resumo "Exportação e logística" da tela Inicial ---------- */
    function resumoInicial() {
        const sec = document.querySelector(".exportacao-resumo"); if (!sec) return;
        const cs = qa(".export-card", sec);
        const set = (c, rotulo, valor, sub) => {
            if (!c) return;
            const sp = q("span", c), st = q("strong", c), sm = q("small", c);
            if (rotulo && sp) sp.textContent = rotulo; if (st) st.textContent = valor; if (sm) sm.textContent = sub;
        };
        const hoje = new Date().toISOString().slice(0, 10);
        const ativos = dados.lotes.filter((l) => l.status !== "preparacao" && l.status !== "concluido");
        const datas = dados.lotes.filter((l) => l.status !== "concluido").map((l) => ({ l, d: l.embarque || l.colheita_estimada }))
            .filter((x) => x.d && x.d >= hoje).sort((a, b) => a.d.localeCompare(b.d));
        const prox = datas[0], c = dados.cards;
        if (prox) set(cs[0], prox.l.embarque ? "Próximo embarque" : "Próxima colheita", data(prox.d), `${prox.l.numero} • ${prox.l.destino || prox.l.regiao || "Destino a definir"}`);
        else set(cs[0], "Próximo embarque", dash, "Nenhum embarque programado");
        const base = ativos[0] || dados.lotes[0];
        set(cs[1], "Volume para exportação", c.volume_ton == null ? dash : ton(c.volume_ton),
            base ? `${base.produto || "Uva"} • Demanda ${(base.demanda || (dados.mercados[0] || {}).demanda || "—").toString().toLowerCase()}` : "Sem lotes ativos");
        set(cs[2], "Preço estimado", c.preco_brl_kg ? preco(c.preco_brl_kg) : dash, c.preco_brl_kg ? "Mercado internacional (ComexStat × PTAX)" : "Preço ou câmbio indisponível");
        const st = q(".export-status", sec);
        if (st && base) {
            q(".status-top strong", st).textContent = `${base.progresso_pct}%`;
            const barra = q(".barra > div", st); if (barra) barra.style.width = `${base.progresso_pct}%`;
            q("small", st).textContent = `${base.status_rotulo} • ${base.numero}`;
        } else if (st) { q(".status-top strong", st).textContent = dash; q("small", st).textContent = "Nenhum lote ativo"; }
    }

    function desenhar() {
        cards();
        const l = lotesFiltrados();
        destaque(l.find((x) => x.status !== "preparacao" && x.status !== "concluido") || l[0]);
        grade(l); mercados(); clima(); rodape(); resumoInicial();
    }

    function marcarCarregando() {
        qa(".cards .card-indicador strong").forEach((s) => { s.textContent = "…"; });
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
        if (!raiz()) return;
        css(); if (!dados) marcarCarregando();
        try { dados = await api("/produtor/exportacao"); }
        catch (e) { dados = null; qa(".cards .card-indicador strong").forEach((s) => { s.textContent = dash; }); avisos([["Exportação", e.message]]); return; }
        avisos([]); filtros(); desenhar();
    }

    function iniciar() {
        if (!raiz()) return;
        const nb = q(".cabecalho .btn-principal");
        if (nb && !nb.dataset.exp) { nb.dataset.exp = "1"; nb.addEventListener("click", (e) => { e.stopImmediatePropagation(); novoLote(); }, true); }
        window.addEventListener("safra:preferencias", () => { if (dados) { filtros(); desenhar(); } });
        carregar();
        setInterval(carregar, 10 * 60 * 1000);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
