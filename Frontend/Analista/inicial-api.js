/* ================= inicial-api.js (Analista > Inicial) =================
   Preenche a dashboard "Inicial" do Analista com dados reais vindos do FastAPI
   (GET /analista/inicial): sensor ESP32 (ThingSpeak) x clima (INMET, ou Open-Meteo quando não há token).

   Os elementos são marcados com data-api="..." no Analista.html.
   Para trocar o endereço da API (ex.: produção), defina antes deste script:
       <script>window.SAFRA_API_ANALISTA = "https://minha-api.exemplo.com";</script>
*/
(function () {
    const BASE = (window.SAFRA_API_ANALISTA || "http://localhost:8000").replace(/\/$/, "");
    const INTERVALO_MS = 30000;
    const raiz = () => document.getElementById("analista.inicial");

    const $ = (chave) => { const r = raiz(); return r ? r.querySelector(`[data-api="${chave}"]`) : null; };
    const texto = (chave, valor) => { const el = $(chave); if (el) el.textContent = valor; };

    const nf = (v, casas = 1) => v === null || v === undefined ? "—"
        : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
    const sinal = (v, casas = 1) => (v > 0 ? "+" : "") + nf(v, casas);

    let ultimo = null;        // última resposta da API (para redesenhar o gráfico)
    let carregando = false;

    /* ---------- saudação ---------- */
    function saudacao() {
        try {
            const nome = (JSON.parse(sessionStorage.getItem("safra_usuario") || "null") || {}).nome || "";
            const primeiro = nome.trim().split(/\s+/)[0];
            texto("saudacao", primeiro ? `Olá, ${primeiro}!` : "Olá!");
        } catch (e) { texto("saudacao", "Olá!"); }
    }

    /* ---------- nome da fonte de clima ---------- */
    const nomeFonte = (cl) => cl.tipo === "modelo" ? `${cl.rotulo} (modelo)` : cl.rotulo;

    /* ---------- banner ---------- */
    function banner(titulo, mensagem) {
        texto("banner-titulo", titulo);
        texto("banner-texto", mensagem);
    }

    /* ---------- gráfico Sensor x Clima (SVG, linhas quebradas onde faltam dados) ---------- */
    function cores() {
        const cor = (sel, padrao) => {
            const el = raiz() && raiz().querySelector(sel);
            return el ? getComputedStyle(el).backgroundColor : padrao;
        };
        return { sensor: cor(".legenda .ponto.previsao", "#4c9b68"), inmet: cor(".legenda .ponto.producao", "#d98e04") };
    }

    function caminho(valores, X, Y) {
        let d = "", aberto = false;
        valores.forEach((v, i) => {
            if (v === null || v === undefined) { aberto = false; return; }
            d += `${aberto ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)} `;
            aberto = true;
        });
        return d.trim();
    }

    // Uma linha precisa de 2 pontos. Hora com dado e vizinhas vazias vira uma bolinha visível.
    function isolados(valores, X, Y, cor) {
        let out = "";
        valores.forEach((v, i) => {
            if (v === null || v === undefined) return;
            const antes = i > 0 && valores[i - 1] !== null && valores[i - 1] !== undefined;
            const depois = i < valores.length - 1 && valores[i + 1] !== null && valores[i + 1] !== undefined;
            if (!antes && !depois) out += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4.5" fill="${cor}"/>`;
        });
        return out;
    }

    function desenharGrafico() {
        const el = $("grafico");
        if (!el || !ultimo) return;
        const metrica = ($("grafico-metrica") || {}).value || "temperatura";
        const g = ultimo.grafico;
        const unidade = metrica === "temperatura" ? "°C" : "%";
        const sensor = g[`sensor_${metrica}`], inmet = g[`clima_${metrica}`];
        const todos = [...sensor, ...inmet].filter(v => v !== null && v !== undefined);

        if (!todos.length) {
            el.innerHTML = "";
            const p = document.createElement("p");
            p.textContent = "Sem leituras nas últimas 24 horas para exibir.";
            p.style.cssText = "padding:60px 0;text-align:center;color:#5f6d68;";
            el.appendChild(p);
            return;
        }

        const W = Math.max(300, Math.round(el.clientWidth || 600)), H = W < 480 ? 240 : 270;
        const ml = 46, mr = 14, mt = 14, mb = 34, larg = W - ml - mr, alt = H - mt - mb;
        let vmin = Math.min(...todos), vmax = Math.max(...todos);
        if (vmin === vmax) { vmin -= 1; vmax += 1; }
        const folga = (vmax - vmin) * 0.15; vmin -= folga; vmax += folga;
        const n = g.rotulos.length;
        const X = i => ml + (n === 1 ? larg / 2 : (i / (n - 1)) * larg);
        const Y = v => mt + (1 - (v - vmin) / (vmax - vmin)) * alt;
        const c = cores();
        const fonte = 'font-size="12" font-family="Inter, system-ui, sans-serif" fill="#5f6d68"';

        let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Sensor x Clima">`;
        for (let i = 0; i <= 4; i++) {
            const v = vmin + ((vmax - vmin) * i) / 4, y = Y(v);
            svg += `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="#e6e8e2"/>`;
            svg += `<text x="${ml - 8}" y="${y + 4}" text-anchor="end" ${fonte}>${nf(v, 0)}</text>`;
        }
        const passo = W < 480 ? 8 : 4;
        for (let i = 0; i < n; i += passo) {
            svg += `<text x="${X(i)}" y="${H - 10}" text-anchor="${i === 0 ? "start" : "middle"}" ${fonte}>${g.rotulos[i]}</text>`;
        }
        svg += `<path d="${caminho(inmet, X, Y)}" fill="none" stroke="${c.inmet}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
        svg += `<path d="${caminho(sensor, X, Y)}" fill="none" stroke="${c.sensor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
        svg += isolados(inmet, X, Y, c.inmet) + isolados(sensor, X, Y, c.sensor);
        // pontos com dica ao passar o mouse (os textos vêm da própria API, então vão como números formatados)
        [[sensor, c.sensor, "Sensor"], [inmet, c.inmet, nomeFonte(ultimo.fontes.clima)]].forEach(([serie, cor, nome]) => {
            serie.forEach((v, i) => {
                if (v === null || v === undefined) return;
                svg += `<circle cx="${X(i).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="5" fill="${cor}" fill-opacity="0.001" stroke="none"><title>${nome}: ${nf(v)}${unidade} às ${g.rotulos[i]}</title></circle>`;
            });
        });
        svg += "</svg>";
        el.innerHTML = svg;

        const cl = ultimo.fontes.clima;
        texto("legenda-inmet", nomeFonte(cl));
        const tit = $("grafico-sub") && $("grafico-sub").previousElementSibling;
        if (tit) tit.textContent = `Sensor x ${cl.ok ? (cl.id === "inmet" ? "INMET" : cl.rotulo) : "clima"}`;
        texto("grafico-sub", cl.ok
            ? "Últimas 24 horas, por hora (horário de Recife)"
            : "Últimas 24 horas — clima indisponível, mostrando só o sensor");
    }

    /* ---------- alertas ---------- */
    const COR_ALERTA = { critico: "vermelho", atencao: "amarelo", info: "azul", ok: "azul" };
    const SVG_ALERTA = {
        critico: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
        atencao: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
        info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5v.01"/>',
        ok: '<path d="M5 12.5l4.5 4.5L19 7"/>'
    };

    function quando(iso) {
        const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
        return min < 1 ? "Agora" : min < 60 ? `${min} min` : "Hoje";
    }

    function desenharAlertas(lista) {
        const caixa = $("alertas");
        if (!caixa) return;
        caixa.replaceChildren();
        if (!lista.length) {
            const vazio = document.createElement("div");
            vazio.className = "alerta-item";
            vazio.innerHTML = "<div><strong>Nenhum alerta</strong><span>Tudo dentro do esperado</span></div>";
            caixa.appendChild(vazio);
            return;
        }
        lista.slice(0, 5).forEach(a => {
            const item = document.createElement("div");
            item.className = "alerta-item";
            const nivel = COR_ALERTA[a.nivel] ? a.nivel : "info";
            item.innerHTML =
                `<div class="alerta-icon ${COR_ALERTA[nivel]}"><svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SVG_ALERTA[nivel]}</svg></div>` +
                "<div><strong></strong><span></span></div><small></small>";
            // textContent: o conteúdo vem de fontes externas e nunca deve ser interpretado como HTML
            item.querySelector("strong").textContent = a.titulo;
            item.querySelector("span").textContent = a.descricao;
            item.querySelector("small").textContent = quando(a.quando);
            caixa.appendChild(item);
        });
    }

    /* ---------- preenchimento geral ---------- */
    function preencher(d) {
        ultimo = d;
        const ts = d.fontes.thingspeak, cl = d.fontes.clima;

        if (ts.ok && cl.ok) {
            banner("Dados atualizados", cl.tipo === "modelo"
                ? `Sensor ESP32 e ${cl.rotulo} (estimativa de modelo, não é estação) sincronizados.`
                : `Sensor ESP32 e ${cl.rotulo} sincronizados.`);
        }
        else if (ts.ok) banner("Dados parciais", `Clima: ${cl.erro}`);
        else if (cl.ok) banner("Dados parciais", `ThingSpeak: ${ts.erro}`);
        else banner("Fontes indisponíveis", `${ts.erro} · ${cl.erro}`);

        const c = d.cards;
        texto("dados-processados", ts.ok ? nf(c.dados_processados.valor, 0) : "—");
        const desc = c.dados_processados.descartadas;
        texto("dados-descartados", ts.ok
            ? `Leituras válidas em 24 h${desc ? ` · ${nf(desc, 0)} descartadas na limpeza` : ""}`
            : "ThingSpeak indisponível");

        texto("temp-sensor", c.temperatura.sensor === null ? "—" : `${nf(c.temperatura.sensor)}°C`);
        const cmp = c.temperatura.comparacao;
        const compEl = $("temp-comparacao");
        if (compEl) {
            compEl.className = "";
            const parado = c.temperatura.minutos_sem_dados;
            if (c.temperatura.sensor !== null && parado !== null && parado > 15) {
                const h = parado / 60;
                compEl.textContent = "Sensor parado · última leitura há " +
                    (h < 1 ? `${parado} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} dias`);
                compEl.className = "atencao";
            } else if (cmp) {
                compEl.textContent = `${nomeFonte(cl)} ${nf(cmp.clima_temperatura)}°C · Δ ${sinal(cmp.delta_temperatura)}°C (${cmp.hora_local})`;
                if (Math.abs(cmp.delta_temperatura) > 5) compEl.className = "atencao";
            } else {
                compEl.textContent = cl.ok ? "Sem hora em comum com o clima" : "Clima indisponível";
            }
        }

        texto("chuva-24h", c.chuva_24h_mm === null ? "—" : `${nf(c.chuva_24h_mm)} mm`);
        const tituloChuva = $("chuva-24h") && $("chuva-24h").previousElementSibling;
        if (tituloChuva) tituloChuva.textContent = cl.ok ? `Chuva em 24 h (${cl.id === "inmet" ? "INMET" : cl.rotulo})` : "Chuva em 24 h";
        texto("chuva-estacao", !cl.ok ? "Clima indisponível" : cl.tipo === "modelo" ? "Estimativa do modelo" : cl.rotulo);

        const q = d.qualidade;
        texto("q-geral", q ? `${nf(q.geral)}%` : "—");
        texto("q-completos", q ? `${nf(q.completos)}%` : "—");
        texto("q-validos", q ? `${nf(q.validos)}%` : "—");
        texto("q-atualizados", q ? `${nf(q.atualizados)}%` : "—");
        texto("q-rotulo", q ? `● ${q.rotulo}` : "● Sem dados");
        const barra = $("q-barra");
        if (barra) barra.style.width = q ? `${Math.min(100, q.geral)}%` : "0%";

        desenharGrafico();
        desenharAlertas(d.alertas || []);
    }

    async function carregar() {
        if (carregando || !raiz()) return;
        carregando = true;
        const btn = $("atualizar");
        if (btn) btn.disabled = true;
        try {
            const token = sessionStorage.getItem("safra_token") || "";
            const resp = await fetch(`${BASE}/analista/inicial`, { headers: { Authorization: `Bearer ${token}` } });
            if (resp.status === 401) throw new Error("Sessão expirada. Entre novamente.");
            if (resp.status === 403) throw new Error("Seu perfil não tem acesso a esta dashboard.");
            if (!resp.ok) throw new Error(`A API respondeu ${resp.status}.`);
            preencher(await resp.json());
        } catch (erro) {
            const fora = erro instanceof TypeError;   // fetch falhou: rede/CORS/servidor desligado
            banner(fora ? "API fora do ar" : "Não foi possível atualizar",
                   fora ? `Inicie o FastAPI (${BASE}) e recarregue a página.` : erro.message);
        } finally {
            carregando = false;
            if (btn) btn.disabled = false;
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        if (window.__safraInicialIniciado) return;      // evita ouvintes/relógios duplicados
        window.__safraInicialIniciado = true;
        saudacao();
        carregar();
        setInterval(() => { if (!document.hidden) carregar(); }, INTERVALO_MS);
        const btn = $("atualizar");
        if (btn) btn.addEventListener("click", carregar);
        // O analista.js tem um filtro antigo que reage a QUALQUER <select> (e esconderia cartões de outras páginas).
        // Capturamos a troca da métrica na fase de captura, redesenhamos o gráfico e paramos a propagação.
        document.addEventListener("change", (e) => {
            if (e.target && e.target.matches && e.target.matches('select[data-api="grafico-metrica"]')) {
                e.stopPropagation();
                desenharGrafico();
            }
        }, true);
        const caixa = $("grafico");
        if (caixa && window.ResizeObserver) {
            let larg = 0;
            new ResizeObserver(() => {
                const l = Math.round(caixa.clientWidth);
                if (l && l !== larg) { larg = l; desenharGrafico(); }
            }).observe(caixa);
        }
    });
})();
