/* ================= clima-api.js (Produtor) =================
   Preenche o clima da dashboard do Produtor com dados reais do Open-Meteo, via FastAPI
   (GET /produtor/clima), do mesmo jeito que o Analista faz em inicial-api.js.

   Elementos marcados com data-api="..." no produtor.html:
     clima-temp, clima-condicao, clima-umidade, clima-vento, clima-chuva   (card "Clima e condições")
     clima-janela                                                         (caixa "Condições ideais para colheita")
     alertas-clima                                                        (página Alertas > Condições climáticas)
     previsao-24h                                                         (Relatório > Clima > Previsão)

   Para trocar o endereço da API (produção), defina antes deste script:
       <script>window.SAFRA_API_PRODUTOR = "https://minha-api.exemplo.com";</script>
*/
(function () {
    const BASE = (window.SAFRA_API_PRODUTOR || window.SAFRA_API_ANALISTA || "http://localhost:8000").replace(/\/$/, "");
    const INTERVALO_MS = 10 * 60 * 1000;   // a API guarda o resultado por 10 min
    let carregando = false, ultimo = null;

    const todos = (chave) => document.querySelectorAll(`[data-api="${chave}"]`);
    const texto = (chave, valor) => todos(chave).forEach(el => { el.textContent = valor; });
    const nf = (v, casas = 0) => v === null || v === undefined ? "--"
        : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
    const dm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

    function limparPara(el) { while (el.firstChild) el.removeChild(el.firstChild); }

    function linhaAlerta(titulo, mensagem, estilo) {
        const opcao = document.createElement("div");
        opcao.className = "opcao";
        if (estilo) opcao.style.cssText = estilo;
        const caixa = document.createElement("div");
        const t = document.createElement("strong");
        t.textContent = titulo;
        const m = document.createElement("span");
        m.textContent = mensagem;
        caixa.append(t, m);
        opcao.appendChild(caixa);
        return opcao;
    }

    function desenharAlertas(lista) {
        todos("alertas-clima").forEach(caixa => {
            limparPara(caixa);
            if (!lista.length) {
                caixa.appendChild(linhaAlerta("Nenhum alerta no momento", "A previsão dos próximos dias está dentro dos limites."));
                return;
            }
            lista.forEach(a => caixa.appendChild(linhaAlerta(a.titulo, a.mensagem)));
        });
    }

    function escreverJanela(titulo, corpo) {
        todos("clima-janela").forEach(el => {
            limparPara(el);
            const t = document.createElement("strong");
            t.textContent = titulo;
            el.append(t, document.createElement("br"), document.createTextNode(corpo));
        });
    }

    function desenharJanela(j) {
        if (j) escreverJanela("Janela ideal de colheita", `${dm(j.inicio)} a ${dm(j.fim)} (${j.dias} dia${j.dias > 1 ? "s" : ""}).`);
        else escreverJanela("Sem janela ideal", "nos próximos 7 dias.");
    }

    const NS = "http://www.w3.org/2000/svg";
    const DIA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

    function quebrar(el, linhas) {
        limparPara(el);
        linhas.forEach((l, i) => { if (i) el.appendChild(document.createElement("br")); el.appendChild(document.createTextNode(l)); });
    }

    function desenharData() {
        const txt = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Recife", day: "numeric", month: "long", year: "numeric" });
        texto("data-hoje", `Hoje, ${txt}`);
    }

    function desenharColheita(d) {
        const j = d.janela_ideal, hoje = d.dias && d.dias[0] ? d.dias[0].data : null;
        const t = document.querySelector('[data-api="colheita-titulo"]'), p = document.querySelector('[data-api="colheita-texto"]');
        if (!t || !p) return;
        if (j && hoje && j.inicio <= hoje) {
            quebrar(t, ["Janela ideal", "de colheita", "aberta"]);
            p.textContent = `Clima favorável até ${dm(j.fim)} (${j.dias} dia${j.dias > 1 ? "s" : ""}).`;
        } else if (j) {
            quebrar(t, ["Próxima janela", "de colheita"]);
            p.textContent = `Clima favorável de ${dm(j.inicio)} a ${dm(j.fim)}.`;
        } else {
            quebrar(t, ["Sem janela", "ideal"]);
            p.textContent = "Nenhum período favorável nos próximos 7 dias.";
        }
    }

    function desenharPrevisao(dias) {
        const svg = document.querySelector('[data-api="prev-grafico"]'), rot = document.querySelector('[data-api="prev-dias"]');
        if (!svg || !rot) return;
        limparPara(svg); limparPara(rot);
        const v = dias.filter(x => x.tmax != null && x.tmin != null);
        if (!v.length) return;
        const todosV = v.flatMap(x => [x.tmax, x.tmin]);
        const min = Math.min(...todosV) - 1, max = Math.max(...todosV) + 1;
        const X = i => v.length === 1 ? 250 : 15 + i * (470 / (v.length - 1));
        const Y = t => 200 - ((t - min) / (max - min || 1)) * 180;
        [["tmax", null], ["tmin", "#9aa5a0"]].forEach(([k, cor]) => {
            const linha = document.createElementNS(NS, "polyline");
            linha.setAttribute("points", v.map((x, i) => `${X(i).toFixed(0)},${Y(x[k]).toFixed(0)}`).join(" "));
            if (cor) { linha.style.stroke = cor; }
            svg.appendChild(linha);
            v.forEach((x, i) => {
                const c = document.createElementNS(NS, "circle");
                c.setAttribute("cx", X(i).toFixed(0)); c.setAttribute("cy", Y(x[k]).toFixed(0)); c.setAttribute("r", 5);
                if (cor) { c.style.stroke = cor; }
                svg.appendChild(c);
            });
        });
        v.forEach(x => {
            const caixa = document.createElement("div");
            const dt = new Date(x.data + "T12:00:00");
            const a = document.createElement("strong"); a.textContent = `${DIA[dt.getDay()]} ${dm(x.data)}`;
            const b = document.createElement("div"); b.textContent = `${nf(x.tmax)}° / ${nf(x.tmin)}°`;
            const c = document.createElement("div"); c.textContent = `${nf(x.chuva_mm, 1)} mm`;
            c.style.color = "#3478a8";
            caixa.append(a, b, c);
            rot.appendChild(caixa);
        });
    }

    function aplicar(d) {
        ultimo = d;
        desenharData();
        texto("clima-temp-topo", `${nf(d.atual.temperatura)}°C`);
        texto("clima-condicao-topo", d.atual.condicao);
        desenharColheita(d);
        desenharPrevisao(d.dias || []);
        texto("clima-temp", `${nf(d.atual.temperatura)}°C`);
        texto("clima-condicao", d.atual.condicao);
        texto("clima-umidade", `${nf(d.atual.umidade)}%`);
        texto("clima-vento", `${nf(d.atual.vento_kmh)} km/h`);
        texto("clima-chuva", `${nf(d.atual.chuva_mm, 1)} mm`);
        texto("previsao-24h", d.max_proximas_24h == null ? "--°C" : `${nf(d.max_proximas_24h)}°C`);
        desenharJanela(d.janela_ideal);
        desenharAlertas(d.alertas || []);
    }

    /* ---------- "Ver detalhes" do card de colheita: janela ideal dia a dia ---------- */
    function el(tag, estilo, t) {
        const e = document.createElement(tag);
        if (estilo) e.style.cssText = estilo;
        if (t !== undefined) e.textContent = t;
        return e;
    }

    function fecharDetalhes() { const m = document.getElementById("modalColheita"); if (m) m.remove(); }

    function abrirDetalhes() {
        fecharDetalhes();
        const fundo = el("div", "position:fixed;inset:0;background:rgba(20,35,30,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px");
        fundo.id = "modalColheita";
        const caixa = el("div", "background:#fff;border-radius:16px;max-width:880px;width:100%;max-height:90vh;overflow:auto;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,.25);font-family:var(--fonte-texto,inherit)");
        caixa.setAttribute("role", "dialog"); caixa.setAttribute("aria-modal", "true");
        fundo.appendChild(caixa);

        if (!ultimo) {
            caixa.append(el("h2", "margin:0 0 8px;color:#173f35", "Previsão indisponível"),
                el("p", "color:#5f6d68", "Ainda não foi possível carregar a previsão do tempo. Tente novamente em instantes."));
        } else {
            const j = ultimo.janela_ideal, dias = ultimo.dias || [], hoje = dias[0] ? dias[0].data : null;
            const aberta = j && hoje && j.inicio <= hoje;
            caixa.append(el("h2", "margin:0 0 6px;color:#173f35", aberta ? "Janela ideal de colheita aberta" : j ? "Próxima janela de colheita" : "Sem janela ideal nos próximos 7 dias"));
            caixa.append(el("p", "margin:0 0 16px;color:#5f6d68;font-size:14px", j
                ? `Período favorável: ${dm(j.inicio)} a ${dm(j.fim)} (${j.dias} dia${j.dias > 1 ? "s" : ""}). Considera dias secos, com temperatura e umidade dentro das faixas ideais. Fonte: Open-Meteo.`
                : "Nenhum período seco, com temperatura e umidade dentro das faixas ideais. Fonte: Open-Meteo."));

            const tabela = el("table", "width:100%;border-collapse:collapse;font-size:13px");
            const cab = el("tr");
            ["Dia", "Condição", "Máx / Mín", "Umidade", "Chuva", "Colheita"].forEach(c => cab.appendChild(el("th", "text-align:left;padding:9px 10px;background:#f0f6f2;color:#31534a", c)));
            tabela.appendChild(cab);
            dias.forEach(x => {
                const dentro = j && x.data >= j.inicio && x.data <= j.fim;
                const d = new Date(x.data + "T12:00:00");
                const tr = el("tr", dentro ? "background:#f1f8f3" : "");
                const c = (t, e) => tr.appendChild(el("td", "padding:9px 10px;border-top:1px solid #eef3f0;" + (e || ""), t));
                c(`${DIA[d.getDay()]} ${dm(x.data)}`, "font-weight:700");
                c(x.condicao || "--");
                c(`${nf(x.tmax)}° / ${nf(x.tmin)}°`);
                c(x.umidade_media == null ? "--" : `${nf(x.umidade_media)}%`);
                c(`${nf(x.chuva_mm, 1)} mm${x.prob_chuva != null ? ` (${nf(x.prob_chuva)}%)` : ""}`);
                c(dentro ? "Ideal" : "Não ideal", dentro ? "color:#1d7a45;font-weight:700" : "color:#8a5a00");
                tabela.appendChild(tr);
            });
            const rolagem = el("div", "overflow:auto;border:1px solid #e1e9e5;border-radius:10px");
            rolagem.appendChild(tabela);
            caixa.appendChild(rolagem);
        }

        const botoes = el("div", "display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;margin-top:18px");
        const estilo = "padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;text-decoration:none;cursor:pointer;border:1px solid #cfe0d5;background:#fff;color:#218149";
        [["Ver lavouras", "#lavoura"], ["Ver exportação", "#exportacao"], ["Ver alertas", "#alertas"]].forEach(([t, h]) => {
            const a = el("a", estilo, t); a.href = h; a.addEventListener("click", fecharDetalhes); botoes.appendChild(a);
        });
        const x = el("button", estilo.replace("background:#fff;color:#218149", "background:#238349;color:#fff;border-color:#238349"), "Fechar");
        x.type = "button"; x.addEventListener("click", fecharDetalhes); botoes.appendChild(x);
        caixa.appendChild(botoes);

        fundo.addEventListener("mousedown", (e) => { if (e.target === fundo) fecharDetalhes(); });
        document.body.appendChild(fundo);
        x.focus();
    }

    document.addEventListener("click", (e) => { if (e.target.closest(".card-colheita button")) abrirDetalhes(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fecharDetalhes(); });

    function indisponivel(mensagem) {
        // Não deixa valores de exemplo parecerem dados reais.
        ["clima-temp", "previsao-24h"].forEach(k => texto(k, "--°C"));
        texto("clima-umidade", "--%");
        texto("clima-vento", "-- km/h");
        texto("clima-chuva", "-- mm");
        texto("clima-condicao", "Clima indisponível");
        desenharData();
        texto("clima-temp-topo", "--°C");
        texto("clima-condicao-topo", "Clima indisponível");
        [["colheita-titulo", "Previsão indisponível"], ["colheita-texto", "Não foi possível avaliar a colheita."]].forEach(([k, v]) => texto(k, v));
        escreverJanela("Previsão indisponível", "não foi possível avaliar a colheita.");
        todos("alertas-clima").forEach(caixa => {
            limparPara(caixa);
            caixa.appendChild(linhaAlerta("Clima indisponível", mensagem, "color:#8a5a00"));
        });
    }

    async function carregar() {
        if (carregando) return;
        carregando = true;
        try {
            const token = sessionStorage.getItem("safra_token") || "";
            const resp = await fetch(`${BASE}/produtor/clima`, { headers: { Authorization: `Bearer ${token}` } });
            if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
            if (resp.status === 403) throw new Error("Seu perfil não tem acesso a esta informação.");
            if (!resp.ok) {
                const corpo = await resp.json().catch(() => null);
                throw new Error((corpo && corpo.detail) || `A API respondeu ${resp.status}.`);
            }
            aplicar(await resp.json());
        } catch (erro) {
            const fora = erro && erro.name === "TypeError";   // fetch falhou: rede/CORS/servidor desligado
            indisponivel(fora ? `Não foi possível falar com a API (${BASE}). Ela está ligada?` : erro.message);
        } finally {
            carregando = false;
        }
    }

    /* ---------- Cards do topo (IBGE PAM + ComexStat via GET /produtor/resumo) ---------- */
    let carregandoResumo = false;

    function sub(chave, variacao, base, fallback) {
        todos(chave).forEach(el => {
            limparPara(el);
            el.className = "";
            if (variacao == null) { el.textContent = fallback; return; }
            el.className = variacao >= 0 ? "positivo" : "";
            if (variacao < 0) el.style.color = "#b3261e";
            el.appendChild(document.createTextNode(`${variacao >= 0 ? "↑" : "↓"} ${nf(Math.abs(variacao), 1)}% `));
            const em = document.createElement("em");
            em.textContent = base;
            el.appendChild(em);
        });
    }

    const usd = (v) => v >= 1e9 ? `US$ ${nf(v / 1e9, 2)} bi` : v >= 1e6 ? `US$ ${nf(v / 1e6, 1)} mi` : `US$ ${nf(v)}`;

    function aplicarResumo(d) {
        const onde = `${d.produto} · ${d.local}`;
        const fonte = (k) => (d.fontes[k] && d.fontes[k].rotulo) || "";
        const dica = (chave, txt) => todos(chave).forEach(el => { const c = el.closest(".card"); if (c) c.title = txt; });
        texto("card-area-rotulo", `Área colhida (${onde})`);
        if (d.area) {
            texto("card-area", `${nf(d.area.ha)} ha`);
            sub("card-area-sub", d.area.variacao_pct, `em relação a ${d.area.ano - 1}`, `Safra ${d.area.ano}`);
        } else { texto("card-area", "--"); texto("card-area-sub", "IBGE indisponível"); }
        dica("card-area", `Fonte: ${fonte("pam")}. Dado do município, não da sua propriedade.`);
        if (d.producao) {
            texto("card-producao", `${nf(d.producao.toneladas)} ton`);
            sub("card-producao-sub", d.producao.variacao_pct, `em relação à safra ${d.producao.ano - 1}`, `Safra ${d.producao.ano}`);
        } else { texto("card-producao", "--"); texto("card-producao-sub", "Sem estimativa"); }
        dica("card-producao", "Área colhida do último ano × produtividade prevista (tendência das últimas 8 safras do IBGE).");
        if (d.receita) {
            texto("card-receita", usd(d.receita.usd));
            texto("card-receita-sub", `Preço de exportação US$ ${nf(d.receita.preco_usd_kg, 2)}/kg`);
        } else { texto("card-receita", "--"); texto("card-receita-sub", (d.fontes.comex && d.fontes.comex.erro) || "ComexStat indisponível"); }
        dica("card-receita", `Produção estimada × preço médio de exportação dos últimos 12 meses (${fonte("comex")}). Supõe toda a produção exportada.`);
        if (d.produtividade) {
            texto("card-produtividade", `${nf(d.produtividade.kg_ha)} kg/ha`);
            const f = d.produtividade.faixa_kg_ha;
            sub("card-produtividade-sub", d.produtividade.variacao_pct, `safra ${d.produtividade.ano}${f ? ` (± ${nf(f)})` : ""}`, `Safra ${d.produtividade.ano}`);
        } else { texto("card-produtividade", "--"); texto("card-produtividade-sub", "Sem previsão"); }
        dica("card-produtividade", `Tendência linear das últimas 8 safras. Fonte: ${fonte("pam")}.`);
    }

    function resumoIndisponivel() {
        ["card-area", "card-producao", "card-receita", "card-produtividade"].forEach(k => texto(k, "--"));
        ["card-area-sub", "card-producao-sub", "card-receita-sub", "card-produtividade-sub"].forEach(k => texto(k, "Indisponível"));
    }

    async function carregarResumo() {
        if (carregandoResumo) return;
        carregandoResumo = true;
        try {
            const token = sessionStorage.getItem("safra_token") || "";
            const resp = await fetch(`${BASE}/produtor/resumo`, { headers: { Authorization: `Bearer ${token}` } });
            if (!resp.ok) throw new Error(`A API respondeu ${resp.status}.`);
            aplicarResumo(await resp.json());
        } catch (erro) {
            resumoIndisponivel();
        } finally {
            carregandoResumo = false;
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        carregar();
        carregarResumo();
        setInterval(() => { if (!document.hidden) carregar(); }, INTERVALO_MS);
        setInterval(() => { if (!document.hidden) carregarResumo(); }, 6 * 60 * 60 * 1000);
    });
})();