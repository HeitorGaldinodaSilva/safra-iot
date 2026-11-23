/* ================= relatorios-api.js (Produtor > Relatórios) =================
   Troca os números fixos da tela Relatórios por dados reais:
     GET /produtor/relatorios -> IBGE PAM (área/produção), ComexStat (exportação, destinos, preço),
                                 PTAX/Banco Central (US$ -> R$), cadastro de lavouras e Financeiro do produtor
     GET /produtor/clima      -> Open-Meteo (condição atual, previsão de 7 dias, janela ideal, alertas)
   Inclua este script no produtor.html, depois do financeiro-api.js.
   Onde uma fonte estiver fora do ar, o card mostra "—" e um aviso aparece acima das abas (nunca um valor inventado). */
(function () {
    "use strict";
    const BASE = (window.SAFRA_API_PRODUTOR || window.SAFRA_API_ANALISTA || "http://localhost:8000").replace(/\/$/, "");
    const nf = (v, c = 1) => Number(v).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c });
    const BRL = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const MESES_OPCOES = [[3, "Últimos 3 meses"], [6, "Últimos 6 meses"], [12, "Últimos 12 meses"]];
    const TXT_FONTE = { comex: "ComexStat", pam: "IBGE (PAM)", bcb: "Banco Central (PTAX)" };

    let rel = null, clima = null, meses = 6, lavoura = "";

    const raiz = () => document.getElementById("relatorio");
    const aba = (id) => document.getElementById("aba-" + id);
    const q = (esc, s) => (esc ? esc.querySelector(s) : null);
    const limpar = (e) => { while (e.firstChild) e.removeChild(e.firstChild); };
    function el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    const compacto = (v) => (Math.abs(v) >= 1e6 ? `R$ ${nf(v / 1e6, 2)} mi` : Math.abs(v) >= 1e3 ? `R$ ${nf(v / 1e3, 0)} mil` : BRL(v));
    const mesBR = (p) => (p ? `${p.slice(5, 7)}/${p.slice(0, 4)}` : "—");
    const seta = (v) => (v == null ? "" : `${v >= 0 ? "↑" : "↓"} ${nf(Math.abs(v), 1)}%`);

    /* ---------- ajuda para preencher "<span>Rótulo</span><strong>Valor</strong><small>Detalhe</small>" ---------- */
    function cartao(escopo, rotulo, valor, sub, novoRotulo) {
        if (!escopo) return null;
        let achou = null;
        escopo.querySelectorAll("span").forEach((sp) => {
            if (achou || sp.children.length || !rotulo.test(sp.textContent.trim())) return;
            const pai = sp.parentElement;
            const forte = pai && pai.querySelector(":scope > strong");
            if (!forte) return;
            if (novoRotulo) sp.textContent = novoRotulo;
            if (valor != null) forte.textContent = valor;
            const peq = pai.querySelector(":scope > small, :scope > p");
            if (peq && sub !== undefined) peq.textContent = sub || "";
            achou = forte;
        });
        return achou;
    }

    function css() {
        if (document.getElementById("rel-api-css")) return;
        const s = el("style");
        s.id = "rel-api-css";
        s.textContent = `
          #rel-aviso{margin:0 0 14px;padding:10px 14px;border-radius:12px;background:rgba(227,181,69,.18);border:1px solid rgba(227,181,69,.5);font-size:14px}
          #rel-aviso:empty{display:none}
          #rel-aviso b{font-weight:600}
          .rel-nota{margin:10px 0 0;font-size:13px;opacity:.75}
          .rel-fonte{margin:12px 2px 0;font-size:12px;opacity:.65}
          #rel-clima-previsao{margin-top:18px}
          #rel-clima-previsao .rel-resumo{display:flex;flex-wrap:wrap;gap:8px 22px;margin:12px 0}
          #rel-clima-previsao .rel-resumo span{font-size:14px}
          .rel-tabela-wrap{overflow-x:auto}
          .rel-tabela{width:100%;border-collapse:collapse;font-size:14px}
          .rel-tabela th,.rel-tabela td{padding:9px 10px;text-align:left;border-bottom:1px solid rgba(128,128,128,.22);white-space:nowrap}
          .rel-tabela th{font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.03em;opacity:.7}
          .rel-alertas{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
          .rel-alerta{padding:6px 12px;border-radius:999px;font-size:13px;background:rgba(227,181,69,.2)}
          .rel-alerta.info{background:rgba(111,169,203,.2)}
          .rel-neg{color:#c0463c}.rel-pos{color:#2f8f4e}`;
        document.head.appendChild(s);
    }

    /* ---------- avisos de fonte ---------- */
    function avisos(extra) {
        const pagina = raiz();
        if (!pagina) return;
        let box = document.getElementById("rel-aviso");
        if (!box) {
            box = el("div"); box.id = "rel-aviso";
            const abas = q(pagina, ".abas");
            if (abas) abas.parentNode.insertBefore(box, abas); else pagina.appendChild(box);
        }
        limpar(box);
        const itens = [];
        if (rel && rel.fontes) {
            Object.entries(rel.fontes).forEach(([k, f]) => { if (f && f.ok === false) itens.push([TXT_FONTE[k] || k, f.erro]); });
        }
        (extra || []).forEach((x) => itens.push(x));
        itens.forEach(([nome, erro]) => {
            const p = el("div");
            p.appendChild(el("b", null, `${nome} indisponível`));
            p.appendChild(document.createTextNode(erro ? `: ${erro}` : ""));
            box.appendChild(p);
        });
    }

    /* ---------- estado de carregamento / erro ---------- */
    function marcar(valor) {
        const p = aba("producao"), f = aba("financeiro"), x = aba("exportacao");
        [[p, /^(Produção|Área|Receita|Eficiência|Produtividade)/], [f, /^(Receita|Despesas|Resultado|A receber)/],
         [x, /^(Lotes|Volume|Preço|Destinos|Países|Variação|Exportado)/]].forEach(([esc, re]) => {
            if (!esc) return;
            esc.querySelectorAll(".cards span").forEach((sp) => {
                if (sp.children.length || !re.test(sp.textContent.trim())) return;
                const pai = sp.parentElement, forte = pai && pai.querySelector(":scope > strong"), peq = pai && pai.querySelector(":scope > small, :scope > p");
                if (forte) forte.textContent = valor;
                if (peq) peq.textContent = "";
            });
        });
    }

    /* =========================== PRODUÇÃO =========================== */
    function filtros() {
        const p = aba("producao");
        if (!p) return;
        const sels = p.querySelectorAll(".filtros select");
        const selPeriodo = sels[0], selLavoura = sels[1], selGrafico = q(p, ".select-pequeno");
        [selPeriodo, selGrafico].forEach((s) => {
            if (!s || s.dataset.rel) return;
            s.dataset.rel = "1";
            limpar(s);
            MESES_OPCOES.forEach(([m, t]) => { const o = el("option", null, t); o.value = m; if (m === meses) o.selected = true; s.appendChild(o); });
            s.addEventListener("change", () => { meses = Number(s.value); [selPeriodo, selGrafico].forEach((o) => { if (o) o.value = String(meses); }); desenharProducao(); });
        });
        if (selLavoura && rel) {
            const atual = selLavoura.value;
            limpar(selLavoura);
            const todas = el("option", null, "Todas as lavouras"); todas.value = ""; selLavoura.appendChild(todas);
            [...new Set(rel.producao.por_lavoura.map((l) => l.nome))].forEach((n) => { const o = el("option", null, n); o.value = n; selLavoura.appendChild(o); });
            selLavoura.value = [...selLavoura.options].some((o) => o.value === atual) ? atual : "";
            if (!selLavoura.dataset.rel) {
                selLavoura.dataset.rel = "1";
                selLavoura.addEventListener("change", () => { lavoura = selLavoura.value; desenharProducao(); });
            }
        }
        const btn = q(p, ".btn-filtro");
        if (btn && !btn.dataset.rel) { btn.dataset.rel = "1"; btn.addEventListener("click", () => desenharProducao()); }
    }

    function desenharProducao() {
        const p = aba("producao");
        if (!p || !rel) return;
        const pr = rel.producao, ex = rel.exportacao;
        const usd = pr.receita_usd, brl = pr.receita_brl;
        cartao(p, /^(Produção total|Produção prevista)/, pr.toneladas != null ? `${nf(pr.toneladas)} ton` : "—",
            pr.toneladas != null ? `${seta(pr.variacao_pct)} ${pr.variacao_pct != null ? "vs ano anterior · " : ""}IBGE PAM` : "Sem dados do IBGE", `Produção prevista${pr.ano ? " " + pr.ano : ""}`);
        cartao(p, /^Área cultivada/, pr.area_ha != null ? `${nf(pr.area_ha)} ha` : "—", pr.area_ano ? `${rel.local || ""} · IBGE ${pr.area_ano}` : "Sem dados do IBGE");
        cartao(p, /^(Receita gerada|Receita potencial)/, brl != null ? compacto(brl) : usd != null ? `US$ ${nf(usd / 1e6, 2)} mi` : "—",
            usd != null ? `Preço ComexStat US$ ${nf(rel.exportacao ? rel.exportacao.preco_usd_kg : 0, 2)}/kg${rel.cambio ? ` × PTAX ${nf(rel.cambio.brl_por_usd, 2)}` : ""}` : "Sem dados de preço", "Receita potencial da safra");
        cartao(p, /^(Eficiência média|Produtividade)/, pr.produtividade_kg_ha != null ? `${nf(pr.produtividade_kg_ha / 1000, 1)} t/ha` : "—", "Rendimento previsto (IBGE)", "Produtividade prevista");

        /* gráfico: exportação mensal (ComexStat) x mesmo mês do ano anterior */
        const g = q(p, ".grafico-card");
        if (g) {
            const h2 = q(g, "h2"), sub = q(g, ".card-topo p");
            if (h2) h2.textContent = "Exportações mensais";
            if (sub) sub.textContent = ex ? `Toneladas embarcadas — ${rel.produto || "Uva"} · ComexStat (${ex.escopo_destinos || "PE e BA"})` : "ComexStat indisponível";
            const serie = ex ? ex.serie.slice(-meses) : [];
            const soma = serie.reduce((s, x) => s + x.ton, 0);
            const somaAnt = serie.reduce((s, x) => s + (x.ton_ano_anterior || 0), 0);
            const vals = g.querySelectorAll(".valores-grafico > div");
            if (vals[0]) { q(vals[0], "span").textContent = `Exportado (${meses} meses)`; q(vals[0], "strong").textContent = ex ? `${nf(soma)} ton` : "—"; }
            if (vals[1]) { q(vals[1], "span").textContent = "Mesmo período, ano anterior"; q(vals[1], "strong").textContent = ex ? `${nf(somaAnt)} ton` : "—"; }
            const area = q(g, ".grafico-barras");
            if (area) {
                limpar(area);
                const max = Math.max(1, ...serie.map((x) => Math.max(x.ton, x.ton_ano_anterior || 0)));
                serie.forEach((x) => {
                    const grupo = el("div", "grupo");
                    const b1 = el("div", "barra producao"), b2 = el("div", "barra meta-barra");
                    b1.style.height = `${Math.max(2, (x.ton / max) * 100)}%`; b1.title = `${x.rotulo}/${x.ano}: ${nf(x.ton)} ton`;
                    b2.style.height = `${Math.max(2, ((x.ton_ano_anterior || 0) / max) * 100)}%`;
                    b2.title = x.ton_ano_anterior != null ? `${x.rotulo}/${x.ano - 1}: ${nf(x.ton_ano_anterior)} ton` : "Sem dado do ano anterior";
                    grupo.append(b1, b2, el("small", null, x.rotulo));
                    area.appendChild(grupo);
                });
                if (!serie.length) area.appendChild(el("p", "rel-nota", "Sem dados de exportação para o período."));
            }
        }

        /* produção por lavoura: cadastro (área × t/ha) */
        const lista = q(p, ".lista-producao");
        if (lista) {
            const card = lista.closest(".card");
            const t = card && q(card, "h2"), s = card && q(card, ".card-topo p");
            if (t) t.textContent = "Produção estimada por lavoura";
            if (s) s.textContent = "Área × produtividade esperada do seu cadastro de lavouras";
            limpar(lista);
            const itens = pr.por_lavoura.filter((l) => !lavoura || l.nome === lavoura);
            const max = Math.max(1, ...itens.map((l) => l.ton));
            itens.forEach((l) => {
                const it = el("div", "item-producao"), nome = el("div", "item-nome"), linha = el("div", "linha"), barra = el("span");
                nome.append(el("span", null, `${l.nome}${l.talhao ? " · " + l.talhao : ""}`), el("strong", null, `${nf(l.ton, 0)} ton`));
                barra.style.width = `${(l.ton / max) * 100}%`;
                linha.appendChild(barra);
                it.append(nome, linha);
                lista.appendChild(it);
            });
            if (!itens.length) lista.appendChild(el("p", "rel-nota", "Nenhuma lavoura cadastrada (veja Backend/lavouras.json)."));
        }
    }

    /* =========================== FINANCEIRO =========================== */
    function desenharFinanceiro() {
        const f = aba("financeiro");
        if (!f || !rel) return;
        const c = rel.financeiro.cards, n = rel.financeiro.meses;
        cartao(f, /^Receita/, BRL(c.receita), c.receita_var_pct != null ? `${seta(c.receita_var_pct)} vs ${n} meses anteriores` : `Recebido nos últimos ${n} meses`, `Receita (últimos ${n} meses)`);
        cartao(f, /^Despesas/, BRL(c.despesas), c.despesas_pct_receita != null ? `${nf(c.despesas_pct_receita, 1)}% da receita` : `Pagas nos últimos ${n} meses`, `Despesas (últimos ${n} meses)`);
        cartao(f, /^Resultado/, BRL(c.resultado), c.resultado_var_pct != null ? `${seta(c.resultado_var_pct)} vs período anterior` : "Receita − despesas");
        cartao(f, /^A receber/, BRL(c.a_receber_30d), `${c.a_receber_qtd} lançamento${c.a_receber_qtd === 1 ? "" : "s"} nos próximos 30 dias`);
        const linha = q(f, ".resumo-financeiro .financeiro-linha");
        if (linha) {
            const v = linha.querySelectorAll("strong");
            [c.receita, c.despesas, c.resultado].forEach((x, i) => { if (v[i]) v[i].textContent = compacto(x); });
        }
        const bloco = q(f, ".resumo-financeiro");
        if (bloco) {
            let nota = bloco.querySelector(".rel-nota");
            if (!nota) { nota = el("p", "rel-nota"); bloco.appendChild(nota); }
            nota.textContent = rel.financeiro.total_movimentacoes
                ? `Baseado nas ${rel.financeiro.total_movimentacoes} movimentações registradas na tela Financeiro.`
                : "Nenhuma movimentação registrada ainda: lance receitas e despesas na tela Financeiro.";
        }
    }

    /* =========================== EXPORTAÇÃO =========================== */
    function demandaRotulo(v) { return v == null ? ["Novo destino", ""] : v >= 5 ? ["Alta", "texto-verde"] : v <= -5 ? ["Baixa", "rel-neg"] : ["Estável", ""]; }

    function desenharExportacao() {
        const x = aba("exportacao");
        if (!x || !rel) return;
        const ex = rel.exportacao;
        if (!ex) {
            cartao(x, /^(Lotes|Exportado)/, "—", "ComexStat indisponível", "Exportado (12 meses)");
            cartao(x, /^(Volume|Variação)/, "—", "", "Variação anual");
            cartao(x, /^Preço médio/, "—", "");
            cartao(x, /^(Destinos|Países)/, "—", "", "Países de destino");
            return;
        }
        const d = ex.destinos;
        cartao(x, /^(Lotes ativos|Exportado)/, `${nf(ex.ton_12m, 0)} ton`, `até ${mesBR(ex.fim)}`, "Exportado (12 meses)");
        cartao(x, /^(Volume disponível|Variação)/, ex.var_volume_pct != null ? seta(ex.var_volume_pct) : "—", `${nf(ex.ton_12m_anterior, 0)} ton nos 12 meses anteriores`, "Variação anual");
        cartao(x, /^Preço médio/, ex.preco_brl_kg != null ? `R$ ${nf(ex.preco_brl_kg, 2)}/kg` : ex.preco_usd_kg != null ? `US$ ${nf(ex.preco_usd_kg, 2)}/kg` : "—",
            ex.preco_usd_kg != null ? `US$ ${nf(ex.preco_usd_kg, 2)}/kg FOB${rel.cambio ? ` · PTAX ${nf(rel.cambio.brl_por_usd, 2)}` : ""}` : "");
        cartao(x, /^(Destinos|Países)/, d ? String(d.total_paises) : "—", d ? `Maior: ${d.destinos[0].pais}` : "Sem dados por país", "Países de destino");

        /* "lote" -> resumo oficial do produto */
        const lote = q(x, ".lote-card");
        if (lote) {
            const nl = q(lote, ".numero-lote"), h2 = q(lote, "h2"), sub = q(lote, ".lote-cabecalho p"), st = q(lote, ".status");
            if (nl) nl.textContent = "COMEX STAT · MDIC";
            if (h2) h2.textContent = rel.produto || "Uva";
            if (sub) sub.textContent = `Exportações do Vale do São Francisco (${ex.escopo_destinos || "PE e BA"}) — 12 meses`;
            if (st) st.textContent = "Dados oficiais";
            const dem = d ? demandaRotulo(d.var_total_pct != null ? d.var_total_pct : ex.var_volume_pct) : demandaRotulo(ex.var_volume_pct);
            cartao(lote, /^Produto/, rel.produto || "Uva", undefined);
            cartao(lote, /^Volume/, `${nf(ex.ton_12m, 0)} ton`, undefined);
            cartao(lote, /^Destino/, d ? d.destinos[0].pais : "—", undefined, "Principal destino");
            const fd = cartao(lote, /^Demanda/, dem[0], undefined, "Demanda (volume vs ano anterior)");
            if (fd) fd.className = dem[1];
            cartao(lote, /^Preço/, ex.preco_brl_kg != null ? `R$ ${nf(ex.preco_brl_kg, 2)}/kg` : ex.preco_usd_kg != null ? `US$ ${nf(ex.preco_usd_kg, 2)}/kg` : "—", undefined);
            const prog = q(lote, ".progresso");
            if (prog) {
                if (ex.progresso_ano_pct == null) prog.style.display = "none";
                else {
                    prog.style.display = "";
                    const l = q(prog, ".progresso-topo span"), v = q(prog, ".progresso-topo strong"), b = q(prog, ".barra-progresso span");
                    if (l) l.textContent = `Embarques de ${ex.fim.slice(0, 4)} vs mesmo período de ${Number(ex.fim.slice(0, 4)) - 1}`;
                    if (v) v.textContent = `${nf(ex.progresso_ano_pct, 0)}%`;
                    if (b) b.style.width = `${ex.progresso_ano_pct}%`;
                }
            }
            cartao(lote, /^Previsão de embarque/, mesBR(ex.ultimo_embarque), undefined, "Último mês com embarque");
            const bt = q(lote, ".btn-lote");
            if (bt) bt.style.display = "none";
        }

        /* destinos */
        const cd = q(x, ".destinos"), cdem = q(x, ".demanda");
        const titulo = cd && cd.closest(".card");
        if (titulo) { const h = q(titulo, "h2"), s = q(titulo, ".card-topo p"); if (h) h.textContent = "Principais destinos"; if (s) s.textContent = `Toneladas nos últimos 12 meses${ex.escopo_destinos ? " · " + ex.escopo_destinos : ""}`; }
        const tdem = cdem && cdem.closest(".card");
        if (tdem) { const h = q(tdem, "h2"), s = q(tdem, ".card-topo p"); if (h) h.textContent = "Demanda internacional"; if (s) s.textContent = "Variação do volume contra os 12 meses anteriores"; }
        if (cd) {
            limpar(cd);
            if (!d) cd.appendChild(el("p", "rel-nota", `Destinos indisponíveis${ex.erro_destinos ? ": " + ex.erro_destinos : "."}`));
            else d.destinos.forEach((p) => {
                const it = el("div", "destino"), info = el("div", "destino-info"), mb = el("div", "mini-barra"), b = el("span");
                info.append(el("span", null, p.pais), el("strong", null, `${nf(p.ton, 0)} ton · ${nf(p.pct, 0)}%`));
                b.style.width = `${p.pct}%`; mb.appendChild(b);
                it.append(info, mb); cd.appendChild(it);
            });
        }
        if (cdem) {
            limpar(cdem);
            if (d) d.destinos.forEach((p) => {
                const it = el("div"), forte = el("strong", p.var_pct == null ? "" : p.var_pct >= 0 ? "rel-pos" : "rel-neg", p.var_pct == null ? "novo" : `${p.var_pct >= 0 ? "+" : ""}${nf(p.var_pct, 0)}%`);
                it.append(el("span", null, p.pais), forte); cdem.appendChild(it);
            });
            const av = q(tdem || x, ".aviso-demanda");
            if (av) {
                const v = d ? d.var_total_pct : ex.var_volume_pct;
                av.textContent = v == null ? "Sem base de comparação" : v >= 0 ? `↑ Volume exportado ${nf(v, 0)}% maior que nos 12 meses anteriores` : `↓ Volume exportado ${nf(Math.abs(v), 0)}% menor que nos 12 meses anteriores`;
            }
        }
    }

    /* =========================== CLIMA (Open-Meteo) =========================== */
    function desenharClima() {
        const c = aba("clima");
        if (!c) return;
        if (!clima) {
            cartao(c, /^Condição climática/, "—", "Open-Meteo indisponível");
            return;
        }
        const alertas = clima.alertas || [];
        const risco = alertas.filter((a) => a.severidade && a.severidade !== "info");   // "info" (ex.: chuva prevista) não é risco
        cartao(c, /^Condição climática/, risco.length ? "Atenção" : clima.janela_ideal ? "Favorável" : "Normal",
            risco.length ? risco[0].mensagem : alertas.length ? alertas[0].mensagem : clima.janela_ideal ? "Janela ideal de colheita prevista" : "Sem alertas nos próximos dias");

        let card = document.getElementById("rel-clima-previsao");
        if (!card) { card = el("article", "card"); card.id = "rel-clima-previsao"; c.appendChild(card); }
        limpar(card);
        const topo = el("div", "card-topo"), tt = el("div");
        tt.append(el("h2", null, "Previsão para os próximos 7 dias"), el("p", null, `Open-Meteo · ${rel && rel.local ? rel.local : "sua região"}`));
        topo.appendChild(tt); card.appendChild(topo);

        const dias = clima.dias || [];
        const chuva = dias.reduce((s, d) => s + (d.chuva_mm || 0), 0);
        const tmax = Math.max(...dias.map((d) => (d.tmax == null ? -99 : d.tmax)));
        const resumo = el("div", "rel-resumo");
        const j = clima.janela_ideal;
        resumo.append(
            el("span", null, j ? `Janela ideal: ${j.inicio.slice(8, 10)}/${j.inicio.slice(5, 7)} a ${j.fim.slice(8, 10)}/${j.fim.slice(5, 7)} (${j.dias} dia${j.dias > 1 ? "s" : ""})` : "Nenhuma janela ideal nos próximos 7 dias"),
            el("span", null, `Chuva prevista: ${nf(chuva)} mm`),
            el("span", null, `Máxima da semana: ${tmax > -99 ? nf(tmax, 0) + "°C" : "—"}`));
        card.appendChild(resumo);

        const wrap = el("div", "rel-tabela-wrap"), tb = el("table", "rel-tabela"), th = el("thead"), tr = el("tr");
        ["Dia", "Condição", "Mín / Máx", "Umidade", "Chuva", "Prob. chuva"].forEach((t) => tr.appendChild(el("th", null, t)));
        th.appendChild(tr); tb.appendChild(th);
        const body = el("tbody");
        dias.forEach((d) => {
            const r = el("tr"), dt = new Date(d.data + "T12:00:00");
            const dia = `${dt.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "")} ${d.data.slice(8, 10)}/${d.data.slice(5, 7)}`;
            [dia, d.condicao || "—", `${d.tmin != null ? nf(d.tmin, 0) : "—"}° / ${d.tmax != null ? nf(d.tmax, 0) : "—"}°`,
                d.umidade_media != null ? `${nf(d.umidade_media, 0)}%` : "—", `${nf(d.chuva_mm || 0)} mm`, d.prob_chuva != null ? `${nf(d.prob_chuva, 0)}%` : "—"]
                .forEach((t) => r.appendChild(el("td", null, t)));
            body.appendChild(r);
        });
        tb.appendChild(body); wrap.appendChild(tb); card.appendChild(wrap);
        if (alertas.length) {
            const al = el("div", "rel-alertas");
            alertas.forEach((a) => al.appendChild(el("span", "rel-alerta " + (a.severidade || ""), `${a.titulo}: ${a.mensagem}`)));
            card.appendChild(al);
        }
        card.appendChild(el("p", "rel-fonte", "Previsão do modelo Open-Meteo para a coordenada configurada; os limites da janela ideal são provisórios (valide com o agrônomo)."));
    }

    /* =========================== CSV =========================== */
    function baixarCSV() {
        if (!rel) return;
        const L = [["Seção", "Indicador", "Valor", "Fonte"]];
        const pr = rel.producao, ex = rel.exportacao;
        L.push(["Produção", "Produção prevista (ton)", pr.toneladas, "IBGE PAM"], ["Produção", "Área (ha)", pr.area_ha, "IBGE PAM"],
            ["Produção", "Receita potencial (R$)", pr.receita_brl, "ComexStat x PTAX"]);
        pr.por_lavoura.forEach((l) => L.push(["Lavoura", `${l.nome} (ton)`, l.ton, "Cadastro de lavouras"]));
        if (ex) {
            ex.serie.forEach((s) => L.push(["Exportação mensal", `${s.mes} (ton)`, s.ton, "ComexStat"]));
            L.push(["Exportação", "Volume 12 meses (ton)", ex.ton_12m, "ComexStat"], ["Exportação", "Preço US$/kg", ex.preco_usd_kg, "ComexStat"]);
            if (ex.destinos) ex.destinos.destinos.forEach((d) => L.push(["Destino", `${d.pais} (ton)`, d.ton, "ComexStat"], ["Demanda", `${d.pais} (var. %)`, d.var_pct, "ComexStat"]));
        }
        const c = rel.financeiro.cards;
        L.push(["Financeiro", "Receita (R$)", c.receita, "Financeiro do produtor"], ["Financeiro", "Despesas (R$)", c.despesas, "Financeiro do produtor"], ["Financeiro", "Resultado (R$)", c.resultado, "Financeiro do produtor"]);
        if (clima) (clima.dias || []).forEach((d) => L.push(["Clima", `${d.data} mín/máx (°C)`, `${d.tmin}/${d.tmax}`, "Open-Meteo"], ["Clima", `${d.data} chuva (mm)`, d.chuva_mm, "Open-Meteo"]));
        const csv = L.map((l) => l.map((v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`).join(";")).join("\r\n");
        const a = el("a");
        a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
        a.download = `relatorio-safra-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a); a.click(); a.remove();
    }

    /* =========================== carga =========================== */
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
        css(); marcar("…");
        const extra = [];
        const [r, c] = await Promise.allSettled([api("/produtor/relatorios"), api("/produtor/clima")]);
        if (r.status === "fulfilled") rel = r.value; else { rel = null; extra.push(["Relatórios", r.reason.message]); marcar("—"); }
        if (c.status === "fulfilled") clima = c.value; else { clima = null; extra.push(["Open-Meteo", c.reason.message]); }
        avisos(extra);
        if (rel) { filtros(); desenharProducao(); desenharFinanceiro(); desenharExportacao(); }
        desenharClima();
    }

    function iniciar() {
        if (!raiz()) return;
        [q(raiz(), ".btn-principal"), q(aba("exportacao"), ".btn-secundario")].forEach((b) => { if (b && !b.dataset.rel) { b.dataset.rel = "1"; b.addEventListener("click", baixarCSV); } });
        carregar();
        setInterval(carregar, 10 * 60 * 1000);
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
