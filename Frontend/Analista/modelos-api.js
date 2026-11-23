/* ================= modelos-api.js (Analista > Inicial e Modelos) =================
   Preenche os blocos de MODELOS com o registro real dos treinos (GET /analista/modelos):
     - Inicial: card "Modelos ativos" e lista "Status dos modelos"
     - Modelos: cartões-resumo, filtros e os cartões de cada modelo
   Os elementos são localizados pelo texto/estrutura já existentes no Analista.html (nenhuma edição de HTML).
   Se a API falhar, os números fixos antigos NÃO aparecem: a tela mostra "—".
*/
(function () {
    const BASE = (window.SAFRA_API_ANALISTA || "http://localhost:8000").replace(/\/$/, "");
    const INTERVALO_MS = 30000;

    const norm = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const NOME_PARA_ID = {
        "previsao de produtividade": "produtividade", "previsao climatica": "clima",
        "estimativa de colheita": "colheita", "previsao de preco": "preco",
        "qualidade da producao": "qualidade", "necessidade de irrigacao": "irrigacao"
    };
    const CLASSE_STATUS = { ativo: "ativo-status", atencao: "atencao-status", treinando: "treinamento-status", planejado: "planejado-status" };
    const TIPO_PARA_ID = { "produtividade": "produtividade", "clima": "clima", "colheita": "colheita", "preco": "preco", "irrigacao": "irrigacao", "qualidade": "qualidade" };
    const STATUS_FILTRO = { "ativo": "ativo", "em treinamento": "treinando", "em atencao": "atencao", "planejado": "planejado" };

    const nf = (v, casas = 1) => v === null || v === undefined ? "—"
        : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
    const pct = (v) => v === null || v === undefined ? "—" : `${nf(v)}%`;

    const $inicial = () => document.getElementById("analista.inicial");
    const $modelos = () => document.getElementById("analista.modelos");
    let dados = null;                 // última resposta (ou null se indisponível)

    /* ---------- estilos extras (status "Planejado" e painel de detalhes) ---------- */
    function injetarEstilos() {
        if (document.getElementById("modelos-api-css")) return;
        const st = document.createElement("style");
        st.id = "modelos-api-css";
        st.textContent =
            ".status.planejado-status{background:#eceee9;color:#5f6d68}" +
            ".modelo-detalhes{margin-top:14px;padding-top:12px;border-top:1px solid #e6e8e2;font-size:13px;color:#4b5a55;display:grid;gap:6px}" +
            ".modelo-detalhes b{color:#1f2d28;font-weight:600}" +
            ".modelo-detalhes .aviso{color:#a15c00}";
        document.head.appendChild(st);
    }

    /* ---------- utilidades ---------- */
    function cartaoResumo(raiz, rotulo) {
        if (!raiz) return null;
        for (const sp of raiz.querySelectorAll("span")) {
            if (norm(sp.textContent) === rotulo) {
                const box = sp.parentElement;
                const strong = box.querySelector("strong"), small = box.querySelector("small");
                if (strong && small) return { strong, small };
            }
        }
        return null;
    }
    const idDoNome = (el) => NOME_PARA_ID[norm(el && el.textContent)] || null;

    function quando(iso) {
        if (!iso) return null;
        const d = new Date(iso), h = new Date();
        const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        const n = Math.round((dia(h) - dia(d)) / 86400000);
        return n <= 0 ? "Atualizado hoje" : n === 1 ? "Atualizado ontem" : `Atualizado há ${n} dias`;
    }

    function textoRodape(m) {
        if (m.status === "treinando") return "Atualização em andamento";
        if (m.status === "planejado") return "Ainda não implementado";
        if (m.erro) return "Último treino falhou";
        return quando(m.treinado_em) || "Sem treino";
    }

    /* ---------- estado "sem dados" (nunca mostrar número inventado) ---------- */
    function resumoVazio(texto) {
        const i = cartaoResumo($inicial(), "modelos ativos");
        if (i) { i.strong.textContent = "—"; i.small.textContent = texto; }
        const r = $modelos();
        [["modelos ativos"], ["precisao media"], ["em treinamento"], ["modelos atualizados"]].forEach(([k]) => {
            const c = cartaoResumo(r, k);
            if (c) { c.strong.textContent = "—"; c.small.textContent = texto; c.small.className = ""; }
        });
        document.querySelectorAll("#analista\\.inicial .modelo-status").forEach(row => {
            const info = row.querySelector(".modelo-info span"), pr = row.querySelector(".modelo-precisao");
            if (info) info.textContent = "—";
            if (pr) { pr.querySelector("strong").textContent = "—"; pr.querySelector("span").textContent = texto; pr.classList.remove("atencao"); }
        });
        document.querySelectorAll("#analista\\.modelos .modelo-card").forEach(card => pintarCartaoVazio(card, texto));
    }

    function pintarCartaoVazio(card, texto) {
        const st = card.querySelector(".modelo-topo .status");
        if (st) { st.className = "status atencao-status"; st.textContent = "● Indisponível"; }
        const vals = card.querySelectorAll(".modelo-dados strong");
        vals.forEach(v => { v.textContent = "—"; });
        const pi = card.querySelector(".progresso-info");
        if (pi) { pi.querySelector("span").textContent = "Desempenho"; pi.querySelector("strong").textContent = "—"; }
        const barra = card.querySelector(".barra span"); if (barra) barra.style.width = "0%";
        const f = card.querySelector(".modelo-footer small"); if (f) f.textContent = texto;
    }

    /* ---------- Inicial ---------- */
    function preencherInicial(d) {
        const raiz = $inicial();
        if (!raiz) return;
        const c = cartaoResumo(raiz, "modelos ativos");
        if (c) { c.strong.textContent = nf(d.resumo.ativos, 0); c.small.textContent = d.resumo.situacao; }

        const lista = raiz.querySelector(".status-card");
        if (!lista) return;
        const linhas = {};
        lista.querySelectorAll(".modelo-status").forEach(row => {
            const id = idDoNome(row.querySelector(".modelo-info strong"));
            if (id) linhas[id] = row;
        });
        // o modelo de irrigação não tinha linha: cria a partir da primeira (com o ícone do cartão da página Modelos)
        if (!linhas.irrigacao && Object.values(linhas)[0]) {
            const nova = Object.values(linhas)[0].cloneNode(true);
            nova.querySelector(".modelo-info strong").textContent = "Necessidade de irrigação";
            const cards = [...document.querySelectorAll("#analista\\.modelos .modelo-card")];
            const cardIrr = cards.find(x => idDoNome(x.querySelector("h2")) === "irrigacao");
            const svgIrr = cardIrr && cardIrr.querySelector(".modelo-icone svg");
            const alvo = nova.querySelector(".mini-icone svg");
            if (svgIrr && alvo) alvo.replaceWith(svgIrr.cloneNode(true));
            lista.appendChild(nova);
            linhas.irrigacao = nova;
        }
        const ordem = d.modelos.filter(m => linhas[m.id]).sort((a, b) =>
            (a.status === "planejado") - (b.status === "planejado"));   // modelos treinados primeiro
        ordem.forEach(m => {
            const row = linhas[m.id];
            lista.appendChild(row);
            const info = row.querySelector(".modelo-info span");
            if (info) info.textContent = m.versao ? `Modelo ${m.versao}` : m.status_rotulo;
            const pr = row.querySelector(".modelo-precisao");
            if (pr) {
                pr.querySelector("strong").textContent = pct(m.precisao);
                pr.querySelector("span").textContent = m.status === "treinando" ? `Treinando ${m.progresso || 0}%` : m.desempenho;
                pr.classList.toggle("atencao", m.status === "atencao");
            }
        });
    }

    /* ---------- Modelos ---------- */
    function preencherResumoModelos(d) {
        const r = $modelos(), s = d.resumo;
        const a = cartaoResumo(r, "modelos ativos");
        if (a) { a.strong.textContent = nf(s.ativos, 0); a.small.textContent = s.situacao; }
        const p = cartaoResumo(r, "precisao media");
        if (p) {
            p.strong.textContent = pct(s.precisao_media);
            if (s.variacao_mes === null || s.variacao_mes === undefined) { p.small.textContent = "Sem histórico de 30 dias"; p.small.className = ""; }
            else if (Math.abs(s.variacao_mes) < 0.05) { p.small.textContent = "Estável no mês"; p.small.className = ""; }
            else {
                p.small.textContent = `${s.variacao_mes >= 0 ? "↑" : "↓"} ${nf(Math.abs(s.variacao_mes))} p.p. no mês`;
                p.small.className = s.variacao_mes >= 0 ? "positivo" : "atencao";
            }
        }
        const t = cartaoResumo(r, "em treinamento");
        if (t) { t.strong.textContent = nf(s.treinando, 0); t.small.textContent = s.treinando ? "Modelos sendo atualizados" : "Nenhum treino em andamento"; }
        const u = cartaoResumo(r, "modelos atualizados");
        if (u) { u.strong.textContent = nf(s.atualizados_7d, 0); u.small.textContent = "Nos últimos 7 dias"; u.small.className = s.atualizados_7d ? "positivo" : ""; }

        const raiz = $modelos();
        const tit = raiz && raiz.querySelector(".atualizacao strong"), txt = raiz && raiz.querySelector(".atualizacao p");
        if (tit && txt) {
            if (!s.ativos && !s.em_atencao && !s.treinando) {
                tit.textContent = "Nenhum modelo treinado ainda";
                txt.textContent = "Execute o treinamento (python -m app.ml.treinar) para gerar as métricas reais.";
            } else if (s.em_atencao) {
                tit.textContent = "Modelos precisam de atenção";
                txt.textContent = "Veja os detalhes de cada modelo em “Ver modelo”.";
            } else {
                tit.textContent = "Modelos operacionais";
                txt.textContent = "Métricas calculadas em testes com dados que o modelo não viu no treino.";
            }
        }
    }

    function preencherCartao(card, m) {
        card.dataset.modeloId = m.id;
        card.dataset.status = m.status;
        card.dataset.precisao = m.precisao === null ? "" : m.precisao;
        card.dataset.treinadoEm = m.treinado_em || "";
        card.style.opacity = m.status === "planejado" ? "0.78" : "";
        const st = card.querySelector(".modelo-topo .status");
        if (st) { st.className = `status ${CLASSE_STATUS[m.status] || "atencao-status"}`; st.textContent = `● ${m.status_rotulo}`; }
        const desc = card.querySelector("p.descricao");
        if (desc && m.descricao) desc.textContent = m.descricao;
        const atencao = m.status === "atencao";       // o HTML antigo deixava o âmbar fixo em alguns cartões
        const vals = card.querySelectorAll(".modelo-dados strong");
        if (vals[0]) { vals[0].textContent = pct(m.precisao); vals[0].classList.toggle("numero-atencao", atencao); }
        if (vals[1]) vals[1].textContent = m.versao || "—";
        const pi = card.querySelector(".progresso-info");
        const treinando = m.status === "treinando";
        if (pi) {
            pi.querySelector("span").textContent = treinando ? "Treinamento" : "Desempenho";
            const forte = pi.querySelector("strong");
            forte.textContent = treinando ? `${m.progresso || 0}%` : m.desempenho;
            forte.classList.toggle("texto-atencao", atencao);
        }
        const barra = card.querySelector(".barra span");
        if (barra) { barra.style.width = `${treinando ? (m.progresso || 0) : (m.precisao || 0)}%`; barra.classList.toggle("barra-atencao", atencao); }
        const f = card.querySelector(".modelo-footer small");
        if (f) { f.textContent = textoRodape(m); f.title = m.erro || ""; }
        card._modelo = m;
    }

    function preencherCartoes(d) {
        const porId = Object.fromEntries(d.modelos.map(m => [m.id, m]));
        document.querySelectorAll("#analista\\.modelos .modelo-card").forEach(card => {
            const id = idDoNome(card.querySelector("h2"));
            if (id && porId[id]) preencherCartao(card, porId[id]);
            else pintarCartaoVazio(card, "Sem registro");
        });
    }

    /* ---------- painel "Ver modelo" ---------- */
    function linha(rotulo, valor, classe) {
        const p = document.createElement("div");
        if (classe) p.className = classe;
        const b = document.createElement("b"); b.textContent = `${rotulo}: `;
        p.appendChild(b); p.appendChild(document.createTextNode(valor));
        return p;
    }

    const fmtData = (iso) => iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
    const CAMPO = "padding:6px 8px;border:1px solid #cfd5cc;border-radius:8px;font:inherit;background:#fff;color:#1f2d28";

    function simuladorColheita(m) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "margin-top:8px;padding-top:10px;border-top:1px dashed #d8dcd3;display:grid;gap:8px";
        const tit = document.createElement("b"); tit.textContent = "Simular colheita (uva de vinho)";
        const form = document.createElement("div");
        form.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center";
        const sel = document.createElement("select"); sel.style.cssText = CAMPO; sel.setAttribute("aria-label", "Cultivar");
        Object.entries(m.parametros.cultivares).forEach(([id, nome]) => {
            const o = document.createElement("option"); o.value = id; o.textContent = nome; sel.appendChild(o);
        });
        const data = document.createElement("input"); data.type = "date"; data.style.cssText = CAMPO;
        data.setAttribute("aria-label", "Data da poda");
        const h = new Date();
        data.value = `${h.getFullYear()}-${String(h.getMonth() + 1).padStart(2, "0")}-${String(h.getDate()).padStart(2, "0")}`;
        const btn = document.createElement("button"); btn.type = "button"; btn.textContent = "Estimar colheita";
        btn.style.cssText = "padding:7px 14px;border:0;border-radius:8px;background:#1f6b45;color:#fff;font:inherit;font-weight:600;cursor:pointer";
        const rotulo = document.createElement("span"); rotulo.textContent = "Data da poda:"; rotulo.style.color = "#5f6d68";
        form.append(sel, rotulo, data, btn);
        const saida = document.createElement("div"); saida.setAttribute("aria-live", "polite"); saida.style.cssText = "display:grid;gap:6px";
        wrap.append(tit, form, saida);

        const msg = (texto, aviso) => { saida.replaceChildren(); const p = document.createElement("div"); p.textContent = texto; if (aviso) p.className = "aviso"; saida.appendChild(p); };
        btn.addEventListener("click", async () => {
            if (!data.value) { msg("Informe a data da poda.", true); return; }
            btn.disabled = true; msg("Calculando…");
            try {
                const token = sessionStorage.getItem("safra_token") || "";
                const url = `${BASE}/analista/colheita?poda=${encodeURIComponent(data.value)}&cultivar=${encodeURIComponent(sel.value)}`;
                const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
                if (!resp.ok) throw new Error(resp.status === 401 ? "Sessão expirada" : resp.status === 403 ? "Sem acesso" : `API ${resp.status}`);
                const j = await resp.json();
                if (!j.ok) { msg(j.erro, true); return; }
                saida.replaceChildren();
                if (j.situacao === "atingida") {
                    saida.appendChild(linha("Soma térmica", `já atingida em ${fmtData(j.colheita_estimada)} (colheita ${j.dias_restantes < 0 ? "no passado" : "próxima"})`));
                } else {
                    const jan = j.janela ? ` · janela de ${fmtData(j.janela.inicio)} a ${fmtData(j.janela.fim)}` : "";
                    const quando = j.dias_restantes >= 0 ? `em ${nf(j.dias_restantes, 0)} dias` : `há ${nf(-j.dias_restantes, 0)} dias`;
                    saida.appendChild(linha("Colheita estimada", `${fmtData(j.colheita_estimada)} (${quando})${jan}`));
                }
                saida.appendChild(linha("Soma térmica", `${nf(j.gd_acumulado, 0)} de ${nf(j.gd_alvo, 0)} graus-dia (${nf(j.progresso_pct)}%), base ${nf(j.tbase, 0)} °C`));
                if (j.incerteza_dias !== null && j.incerteza_dias !== undefined)
                    saida.appendChild(linha("Incerteza", `±${nf(Math.ceil(j.incerteza_dias), 0)} dias (cobre ~80% dos ciclos do teste)`));
                saida.appendChild(linha("Parâmetros", j.fonte_parametros));
                (j.avisos || []).forEach(a => saida.appendChild(linha("Atenção", a, "aviso")));
            } catch (e) {
                msg(e instanceof TypeError ? `API fora do ar (${BASE}).` : e.message, true);
            } finally { btn.disabled = false; }
        });
        return wrap;
    }

    function alternarDetalhes(card) {
        const ja = card.querySelector(".modelo-detalhes");
        if (ja) { ja.remove(); return; }
        const m = card._modelo;
        const box = document.createElement("div");
        box.className = "modelo-detalhes";
        if (!m) { box.appendChild(linha("Situação", "sem dados do registro")); }
        else if (m.status === "planejado") {
            box.appendChild(linha("Situação", "modelo planejado para uma próxima fase; ainda não há treino nem métricas."));
        } else {
            box.appendChild(linha("Algoritmo", m.algoritmo || "—"));
            box.appendChild(linha("Fonte dos dados", m.fonte_dados || "—"));
            const me = m.metrica || {};
            const casas = Math.abs(me.valor) < 10 ? 3 : 0;
            if (me.valor !== null && me.valor !== undefined)
                box.appendChild(linha(`Erro médio (${me.nome})`, `${nf(me.valor, casas)} — linha de base: ${nf(me.baseline, casas)} (quanto menor, melhor)`));
            if (me.melhora_pct !== null && me.melhora_pct !== undefined)
                box.appendChild(linha("Ganho sobre a linha de base", `${nf(me.melhora_pct)}% menos erro (define o rótulo: ≥25% Excelente, ≥10% Bom)`));
            if (m.amostras && m.amostras.treino)
                box.appendChild(linha("Amostras", `${nf(m.amostras.treino, 0)} para treino · ${nf(m.amostras.teste, 0)} para teste`));
            if (m.parametros && m.parametros.periodo)
                box.appendChild(linha("Período dos dados", m.parametros.periodo
                    .replace(/(\d{4})-(\d{2})-(\d{2})/g, "$3/$2/$1").replace(/\b(\d{4})-(\d{2})\b/g, "$2/$1")));
            if (m.parametros && m.parametros.kc !== undefined) box.appendChild(linha("Kc (provisório)", nf(m.parametros.kc, 2)));
            if (m.parametros && Array.isArray(m.parametros.previsoes) && m.parametros.previsoes.length) {
                m.parametros.previsoes.forEach(pv => {
                    const d = pv.unidade === "kg/ha" ? 0 : 2;
                    box.appendChild(linha(`Previsão · ${pv.rotulo}`, `${nf(pv.valor, d)} ${pv.unidade} (faixa ${nf(pv.faixa[0], d)} a ${nf(pv.faixa[1], d)})`));
                });
                box.appendChild(linha("Faixa", "± o erro P80 do teste (cobre ~80% dos casos avaliados)"));
            }
            box.appendChild(linha("Precisão", "100% − erro percentual médio (MAPE) no período de teste"));
            if (m.id === "produtividade")
                box.appendChild(linha("Atenção", "é 1 valor por safra (poucos pontos) e o IBGE revisa os anos mais recentes. Use como referência, não como meta.", "aviso"));
            if (m.id === "preco")
                box.appendChild(linha("Atenção", "é preço de EXPORTAÇÃO (US$/kg FOB; mistura destinos, variedades e épocas), não o preço pago ao produtor nem o de mercado interno.", "aviso"));
            if (m.id === "colheita")
                box.appendChild(linha("O que o teste mede", "se a média histórica prevê bem quando a soma térmica será atingida. Não compara com datas reais de colheita (ainda não temos esses registros).", "aviso"));
            if (m.observacao) box.appendChild(linha("Observação", m.observacao, "aviso"));
            if (m.erro) box.appendChild(linha("Erro do último treino", m.erro, "aviso"));
            if (m.id === "colheita" && m.parametros && m.parametros.cultivares) box.appendChild(simuladorColheita(m));
        }
        card.appendChild(box);
    }

    /* ---------- filtros da página Modelos ---------- */
    function selects() { return [...document.querySelectorAll("#analista\\.modelos .filtros select")]; }

    function prepararOpcoes() {
        const [st, tp] = selects();
        const add = (sel, rotulo) => {
            if (sel && ![...sel.options].some(o => norm(o.textContent) === norm(rotulo))) {
                const o = document.createElement("option"); o.textContent = rotulo; sel.appendChild(o);
            }
        };
        add(st, "Planejado"); add(tp, "Qualidade");
    }

    function aplicarFiltros() {
        const [st, tp, ord] = selects();
        const fStatus = st ? STATUS_FILTRO[norm(st.value)] : null;
        const fTipo = tp ? TIPO_PARA_ID[norm(tp.value)] : null;
        const ordem = ord ? norm(ord.value) : "";
        const grid = document.querySelector("#analista\\.modelos .modelos-grid");
        if (!grid) return;
        const cards = [...grid.querySelectorAll(".modelo-card")];
        let visiveis = 0;
        cards.forEach(card => {
            const ok = (!fStatus || card.dataset.status === fStatus) && (!fTipo || card.dataset.modeloId === fTipo);
            card.style.display = ok ? "" : "none";
            if (ok) visiveis++;
        });
        const num = (c) => c.dataset.precisao === "" || c.dataset.precisao === undefined ? null : Number(c.dataset.precisao);
        const dataC = (c) => c.dataset.treinadoEm ? new Date(c.dataset.treinadoEm).getTime() : null;
        const comparar = (get, desc) => (a, b) => {
            const x = get(a), y = get(b);
            if (x === null && y === null) return 0;
            if (x === null) return 1;          // sem valor vai para o fim
            if (y === null) return -1;
            return desc ? y - x : x - y;
        };
        let ordenados = cards;
        if (ordem === "maior precisao") ordenados = [...cards].sort(comparar(num, true));
        else if (ordem === "menor precisao") ordenados = [...cards].sort(comparar(num, false));
        else if (ordem === "mais recente") ordenados = [...cards].sort(comparar(dataC, true));
        ordenados.forEach(c => grid.appendChild(c));

        const total = document.querySelector("#analista\\.modelos .total-modelos");
        if (total) total.textContent = `${visiveis} ${visiveis === 1 ? "modelo" : "modelos"}`;
        let vazio = grid.querySelector(".sem-modelos");
        if (!visiveis) {
            if (!vazio) {
                vazio = document.createElement("p");
                vazio.className = "sem-modelos";
                vazio.style.cssText = "grid-column:1/-1;text-align:center;padding:32px;color:#5f6d68";
                vazio.textContent = "Nenhum modelo encontrado com esses filtros.";
                grid.appendChild(vazio);
            }
        } else if (vazio) vazio.remove();
    }

    /* ---------- ciclo de carga ---------- */
    function desenhar() {
        if (!dados) return;
        preencherInicial(dados);
        preencherResumoModelos(dados);
        preencherCartoes(dados);
        aplicarFiltros();
    }

    let carregando = false;
    async function carregar() {
        if (carregando) return;
        carregando = true;
        try {
            const token = sessionStorage.getItem("safra_token") || "";
            const resp = await fetch(`${BASE}/analista/modelos`, { headers: { Authorization: `Bearer ${token}` } });
            if (resp.status === 401) throw new Error("Sessão expirada");
            if (resp.status === 403) throw new Error("Sem acesso");
            if (!resp.ok) throw new Error(`API ${resp.status}`);
            const d = await resp.json();
            if (!d.ok) { dados = null; resumoVazio("Registro indisponível"); falar("Registro de modelos indisponível", d.erro); return; }
            dados = d;
            desenhar();
        } catch (e) {
            dados = null;
            const fora = e instanceof TypeError;
            resumoVazio(fora ? "API fora do ar" : e.message);
            falar(fora ? "API fora do ar" : "Não foi possível carregar os modelos", fora ? `Inicie o FastAPI (${BASE}).` : e.message);
        } finally { carregando = false; }
    }

    function falar(titulo, texto) {
        const raiz = $modelos();
        const tit = raiz && raiz.querySelector(".atualizacao strong"), txt = raiz && raiz.querySelector(".atualizacao p");
        if (tit) tit.textContent = titulo;
        if (txt) txt.textContent = texto || "";
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (window.__safraModelosIniciado) return;      // evita ouvintes duplicados se o script for carregado 2x
        window.__safraModelosIniciado = true;
        injetarEstilos();
        prepararOpcoes();
        resumoVazio("Carregando…");          // some com os números fixos antigos já no primeiro quadro

        // O analista.js tem um filtro antigo que reage a QUALQUER <select> da página (por texto do cartão).
        // Na fase de captura assumimos os filtros desta página e impedimos que o antigo rode.
        document.addEventListener("change", (e) => {
            const t = e.target;
            if (!t || !t.closest) return;
            if (t.closest("#analista\\.modelos .filtros")) { e.stopPropagation(); aplicarFiltros(); }
            else if (t.closest("#analista\\.modelos .modelo-detalhes")) e.stopPropagation();   // campos do simulador
        }, true);
        document.addEventListener("click", (e) => {
            const alvo = e.target && e.target.closest ? e.target : null;
            if (!alvo) return;
            const botao = alvo.closest("#analista\\.modelos .filtros button");
            if (botao) { e.preventDefault(); e.stopPropagation(); aplicarFiltros(); return; }
            const ver = alvo.closest("#analista\\.modelos .modelo-footer a");
            if (ver) { e.preventDefault(); e.stopPropagation(); alternarDetalhes(ver.closest(".modelo-card")); }
        }, true);

        carregar();
        setInterval(() => { if (!document.hidden) carregar(); }, INTERVALO_MS);
    });
})();
