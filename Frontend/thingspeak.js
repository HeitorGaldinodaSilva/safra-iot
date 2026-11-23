/* ================= thingspeak.js (compartilhado) =================
   Busca as leituras do ESP32 via backend (/thingspeak) e preenche
   qualquer elemento marcado com data-ts="...".

   data-ts="temperatura"        -> última temperatura (ex.: 28°C)
   data-ts="umidade"            -> última umidade (ex.: 68%)
   data-ts="atualizado"         -> "Atualizado há X"
   data-ts="atualizado-curto"   -> tempo curto (ex.: 15s, 3min)
   data-ts="sync"               -> "há 12 segundos" desde a última sincronização OK
   data-ts="sync-curto"         -> "12s" desde a última sincronização OK
   data-ts="tempo-relativo"     -> "há 10 dias", "há 3 min"...
   data-ts="condicao-umidade"   -> texto de condição da umidade
   data-ts="status-esp32"       -> Online/Offline do ESP32
   data-ts="status-thingspeak"  -> Online/Offline do ThingSpeak
   data-ts="temperatura-min|media|max" e "umidade-min|media|max" -> resumo das leituras
   data-ts-grafico="temperatura|umidade" -> gráfico de linha com as últimas leituras
*/
(function () {
    const API = "http://localhost:3001/thingspeak";
    const INTERVALO_MS = 30000;   // atualiza a cada 30 s
    const LEITURAS = 60;          // igual ao padrão dos gráficos do ThingSpeak
    const ESP32_OFFLINE_APOS_MIN = 15;

    const todos = (seletor) => document.querySelectorAll(seletor);

    function texto(chave, valor) {
        todos(`[data-ts="${chave}"]`).forEach(el => { el.textContent = valor; });
    }

    // Online = verde (cor original do CSS), Offline = vermelho
    function estado(chave, online) {
        todos(`[data-ts="${chave}"]`).forEach(el => {
            el.textContent = online ? "Online" : "Offline";
            el.style.color = online ? "" : "#c0392b";
        });
    }

    function tempoRelativo(iso) {
        const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
        if (seg === 1) return "há 1 segundo";
        if (seg < 60) return `há ${seg} segundos`;
        if (seg < 3600) return `há ${Math.round(seg / 60)} min`;
        if (seg < 86400) return `há ${Math.round(seg / 3600)} h`;
        return `há ${Math.round(seg / 86400)} dias`;
    }

    function tempoCurto(iso) {
        const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
        if (seg < 60) return `${seg}s`;
        if (seg < 3600) return `${Math.round(seg / 60)}min`;
        if (seg < 86400) return `${Math.round(seg / 3600)}h`;
        return `${Math.round(seg / 86400)}d`;
    }

    function condicaoUmidade(u) {
        if (u === null || u === undefined) return "Sem dados";
        if (u < 30) return "Umidade baixa";
        if (u > 85) return "Umidade alta";
        return "Condição normal";
    }

    const COR = { temperatura: "#d98e04", umidade: "#3478a8" };

    function fmtHora(d) {
        return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }
    function fmtData(d) {
        return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    }
    function fmtNum(v) {
        return v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    }

    // Gráfico de linha com eixos, como no ThingSpeak.
    // O desenho usa a largura REAL do cartão, então os textos dos eixos
    // ficam sempre com tamanho fixo e legível (13 px), em qualquer tela.
    const FONTE_EIXO = 13;
    const FONTE_DATA = 12;

    function desenharGrafico(el, pontos) {
        if (!pontos.length) return;
        el._pontos = pontos;   // guarda para redesenhar quando a tela mudar de tamanho

        const tipo = el.dataset.tsGrafico;
        const unidade = tipo === "temperatura" ? "°C" : "%";
        const cor = COR[tipo] || "#2f8f5b";

        const W = Math.max(300, Math.round(el.clientWidth || 640));
        const H = W < 480 ? 250 : 300;
        const ml = 56, mr = 18, mt = 16, mb = 46;
        const larg = W - ml - mr, alt = H - mt - mb;

        const t0 = pontos[0].t, t1 = pontos[pontos.length - 1].t;
        const dt = t1 - t0 || 1;
        let vmin = Math.min(...pontos.map(p => p.v));
        let vmax = Math.max(...pontos.map(p => p.v));
        if (vmin === vmax) { vmin -= 1; vmax += 1; }
        const folga = (vmax - vmin) * 0.15;
        vmin -= folga; vmax += folga;

        const X = t => ml + (pontos.length === 1 ? larg / 2 : ((t - t0) / dt) * larg);
        const Y = v => mt + (1 - (v - vmin) / (vmax - vmin)) * alt;

        let svg = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="width:100%;height:auto;display:block" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gráfico de ${tipo}">`;

        // grade e eixo Y
        for (let i = 0; i <= 4; i++) {
            const v = vmin + ((vmax - vmin) * i) / 4;
            const y = Y(v);
            svg += `<line x1="${ml}" y1="${y}" x2="${W - mr}" y2="${y}" stroke="#e6e8e2" stroke-width="1"/>`;
            svg += `<text x="${ml - 10}" y="${y + 5}" text-anchor="end" font-size="${FONTE_EIXO}" font-family="Inter, system-ui, sans-serif" fill="#5f6d68">${fmtNum(v)}</text>`;
        }

        // eixo X (horários); mostra a data quando passa de um dia
        const multiDia = fmtData(new Date(t0)) !== fmtData(new Date(t1));
        const nX = Math.min(W < 480 ? 3 : 5, pontos.length);
        for (let i = 0; i < nX; i++) {
            const t = nX === 1 ? t0 : t0 + (dt * i) / (nX - 1);
            const d = new Date(t);
            const x = X(t);
            const anchor = i === 0 ? "start" : i === nX - 1 ? "end" : "middle";
            svg += `<text x="${x}" y="${H - mb + 20}" text-anchor="${anchor}" font-size="${FONTE_EIXO}" font-family="Inter, system-ui, sans-serif" fill="#5f6d68">${fmtHora(d)}</text>`;
            if (multiDia) {
                svg += `<text x="${x}" y="${H - mb + 37}" text-anchor="${anchor}" font-size="${FONTE_DATA}" font-family="Inter, system-ui, sans-serif" fill="#8a9690">${fmtData(d)}</text>`;
            }
        }
        svg += `<line x1="${ml}" y1="${mt + alt}" x2="${W - mr}" y2="${mt + alt}" stroke="#cfd3cb" stroke-width="1"/>`;

        // área suave sob a linha + a linha
        if (pontos.length > 1) {
            const linha = pontos.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ");
            const area = `${linha} L${X(t1).toFixed(1)},${mt + alt} L${X(t0).toFixed(1)},${mt + alt} Z`;
            svg += `<path d="${area}" fill="${cor}" fill-opacity="0.10" stroke="none"/>`;
            svg += `<path d="${linha}" fill="none" stroke="${cor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
        }

        // pontos: visíveis quando são poucos; com muitos, só ficam as dicas ao passar o mouse
        const poucos = pontos.length <= 30;
        pontos.forEach(p => {
            const rotulo = `${fmtNum(p.v)}${unidade} - ${fmtData(new Date(p.t))} ${fmtHora(new Date(p.t))}`;
            const cx = X(p.t).toFixed(1), cy = Y(p.v).toFixed(1);
            if (poucos) {
                svg += `<circle cx="${cx}" cy="${cy}" r="3.5" fill="#fff" stroke="${cor}" stroke-width="2"><title>${rotulo}</title></circle>`;
            } else {
                svg += `<circle cx="${cx}" cy="${cy}" r="7" fill="transparent"><title>${rotulo}</title></circle>`;
            }
        });

        // destaque na leitura mais recente
        const ult = pontos[pontos.length - 1];
        svg += `<circle cx="${X(ult.t).toFixed(1)}" cy="${Y(ult.v).toFixed(1)}" r="6" fill="${cor}" stroke="#fff" stroke-width="2.5"/>`;

        svg += "</svg>";

        // o CSS antigo era para barras; aqui neutralizamos
        el.style.cssText = "display:block;height:auto;padding:0;border:none;";
        el.innerHTML = svg;

        // subtítulo do card: período real mostrado
        const sub = el.closest(".card") && el.closest(".card").querySelector(".card-topo p");
        if (sub) {
            const ini = new Date(t0), fim = new Date(t1);
            sub.textContent = `${pontos.length} leituras · ${fmtData(ini)} ${fmtHora(ini)} a ${fmtData(fim)} ${fmtHora(fim)}`;
        }
    }

    // Redesenha os gráficos quando o cartão muda de largura (janela, aba escondida, celular)
    if (window.ResizeObserver) {
        const observador = new ResizeObserver(entradas => {
            entradas.forEach(({ target }) => {
                const larg = Math.round(target.clientWidth);
                if (target._pontos && larg && larg !== target._larg) {
                    target._larg = larg;
                    desenharGrafico(target, target._pontos);
                }
            });
        });
        document.addEventListener("DOMContentLoaded", () => {
            todos("[data-ts-grafico]").forEach(el => observador.observe(el));
        });
    }

    // Mínima, média e máxima das leituras exibidas
    function resumoSerie(campo, pontos, unidade) {
        if (!pontos.length) return;
        const vs = pontos.map(p => p.v);
        const media = vs.reduce((a, b) => a + b, 0) / vs.length;
        texto(`${campo}-min`, `${fmtNum(Math.min(...vs))}${unidade}`);
        texto(`${campo}-media`, `${fmtNum(media)}${unidade}`);
        texto(`${campo}-max`, `${fmtNum(Math.max(...vs))}${unidade}`);
    }

    let ultimaLeitura = null;   // última leitura vinda do ThingSpeak
    let ultimoSync = null;      // quando o site sincronizou com sucesso pela última vez

    // Reescreve os tempos a cada segundo, sempre a partir de horários reais
    function renderTempos() {
        if (ultimoSync) {
            texto("sync", tempoRelativo(ultimoSync));
            texto("sync-curto", tempoCurto(ultimoSync));
        } else {
            texto("sync", "sem sincronização");
            texto("sync-curto", "—");
        }
        if (ultimaLeitura) {
            texto("atualizado", `Atualizado ${tempoRelativo(ultimaLeitura.data_hora)}`);
            texto("atualizado-curto", tempoCurto(ultimaLeitura.data_hora));
            texto("tempo-relativo", tempoRelativo(ultimaLeitura.data_hora));
        }
    }

    function marcarOffline(motivo) {
        ultimaLeitura = null;
        estado("status-thingspeak", false);
        estado("status-esp32", false);
        texto("atualizado", motivo);
        texto("atualizado-curto", "—");
        texto("tempo-relativo", "sem comunicação");
        renderTempos();
    }

    async function atualizar() {
        try {
            let dados;
            try {
                const resp = await fetch(`${API}?results=${LEITURAS}`, {
                    headers: { Authorization: `Bearer ${sessionStorage.getItem("safra_token") || ""}` }
                });
                dados = await resp.json();
            } catch (e) {
                throw new Error("Backend fora do ar ou rota /thingspeak ausente (localhost:3001)");
            }
            if (!dados.sucesso || !dados.ultima) throw new Error(dados.erro || "Sem leituras");

            const { ultima, leituras } = dados;
            const temp = ultima.temperatura;
            const umid = ultima.umidade;

            texto("temperatura", `${Math.round(temp)}°C`);
            if (umid !== null) texto("umidade", `${Math.round(umid)}%`);
            ultimaLeitura = ultima;
            ultimoSync = Date.now();
            renderTempos();
            texto("condicao-umidade", condicaoUmidade(umid));
            estado("status-thingspeak", true);

            // o status vem decidido pelo backend; o cálculo local é só reserva
            const minutos = (Date.now() - new Date(ultima.data_hora).getTime()) / 60000;
            const esp32Online = dados.status
                ? dados.status.esp32 === "online"
                : minutos <= ESP32_OFFLINE_APOS_MIN;
            estado("status-esp32", esp32Online);

            const serie = (campo) => leituras
                .filter(l => l[campo] !== null && !Number.isNaN(l[campo]))
                .map(l => ({ t: new Date(l.data_hora).getTime(), v: l[campo] }));
            todos('[data-ts-grafico="temperatura"]').forEach(el => desenharGrafico(el, serie("temperatura")));
            todos('[data-ts-grafico="umidade"]').forEach(el => desenharGrafico(el, serie("umidade")));
            resumoSerie("temperatura", serie("temperatura"), "°C");
            resumoSerie("umidade", serie("umidade"), "%");

            window.dispatchEvent(new CustomEvent("thingspeak:dados", { detail: dados }));
        } catch (erro) {
            console.warn("ThingSpeak:", erro.message);
            marcarOffline("Erro: " + erro.message);
        }
    }

    document.addEventListener("DOMContentLoaded", () => {
        renderTempos();
        atualizar();
        setInterval(atualizar, INTERVALO_MS);
        setInterval(renderTempos, 1000);
        // o botão "Atualizar" do Produtor também força nova leitura
        document.querySelectorAll("#btnAtualizar, .btn-atualizar")
            .forEach(b => b.addEventListener("click", atualizar));
    });

    window.SafraThingSpeak = { atualizar };
})();