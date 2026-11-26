const mostrarMensagem = Safra.avisar;


/* ================= analista.alerta.js ================= */


document.addEventListener("DOMContentLoaded", () => {

    // ==============================
    // DADOS DOS ALERTAS
    // ==============================

    const alertas = [
        {
            tipo: "urgente",
            titulo: "Baixa precisão no modelo",
            mensagem: "O modelo de estimativa de colheita apresentou queda na precisão.",
            categoria: "Modelos"
        },
        {
            tipo: "atencao",
            titulo: "Dados incompletos",
            mensagem: "Foram identificados dados incompletos em algumas fontes.",
            categoria: "Dados"
        },
        {
            tipo: "informativo",
            titulo: "Modelo atualizado",
            mensagem: "O modelo de previsão climática foi atualizado com sucesso.",
            categoria: "Modelos"
        }
    ];


    // ==============================
    // ELEMENTOS DOS ALERTAS
    // ==============================

    const cardsAlertas = document.querySelectorAll(
        ".alerta, .alerta-card, .card-alerta"
    );


    // ==============================
    // FILTROS
    // ==============================

    const filtros = document.querySelectorAll("[id=\"analista.alertas\"] select");


    filtros.forEach(filtro => {

        filtro.addEventListener("change", () => {

            const valor = filtro.value
                .toLowerCase()
                .trim();

            cardsAlertas.forEach(card => {

                const texto = card.textContent
                    .toLowerCase();

                if (
                    valor === "" ||
                    valor === "todos" ||
                    valor === "todas"
                ) {

                    card.style.display = "";

                } else if (
                    texto.includes(valor)
                ) {

                    card.style.display = "";

                } else {

                    card.style.display = "none";

                }

            });

            mostrarMensagem(
                `Filtro "${filtro.value}" aplicado.`
            );

        });

    });


    // ==============================
    // MARCAR ALERTA COMO LIDO
    // ==============================

    const botoesLido = document.querySelectorAll(
        ".marcar-lido, .btn-marcar-lido"
    );


    botoesLido.forEach(botao => {

        botao.addEventListener("click", () => {

            const alerta = botao.closest(
                ".alerta, .alerta-card, .card-alerta"
            );

            if (!alerta) {
                return;
            }

            alerta.classList.add("lido");

            alerta.style.opacity = "0.6";

            botao.textContent = "Lido";

            botao.disabled = true;

            mostrarMensagem(
                "Alerta marcado como lido."
            );

        });

    });


    // ==============================
    // MARCAR TODOS COMO LIDOS
    // ==============================

    const btnMarcarTodos = document.querySelector(
        "#marcarTodosLidos, .marcar-todos-lidos"
    );


    if (btnMarcarTodos) {

        btnMarcarTodos.addEventListener("click", () => {

            cardsAlertas.forEach(alerta => {

                alerta.classList.add("lido");

                alerta.style.opacity = "0.6";

            });


            botoesLido.forEach(botao => {

                botao.textContent = "Lido";
                botao.disabled = true;

            });


            mostrarMensagem(
                "Todos os alertas foram marcados como lidos."
            );

        });

    }


    // ==============================
    // CLIQUE NOS ALERTAS
    // ==============================

    cardsAlertas.forEach(alerta => {

        alerta.addEventListener("click", evento => {

            if (
                evento.target.closest("button") ||
                evento.target.closest("select")
            ) {
                return;
            }

            alerta.classList.toggle(
                "selecionado"
            );

        });

    });


    // ==============================
    // ANIMAÇÃO DOS ALERTAS
    // ==============================

    cardsAlertas.forEach((alerta, index) => {

        alerta.style.opacity = "0";
        alerta.style.transform =
            "translateY(12px)";


        setTimeout(() => {

            alerta.style.transition =
                "opacity 0.4s ease, transform 0.4s ease";

            alerta.style.opacity = "1";
            alerta.style.transform =
                "translateY(0)";

        }, index * 120);

    });




});

/* ================= analista.previsoes.js ================= */

document.addEventListener("DOMContentLoaded", () => {

    // ==============================
    // DADOS DAS PREVISÕES
    // ==============================

    const previsoes = {
        produtividade: "96,2%",
        clima: "94,7%",
        colheita: "89,4%",
        preco: "93,1%"
    };


    // ==============================
    // ELEMENTOS DAS PREVISÕES
    // ==============================

    const produtividade = document.querySelector(
        "#produtividade, #previsaoProdutividade, [data-previsao='produtividade']"
    );

    const clima = document.querySelector(
        "#clima, #previsaoClima, [data-previsao='clima']"
    );

    const colheita = document.querySelector(
        "#colheita, #previsaoColheita, [data-previsao='colheita']"
    );

    const preco = document.querySelector(
        "#preco, #previsaoPreco, [data-previsao='preco']"
    );


    // ==============================
    // PREENCHER OS DADOS
    // ==============================

    if (produtividade) {
        produtividade.textContent =
            previsoes.produtividade;
    }

    if (clima) {
        clima.textContent =
            previsoes.clima;
    }

    if (colheita) {
        colheita.textContent =
            previsoes.colheita;
    }

    if (preco) {
        preco.textContent =
            previsoes.preco;
    }


    // ==============================
    // FILTROS
    // ==============================

    const filtros = document.querySelectorAll("[id=\"analista.previsoes\"] select");

    filtros.forEach(filtro => {

        filtro.addEventListener("change", () => {

            mostrarMensagem(
                `Filtro "${filtro.value}" aplicado.`
            );

        });

    });


    // ==============================
    // BOTÕES "VER DETALHES"
    // ==============================

    const botoesDetalhes = document.querySelectorAll(
        ".btn-detalhes, .ver-detalhes, #btnDetalhes"
    );


    botoesDetalhes.forEach(botao => {

        botao.addEventListener("click", () => {

            const card = botao.closest(
                ".previsao-card, .card-previsao, .card"
            );

            if (card) {

                const titulo = card.querySelector(
                    "h3, h4, .titulo-previsao"
                );

                if (titulo) {

                    mostrarMensagem(
                        `Abrindo detalhes de ${titulo.textContent.trim()}...`
                    );

                } else {

                    mostrarMensagem(
                        "Abrindo detalhes da previsão..."
                    );

                }

            } else {

                mostrarMensagem(
                    "Abrindo detalhes da previsão..."
                );

            }

        });

    });


    // ==============================
    // BOTÃO ATUALIZAR PREVISÕES
    // ==============================

    const botoesAtualizar = document.querySelectorAll(
        "#btnAtualizar, .btn-atualizar, .btn-atualizar-previsoes"
    );


    botoesAtualizar.forEach(botao => {

        botao.addEventListener("click", () => {

            botao.disabled = true;
            botao.textContent = "Atualizando...";


            setTimeout(() => {

                if (produtividade) {
                    produtividade.textContent =
                        previsoes.produtividade;
                }

                if (clima) {
                    clima.textContent =
                        previsoes.clima;
                }

                if (colheita) {
                    colheita.textContent =
                        previsoes.colheita;
                }

                if (preco) {
                    preco.textContent =
                        previsoes.preco;
                }


                botao.disabled = false;
                botao.textContent =
                    "Atualizar dados";


                mostrarMensagem(
                    "Previsões atualizadas com sucesso!"
                );

            }, 800);

        });

    });


    // ==============================
    // ANIMAÇÃO DAS BARRAS
    // ==============================

    const barras = document.querySelectorAll(
        ".barra, .barra-progresso, .progresso"
    );


    barras.forEach(barra => {

        const valor =
            barra.dataset.valor ||
            barra.dataset.progresso;

        if (valor) {

            barra.style.width = "0%";

            setTimeout(() => {

                barra.style.transition =
                    "width 1s ease";

                barra.style.width =
                    `${valor}%`;

            }, 300);

        }

    });


    // ==============================
    // ANIMAÇÃO DOS CARDS
    // ==============================

    const cards = document.querySelectorAll(
        ".card, .stat-card, .indicador, .previsao-card, .card-previsao"
    );


    cards.forEach((card, index) => {

        card.style.opacity = "0";
        card.style.transform =
            "translateY(12px)";


        setTimeout(() => {

            card.style.transition =
                "opacity 0.4s ease, transform 0.4s ease";

            card.style.opacity = "1";
            card.style.transform =
                "translateY(0)";

        }, index * 100);

    });




});

/* ================= analista.funcional.js =================
   Inicial (Atualizar dados) • Modelos (Criar novo modelo, filtros, detalhes)
   • Dados (Atualizar dados, filtros, Ver todos, Exportar CSV)
   Tudo roda no navegador, sem depender do backend.
======================================================== */

(function () {
    "use strict";

    const aviso = Safra.avisar;
    const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
    const $$ = (seletor, raiz = document) => Array.from(raiz.querySelectorAll(seletor));
    const pagina = id => document.getElementById(id);
    const esperar = ms => new Promise(resolver => setTimeout(resolver, ms));
    const aleatorio = (min, max) => Math.random() * (max - min) + min;
    const inteiro = (min, max) => Math.floor(aleatorio(min, max + 1));
    const limitar = (n, min, max) => Math.min(max, Math.max(min, n));
    const fmtInt = n => Math.round(n).toLocaleString("pt-BR");
    const fmtDec = (n, casas = 1) =>
        n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
    const lerNumero = texto =>
        parseFloat(String(texto).replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0;
    const normalizar = texto =>
        String(texto).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const escapar = texto =>
        String(texto).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const horaAgora = () => new Date().toLocaleTimeString("pt-BR");


    // ==============================
    // FUNÇÕES COMUNS
    // ==============================

    // Número que "sobe" até o valor final
    function contar(elemento, de, ate, formatar, duracao = 900) {
        if (!elemento) return;
        const inicio = performance.now();
        function passo(agora) {
            const t = Math.min(1, (agora - inicio) / duracao);
            const suave = 1 - Math.pow(1 - t, 3);
            elemento.textContent = formatar(de + (ate - de) * suave);
            if (t < 1) requestAnimationFrame(passo);
        }
        requestAnimationFrame(passo);
    }

    // Acha o cartão de resumo pelo rótulo ("Modelos ativos", "Dados pendentes"...)
    function cartao(pg, rotulo) {
        const alvo = normalizar(rotulo);
        const card = $$(".cards-resumo .card", pg).find(c => {
            const span = $("span", c);
            return span && normalizar(span.textContent).includes(alvo);
        });
        if (!card) return null;
        return { card, valor: $("strong", card), nota: $("small", card) };
    }

    // Atualiza um cartão com animação de contagem e "pulso"
    function atualizarCartao(pg, rotulo, novoValor, formatar) {
        const c = cartao(pg, rotulo);
        if (!c || !c.valor) return;
        const atual = lerNumero(c.valor.textContent);
        contar(c.valor, atual, novoValor, formatar);
        c.card.classList.remove("pulso");
        void c.card.offsetWidth;
        c.card.classList.add("pulso");
    }

    // Barra de progresso fininha no topo da página durante a atualização
    function barraProgresso(pg, duracao) {
        const conteudo = $(".conteudo", pg);
        if (!conteudo) return;
        const antiga = $(".safra-progresso", conteudo);
        if (antiga) antiga.remove();
        const trilho = document.createElement("div");
        trilho.className = "safra-progresso";
        trilho.innerHTML = "<span></span>";
        const cabecalho = $(".cabecalho", conteudo);
        if (cabecalho && cabecalho.nextSibling) conteudo.insertBefore(trilho, cabecalho.nextSibling);
        else conteudo.appendChild(trilho);
        const barra = $("span", trilho);
        barra.style.transition = `width ${duracao}ms ease`;
        requestAnimationFrame(() => requestAnimationFrame(() => { barra.style.width = "100%"; }));
        setTimeout(() => {
            trilho.style.opacity = "0";
            setTimeout(() => trilho.remove(), 400);
        }, duracao + 150);
    }

    // Faixa de status (título + texto) de qualquer tela
    function faixa(pg, titulo, texto) {
        const el = $(".status-base", pg) || $(".status-sistema", pg) || $("div.atualizacao", pg) || $(".atualizacao", pg);
        if (!el) return;
        const forte = $("strong", el);
        if (!forte) return;
        const alvoTexto = forte.nextElementSibling && !forte.nextElementSibling.matches(".atualizacao, .atualizado, .tempo")
            ? forte.nextElementSibling : null;
        forte.textContent = titulo;
        if (alvoTexto) alvoTexto.textContent = texto;
        el.classList.remove("pulso");
        void el.offsetWidth;
        el.classList.add("pulso");
    }

    // Barras (gráfico e progresso) voltam do zero até o valor
    function reanimarBarras(pg) {
        $$(".grafico .barra", pg).forEach(barra => {
            const alvo = barra.style.height;
            barra.style.transition = "none";
            barra.style.height = "0%";
            void barra.offsetWidth;
            barra.style.transition = "height .9s cubic-bezier(.2,.8,.2,1)";
            barra.style.height = alvo;
        });
        $$(".barra > span", pg).forEach(barra => {
            const alvo = barra.style.width;
            if (!alvo) return;
            barra.style.transition = "none";
            barra.style.width = "0%";
            void barra.offsetWidth;
            barra.style.transition = "width .9s cubic-bezier(.2,.8,.2,1)";
            barra.style.width = alvo;
        });
    }

    // Botão com spinner, texto de carregando e "✓ Atualizado" no final
    async function comBotao(botao, textoCarregando, textoFinal, tarefa) {
        if (!botao || botao.dataset.ocupado) return;
        const original = botao.innerHTML;
        const svg = botao.querySelector("svg");
        const icone = svg ? svg.outerHTML + " " : "";

        botao.dataset.ocupado = "1";
        botao.disabled = true;
        botao.classList.add("carregando");
        botao.innerHTML = icone + textoCarregando;

        try {
            await tarefa();
            botao.classList.remove("carregando");
            botao.classList.add("concluido");
            botao.innerHTML = "✓ " + textoFinal;
            await esperar(1100);
        } finally {
            botao.classList.remove("carregando", "concluido");
            botao.innerHTML = original;
            botao.disabled = false;
            delete botao.dataset.ocupado;
        }
    }

    // ---------- Modal reutilizável ----------
    let fundoModal = null;
    let aoFechar = null;

    function abrirModal(html, largura) {
        fecharModal();
        fundoModal = document.createElement("div");
        fundoModal.className = "safra-modal-fundo";
        fundoModal.innerHTML =
            `<div class="safra-modal" role="dialog" aria-modal="true" style="max-width:${largura || 560}px">${html}</div>`;
        document.body.appendChild(fundoModal);
        document.body.classList.add("modal-aberto");
        requestAnimationFrame(() => fundoModal && fundoModal.classList.add("visivel"));

        fundoModal.addEventListener("mousedown", e => {
            if (e.target === fundoModal) fecharModal();
        });
        $$("[data-fechar-modal]", fundoModal).forEach(b => b.addEventListener("click", fecharModal));
        return $(".safra-modal", fundoModal);
    }

    function fecharModal() {
        if (!fundoModal) return;
        const fundo = fundoModal;
        fundoModal = null;
        fundo.classList.remove("visivel");
        document.body.classList.remove("modal-aberto");
        setTimeout(() => fundo.remove(), 220);
        if (aoFechar) { const f = aoFechar; aoFechar = null; f(); }
    }

    document.addEventListener("keydown", e => {
        if (e.key === "Escape" && fundoModal && !fundoModal.dataset.travado) fecharModal();
    });


    // =====================================================
    // DADOS REAIS (sensor DHT11 do ESP32, via backend /thingspeak)
    // =====================================================

    const API_TS = "http://localhost:3001/thingspeak";
    const NOME_FONTE = "Sensor DHT11 (ESP32)";

    async function buscarLeituras(quantidade) {
        let resposta;
        try {
            resposta = await fetch(`${API_TS}?results=${quantidade || 500}`, { headers: { Authorization: `Bearer ${sessionStorage.getItem("safra_token") || ""}` } });
        } catch (e) {
            throw new Error("Backend fora do ar (localhost:3001). Inicie o servidor e tente de novo.");
        }
        const dados = await resposta.json().catch(() => null);
        if (!dados || !dados.sucesso || !dados.leituras || !dados.leituras.length) {
            throw new Error((dados && dados.erro) || "O ThingSpeak não retornou leituras.");
        }
        return dados;
    }

    function relativo(ms) {
        const seg = Math.max(0, Math.round((Date.now() - ms) / 1000));
        if (seg < 60) return `há ${seg} s`;
        if (seg < 3600) return `há ${Math.round(seg / 60)} min`;
        if (seg < 86400) return `há ${Math.round(seg / 3600)} h`;
        return `há ${Math.round(seg / 86400)} dias`;
    }

    function fmtDataHora(d) {
        return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " +
               d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    // Faixas de funcionamento do DHT11: 0 a 50 °C e 20 a 90 % de umidade
    const tempOk = v => v !== null && v !== undefined && !Number.isNaN(v) && v >= 0 && v <= 50;
    const umidOk = v => v !== null && v !== undefined && !Number.isNaN(v) && v >= 20 && v <= 90;

    // Transforma as leituras reais em indicadores
    function analisar(leituras) {
        const ls = leituras.slice().sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora));
        const n = ls.length;
        const tempos = ls.map(l => new Date(l.data_hora).getTime());

        const completos = ls.filter(l => l.umidade !== null && !Number.isNaN(l.umidade)).length;
        const validos = ls.filter(l => tempOk(l.temperatura) && umidOk(l.umidade)).length;

        // Lacunas: intervalo bem maior que o normal entre duas leituras = leituras pendentes
        const difs = [];
        for (let i = 1; i < n; i++) difs.push(tempos[i] - tempos[i - 1]);
        const mediana = difs.length ? difs.slice().sort((a, b) => a - b)[Math.floor(difs.length / 2)] : 0;
        const normal = Math.max(mediana, 5000);
        const lacunas = [];
        let faltantes = 0;
        difs.forEach((d, i) => {
            if (d > normal * 2.5) {
                const f = Math.max(1, Math.round(d / normal) - 1);
                faltantes += f;
                lacunas.push({ de: tempos[i], ate: tempos[i + 1], faltam: f });
            }
        });

        // 7 faixas de tempo para o gráfico "Processamento dos dados"
        const faixas = new Array(7).fill(0);
        const t0 = tempos[0], t1 = tempos[n - 1];
        const largura = (t1 - t0) / 7 || 1;
        tempos.forEach(t => { faixas[Math.min(6, Math.floor((t - t0) / largura))]++; });
        const multiDia = new Date(t0).toDateString() !== new Date(t1).toDateString();
        const rotulos = faixas.map((_, i) => {
            const d = new Date(t0 + largura * i);
            return multiDia
                ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        });

        const pctCompletos = n ? (completos / n) * 100 : 0;
        const pctValidos = n ? (validos / n) * 100 : 0;
        const pctAtualizados = (n / (n + faltantes)) * 100;

        return {
            n, ordenadas: ls, tempos, lacunas, faltantes,
            inconsistentes: n - validos,
            pctCompletos, pctValidos, pctAtualizados,
            pctGeral: (pctCompletos + pctValidos + pctAtualizados) / 3,
            faixas, rotulos
        };
    }

    // Cartões "Qualidade dos dados" (Inicial e Dados)
    function aplicarQualidade(pg, a) {
        const card = $(".qualidade-card", pg);
        if (!card) return;
        const principal = $(".qualidade-principal strong", card);
        if (principal) principal.textContent = fmtDec(a.pctGeral) + "%";

        const mapa = { "dados completos": a.pctCompletos, "dados validos": a.pctValidos, "dados atualizados": a.pctAtualizados };
        $$("span, p, small, div", card).forEach(el => {
            if (el.children.length) return;
            const valor = mapa[normalizar(el.textContent)];
            if (valor === undefined) return;
            let bloco = el.parentElement;
            for (let i = 0; i < 3 && bloco && !$("strong", bloco) ; i++) bloco = bloco.parentElement;
            if (!bloco) return;
            const forte = $$("strong", bloco).find(s => !/dados/i.test(s.textContent));
            if (forte) forte.textContent = fmtDec(valor) + "%";
            let pai = el.parentElement;
            for (let i = 0; i < 3 && pai; i++, pai = pai.parentElement) {
                const barra = $(".barra span", pai);
                if (barra) { barra.style.width = valor + "%"; break; }
            }
        });
    }

    function textoLeituraAtual(dados) {
        const u = dados.ultima;
        const esp = dados.status && dados.status.esp32 === "offline" ? "ESP32 offline" : "ESP32 online";
        const umid = u.umidade !== null && u.umidade !== undefined ? ` · ${fmtDec(u.umidade, 0)}%` : "";
        return `${esp} · ${fmtDec(u.temperatura, 1)}°C${umid} · última leitura ${relativo(new Date(u.data_hora).getTime())}.`;
    }

    function erroSensor(pg, e) {
        faixa(pg, "Sem comunicação com o sensor", e.message);
        aviso(e.message);
    }


    // =====================================================
    // MODELOS (usam as leituras reais para treinar e avaliar)
    // =====================================================

    const CHAVE = "safra_analista_modelos_v2";
    const BASE_TOTAL = 6;          // modelos de exemplo que já vêm no HTML
    const BASE_PRECISAO = 94.8;
    const BASE_ATUALIZADOS = 5;
    const MIN_LEITURAS = 15;

    const VARIAVEIS = {
        temperatura: { rotulo: "Temperatura", unidade: "°C", campo: "temperatura", cor: "amarelo" },
        umidade: { rotulo: "Umidade", unidade: "%", campo: "umidade", cor: "azul" }
    };

    const ALGORITMOS = {
        media: "Média móvel (5 leituras)",
        regressao: "Regressão linear (10 leituras)",
        suavizacao: "Suavização exponencial (α = 0,5)"
    };

    const media = v => v.reduce((s, x) => s + x, 0) / v.length;

    // Previsão da próxima leitura a partir do histórico
    function prever(algoritmo, historico) {
        if (algoritmo === "media") return media(historico.slice(-5));
        if (algoritmo === "regressao") {
            const j = historico.slice(-10);
            const m = j.length;
            const mx = (m - 1) / 2, my = media(j);
            let num = 0, den = 0;
            j.forEach((y, x) => { num += (x - mx) * (y - my); den += (x - mx) * (x - mx); });
            const b = den ? num / den : 0;
            return my + b * (m - mx);
        }
        let s = historico[0];
        historico.slice(1).forEach(v => { s = 0.5 * v + 0.5 * s; });
        return s;
    }

    // Treina e testa de verdade: prevê cada leitura dos últimos 30% só com o que veio antes dela
    function avaliar(algoritmo, serie) {
        const inicio = Math.max(8, Math.floor(serie.length * 0.7));
        let somaAbs = 0, somaPct = 0, testes = 0;
        for (let i = inicio; i < serie.length; i++) {
            const p = prever(algoritmo, serie.slice(0, i));
            const erro = Math.abs(p - serie[i]);
            somaAbs += erro;
            somaPct += serie[i] !== 0 ? erro / Math.abs(serie[i]) : 0;
            testes++;
        }
        const mae = somaAbs / testes;
        const mape = (somaPct / testes) * 100;
        return {
            precisao: Math.round(limitar(100 - mape, 0, 100) * 10) / 10,
            mae, testes,
            previsao: prever(algoritmo, serie)
        };
    }

    // Faz o treino completo a partir do ThingSpeak e devolve os números do modelo
    async function treinarComDadosReais(config) {
        const dados = await buscarLeituras(config.janela);
        const campo = VARIAVEIS[config.variavel].campo;
        const serie = dados.leituras.filter(l => l[campo] !== null && !Number.isNaN(l[campo])).map(l => l[campo]);
        if (serie.length < MIN_LEITURAS) {
            throw new Error(`Só existem ${serie.length} leituras de ${VARIAVEIS[config.variavel].rotulo.toLowerCase()} no canal. São necessárias pelo menos ${MIN_LEITURAS}.`);
        }
        const r = avaliar(config.algoritmo, serie);
        return Object.assign(r, { nLeituras: serie.length });
    }

    function lerSalvos() {
        try {
            const lista = JSON.parse(localStorage.getItem(CHAVE) || "[]");
            return Array.isArray(lista) ? lista : [];
        } catch (e) { return []; }
    }
    function salvar(lista) {
        try { localStorage.setItem(CHAVE, JSON.stringify(lista)); } catch (e) { /* segue só na tela */ }
    }

    function tipoDoCard(card) {
        if (card.dataset.tipo) return card.dataset.tipo;
        const nome = normalizar($("h2", card) ? $("h2", card).textContent : "");
        if (nome.includes("produtiv")) return "produtividade";
        if (nome.includes("clima")) return "clima";
        if (nome.includes("colheita")) return "colheita";
        if (nome.includes("preco")) return "preco";
        if (nome.includes("irriga")) return "irrigacao";
        if (nome.includes("qualidade")) return "qualidade";
        return "";
    }
    function statusDoCard(card) {
        const s = $(".status", card);
        if (!s) return "ativo";
        if (s.classList.contains("treinamento-status")) return "treinamento";
        if (s.classList.contains("atencao-status")) return "atencao";
        return "ativo";
    }
    function precisaoDoCard(card) {
        const forte = $(".modelo-dados strong", card);
        return forte ? lerNumero(forte.textContent) : 0;
    }
    function rotuloDesempenho(p) {
        if (p >= 95) return "Excelente";
        if (p >= 92) return "Muito bom";
        if (p >= 90) return "Bom";
        return "Regular";
    }
    function textoAtualizado(m) {
        const d = new Date(m.atualizadoEm);
        return "Atualizado " + d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " +
               d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    }

    const ICONE_MODELO =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M22 20H2"/></svg>';

    function montarCard(m, novo) {
        const v = VARIAVEIS[m.variavel];
        const card = document.createElement("div");
        card.className = "card meu-modelo";
        card.dataset.id = m.id;
        card.dataset.tipo = "clima";
        card.dataset.ordem = String(-m.criadoEm);
        const descricao = m.descricao ||
            `Prevê a próxima leitura de ${v.rotulo.toLowerCase()} com ${ALGORITMOS[m.algoritmo].split(" (")[0].toLowerCase()}, usando ${m.nLeituras} leituras reais do sensor.`;
        card.innerHTML = `
            <div class="modelo-topo">
                <div class="modelo-icone ${v.cor}">${ICONE_MODELO}</div>
                <span class="status ativo-status">● Ativo</span>
            </div>
            <h2>${escapar(m.nome)}${novo ? ' <span class="selo-novo">Novo</span>' : ""}</h2>
            <p class="descricao">${escapar(descricao)}</p>
            <div class="modelo-dados">
                <div><span>Precisão</span><strong>${fmtDec(m.precisao)}%</strong></div>
                <div><span>Versão</span><strong>${escapar(m.versao)}</strong></div>
            </div>
            <div class="progresso">
                <div class="progresso-info"><span>Desempenho</span><strong>${rotuloDesempenho(m.precisao)}</strong></div>
                <div class="barra"><span style="width:${m.precisao}%"></span></div>
            </div>
            <div class="modelo-footer">
                <small>${textoAtualizado(m)}</small>
                <span class="meu-modelo-acoes">
                    <button type="button" class="btn-lixo" data-excluir-card title="Excluir modelo" aria-label="Excluir modelo">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                    </button>
                    <a href="#" data-ver-modelo>Ver modelo →</a>
                </span>
            </div>`;
        return card;
    }

    function resumoModelos() {
        const extras = lerSalvos();
        const total = BASE_TOTAL + extras.length;
        const soma = BASE_PRECISAO * BASE_TOTAL + extras.reduce((s, m) => s + m.precisao, 0);
        return { total, precisao: soma / total, extras: extras.length };
    }

    function atualizarContadoresInicial() {
        const ini = pagina("analista.inicial");
        if (!ini) return;
        const r = resumoModelos();
        const a = cartao(ini, "Modelos ativos");
        const c = cartao(ini, "Precisão média");
        if (a) a.valor.textContent = fmtInt(r.total);
        if (c) c.valor.textContent = fmtDec(r.precisao) + "%";
    }

    // Área "Meus modelos": fica fora da grade original, então nenhum outro script mexe nela
    function garantirArea() {
        let area = $(".meus-modelos");
        if (!area) {
            const pg = pagina("analista.modelos");
            const grade = $(".modelos-grid", pg);
            area = document.createElement("section");
            area.className = "meus-modelos";
            area.innerHTML = `
                <div class="meus-modelos-topo">
                    <div><h2>Meus modelos</h2><p>Modelos criados por você com leituras reais do sensor.</p></div>
                    <span class="meus-modelos-total"></span>
                </div>
                <div class="meus-modelos-grid"></div>`;
            const ref = grade.closest(".card") && !grade.closest(".card").classList.contains("modelo-card") ? grade.closest(".card") : grade;
            ref.parentNode.insertBefore(area, ref);
            area.addEventListener("click", e => {
                const lixo = e.target.closest("[data-excluir-card]");
                const ver = e.target.closest("[data-ver-modelo]");
                if (!lixo && !ver) return;
                e.preventDefault();
                abrirDetalhes(e.target.closest(".meu-modelo"), !!lixo);
            });
        }
        return $(".meus-modelos-grid", area);
    }

    function atualizarArea() {
        const area = $(".meus-modelos");
        if (!area) return;
        const n = $$(".meu-modelo", area).length;
        area.style.display = n ? "" : "none";
        $(".meus-modelos-total", area).textContent = n === 1 ? "1 modelo" : `${n} modelos`;
    }

    // ---------- Criar novo modelo ----------
    function abrirCriarModelo() {
        const pg = pagina("analista.modelos");
        const opcoesVar = Object.keys(VARIAVEIS).map(k => `<option value="${k}">${VARIAVEIS[k].rotulo} (${VARIAVEIS[k].unidade})</option>`).join("");
        const opcoesAlgo = Object.keys(ALGORITMOS).map(k => `<option value="${k}">${ALGORITMOS[k]}</option>`).join("");

        const modal = abrirModal(`
            <form id="formNovoModelo" novalidate>
                <div class="modal-topo">
                    <div>
                        <h2>Criar novo modelo</h2>
                        <p class="modal-sub">O modelo é treinado e testado com as leituras reais do sensor.</p>
                    </div>
                    <button type="button" class="modal-x" data-fechar-modal aria-label="Fechar">×</button>
                </div>

                <label class="campo">
                    <span>Nome do modelo</span>
                    <input type="text" name="nome" maxlength="40" placeholder="Ex.: Previsão de temperatura da estufa" autocomplete="off">
                    <small class="erro-campo" data-erro="nome"></small>
                </label>

                <div class="modal-linha">
                    <label class="campo">
                        <span>Variável a prever</span>
                        <select name="variavel">${opcoesVar}</select>
                    </label>
                    <label class="campo">
                        <span>Algoritmo</span>
                        <select name="algoritmo">${opcoesAlgo}</select>
                    </label>
                </div>

                <div class="campo">
                    <span>Dados utilizados</span>
                    <div class="fonte-real">
                        <select name="janela">
                            <option value="50">Últimas 50 leituras</option>
                            <option value="100" selected>Últimas 100 leituras</option>
                            <option value="200">Últimas 200 leituras</option>
                            <option value="500">Últimas 500 leituras</option>
                        </select>
                        <div class="fonte-real-info" data-info-fonte><i class="ponto-carregando"></i> Verificando o sensor...</div>
                    </div>
                    <small class="erro-campo" data-erro="dados"></small>
                </div>

                <label class="campo">
                    <span>Descrição <em>(opcional)</em></span>
                    <textarea name="descricao" rows="2" maxlength="120" placeholder="Para que esse modelo será usado?"></textarea>
                </label>

                <div class="modal-rodape">
                    <button type="button" class="btn-secundario" data-fechar-modal>Cancelar</button>
                    <button type="submit" class="btn-principal">Criar e treinar modelo</button>
                </div>
            </form>`);

        const form = $("#formNovoModelo", modal);
        const campoNome = form.elements.nome;
        const info = $("[data-info-fonte]", modal);
        setTimeout(() => campoNome.focus(), 120);

        // mostra quantas leituras reais existem no canal
        buscarLeituras(500).then(d => {
            const u = d.ultima;
            info.innerHTML = `<i class="ponto-ok"></i> ${NOME_FONTE}: ${d.leituras.length} leituras disponíveis · última ${fmtDec(u.temperatura, 1)}°C` +
                (u.umidade != null ? ` / ${fmtDec(u.umidade, 0)}%` : "");
        }).catch(e => {
            info.innerHTML = `<i class="ponto-erro"></i> Sem conexão com o sensor`;
            $('[data-erro="dados"]', form).textContent = e.message;
        });

        const erro = (nome, texto) => {
            const el = $(`[data-erro="${nome}"]`, form);
            if (el) el.textContent = texto || "";
            if (nome === "nome") campoNome.classList.toggle("invalido", !!texto);
        };
        campoNome.addEventListener("input", () => erro("nome", ""));

        form.addEventListener("submit", async evento => {
            evento.preventDefault();
            const nome = campoNome.value.trim().replace(/\s+/g, " ");
            const existentes = $$(".modelo-card h2, .meu-modelo h2", pg).map(h => normalizar(h.childNodes[0].textContent));
            let ok = true;
            if (nome.length < 3) { erro("nome", "Informe um nome com pelo menos 3 caracteres."); ok = false; }
            else if (existentes.includes(normalizar(nome))) { erro("nome", "Já existe um modelo com esse nome."); ok = false; }
            if (!ok) {
                modal.classList.remove("tremer"); void modal.offsetWidth; modal.classList.add("tremer");
                return;
            }
            await treinarNovoModelo(modal, {
                nome,
                variavel: form.elements.variavel.value,
                algoritmo: form.elements.algoritmo.value,
                janela: parseInt(form.elements.janela.value, 10),
                descricao: form.elements.descricao.value.trim()
            });
        });
    }

    async function treinarNovoModelo(modal, dados) {
        fundoModal.dataset.travado = "1";
        modal.innerHTML = `
            <div class="treino">
                <div class="treino-spinner"></div>
                <h2>Treinando "${escapar(dados.nome)}"</h2>
                <p class="treino-etapa">Preparando...</p>
                <div class="treino-trilho"><span></span></div>
                <small class="treino-pct">0%</small>
            </div>`;
        const barra = $(".treino-trilho span", modal);
        const etapa = $(".treino-etapa", modal);
        const pct = $(".treino-pct", modal);
        const passo = (texto, valor) => { etapa.textContent = texto; barra.style.width = valor + "%"; pct.textContent = valor + "%"; };

        let resultado;
        try {
            passo("Buscando leituras reais no ThingSpeak...", 25);
            const inicio = Date.now();
            resultado = await treinarComDadosReais(dados);
            await esperar(Math.max(0, 700 - (Date.now() - inicio)));
            passo("Separando dados de treino (70%) e teste (30%)...", 50);
            await esperar(600);
            passo(`Treinando: ${ALGORITMOS[dados.algoritmo]}...`, 75);
            await esperar(800);
            passo("Avaliando a precisão no conjunto de teste...", 100);
            await esperar(600);
        } catch (e) {
            delete fundoModal.dataset.travado;
            modal.innerHTML = `
                <div class="treino treino-erro">
                    <div class="treino-check erro">!</div>
                    <h2>Não foi possível treinar</h2>
                    <p>${escapar(e.message)}</p>
                    <div class="modal-rodape" style="justify-content:center">
                        <button type="button" class="btn-principal" data-fechar-modal>Fechar</button>
                    </div>
                </div>`;
            $("[data-fechar-modal]", modal).addEventListener("click", fecharModal);
            return;
        }

        const salvos = lerSalvos();
        const agora = Date.now();
        const modelo = {
            id: "m" + agora,
            nome: dados.nome,
            variavel: dados.variavel,
            algoritmo: dados.algoritmo,
            janela: dados.janela,
            descricao: dados.descricao,
            versao: "v1.0",
            retreinos: 0,
            precisao: resultado.precisao,
            mae: resultado.mae,
            previsao: resultado.previsao,
            nLeituras: resultado.nLeituras,
            criadoEm: agora,
            atualizadoEm: agora
        };
        salvos.unshift(modelo);
        salvar(salvos);

        modal.innerHTML = `
            <div class="treino treino-ok">
                <div class="treino-check">✓</div>
                <h2>Modelo criado!</h2>
                <p>"${escapar(modelo.nome)}" ficou com precisão de <strong>${fmtDec(modelo.precisao)}%</strong> nos testes com ${modelo.nLeituras} leituras reais.</p>
            </div>`;
        await esperar(1200);
        delete fundoModal.dataset.travado;
        fecharModal();

        const grid = garantirArea();
        const card = montarCard(modelo, true);
        grid.insertBefore(card, grid.firstChild);
        atualizarArea();
        card.classList.add("entrando");
        const barraCard = $(".barra span", card);
        barraCard.style.width = "0%";
        requestAnimationFrame(() => requestAnimationFrame(() => {
            barraCard.style.transition = "width 1s ease";
            barraCard.style.width = modelo.precisao + "%";
        }));
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        atualizarContadoresInicial();
        window.dispatchEvent(new Event("safra:modelos"));
        aviso(`Modelo "${modelo.nome}" criado com dados reais do sensor!`);
    }

    // ---------- Detalhes (Ver modelo →) ----------
    function abrirDetalhes(card, direto) {
        const nome = $("h2", card).childNodes[0].textContent.trim();
        const id = card.dataset.id;
        const salvo = id ? lerSalvos().find(m => m.id === id) : null;

        const montar = () => {
            const status = statusDoCard(card);
            const rotuloStatus = { ativo: "Ativo", treinamento: "Em treinamento", atencao: "Atenção" }[status];
            const precisao = precisaoDoCard(card);
            const versao = $(".modelo-dados div:nth-child(2) strong", card).textContent.trim();
            const atualizado = $(".modelo-footer small", card).textContent.trim().replace(/^Atualizado\s*/i, "") || "—";
            const descricao = $(".descricao", card).textContent.trim();

            let blocos;
            if (salvo) {
                const m = lerSalvos().find(x => x.id === id) || salvo;
                const v = VARIAVEIS[m.variavel];
                blocos = `
                    <div class="detalhe-grid">
                        <div><span>Precisão</span><strong>${fmtDec(precisao)}%</strong></div>
                        <div><span>Versão</span><strong>${escapar(m.versao)}</strong></div>
                        <div><span>Variável prevista</span><strong>${v.rotulo} (${v.unidade})</strong></div>
                        <div><span>Algoritmo</span><strong>${escapar(ALGORITMOS[m.algoritmo])}</strong></div>
                        <div><span>Leituras reais usadas</span><strong>${m.nLeituras}</strong></div>
                        <div><span>Erro médio (MAE)</span><strong>±${fmtDec(m.mae, 2)} ${v.unidade}</strong></div>
                        <div><span>Próxima leitura prevista</span><strong>${fmtDec(m.previsao, 1)} ${v.unidade}</strong></div>
                        <div><span>Última atualização</span><strong>${escapar(atualizado)}</strong></div>
                    </div>
                    <div class="detalhe-bloco">
                        <span>Fonte dos dados</span>
                        <strong>${NOME_FONTE} · ThingSpeak</strong>
                    </div>`;
            } else {
                blocos = `
                    <div class="detalhe-grid">
                        <div><span>Precisão</span><strong>${fmtDec(precisao)}%</strong></div>
                        <div><span>Versão</span><strong>${escapar(versao)}</strong></div>
                        <div><span>Última atualização</span><strong>${escapar(atualizado)}</strong></div>
                        <div><span>Tipo</span><strong>Modelo de exemplo</strong></div>
                    </div>
                    <div class="detalhe-bloco"><span>Observação</span><strong>Modelos de exemplo do sistema não podem ser excluídos.</strong></div>`;
            }

            return `
                <div class="modal-topo">
                    <div>
                        <h2>${escapar(nome)}</h2>
                        <span class="status ${status}-status" style="display:inline-block;margin-top:8px">● ${rotuloStatus}</span>
                    </div>
                    <button type="button" class="modal-x" data-fechar-modal aria-label="Fechar">×</button>
                </div>
                <p class="modal-sub" style="margin-bottom:18px">${escapar(descricao)}</p>
                ${blocos}
                <div class="detalhe-bloco">
                    <span>Desempenho · ${rotuloDesempenho(precisao)}</span>
                    <div class="barra"><span style="width:${precisao}%"></span></div>
                </div>
                <div class="modal-rodape" data-rodape>
                    ${salvo ? '<button type="button" class="btn-perigo" data-excluir>Excluir modelo</button>' : ""}
                    <button type="button" class="btn-secundario" data-fechar-modal>Fechar</button>
                    ${salvo ? '<button type="button" class="btn-principal" data-retreinar>Retreinar com dados atuais</button>' : ""}
                </div>`;
        };

        const ligar = modal => {
            $$("[data-fechar-modal]", modal).forEach(b => b.addEventListener("click", fecharModal));

            const botaoRetreinar = $("[data-retreinar]", modal);
            if (botaoRetreinar) botaoRetreinar.addEventListener("click", () => {
                let falhou = null;
                comBotao(botaoRetreinar, "Retreinando...", "Retreinado", async () => {
                    const lista = lerSalvos();
                    const m = lista.find(x => x.id === id);
                    if (!m) throw new Error("Modelo não encontrado.");
                    const r = await treinarComDadosReais(m);
                    await esperar(500);
                    const antes = precisaoDoCard(card);
                    m.precisao = r.precisao; m.mae = r.mae; m.previsao = r.previsao; m.nLeituras = r.nLeituras;
                    m.retreinos = (m.retreinos || 0) + 1;
                    m.versao = "v1." + m.retreinos;
                    m.atualizadoEm = Date.now();
                    salvar(lista);

                    contar($(".modelo-dados strong", card), antes, r.precisao, n => fmtDec(n) + "%");
                    $(".modelo-dados div:nth-child(2) strong", card).textContent = m.versao;
                    const barraCard = $(".barra span", card);
                    barraCard.style.transition = "width 1s ease";
                    barraCard.style.width = r.precisao + "%";
                    $(".progresso-info strong", card).textContent = rotuloDesempenho(r.precisao);
                    $(".modelo-footer small", card).textContent = textoAtualizado(m);
                    atualizarContadoresInicial();
                    window.dispatchEvent(new Event("safra:modelos"));
                    aviso(`Modelo "${nome}" retreinado: precisão em ${fmtDec(r.precisao)}%.`);
                }).catch(e => { falhou = e; aviso(e.message); }).then(() => {
                    if (fundoModal) { const mm = $(".safra-modal", fundoModal); mm.innerHTML = montar(); ligar(mm); }
                });
            });

            // Excluir (só modelos criados) com confirmação dentro do próprio modal
            const botaoExcluir = $("[data-excluir]", modal);
            if (botaoExcluir) botaoExcluir.addEventListener("click", () => {
                const rodape = $("[data-rodape]", modal);
                rodape.innerHTML = `
                    <span class="confirma-texto">Excluir "${escapar(nome)}" de vez?</span>
                    <button type="button" class="btn-secundario" data-cancelar>Cancelar</button>
                    <button type="button" class="btn-perigo-cheio" data-confirmar>Sim, excluir</button>`;
                $("[data-cancelar]", rodape).addEventListener("click", () => {
                    const mm = $(".safra-modal", fundoModal); mm.innerHTML = montar(); ligar(mm);
                });
                $("[data-confirmar]", rodape).addEventListener("click", () => {
                    salvar(lerSalvos().filter(m => m.id !== id));
                    fecharModal();
                    card.classList.add("saindo");
                    setTimeout(() => {
                        card.remove();
                        atualizarArea();
                        atualizarContadoresInicial();
                        window.dispatchEvent(new Event("safra:modelos"));
                    }, 320);
                    aviso(`Modelo "${nome}" excluído.`);
                });
            });
        };

        const modal = abrirModal(montar(), 600);
        ligar(modal);
        if (direto) { const b = $("[data-excluir]", modal); if (b) b.click(); }
    }

    function iniciarModelos() {
        const pg = pagina("analista.modelos");
        if (!pg) return;

        const salvos = lerSalvos().filter(m => VARIAVEIS[m.variavel] && ALGORITMOS[m.algoritmo]);
        if (salvos.length) {
            const grid = garantirArea();
            salvos.slice().reverse().forEach(m => grid.insertBefore(montarCard(m, false), grid.firstChild));
            atualizarArea();
        }

        const botaoCriar = $(".cabecalho .btn-principal", pg);
        if (botaoCriar) botaoCriar.addEventListener("click", abrirCriarModelo);

        atualizarContadoresInicial();
    }


    // =====================================================
    // TELA INICIAL (dados reais do sensor)
    // =====================================================

    async function carregarInicial(manual) {
        const pg = pagina("analista.inicial");
        const dados = await buscarLeituras(500);
        const a = analisar(dados.leituras);
        const r = resumoModelos();

        const aplicar = (rotulo, valor, fmt) => {
            const c = cartao(pg, rotulo);
            if (!c) return;
            if (manual) atualizarCartao(pg, rotulo, valor, fmt);
            else c.valor.textContent = fmt(valor);
        };
        aplicar("Modelos ativos", r.total, fmtInt);
        aplicar("Precisão média", r.precisao, n => fmtDec(n) + "%");
        aplicar("Dados processados", a.n, fmtInt);
        const proc = cartao(pg, "Dados processados");
        if (proc && proc.nota) proc.nota.textContent = `Últimas ${a.n} leituras do sensor`;

        aplicarQualidade(pg, a);
        faixa(pg, "Dados atualizados", textoLeituraAtual(dados));
        return a;
    }

    function iniciarInicial() {
        const pg = pagina("analista.inicial");
        if (!pg) return;
        const botao = $(".cabecalho .btn-principal", pg);

        // ao abrir o site já mostra os valores reais
        carregarInicial(false).catch(e => faixa(pg, "Sem comunicação com o sensor", e.message));

        if (!botao) return;
        botao.addEventListener("click", () => {
            let falhou = false;
            comBotao(botao, "Atualizando...", "Atualizado", async () => {
                barraProgresso(pg, 1500);
                faixa(pg, "Atualizando dados...", "Buscando as leituras mais recentes no ThingSpeak.");
                const inicio = Date.now();
                try {
                    await carregarInicial(true);
                } catch (e) {
                    falhou = true;
                    erroSensor(pg, e);
                    throw e;
                }
                await esperar(Math.max(0, 1200 - (Date.now() - inicio)));
                reanimarBarras(pg);
                aviso("Dados atualizados com sucesso!");
            }).catch(() => {});
        });
    }


    // =====================================================
    // DADOS (leituras reais na tabela, cartões e gráficos)
    // =====================================================

    const STATUS_REGISTRO = {
        processados: { texto: "Processado", classe: "sucesso" },
        pendentes: { texto: "Pendente", classe: "atencao" },
        inconsistencias: { texto: "Inconsistente", classe: "erro" }
    };

    function criarLinha(d, extra) {
        const tr = document.createElement("tr");
        const st = STATUS_REGISTRO[d.status];
        tr.innerHTML = `
            <td><strong>${NOME_FONTE}</strong></td>
            <td>${escapar(d.tipo)}</td>
            <td>${escapar(d.reg)}</td>
            <td>${escapar(d.val)}</td>
            <td><span class="tag ${st.classe}">${st.texto}</span></td>
            <td data-t="${d.t}">${relativo(d.t)}</td>`;
        tr.dataset.tipo = normalizar(d.tipo);
        tr.dataset.status = d.status;
        if (extra) tr.classList.add("linha-extra");
        return tr;
    }

    // Uma leitura vira duas linhas (temperatura e umidade); lacunas viram linhas "pendentes"
    function linhasReais(a) {
        const lacunaPorFim = {};
        a.lacunas.forEach(l => { lacunaPorFim[l.ate] = l; });
        const hora = ms => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        const saida = [];
        a.ordenadas.slice().reverse().forEach(l => {
            const t = new Date(l.data_hora).getTime();
            const reg = fmtDataHora(new Date(t));
            saida.push({
                tipo: "Temperatura", reg, t,
                val: fmtDec(l.temperatura, 1) + "°C",
                status: tempOk(l.temperatura) ? "processados" : "inconsistencias"
            });
            saida.push({
                tipo: "Umidade", reg, t,
                val: l.umidade !== null && !Number.isNaN(l.umidade) ? fmtDec(l.umidade, 0) + "%" : "—",
                status: umidOk(l.umidade) ? "processados" : "inconsistencias"
            });
            const lac = lacunaPorFim[t];
            if (lac) saida.push({
                tipo: "Leitura ausente", t: lac.de,
                reg: `Sem dados entre ${hora(lac.de)} e ${hora(lac.ate)}`,
                val: `≈ ${lac.faltam} leitura(s)`,
                status: "pendentes"
            });
        });
        return saida.slice(0, 1200);
    }

    function iniciarDados() {
        const pg = pagina("analista.dados");
        if (!pg) return;
        const corpo = $("tbody", pg);
        const cardTabela = $(".tabela-card", pg);
        if (!corpo || !cardTabela) return;

        const textoOriginal = $(".card-cabecalho p", cardTabela).textContent.trim();
        const LINHAS_INICIAIS = 6;
        let expandido = false;

        // botões da tabela: Exportar CSV + Ver todos
        const cabecalhoTabela = $(".card-cabecalho", cardTabela);
        const botaoVerTodos = $(".btn-secundario", cabecalhoTabela);
        const acoes = document.createElement("div");
        acoes.className = "acoes-tabela";
        const botaoCsv = document.createElement("button");
        botaoCsv.type = "button";
        botaoCsv.className = "btn-secundario";
        botaoCsv.textContent = "Exportar CSV";
        botaoVerTodos.parentNode.insertBefore(acoes, botaoVerTodos);
        acoes.appendChild(botaoCsv);
        acoes.appendChild(botaoVerTodos);

        // filtros com as opções reais (só existe uma fonte conectada: o sensor)
        const selects = $$(".card.filtros select", pg);
        const botaoFiltrar = $(".card.filtros .btn-filtro", pg);
        const refazerOpcoes = (select, lista) => {
            select.innerHTML = lista.map(t => `<option>${t}</option>`).join("");
        };
        refazerOpcoes(selects[0], ["Todas as fontes", NOME_FONTE]);
        refazerOpcoes(selects[1], ["Todos os tipos", "Temperatura", "Umidade", "Leitura ausente"]);

        function renderizar() {
            const tipo = selects[1].selectedIndex === 0 ? "" : normalizar(selects[1].value);
            const textoStatus = normalizar(selects[2].value);
            let status = "";
            if (selects[2].selectedIndex > 0) {
                if (textoStatus.includes("processad")) status = "processados";
                else if (textoStatus.includes("pendent")) status = "pendentes";
                else if (textoStatus.includes("inconsist")) status = "inconsistencias";
            }
            const filtrando = !!(tipo || status || selects[0].selectedIndex > 0);

            const linhas = $$("tr", corpo).filter(tr => !tr.classList.contains("linha-vazia") && !tr.classList.contains("linha-msg"));
            let visiveis = 0;
            linhas.forEach(tr => {
                const passa =
                    (!tipo || tr.dataset.tipo === tipo) &&
                    (!status || tr.dataset.status === status) &&
                    (expandido || filtrando || !tr.classList.contains("linha-extra"));
                tr.style.display = passa ? "" : "none";
                if (passa) visiveis++;
            });

            let vazia = $(".linha-vazia", corpo);
            if (!visiveis && linhas.length) {
                if (!vazia) {
                    vazia = document.createElement("tr");
                    vazia.className = "linha-vazia";
                    vazia.innerHTML = '<td colspan="6">Nenhum registro encontrado para os filtros selecionados.</td>';
                    corpo.appendChild(vazia);
                }
            } else if (vazia) vazia.remove();

            const p = $(".card-cabecalho p", cardTabela);
            if (linhas.length) p.textContent = filtrando ? `Mostrando ${visiveis} de ${linhas.length} registros.` : textoOriginal;
            botaoVerTodos.style.display = filtrando ? "none" : "";
            return visiveis;
        }

        botaoFiltrar.addEventListener("click", () => {
            const n = renderizar();
            aviso(n ? `${n} registro(s) encontrado(s).` : "Nenhum registro encontrado.");
        });
        selects.forEach(s => s.addEventListener("change", renderizar));

        botaoVerTodos.addEventListener("click", () => {
            expandido = !expandido;
            botaoVerTodos.textContent = expandido ? "Ver menos" : "Ver todos";
            renderizar();
            if (expandido) {
                $$(".linha-extra", corpo).slice(0, 20).forEach((tr, i) => {
                    tr.classList.remove("linha-nova");
                    void tr.offsetWidth;
                    tr.style.animationDelay = i * 40 + "ms";
                    tr.classList.add("linha-nova");
                });
            }
        });

        botaoCsv.addEventListener("click", () => {
            const cabecalho = $$("thead th", cardTabela).map(th => th.textContent.trim());
            const linhas = $$("tr", corpo)
                .filter(tr => tr.style.display !== "none" && tr.dataset.status)
                .map(tr => $$("td", tr).map(td => td.textContent.trim().replace(/\s+/g, " ")));
            if (!linhas.length) { aviso("Não há registros para exportar."); return; }
            const csv = [cabecalho].concat(linhas)
                .map(l => l.map(c => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n");
            const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = "safra-dados.csv";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            aviso(`${linhas.length} registro(s) exportado(s) em CSV.`);
        });

        // mantém "há X min" da tabela sempre correto
        setInterval(() => {
            $$("td[data-t]", corpo).forEach(td => { td.textContent = relativo(Number(td.dataset.t)); });
        }, 15000);

        // ---------- carrega e desenha os dados reais ----------
        function mensagemTabela(texto) {
            corpo.innerHTML = `<tr class="linha-msg"><td colspan="6" style="text-align:center;padding:28px 10px;color:#6b7a70">${escapar(texto)}</td></tr>`;
        }

        async function carregarDados(manual) {
            const dados = await buscarLeituras(500);
            const a = analisar(dados.leituras);

            const aplicar = (rotulo, valor, fmt) => {
                const c = cartao(pg, rotulo);
                if (!c) return;
                if (manual) atualizarCartao(pg, rotulo, valor, fmt);
                else c.valor.textContent = fmt(valor);
            };
            aplicar("Dados processados", a.n, fmtInt);
            aplicar("Dados completos", a.pctCompletos, n => fmtDec(n) + "%");
            aplicar("Dados pendentes", a.faltantes, fmtInt);
            const proc = cartao(pg, "Dados processados");
            if (proc && proc.nota) { proc.nota.textContent = "Leituras do sensor recebidas"; proc.nota.className = ""; }
            const comp = cartao(pg, "Dados completos");
            if (comp && comp.nota) comp.nota.textContent = "Leituras com temperatura e umidade";

            aplicarQualidade(pg, a);

            // Fontes de dados: só o sensor está conectado
            $$(".fonte-item", pg).forEach((item, i) => {
                const forte = $(".fonte-status strong", item);
                const rotulo = $(".fonte-status span", item);
                if (!forte) return;
                if (i === 0) {
                    forte.textContent = fmtInt(a.n);
                    if (rotulo) rotulo.textContent = "registros";
                } else {
                    forte.textContent = "0";
                    if (rotulo) rotulo.textContent = "não conectada";
                }
            });

            // Processamento dos dados: leituras por faixa de tempo
            const proCard = $(".processamento-card", pg);
            if (proCard) {
                const maximo = Math.max(...a.faixas, 1);
                const barras = $$(".barra-grafico", proCard);
                barras.forEach((b, i) => {
                    const alvo = Math.max(4, (a.faixas[i] / maximo) * 100);
                    b.title = `${a.faixas[i]} leituras`;
                    b.style.transition = "none";
                    b.style.height = "0%";
                    void b.offsetWidth;
                    b.style.transition = "height .9s cubic-bezier(.2,.8,.2,1)";
                    b.style.height = alvo + "%";
                });
                $$(".dias span", proCard).forEach((s, i) => { s.textContent = a.rotulos[i] || ""; });
                const sel = $("select", proCard);
                if (sel) sel.innerHTML = `<option>Últimas ${a.n} leituras</option>`;
                const p = $(".card-cabecalho p", proCard);
                if (p) p.textContent = "Leituras recebidas do sensor ao longo do período.";
            }

            // Qualidade e inconsistências
            $$(".inconsistencia", pg).forEach(item => {
                const titulo = normalizar($("strong", item).textContent);
                const texto = $("span", item);
                if (titulo.includes("pendentes")) texto.textContent = `${fmtInt(a.faltantes)} leituras ausentes entre as recebidas.`;
                else if (titulo.includes("inconsistentes")) texto.textContent = `${fmtInt(a.inconsistentes)} registros precisam ser revisados.`;
                else if (titulo.includes("fonte")) {
                    $("strong", item).textContent = "Fonte conectada";
                    texto.textContent = `${NOME_FONTE} sincronizado.`;
                }
            });

            // Tabela
            const linhas = linhasReais(a);
            corpo.innerHTML = "";
            linhas.forEach((d, i) => {
                const tr = criarLinha(d, i >= LINHAS_INICIAIS);
                if (manual && i < 4) { tr.classList.add("linha-nova"); tr.style.animationDelay = i * 100 + "ms"; }
                corpo.appendChild(tr);
            });
            renderizar();

            faixa(pg, "Base de dados atualizada", textoLeituraAtual(dados));
            return a;
        }

        mensagemTabela("Carregando leituras do sensor...");
        carregarDados(false).catch(e => {
            mensagemTabela(e.message);
            faixa(pg, "Sem comunicação com o sensor", e.message);
        });

        const botao = $(".cabecalho .btn-principal", pg);
        if (!botao) return;
        botao.addEventListener("click", () => {
            comBotao(botao, "Atualizando...", "Atualizado", async () => {
                barraProgresso(pg, 1500);
                faixa(pg, "Atualizando dados...", "Buscando as leituras mais recentes no ThingSpeak.");
                const inicio = Date.now();
                try {
                    const a = await carregarDados(true);
                    aviso(`Dados atualizados: ${a.n} leituras do sensor.`);
                } catch (e) {
                    erroSensor(pg, e);
                    throw e;
                }
                await esperar(Math.max(0, 1200 - (Date.now() - inicio)));
            }).catch(() => {});
        });
    }


    // =====================================================
    // OPEN-METEO + SENSOR (fontes de dados reais compartilhadas)
    // =====================================================

    // Coordenadas usadas na previsão do tempo (troque aqui se quiser outro local)
    const LOCAL = { nome: "Petrolina – PE", lat: -9.39, lon: -40.5 };
    const FUSO = "America%2FBahia";

    const isoData = d =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const diaMes = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
    const nomeDia = iso => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");

    async function chamarOpenMeteo(url) {
        let resposta;
        try { resposta = await fetch(url); }
        catch (e) { throw new Error("Não foi possível acessar o Open-Meteo. Verifique a conexão com a internet."); }
        if (!resposta.ok) throw new Error(`O Open-Meteo respondeu com erro ${resposta.status}.`);
        const json = await resposta.json().catch(() => null);
        if (!json || !json.daily || !json.daily.time) throw new Error("Resposta inesperada do Open-Meteo.");
        return json;
    }

    const cacheClima = { prev: null, hist: {} };

    // Previsão dos próximos dias (até 16)
    async function climaPrevisao(dias, forcar) {
        const c = cacheClima.prev;
        if (!forcar && c && c.dias >= dias && Date.now() - c.t < 5 * 60000) {
            return { atual: c.dados.atual, dias: c.dados.dias.slice(0, dias) };
        }
        const pedir = Math.max(dias, 14);
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${LOCAL.lat}&longitude=${LOCAL.lon}` +
            `&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m` +
            `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,et0_fao_evapotranspiration` +
            `&forecast_days=${pedir}&timezone=${FUSO}`;
        const j = await chamarOpenMeteo(url);
        const d = j.daily;
        const lista = d.time.map((t, i) => ({
            data: t,
            tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i],
            chuva: d.precipitation_sum[i] || 0,
            prob: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null,
            et0: d.et0_fao_evapotranspiration ? d.et0_fao_evapotranspiration[i] : null
        })).filter(x => x.tmax !== null && x.tmax !== undefined);
        const dados = { atual: j.current || null, dias: lista };
        cacheClima.prev = { t: Date.now(), dias: pedir, dados };
        return { atual: dados.atual, dias: lista.slice(0, dias) };
    }

    // Histórico dos últimos N dias
    async function climaHistorico(diasAtras, forcar) {
        const c = cacheClima.hist[diasAtras];
        if (!forcar && c && Date.now() - c.t < 10 * 60000) return c.lista;
        const vars = "temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration";
        const hoje = new Date();
        let url;
        if (diasAtras <= 90) {
            url = `https://api.open-meteo.com/v1/forecast?latitude=${LOCAL.lat}&longitude=${LOCAL.lon}` +
                `&daily=${vars}&past_days=${diasAtras}&forecast_days=1&timezone=${FUSO}`;
        } else {
            const fim = new Date(hoje.getTime() - 5 * 86400000);   // o arquivo histórico tem ~5 dias de atraso
            const ini = new Date(hoje.getTime() - diasAtras * 86400000);
            url = `https://archive-api.open-meteo.com/v1/archive?latitude=${LOCAL.lat}&longitude=${LOCAL.lon}` +
                `&start_date=${isoData(ini)}&end_date=${isoData(fim)}&daily=${vars}&timezone=${FUSO}`;
        }
        const j = await chamarOpenMeteo(url);
        const d = j.daily;
        const hojeIso = isoData(hoje);
        const lista = d.time.map((t, i) => ({
            data: t, tmax: d.temperature_2m_max[i], tmin: d.temperature_2m_min[i],
            chuva: d.precipitation_sum[i] || 0, et0: d.et0_fao_evapotranspiration[i]
        })).filter(x => x.tmax !== null && x.tmax !== undefined && x.data <= hojeIso);
        cacheClima.hist[diasAtras] = { t: Date.now(), lista };
        return lista;
    }

    // Leituras do sensor já analisadas (cache curto)
    const cacheSensor = { t: 0, valor: null };
    async function obterSensor(forcar) {
        if (!forcar && cacheSensor.valor && Date.now() - cacheSensor.t < 45000) return cacheSensor.valor;
        const dados = await buscarLeituras(500);
        const valor = { dados, a: analisar(dados.leituras) };
        cacheSensor.t = Date.now();
        cacheSensor.valor = valor;
        return valor;
    }

    const soma = v => v.reduce((s, x) => s + x, 0);
    const mediaOuNull = v => (v.length ? soma(v) / v.length : null);

    function irPara(idPagina) {
        const a = document.createElement("a");
        a.href = "#" + idPagina;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // Acha o valor de um indicador pelo rótulo (funciona nos três formatos de cartão)
    function indicador(pg, rotulo) {
        const alvo = normalizar(rotulo);
        const folhas = $$("span, small, p, strong, label", pg).filter(e => !e.children.length && normalizar(e.textContent) === alvo);
        for (const folha of folhas) {
            let el = folha;
            for (let i = 0; i < 3 && el && el !== pg; i++, el = el.parentElement) {
                const achados = [];
                let prox = el.nextElementSibling;
                while (prox && achados.length < 2) {
                    if (prox.textContent.trim() && !prox.querySelector("svg") && !prox.matches(".barra")) achados.push(prox);
                    prox = prox.nextElementSibling;
                }
                if (achados.length) return { valor: achados[0], nota: achados[1] || null };
            }
        }
        return null;
    }

    function definirIndicador(pg, rotulo, texto, nota) {
        const i = indicador(pg, rotulo);
        if (!i) return null;
        i.valor.textContent = texto;
        if (nota !== undefined && i.nota) i.nota.textContent = nota;
        return i;
    }

    const ICONES = {
        alerta: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/></svg>',
        info: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
        nuvem: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.5 19H7a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 10.5 4.25 4.25 0 0 1 17.5 19z"/></svg>',
        grafico: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
        doc: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>'
    };

    function quando(ms) {
        const d = new Date(ms), hoje = new Date();
        const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
        if (d.toDateString() === hoje.toDateString()) return `Hoje às ${hora}`;
        if (d.toDateString() === new Date(hoje.getTime() - 86400000).toDateString()) return `Ontem às ${hora}`;
        return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " às " + hora;
    }


    // =====================================================
    // ALERTAS (gerados a partir do sensor, do Open-Meteo e dos modelos)
    // =====================================================

    const CHAVE_ALERTAS = "safra_alertas_estado_v1";
    const NIVEIS = {
        urgente: { rotulo: "Urgente", cor: "vermelho", classe: "urgente" },
        atencao: { rotulo: "Atenção", cor: "amarelo", classe: "atencao" },
        informativo: { rotulo: "Informativo", cor: "azul", classe: "informativo" }
    };

    function lerEstadoAlertas() {
        try { return JSON.parse(localStorage.getItem(CHAVE_ALERTAS) || "{}") || {}; } catch (e) { return {}; }
    }
    function gravarEstadoAlertas(e) {
        try { localStorage.setItem(CHAVE_ALERTAS, JSON.stringify(e)); } catch (x) { /* ok */ }
    }

    async function reunirAlertas() {
        const lista = [];
        const add = (id, nivel, categoria, titulo, texto, extra) =>
            lista.push(Object.assign({ id, nivel, categoria, titulo, texto }, extra || {}));
        const irDados = { rotulo: "Ver dados", destino: "analista.dados" };
        const irPrev = { rotulo: "Ver previsões", destino: "analista.previsoes" };
        const irMod = { rotulo: "Ver modelos", destino: "analista.modelos" };

        let sensor = null, clima = null;
        try { sensor = await obterSensor(true); }
        catch (e) { add("sensor-fora", "urgente", "Sistema", "Sensor sem comunicação", e.message, { acao: irDados }); }
        try { clima = await climaPrevisao(7); }
        catch (e) { add("clima-fora", "informativo", "Sistema", "Open-Meteo indisponível", e.message); }

        if (sensor) {
            const { dados, a } = sensor;
            const u = dados.ultima;
            const minutos = dados.status ? dados.status.minutos_sem_dados : 0;
            if (dados.status && dados.status.esp32 === "offline") {
                add("esp32-offline", "urgente", "Sistema", "ESP32 offline",
                    `O sensor está sem enviar leituras há ${minutos} min (limite de ${dados.status.limite_min} min).`, { acao: irDados });
            }
            if (u.temperatura >= 38) add("temp-critica", "urgente", "Dados", "Temperatura crítica", `Última leitura: ${fmtDec(u.temperatura, 1)}°C. Acima de 38°C há risco de estresse térmico nas plantas.`, { acao: irDados });
            else if (u.temperatura >= 35) add("temp-alta", "atencao", "Dados", "Temperatura elevada", `Última leitura: ${fmtDec(u.temperatura, 1)}°C, acima do ideal para as lavouras.`, { acao: irDados });
            else if (u.temperatura <= 8) add("temp-baixa", "atencao", "Dados", "Temperatura baixa", `Última leitura: ${fmtDec(u.temperatura, 1)}°C.`, { acao: irDados });
            if (u.umidade !== null && u.umidade !== undefined) {
                if (u.umidade <= 30) add("umid-baixa", "atencao", "Dados", "Umidade do ar baixa", `Última leitura: ${fmtDec(u.umidade, 0)}%. Considere reforçar a irrigação.`, { acao: irDados });
                else if (u.umidade >= 90) add("umid-alta", "atencao", "Dados", "Umidade do ar alta", `Última leitura: ${fmtDec(u.umidade, 0)}%. Risco maior de doenças fúngicas.`, { acao: irDados });
            }
            if (a.faltantes > 0) add("leituras-ausentes", "atencao", "Dados", "Leituras ausentes", `${fmtInt(a.faltantes)} leituras não chegaram entre as ${fmtInt(a.n)} recebidas.`, { acao: irDados });
            if (a.inconsistentes > 0) add("dados-inconsistentes", "atencao", "Dados", "Qualidade dos dados", `${fmtInt(a.inconsistentes)} registros estão incompletos ou fora da faixa do sensor.`, { acao: irDados });
            add("dados-ok", "informativo", "Dados", "Dados do sensor atualizados",
                `${fmtInt(a.n)} leituras processadas · qualidade geral de ${fmtDec(a.pctGeral)}%.`);
        }

        if (clima && clima.dias.length) {
            const dias = clima.dias;
            const calor = dias.reduce((m, d) => (d.tmax > m.tmax ? d : m), dias[0]);
            const chuva = dias.reduce((m, d) => (d.chuva > m.chuva ? d : m), dias[0]);
            if (calor.tmax >= 38) add("prev-calor-" + calor.data, "atencao", "Previsões", "Calor intenso previsto", `Máxima de ${fmtDec(calor.tmax, 1)}°C em ${diaMes(calor.data)}. Planeje a irrigação.`, { acao: irPrev });
            if (chuva.chuva >= 50) add("prev-chuva-" + chuva.data, "urgente", "Previsões", "Chuva muito forte prevista", `${fmtDec(chuva.chuva, 0)} mm previstos em ${diaMes(chuva.data)}.`, { acao: irPrev });
            else if (chuva.chuva >= 20) add("prev-chuva-" + chuva.data, "atencao", "Previsões", "Chuva forte prevista", `${fmtDec(chuva.chuva, 0)} mm previstos em ${diaMes(chuva.data)}.`, { acao: irPrev });
            const et = dias.reduce((m, d) => ((d.et0 || 0) > (m.et0 || 0) ? d : m), dias[0]);
            if (et.et0 >= 7) add("prev-et0-" + et.data, "atencao", "Previsões", "Alta demanda de água", `Evapotranspiração de ${fmtDec(et.et0, 1)} mm em ${diaMes(et.data)}.`, { acao: irPrev });
            const amanha = dias[1] || dias[0];
            add("prev-resumo-" + amanha.data, "informativo", "Previsões", `Previsão para ${LOCAL.nome}`,
                `${diaMes(amanha.data)}: mínima de ${fmtDec(amanha.tmin, 0)}°C, máxima de ${fmtDec(amanha.tmax, 0)}°C e chuva de ${fmtDec(amanha.chuva, 1)} mm.`, { acao: irPrev });
        }

        lerSalvos().forEach(m => {
            if (m.precisao < 90) add("modelo-baixo-" + m.id, "atencao", "Modelos", m.nome,
                `A precisão do modelo está em ${fmtDec(m.precisao)}%, abaixo do nível recomendado (90%). Considere retreinar.`, { acao: irMod, quando: m.atualizadoEm, detalhe: `Precisão atual: ${fmtDec(m.precisao)}%` });
        });
        lerSalvos().slice(0, 3).forEach(m => {
            add(`modelo-${m.id}-${m.atualizadoEm}`, "informativo", "Modelos", "Modelo atualizado",
                `O modelo "${m.nome}" (${m.versao}) foi treinado com ${m.nLeituras} leituras reais.`, { acao: irMod, quando: m.atualizadoEm });
        });
        return lista;
    }

    function iniciarAlertas() {
        const pg = pagina("analista.alertas");
        if (!pg) return;
        const destaque = $(".alerta-destaque", pg);
        const listas = $$(".lista-card", pg);
        const listaAtencao = listas[0], listaInfo = listas[1];
        const selects = $$(".filtros select", pg);
        const botaoFiltrar = $(".filtros button", pg);
        const botaoTodos = $(".cabecalho .btn-principal", pg);
        let alertas = [];
        let infoExpandido = false;
        let carregou = false;
        // Configurações > Notificações do Analista: Dados, Previsões, Sensor/Sistema e Modelos
        const PREF_CATEGORIA = { "Dados": "notif_producao", "Previsões": "notif_clima", "Sistema": "notif_exportacao", "Modelos": "notif_relatorios" };
        const prefLigada = a => !window.Safra || !Safra.sino || Safra.sino.ligada(PREF_CATEGORIA[a.categoria]);
        window.addEventListener("safra:preferencias", () => { if (carregou) renderizar(); });

        const estaVisivel = a => !(lerEstadoAlertas()[a.id] || {}).dispensado;
        const estaLido = a => !!(lerEstadoAlertas()[a.id] || {}).lido;

        function marcar(id, campo, valor) {
            const e = lerEstadoAlertas();
            e[id] = Object.assign({}, e[id], { [campo]: valor });
            gravarEstadoAlertas(e);
        }

        function itemHTML(a) {
            const n = NIVEIS[a.nivel];
            const lido = estaLido(a);
            return `
                <div class="alerta-item ${lido ? "lido" : ""}" data-id="${escapar(a.id)}" data-nivel="${a.nivel}" data-categoria="${normalizar(a.categoria)}">
                    <div class="alerta-icon ${n.cor}">${a.nivel === "informativo" ? ICONES.info : ICONES.alerta}</div>
                    <div class="alerta-texto">
                        <strong>${escapar(a.titulo)}</strong>
                        <span>${escapar(a.texto)}</span>
                        <small>${quando(a.quando)} • ${escapar(a.categoria)}</small>
                    </div>
                    <span class="status-alerta ${n.classe}">${n.rotulo}</span>
                    <span class="alerta-acoes">
                        ${a.acao ? `<button type="button" class="alerta-mini" data-ir="${a.acao.destino}" title="${a.acao.rotulo}">${a.acao.rotulo}</button>` : ""}
                        <button type="button" class="alerta-mini" data-lido title="${lido ? "Marcar como não lido" : "Marcar como lido"}">${lido ? "Não lido" : "Lido"}</button>
                        <button type="button" class="alerta-mini perigo" data-dispensar title="Dispensar alerta" aria-label="Dispensar alerta">×</button>
                    </span>
                </div>`;
        }

        function preencherLista(card, itens, vazioTexto, rotuloContador) {
            if (!card) return;
            $$(".alerta-item, .alerta-vazio", card).forEach(e => e.remove());
            card.insertAdjacentHTML("beforeend",
                itens.length ? itens.map(itemHTML).join("") : `<div class="alerta-vazio">${vazioTexto}</div>`);
            const contador = $(".contador", card);
            if (contador) contador.textContent = rotuloContador(itens.length);
        }

        function renderizar() {
            const ativos = alertas.filter(a => estaVisivel(a) && prefLigada(a));
            const urgentes = ativos.filter(a => a.nivel === "urgente");
            const atencao = ativos.filter(a => a.nivel === "atencao");
            const infos = ativos.filter(a => a.nivel === "informativo");

            // Destaque: primeiro urgente (não lidos primeiro)
            const principal = urgentes.slice().sort((a, b) => Number(estaLido(a)) - Number(estaLido(b)))[0];
            if (destaque) {
                if (principal) {
                    destaque.style.display = "";
                    destaque.dataset.id = principal.id;
                    destaque.innerHTML = `
                        <div class="alerta-principal">
                            <div class="alerta-grande vermelho">!</div>
                            <div>
                                <div class="alerta-titulo"><h2>${escapar(principal.titulo)}</h2><span class="tag urgente-tag">Urgente</span></div>
                                <p>${escapar(principal.texto)}</p>
                                <div class="alerta-meta"><span>${quando(principal.quando)}</span><span>${escapar(principal.categoria)}</span>${principal.detalhe ? `<span>${escapar(principal.detalhe)}</span>` : ""}</div>
                            </div>
                        </div>
                        <div class="alerta-destaque-acoes">
                            ${principal.acao ? `<button type="button" class="btn-alerta vermelho-btn" data-ir="${principal.acao.destino}">${principal.acao.rotulo}</button>` : ""}
                            <button type="button" class="btn-alerta" data-lido>${estaLido(principal) ? "Marcar como não lido" : "Marcar como lido"}</button>
                            <button type="button" class="btn-alerta" data-dispensar>Dispensar</button>
                        </div>`;
                    destaque.classList.toggle("lido", estaLido(principal));
                } else {
                    destaque.style.display = "none";
                }
            }

            const restoAtencao = urgentes.filter(a => a !== principal).concat(atencao);
            preencherLista(listaAtencao, restoAtencao, "Nenhum alerta em atenção no momento.", n => (n === 1 ? "1 alerta" : `${n} alertas`));
            const infosMostradas = infoExpandido ? infos : infos.slice(0, 3);
            preencherLista(listaInfo, infosMostradas, "Nenhuma atualização recente.", () => "");
            const verTodos = $("a", $(".card-cabecalho", listaInfo || document.createElement("div")) || document.createElement("div"));
            if (verTodos) {
                verTodos.textContent = infoExpandido ? "Ver menos" : "Ver todos";
                verTodos.style.display = infos.length > 3 ? "" : "none";
            }

            // Contadores
            const naoLidosImportantes = urgentes.concat(atencao).filter(a => !estaLido(a)).length;
            const naoLidos = ativos.filter(a => !estaLido(a)).length;
            const numero = (rotulo, valor, nota) => definirIndicador(pg, rotulo, String(valor), nota);
            numero("Urgentes", urgentes.length, urgentes.length ? "Requer ação imediata" : "Nenhum urgente");
            numero("Atenção", atencao.length, atencao.length ? "Verificar dados e modelos" : "Nada em atenção");
            numero("Informativos", infos.length, "Sem ação necessária");
            numero("Total de alertas", ativos.length, "Monitoramento ativo");
            const total = $(".total-alertas", pg);
            if (total) total.textContent = naoLidos === 1 ? "1 não lido" : `${naoLidos} não lidos`;

            const banner = $(".atualizacao", pg);
            if (banner && $("strong", banner)) {
                const t = naoLidosImportantes;
                $("strong", banner).textContent = t ? `${t} ${t === 1 ? "alerta precisa" : "alertas precisam"} da sua atenção` : "Nenhum alerta pendente";
                const p = $("p", banner);
                if (p) p.textContent = t ? "Existem ocorrências que podem afetar os dados, as previsões e os modelos." : "Tudo certo por aqui. Os alertas são recalculados a cada minuto.";
            }

            // Selos do menu e do sino
            $$(".menu-item[href='#analista.alertas'] .badge, .tb-badge").forEach(b => {
                b.textContent = String(naoLidosImportantes);
                b.style.display = naoLidosImportantes ? "" : "none";
            });
            if (window.Safra && Safra.sino) {
                Safra.sino.atualizar({
                    itens: ativos.map(a => ({ id: a.id, titulo: a.titulo, mensagem: a.texto, prioridade: a.nivel, categoria: a.categoria, quando: a.quando, lido: estaLido(a) })),
                    naoLidos: naoLidosImportantes, destino: "#analista.alertas",
                    aoLer: id => { marcar(id, "lido", true); renderizar(); },
                    aoLerTodos: () => { ativos.forEach(a => marcar(a.id, "lido", true)); renderizar(); }
                });
            }

            aplicarFiltros();
        }

        function aplicarFiltros() {
            const status = selects[0] && selects[0].selectedIndex > 0 ? normalizar(selects[0].value) : "";
            const prioridade = selects[1] && selects[1].selectedIndex > 0 ? normalizar(selects[1].value) : "";
            const categoria = selects[2] && selects[2].selectedIndex > 0 ? normalizar(selects[2].value) : "";
            const alvos = $$(".alerta-item", pg).concat(destaque && destaque.dataset.id ? [destaque] : []);
            alvos.forEach(el => {
                const id = el.dataset.id;
                const a = alertas.find(x => x.id === id);
                if (!a) return;
                const nivelTxt = normalizar(NIVEIS[a.nivel].rotulo);
                const passa =
                    (!status || status === "todos" || (status === "nao lidos" && !estaLido(a)) || (status === "lidos" && estaLido(a))) &&
                    (!prioridade || prioridade === "todas" || prioridade === nivelTxt) &&
                    (!categoria || categoria === "todas" || categoria === normalizar(a.categoria));
                if (el === destaque) { if (a.nivel === "urgente" && destaque.style.display !== "none") destaque.style.display = passa ? "" : "none"; }
                else el.style.display = passa ? "" : "none";
            });
        }

        async function carregar(manual) {
            try {
                const novos = await reunirAlertas();
                const estado = lerEstadoAlertas();
                const agora = Date.now();
                novos.forEach(a => {
                    if (!estado[a.id]) estado[a.id] = { visto: agora };
                    if (!estado[a.id].visto) estado[a.id].visto = agora;
                    a.quando = a.quando || estado[a.id].visto;
                });
                // limpa o que não existe mais
                const ids = new Set(novos.map(a => a.id));
                Object.keys(estado).forEach(k => { if (!ids.has(k)) delete estado[k]; });
                gravarEstadoAlertas(estado);
                const ordem = { urgente: 0, atencao: 1, informativo: 2 };
                alertas = novos.sort((a, b) => ordem[a.nivel] - ordem[b.nivel] || b.quando - a.quando);
                carregou = true;
                renderizar();
                const tempo = $(".tempo", pg);
                if (tempo) tempo.setAttribute("title", "Atualizado às " + horaAgora());
            } catch (e) {
                if (manual) aviso(e.message);
            }
        }

        // cliques dentro da tela (delegação: vale para itens criados depois)
        pg.addEventListener("click", ev => {
            const alvo = ev.target.closest("[data-ir], [data-lido], [data-dispensar]");
            const verTodos = ev.target.closest(".lista-card .card-cabecalho a");
            if (verTodos && listaInfo && listaInfo.contains(verTodos)) {
                ev.preventDefault();
                infoExpandido = !infoExpandido;
                renderizar();
                return;
            }
            if (!alvo) return;
            ev.preventDefault();
            const caixa = alvo.closest("[data-id]");
            const id = caixa && caixa.dataset.id;
            if (alvo.dataset.ir !== undefined) { irPara(alvo.dataset.ir); return; }
            if (!id) return;
            if (alvo.hasAttribute("data-lido")) {
                marcar(id, "lido", !estaLido(alertas.find(a => a.id === id)));
                renderizar();
            } else if (alvo.hasAttribute("data-dispensar")) {
                caixa.classList.add("saindo");
                setTimeout(() => { marcar(id, "dispensado", true); renderizar(); }, 260);
                aviso("Alerta dispensado.");
            }
        });

        if (botaoTodos) botaoTodos.addEventListener("click", () => {
            const pendentes = alertas.filter(a => estaVisivel(a) && !estaLido(a));
            if (!pendentes.length) { aviso("Todos os alertas já estão lidos."); return; }
            const e = lerEstadoAlertas();
            pendentes.forEach(a => { e[a.id] = Object.assign({}, e[a.id], { lido: true }); });
            gravarEstadoAlertas(e);
            renderizar();
            aviso(`${pendentes.length} alerta(s) marcado(s) como lido(s).`);
        });
        if (botaoFiltrar) botaoFiltrar.addEventListener("click", () => { aplicarFiltros(); aviso("Filtros aplicados."); });
        selects.forEach(s => s.addEventListener("change", aplicarFiltros));

        // some o conteúdo de exemplo do HTML enquanto os alertas reais carregam
        if (destaque) destaque.style.display = "none";
        [listaAtencao, listaInfo].forEach(c => { if (c) { $$(".alerta-item", c).forEach(e => e.remove()); c.insertAdjacentHTML("beforeend", '<div class="alerta-vazio">Carregando alertas...</div>'); } });

        // recalcula ao abrir, a cada minuto e quando um modelo muda
        carregar(false);
        setInterval(() => carregar(false), 60000);
        window.addEventListener("safra:modelos", () => carregar(false));
        window.SafraAlertas = { atualizar: () => carregar(true) };
    }


    // =====================================================
    // PREVISÕES (sensor + Open-Meteo + modelos criados)
    // =====================================================

    // Escolhe o melhor algoritmo para a série do sensor (o que erra menos no teste)
    function melhorModelo(serie) {
        if (serie.length < MIN_LEITURAS) return null;
        let melhor = null;
        Object.keys(ALGORITMOS).forEach(k => {
            const r = avaliar(k, serie);
            if (!melhor || r.precisao > melhor.precisao) melhor = Object.assign({ algoritmo: k }, r);
        });
        return melhor;
    }

    function statusPrevisao(conf) {
        if (conf === null) return "atualizadas";
        if (conf < 85) return "recalibracao";
        if (conf < 90) return "em atencao";
        return "atualizadas";
    }

    // Monta as linhas de previsão com dados reais
    function gerarPrevisoes(sensor, clima) {
        const linhas = [], extras = [];
        const agora = Date.now();
        if (sensor) {
            const ls = sensor.a.ordenadas;
            const tUltima = new Date(sensor.dados.ultima.data_hora).getTime();
            [["temperatura", "°C", 1], ["umidade", "%", 0]].forEach(([campo, un, casas]) => {
                const serie = ls.map(l => l[campo]).filter(v => v !== null && !Number.isNaN(v));
                const m = melhorModelo(serie);
                if (!m) return;
                linhas.push({
                    modelo: `Próxima leitura de ${VARIAVEIS[campo].rotulo.toLowerCase()}`, tipo: "Sensor", origem: "Sensor ESP32",
                    previsao: `${fmtDec(m.previsao, casas)}${un}`, conf: m.precisao, t: tUltima,
                    detalhe: ALGORITMOS[m.algoritmo], campo
                });
            });
        }
        if (clima && clima.dias.length) {
            const d = clima.dias;
            const amanha = d[1] || d[0];
            const chuvaTotal = soma(d.map(x => x.chuva));
            const maxProb = Math.max(...d.map(x => x.prob || 0));
            linhas.push({ modelo: "Temperatura máxima (amanhã)", tipo: "Clima", origem: LOCAL.nome, previsao: `${fmtDec(amanha.tmax, 1)}°C`, conf: null, rotuloConf: "Open-Meteo", t: agora, atencao: amanha.tmax >= 38 });
            linhas.push({ modelo: "Chuva prevista (7 dias)", tipo: "Clima", origem: LOCAL.nome, previsao: `${fmtDec(chuvaTotal, 1)} mm`, conf: null, rotuloConf: maxProb ? `até ${fmtDec(maxProb, 0)}% de chance` : "Open-Meteo", t: agora, atencao: Math.max(...d.map(x => x.chuva)) >= 20 });
            if (amanha.et0 !== null) linhas.push({ modelo: "Evapotranspiração (amanhã)", tipo: "Clima", origem: LOCAL.nome, previsao: `${fmtDec(amanha.et0, 1)} mm`, conf: null, rotuloConf: "Open-Meteo", t: agora, atencao: amanha.et0 >= 7 });
            d.forEach(x => extras.push({
                modelo: `Previsão de ${nomeDia(x.data)} (${diaMes(x.data)})`, tipo: "Clima", origem: LOCAL.nome,
                previsao: `${fmtDec(x.tmin, 0)}–${fmtDec(x.tmax, 0)}°C · ${fmtDec(x.chuva, 1)} mm`,
                conf: null, rotuloConf: x.prob !== null ? `${fmtDec(x.prob, 0)}% de chuva` : "Open-Meteo", t: agora, atencao: x.tmax >= 38 || x.chuva >= 20
            }));
        }
        lerSalvos().forEach(m => {
            const v = VARIAVEIS[m.variavel];
            if (!v) return;
            linhas.push({
                modelo: m.nome, tipo: "Modelos", origem: "Sensor ESP32",
                previsao: `${fmtDec(m.previsao, v.unidade === "%" ? 0 : 1)}${v.unidade}`, conf: m.precisao, t: m.atualizadoEm,
                detalhe: ALGORITMOS[m.algoritmo], modeloSalvo: m
            });
        });
        linhas.forEach(l => { l.status = l.atencao ? "em atencao" : statusPrevisao(l.conf); });
        extras.forEach(l => { l.status = l.atencao ? "em atencao" : "atualizadas"; });
        return { linhas, extras };
    }

    function fatorClima(dias) {
        if (!dias.length) return 1;
        const tm = mediaOuNull(dias.map(d => (d.tmax + d.tmin) / 2));
        const chuva = soma(dias.map(d => d.chuva));
        let f = 1 - 0.012 * Math.max(0, Math.abs(tm - 27) - 3) - 0.002 * Math.max(0, chuva - 30);
        return limitar(f, 0.9, 1.05);
    }

    function iniciarPrevisoes() {
        const pg = pagina("analista.previsoes");
        if (!pg) return;
        const botao = $(".botao-principal, .cabecalho .btn-principal", pg);
        const corpo = $("tbody", pg);
        const cardTabela = $(".tabela-card", pg);
        const filtros = $$(".filtro select", pg);
        const botaoFiltrar = $(".botao-filtrar", pg);
        const botaoVerTodas = cardTabela ? $(".btn-secundario", cardTabela) : null;
        const cardTend = $(".tendencia-card", pg);
        const selTend = cardTend ? $("select", cardTend) : null;
        let expandido = false;
        let ultimo = null;   // { sensor, clima, previsoes }

        // Opções de filtro com a realidade dos dados
        const opcoes = (sel, lista) => { if (sel) sel.innerHTML = lista.map(t => `<option>${t}</option>`).join(""); };
        opcoes(filtros[0], ["Todas as previsões", "Clima", "Sensor", "Modelos"]);
        opcoes(filtros[1], ["Todas as origens", LOCAL.nome, "Sensor ESP32"]);
        opcoes(filtros[2], ["Todos", "Atualizadas", "Em atenção", "Recalibração"]);
        const rotuloOrigem = filtros[1] && filtros[1].closest(".filtro") ? $("label", filtros[1].closest(".filtro")) : null;
        if (rotuloOrigem) rotuloOrigem.textContent = "Origem dos dados";
        if (selTend) opcoes(selTend, ["Próximos 7 dias", "Próximos 14 dias"]);
        if (cardTend) {
            const h2 = $("h2", cardTend), p = $(".card-cabecalho p", cardTend);
            if (h2) h2.textContent = "Previsão do tempo";
            if (p) p.textContent = `Temperatura máxima prevista para ${LOCAL.nome} (Open-Meteo).`;
        }
        if (cardTabela) {
            const thLav = $$("th", cardTabela).find(th => normalizar(th.textContent) === "lavoura");
            if (thLav) thLav.textContent = "Origem";
        }

        function linhaHTML(l, extra) {
            const confClasse = l.conf === null ? "sucesso" : l.conf < 85 ? "erro" : l.conf < 90 ? "atencao" : "sucesso";
            const confTxt = l.conf === null ? l.rotuloConf : fmtDec(l.conf) + "%";
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><strong>${escapar(l.modelo)}</strong></td>
                <td>${escapar(l.tipo)}</td>
                <td>${escapar(l.origem)}</td>
                <td>${escapar(l.previsao)}</td>
                <td><span class="tag ${l.atencao && l.conf === null ? "atencao" : confClasse}">${escapar(confTxt)}</span></td>
                <td data-t="${l.t}">${relativo(l.t)}</td>`;
            tr.dataset.tipo = normalizar(l.tipo);
            tr.dataset.origem = normalizar(l.origem);
            tr.dataset.status = l.status;
            if (extra) tr.classList.add("linha-extra");
            return tr;
        }

        function renderizarTabela() {
            const tipo = filtros[0].selectedIndex > 0 ? normalizar(filtros[0].value) : "";
            const origem = filtros[1].selectedIndex > 0 ? normalizar(filtros[1].value) : "";
            const status = filtros[2].selectedIndex > 0 ? normalizar(filtros[2].value) : "";
            const filtrando = !!(tipo || origem || status);
            let visiveis = 0;
            $$("tr", corpo).forEach(tr => {
                if (tr.classList.contains("linha-msg")) return;
                const passa = (!tipo || tr.dataset.tipo === tipo) && (!origem || tr.dataset.origem === origem) &&
                    (!status || tr.dataset.status === status) && (expandido || filtrando || !tr.classList.contains("linha-extra"));
                tr.style.display = passa ? "" : "none";
                if (passa) visiveis++;
            });
            let vazia = $(".linha-vazia", corpo);
            if (!visiveis) {
                if (!vazia) {
                    vazia = document.createElement("tr");
                    vazia.className = "linha-vazia";
                    vazia.innerHTML = '<td colspan="6">Nenhuma previsão encontrada para os filtros selecionados.</td>';
                    corpo.appendChild(vazia);
                }
            } else if (vazia) vazia.remove();
            if (botaoVerTodas) botaoVerTodas.style.display = filtrando ? "none" : "";
            return visiveis;
        }

        function desenharTempo(clima, n) {
            if (!cardTend || !clima) return;
            const dias = clima.dias.slice(0, n);
            const barras = $(".barras", cardTend), rotulos = $(".dias", cardTend);
            const maximo = Math.max(45, ...dias.map(d => d.tmax));
            barras.innerHTML = dias.map(d =>
                `<div class="barra-grafico" style="height:0%" data-h="${Math.max(6, (d.tmax / maximo) * 100)}" title="${diaMes(d.data)}: ${fmtDec(d.tmin, 0)}–${fmtDec(d.tmax, 0)}°C · chuva ${fmtDec(d.chuva, 1)} mm"></div>`).join("");
            rotulos.innerHTML = dias.map(d => `<span>${d.data.slice(8, 10)}</span>`).join("");
            requestAnimationFrame(() => requestAnimationFrame(() => {
                $$(".barra-grafico", barras).forEach(b => { b.style.transition = "height .9s cubic-bezier(.2,.8,.2,1)"; b.style.height = b.dataset.h + "%"; });
            }));
        }

        function desenharAtencao(prev, clima) {
            const card = $(".alertas-card", pg);
            if (!card) return;
            const itens = [];
            prev.linhas.filter(l => l.status !== "atualizadas").forEach(l =>
                itens.push({ cor: l.status === "recalibracao" ? "vermelho" : "amarelo", titulo: l.modelo, texto: l.conf !== null ? `Precisão de ${fmtDec(l.conf)}%, abaixo do nível recomendado.` : `Valor previsto de ${l.previsao} merece atenção.` }));
            if (clima) {
                const d = clima.dias;
                const calor = d.reduce((m, x) => (x.tmax > m.tmax ? x : m), d[0]);
                const chuva = d.reduce((m, x) => (x.chuva > m.chuva ? x : m), d[0]);
                if (calor.tmax >= 38) itens.push({ cor: "vermelho", titulo: "Calor intenso previsto", texto: `Máxima de ${fmtDec(calor.tmax, 1)}°C em ${diaMes(calor.data)}.` });
                if (chuva.chuva >= 20) itens.push({ cor: "amarelo", titulo: "Chuva forte prevista", texto: `${fmtDec(chuva.chuva, 0)} mm em ${diaMes(chuva.data)}.` });
            }
            $$(".alerta-previsao", card).forEach(e => e.remove());
            const html = (itens.length ? itens.slice(0, 4) : [{ cor: "azul", titulo: "Tudo em ordem", texto: "Nenhuma previsão precisa de atenção agora." }]).map(i => `
                <div class="alerta-previsao">
                    <div class="alerta-icon ${i.cor}">${i.cor === "azul" ? ICONES.info : ICONES.alerta}</div>
                    <div><strong>${escapar(i.titulo)}</strong><span>${escapar(i.texto)}</span></div>
                </div>`).join("");
            card.insertAdjacentHTML("beforeend", html);
            return itens.length;
        }

        function atualizarDesempenho(prev) {
            const card = $(".modelos-previsao", pg);
            if (!card) return;
            $$(".modelo-previsao-item[data-meu]", card).forEach(e => e.remove());
            const temp = prev.linhas.find(l => l.campo === "temperatura");
            const itemClima = $$(".modelo-previsao-item", card).find(i => normalizar($("strong", i).textContent) === "previsao climatica");
            if (itemClima && temp) {
                const v = $(".modelo-previsao-valor strong", itemClima);
                if (v) v.textContent = fmtDec(temp.conf) + "%";
                const sp = $(".modelo-previsao-valor span", itemClima);
                if (sp) sp.textContent = temp.conf < 90 ? "recalibrar" : "precisão";
                const box = $(".modelo-previsao-valor", itemClima);
                if (box) box.classList.toggle("alerta", temp.conf < 90);
            }
            prev.linhas.filter(l => l.modeloSalvo).forEach(l => {
                const m = l.modeloSalvo, v = VARIAVEIS[m.variavel];
                card.insertAdjacentHTML("beforeend", `
                    <div class="modelo-previsao-item" data-meu="1">
                        <div class="modelo-previsao-icon ${v.cor}">${ICONES.grafico}</div>
                        <div class="modelo-previsao-info"><strong>${escapar(m.nome)}</strong><span>${v.rotulo} · ${escapar(ALGORITMOS[m.algoritmo].split(" (")[0])}</span></div>
                        <div class="modelo-previsao-valor ${m.precisao < 90 ? "alerta" : ""}"><strong>${fmtDec(m.precisao)}%</strong><span>${m.precisao < 90 ? "recalibrar" : "precisão"}</span></div>
                    </div>`);
            });
        }

        async function carregar(manual) {
            const [rs, rc] = await Promise.allSettled([obterSensor(manual), climaPrevisao(14, manual)]);
            if (rs.status === "rejected" && rc.status === "rejected") throw new Error(`${rs.reason.message} ${rc.reason.message}`);
            const sensor = rs.status === "fulfilled" ? rs.value : null;
            const clima = rc.status === "fulfilled" ? rc.value : null;
            const prev = gerarPrevisoes(sensor, clima && { atual: clima.atual, dias: clima.dias.slice(0, 7) });
            ultimo = { sensor, clima, prev };

            // tabela
            corpo.innerHTML = "";
            prev.linhas.forEach(l => corpo.appendChild(linhaHTML(l, false)));
            prev.extras.forEach(l => corpo.appendChild(linhaHTML(l, true)));
            if (manual) $$("tr", corpo).slice(0, 4).forEach((tr, i) => { tr.classList.add("linha-nova"); tr.style.animationDelay = i * 90 + "ms"; });
            renderizarTabela();

            // indicadores
            const comConf = prev.linhas.filter(l => l.conf !== null);
            const precMedia = mediaOuNull(comConf.map(l => l.conf));
            const origens = [sensor ? "Sensor" : null, clima ? "Open-Meteo" : null].filter(Boolean).join(" + ");
            definirIndicador(pg, "Previsões ativas", fmtInt(prev.linhas.length), origens);
            if (precMedia !== null) definirIndicador(pg, "Precisão média", fmtDec(precMedia) + "%");


            // previsão da safra ajustada pelo clima
            const principal = $(".previsao-principal strong", pg);
            if (principal && clima) {
                const fator = fatorClima(clima.dias.slice(0, 7));
                const alvo = 842.3 * fator;
                contar(principal, lerNumero(principal.textContent), alvo, n => fmtDec(n) + " ton");
                const cab = $(".previsao-card .card-cabecalho p", pg);
                if (cab) cab.textContent = "Produção base ajustada pelo clima previsto (Open-Meteo).";
                const tend = $$(".info-previsao", pg).find(i => normalizar($("span", i).textContent) === "tendencia");
                if (tend) { const s = $("strong, span:last-child", tend); if (s) { s.textContent = fator >= 1 ? "↑ Favorável" : "↓ Atenção"; s.className = fator >= 1 ? "positivo" : "atencao"; } }
            }
            if (precMedia !== null) {
                const info = $$(".info-previsao", pg).find(i => normalizar($("span", i).textContent) === "precisao");
                if (info) $("strong", info).textContent = fmtDec(precMedia) + "%";
                const topo = $(".barra-topo strong", pg);
                if (topo) topo.textContent = fmtDec(precMedia) + "%";
                const barra = $(".barra-previsao .barra span", pg);
                if (barra) { barra.style.transition = "width 1s ease"; barra.style.width = precMedia + "%"; }
            }
            const prox = $$(".info-previsao", pg).find(i => normalizar($("span", i).textContent).includes("proxima"));
            if (prox) $("strong", prox).textContent = "5 min";

            atualizarDesempenho(prev);
            const nAtencao = desenharAtencao(prev, clima) || 0;
            definirIndicador(pg, "Previsões em atenção", fmtInt(nAtencao), nAtencao ? "Precisam de análise" : "Tudo em ordem");
            if (clima) desenharTempo(clima, selTend && selTend.selectedIndex === 1 ? 14 : 7);

            faixa(pg, manual ? "Previsões atualizadas" : "Previsões carregadas",
                `${prev.linhas.length} previsões com dados reais (${origens}) às ${horaAgora()}.`);
            return prev;
        }

        // Interações
        if (botaoFiltrar) botaoFiltrar.addEventListener("click", () => { const n = renderizarTabela(); aviso(n ? `${n} previsão(ões) encontrada(s).` : "Nenhuma previsão encontrada."); });
        filtros.forEach(s => s.addEventListener("change", renderizarTabela));
        if (botaoVerTodas) botaoVerTodas.addEventListener("click", () => {
            expandido = !expandido;
            botaoVerTodas.textContent = expandido ? "Ver menos" : "Ver todas";
            renderizarTabela();
        });
        if (selTend) selTend.addEventListener("change", () => { if (ultimo && ultimo.clima) desenharTempo(ultimo.clima, selTend.selectedIndex === 1 ? 14 : 7); });
        const verAlertas = $(".alertas-card .card-cabecalho a", pg);
        if (verAlertas) verAlertas.addEventListener("click", e => { e.preventDefault(); irPara("analista.alertas"); });
        setInterval(() => { $$("td[data-t]", corpo).forEach(td => { td.textContent = relativo(Number(td.dataset.t)); }); }, 15000);
        window.addEventListener("safra:modelos", () => carregar(false).catch(() => {}));

        corpo.innerHTML = '<tr class="linha-msg"><td colspan="6" style="text-align:center;padding:28px 10px;color:#6b7a70">Carregando previsões...</td></tr>';
        carregar(false).catch(e => {
            corpo.innerHTML = `<tr class="linha-msg"><td colspan="6" style="text-align:center;padding:28px 10px;color:#6b7a70">${escapar(e.message)}</td></tr>`;
            faixa(pg, "Sem dados para as previsões", e.message);
        });

        if (botao) botao.addEventListener("click", () => {
            comBotao(botao, "Atualizando...", "Atualizado", async () => {
                barraProgresso(pg, 1600);
                faixa(pg, "Atualizando previsões...", "Buscando o sensor e o Open-Meteo.");
                const inicio = Date.now();
                try { await carregar(true); aviso("Previsões atualizadas com dados reais!"); }
                catch (e) { erroSensor(pg, e); throw e; }
                await esperar(Math.max(0, 1300 - (Date.now() - inicio)));
            }).catch(() => {});
        });

        window.SafraPrevisoes = { ultimo: () => ultimo };
    }


    // =====================================================
    // RELATÓRIOS (geração, visualização, CSV e PDF)
    // =====================================================

    const CHAVE_REL = "safra_relatorios_v1";
    const CATALOGO = {
        desempenho: { titulo: "Desempenho geral", sub: "Indicadores gerais do sistema", tipo: "Desempenho", origem: "Sensor ESP32" },
        modelos: { titulo: "Desempenho dos modelos", sub: "Análise geral dos modelos", tipo: "Modelos", origem: "Sensor ESP32" },
        dados: { titulo: "Qualidade dos dados", sub: "Validação dos registros", tipo: "Dados", origem: "Sensor ESP32" },
        previsoes: { titulo: "Previsão da safra", sub: "Previsões com dados reais", tipo: "Previsões", origem: LOCAL.nome },
        clima: { titulo: "Análise climática", sub: "Histórico das condições", tipo: "Clima", origem: LOCAL.nome }
    };
    const PERIODOS = [
        { rotulo: "Últimos 7 dias", dias: 7 },
        { rotulo: "Últimos 30 dias", dias: 30 },
        { rotulo: "Últimos 6 meses", dias: 183 },
        { rotulo: "Último ano", dias: 365 }
    ];

    function lerRelatorios() {
        try { const l = JSON.parse(localStorage.getItem(CHAVE_REL) || "[]"); return Array.isArray(l) ? l : []; } catch (e) { return []; }
    }
    function gravarRelatorios(l) {
        try { localStorage.setItem(CHAVE_REL, JSON.stringify(l.slice(0, 30))); } catch (e) { /* ok */ }
    }
    const periodoPorDias = dias => PERIODOS.find(p => p.dias === dias) || PERIODOS[1];

    function agruparMeses(lista) {
        const mapa = {};
        lista.forEach(d => { (mapa[d.data.slice(0, 7)] = mapa[d.data.slice(0, 7)] || []).push(d); });
        return Object.keys(mapa).sort().map(k => {
            const g = mapa[k];
            return {
                data: k,
                tmax: mediaOuNull(g.map(x => x.tmax)), tmin: mediaOuNull(g.map(x => x.tmin)),
                chuva: soma(g.map(x => x.chuva)), et0: soma(g.map(x => x.et0 || 0)), dias: g.length
            };
        });
    }

    // Cada relatório vira { titulo, resumo: [[rótulo, valor]], secoes: [{titulo, cab, linhas, nota}] }
    async function construirRelatorio(tipo, dias) {
        const cat = CATALOGO[tipo];
        const periodo = periodoPorDias(dias);
        const rel = { tipo, titulo: cat.titulo, periodo: periodo.rotulo, geradoEm: new Date(), resumo: [], secoes: [] };
        const dh = ms => fmtDataHora(new Date(ms));

        const sensorP = (tipo === "dados" || tipo === "modelos" || tipo === "desempenho" || tipo === "previsoes") ? obterSensor(true) : null;
        let sensor = null, aviso1 = null;
        if (sensorP) { try { sensor = await sensorP; } catch (e) { aviso1 = e.message; } }

        if (tipo === "dados" || tipo === "desempenho") {
            if (sensor) {
                const a = sensor.a;
                rel.resumo.push(["Leituras analisadas", fmtInt(a.n)], ["Dados completos", fmtDec(a.pctCompletos) + "%"], ["Dados válidos", fmtDec(a.pctValidos) + "%"],
                    ["Leituras ausentes", fmtInt(a.faltantes)], ["Registros inconsistentes", fmtInt(a.inconsistentes)], ["Qualidade geral", fmtDec(a.pctGeral) + "%"]);
                if (tipo === "dados") {
                    const temps = a.ordenadas.map(l => l.temperatura), umids = a.ordenadas.map(l => l.umidade).filter(v => v !== null);
                    rel.secoes.push({
                        titulo: "Estatísticas do sensor (DHT11 / ESP32)", cab: ["Variável", "Mínima", "Média", "Máxima"],
                        linhas: [
                            ["Temperatura (°C)", fmtDec(Math.min(...temps), 1), fmtDec(mediaOuNull(temps), 1), fmtDec(Math.max(...temps), 1)],
                            ["Umidade (%)", fmtDec(Math.min(...umids), 0), fmtDec(mediaOuNull(umids), 0), fmtDec(Math.max(...umids), 0)]
                        ]
                    });
                    rel.secoes.push({
                        titulo: "Últimas leituras", cab: ["Data e hora", "Temperatura", "Umidade", "Status"],
                        linhas: a.ordenadas.slice(-25).reverse().map(l => [fmtDataHora(new Date(l.data_hora)), fmtDec(l.temperatura, 1) + "°C",
                            l.umidade !== null ? fmtDec(l.umidade, 0) + "%" : "—", tempOk(l.temperatura) && umidOk(l.umidade) ? "Processado" : "Inconsistente"])
                    });
                    if (a.lacunas.length) rel.secoes.push({
                        titulo: "Intervalos sem leitura", cab: ["De", "Até", "Leituras ausentes"],
                        linhas: a.lacunas.slice(-15).reverse().map(l => [dh(l.de), dh(l.ate), "≈ " + l.faltam])
                    });
                }
            } else rel.secoes.push({ titulo: "Sensor indisponível", nota: aviso1 });
        }

        if (tipo === "modelos" || tipo === "desempenho") {
            const salvos = lerSalvos();
            rel.resumo.push(["Modelos criados", fmtInt(salvos.length)]);
            if (salvos.length) rel.resumo.push(["Precisão dos modelos criados", fmtDec(mediaOuNull(salvos.map(m => m.precisao))) + "%"]);
            if (tipo === "modelos") {
                rel.secoes.push({
                    titulo: "Modelos criados com dados reais",
                    cab: ["Modelo", "Variável", "Algoritmo", "Leituras", "Precisão", "Erro médio", "Próxima leitura", "Versão"],
                    linhas: salvos.map(m => { const v = VARIAVEIS[m.variavel]; return [m.nome, v.rotulo, ALGORITMOS[m.algoritmo], m.nLeituras, fmtDec(m.precisao) + "%", "±" + fmtDec(m.mae, 2) + " " + v.unidade, fmtDec(m.previsao, 1) + " " + v.unidade, m.versao]; }),
                    nota: salvos.length ? "Precisão = 100% menos o erro percentual médio em testes com as últimas 30% das leituras." : "Nenhum modelo foi criado ainda. Use \"Criar novo modelo\" na tela Modelos."
                });
            }
        }

        if (tipo === "previsoes" || tipo === "desempenho") {
            let clima = null, erroClima = null;
            try { clima = await climaPrevisao(7, true); } catch (e) { erroClima = e.message; }
            const prev = gerarPrevisoes(sensor, clima);
            if (tipo === "desempenho") rel.resumo.push(["Previsões geradas", fmtInt(prev.linhas.length)]);
            if (tipo === "previsoes") {
                rel.resumo.push(["Previsões geradas", fmtInt(prev.linhas.length)]);
                if (clima) {
                    rel.resumo.push(["Chuva prevista (7 dias)", fmtDec(soma(clima.dias.map(d => d.chuva)), 1) + " mm"],
                        ["Temperatura máx. prevista", fmtDec(Math.max(...clima.dias.map(d => d.tmax)), 1) + "°C"]);
                }
                rel.secoes.push({
                    titulo: "Previsões atuais", cab: ["Previsão", "Tipo", "Origem", "Valor", "Confiança"],
                    linhas: prev.linhas.map(l => [l.modelo, l.tipo, l.origem, l.previsao, l.conf !== null ? fmtDec(l.conf) + "%" : l.rotuloConf])
                });
                if (clima) rel.secoes.push({
                    titulo: `Previsão do tempo — ${LOCAL.nome} (Open-Meteo)`, cab: ["Dia", "Mínima", "Máxima", "Chuva", "Chance de chuva", "Evapotranspiração"],
                    linhas: clima.dias.map(d => [`${nomeDia(d.data)} ${diaMes(d.data)}`, fmtDec(d.tmin, 0) + "°C", fmtDec(d.tmax, 0) + "°C", fmtDec(d.chuva, 1) + " mm", d.prob !== null ? fmtDec(d.prob, 0) + "%" : "—", d.et0 !== null ? fmtDec(d.et0, 1) + " mm" : "—"])
                });
                if (erroClima) rel.secoes.push({ titulo: "Open-Meteo indisponível", nota: erroClima });
            }
        }

        if (tipo === "clima") {
            try {
                const hist = await climaHistorico(dias, true);
                if (!hist.length) throw new Error("O Open-Meteo não retornou dados para o período.");
                rel.resumo.push(["Temperatura máxima média", fmtDec(mediaOuNull(hist.map(d => d.tmax)), 1) + "°C"], ["Temperatura mínima média", fmtDec(mediaOuNull(hist.map(d => d.tmin)), 1) + "°C"],
                    ["Chuva acumulada", fmtDec(soma(hist.map(d => d.chuva)), 1) + " mm"], ["Dias com chuva", fmtInt(hist.filter(d => d.chuva >= 1).length)],
                    ["Evapotranspiração total", fmtDec(soma(hist.map(d => d.et0 || 0)), 0) + " mm"], ["Dias analisados", fmtInt(hist.length)]);
                if (dias > 90) {
                    rel.secoes.push({
                        titulo: `Resumo mensal — ${LOCAL.nome} (Open-Meteo)`, cab: ["Mês", "Máx. média", "Mín. média", "Chuva", "Evapotranspiração"],
                        linhas: agruparMeses(hist).map(m => [`${m.data.slice(5, 7)}/${m.data.slice(0, 4)}`, fmtDec(m.tmax, 1) + "°C", fmtDec(m.tmin, 1) + "°C", fmtDec(m.chuva, 0) + " mm", fmtDec(m.et0, 0) + " mm"])
                    });
                } else {
                    rel.secoes.push({
                        titulo: `Dados diários — ${LOCAL.nome} (Open-Meteo)`, cab: ["Data", "Mínima", "Máxima", "Chuva", "Evapotranspiração"],
                        linhas: hist.slice().reverse().map(d => [diaMes(d.data) + "/" + d.data.slice(0, 4), fmtDec(d.tmin, 1) + "°C", fmtDec(d.tmax, 1) + "°C", fmtDec(d.chuva, 1) + " mm", d.et0 !== null ? fmtDec(d.et0, 1) + " mm" : "—"])
                    });
                }
                // estatística do sensor no mesmo relatório, se disponível
                try {
                    const s = await obterSensor(false);
                    const t = s.a.ordenadas.map(l => l.temperatura);
                    rel.secoes.push({
                        titulo: "Comparação com o sensor local", cab: ["Fonte", "Temp. mínima", "Temp. média", "Temp. máxima"],
                        linhas: [["Sensor ESP32 (últimas leituras)", fmtDec(Math.min(...t), 1) + "°C", fmtDec(mediaOuNull(t), 1) + "°C", fmtDec(Math.max(...t), 1) + "°C"]]
                    });
                } catch (e) { /* sensor opcional aqui */ }
            } catch (e) { rel.secoes.push({ titulo: "Open-Meteo indisponível", nota: e.message }); }
        }
        return rel;
    }

    function relatorioParaHTML(rel, paraImpressao) {
        const kpis = rel.resumo.length ? `<div class="rel-kpis">${rel.resumo.map(([r, v]) => `<div><span>${escapar(r)}</span><strong>${escapar(v)}</strong></div>`).join("")}</div>` : "";
        const secoes = rel.secoes.map(s => `
            <section class="rel-secao">
                <h3>${escapar(s.titulo)}</h3>
                ${s.cab ? `<div class="rel-tabela"><table><thead><tr>${s.cab.map(c => `<th>${escapar(c)}</th>`).join("")}</tr></thead><tbody>${
                    s.linhas.length ? s.linhas.map(l => `<tr>${l.map(c => `<td>${escapar(c)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${s.cab.length}">Sem registros.</td></tr>`
                }</tbody></table></div>` : ""}
                ${s.nota ? `<p class="rel-nota">${escapar(s.nota)}</p>` : ""}
            </section>`).join("");
        const cab = `<header class="rel-cab"><h2>${escapar(rel.titulo)}</h2><p>${escapar(rel.periodo)} · gerado em ${rel.geradoEm.toLocaleDateString("pt-BR")} às ${rel.geradoEm.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} · Safra • Vale do São Francisco</p></header>`;
        return paraImpressao ? cab + kpis + secoes : cab + kpis + secoes;
    }

    function relatorioParaCSV(rel) {
        const aspas = c => `"${String(c).replace(/"/g, '""')}"`;
        const linhas = [[rel.titulo], [rel.periodo], []];
        rel.resumo.forEach(r => linhas.push(r));
        rel.secoes.forEach(s => {
            linhas.push([], [s.titulo]);
            if (s.cab) { linhas.push(s.cab); s.linhas.forEach(l => linhas.push(l)); }
            if (s.nota) linhas.push([s.nota]);
        });
        return "\uFEFF" + linhas.map(l => l.map(aspas).join(";")).join("\r\n");
    }

    function baixarArquivo(nome, conteudo, tipoMime) {
        const url = URL.createObjectURL(new Blob([conteudo], { type: tipoMime }));
        const a = document.createElement("a");
        a.href = url; a.download = nome;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function imprimirRelatorio(rel) {
        const quadro = document.createElement("iframe");
        quadro.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
        document.body.appendChild(quadro);
        const doc = quadro.contentWindow.document;
        doc.open();
        doc.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapar(rel.titulo)}</title>
            <style>
                body{font-family:Arial,Helvetica,sans-serif;color:#1f3a2c;margin:28px}
                h2{margin:0 0 4px;font-size:24px;color:#1d6b3c} .rel-cab p{margin:0 0 18px;color:#6b7a70;font-size:13px}
                .rel-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:18px}
                .rel-kpis div{border:1px solid #dce1da;border-radius:8px;padding:10px 12px}
                .rel-kpis span{display:block;font-size:12px;color:#6b7a70} .rel-kpis strong{font-size:18px}
                h3{font-size:15px;margin:22px 0 8px} table{width:100%;border-collapse:collapse;font-size:12px}
                th{background:#edf5ea;text-align:left} th,td{border:1px solid #dce1da;padding:6px 8px}
                .rel-nota{font-size:12px;color:#6b7a70}
            </style></head><body>${relatorioParaHTML(rel, true)}</body></html>`);
        doc.close();
        setTimeout(() => { quadro.contentWindow.focus(); quadro.contentWindow.print(); setTimeout(() => quadro.remove(), 2000); }, 300);
    }

    // Janela do relatório (carrega, mostra e oferece CSV / PDF)
    async function abrirRelatorio(tipo, dias) {
        const modal = abrirModal(`
            <div class="treino"><div class="treino-spinner"></div><h2>Gerando relatório...</h2><p>Reunindo dados reais do sensor e do Open-Meteo.</p></div>`, 860);
        fundoModal.dataset.travado = "1";
        let rel;
        try { rel = await construirRelatorio(tipo, dias); }
        catch (e) {
            delete fundoModal.dataset.travado;
            modal.innerHTML = `<div class="treino treino-erro"><div class="treino-check erro">!</div><h2>Não foi possível gerar</h2><p>${escapar(e.message)}</p>
                <div class="modal-rodape" style="justify-content:center"><button type="button" class="btn-principal" data-fechar-modal>Fechar</button></div></div>`;
            $("[data-fechar-modal]", modal).addEventListener("click", fecharModal);
            return null;
        }
        delete fundoModal.dataset.travado;
        modal.innerHTML = `
            <div class="modal-topo"><div><span class="rel-tipo">${escapar(CATALOGO[tipo].tipo)}</span></div>
                <button type="button" class="modal-x" data-fechar-modal aria-label="Fechar">×</button></div>
            <div class="rel-corpo">${relatorioParaHTML(rel)}</div>
            <div class="modal-rodape">
                <button type="button" class="btn-secundario" data-fechar-modal>Fechar</button>
                <button type="button" class="btn-secundario" data-csv>Baixar CSV</button>
                <button type="button" class="btn-principal" data-pdf>Imprimir / Salvar PDF</button>
            </div>`;
        $$("[data-fechar-modal]", modal).forEach(b => b.addEventListener("click", fecharModal));
        $("[data-csv]", modal).addEventListener("click", () => {
            baixarArquivo(`safra-${tipo}-${isoData(new Date())}.csv`, relatorioParaCSV(rel), "text/csv;charset=utf-8;");
            aviso("Relatório baixado em CSV.");
        });
        $("[data-pdf]", modal).addEventListener("click", () => imprimirRelatorio(rel));
        return rel;
    }

    function iniciarRelatorios() {
        const pg = pagina("analista.relatorios");
        if (!pg) return;
        const botaoGerar = $(".cabecalho-pagina .btn-principal", pg) || $(".btn-principal", pg);
        const selects = $$(".filtros-card select", pg);
        const botaoFiltrar = $(".btn-filtrar", pg);
        const cardTabela = $(".tabela-card", pg);
        const corpo = cardTabela ? $("tbody", cardTabela) : null;
        const botaoVerTodos = cardTabela ? $(".btn-secundario", cardTabela) : null;
        const cargaInicial = Date.now();
        let expandido = false;

        // opções reais dos filtros
        const opcoes = (sel, lista) => { if (sel) sel.innerHTML = lista.map(t => `<option>${t}</option>`).join(""); };
        opcoes(selects[0], ["Todos", "Dados", "Modelos", "Previsões", "Clima", "Desempenho"]);
        opcoes(selects[1], PERIODOS.map(p => p.rotulo));
        selects[1].selectedIndex = 1;
        opcoes(selects[2], ["Todas as origens", LOCAL.nome, "Sensor ESP32"]);
        const rotOrigem = selects[2] && $("label", selects[2].closest(".campo"));
        if (rotOrigem) rotOrigem.textContent = "Origem dos dados";

        const diasSelecionados = () => PERIODOS[Math.max(0, selects[1].selectedIndex)].dias;

        function iconeLinha() { return ICONES.doc; }

        function linhaRel(r, extra) {
            const cat = CATALOGO[r.tipo];
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td><div class="nome-relatorio"><span class="mini-icone">${iconeLinha()}</span><div><strong>${escapar(r.titulo || cat.titulo)}</strong><small>${escapar(cat.sub)}</small></div></div></td>
                <td><span class="tipo">${escapar(cat.tipo)}</span></td>
                <td>${escapar(periodoPorDias(r.dias).rotulo)}</td>
                <td><span class="status-tag sucesso">Pronto</span></td>
                <td data-t="${r.criadoEm}">${relativo(r.criadoEm).replace("há", "Há")}</td>
                <td><button type="button" class="btn-ver" data-ver>Ver relatório</button></td>`;
            tr.dataset.tipo = normalizar(cat.tipo);
            tr.dataset.origem = normalizar(cat.origem);
            tr.dataset.relTipo = r.tipo;
            tr.dataset.relDias = String(r.dias);
            if (extra) tr.classList.add("linha-extra");
            return tr;
        }

        function montarTabela() {
            if (!corpo) return;
            const dias = diasSelecionados();
            const geradosPorVoce = lerRelatorios();
            const automaticos = ["modelos", "dados", "previsoes", "clima"].map((t, i) => ({ tipo: t, dias, criadoEm: cargaInicial - i * 120000, titulo: null }));
            corpo.innerHTML = "";
            geradosPorVoce.forEach(r => corpo.appendChild(linhaRel(r, false)));
            automaticos.forEach((r, i) => corpo.appendChild(linhaRel(r, geradosPorVoce.length + i >= 4)));
            renderizarTabela();
            atualizarIndicadores();
        }

        function renderizarTabela() {
            if (!corpo) return 0;
            const tipo = selects[0].selectedIndex > 0 ? normalizar(selects[0].value) : "";
            const origem = selects[2].selectedIndex > 0 ? normalizar(selects[2].value) : "";
            const filtrando = !!(tipo || origem);
            let visiveis = 0;
            $$("tr", corpo).forEach(tr => {
                if (tr.classList.contains("linha-vazia")) return;
                const passa = (!tipo || tr.dataset.tipo === tipo) && (!origem || tr.dataset.origem === origem) && (expandido || filtrando || !tr.classList.contains("linha-extra"));
                tr.style.display = passa ? "" : "none";
                if (passa) visiveis++;
            });
            let vazia = $(".linha-vazia", corpo);
            if (!visiveis) {
                if (!vazia) {
                    vazia = document.createElement("tr");
                    vazia.className = "linha-vazia";
                    vazia.innerHTML = '<td colspan="6">Nenhum relatório encontrado para os filtros selecionados.</td>';
                    corpo.appendChild(vazia);
                }
            } else if (vazia) vazia.remove();
            if (botaoVerTodos) botaoVerTodos.style.display = filtrando ? "none" : "";
            return visiveis;
        }

        function atualizarIndicadores() {
            definirIndicador(pg, "Relatórios disponíveis", String(Object.keys(CATALOGO).length), "Tipos de relatório");
            definirIndicador(pg, "Relatórios gerados", String(lerRelatorios().length), "Gerados por você");
        }

        // evolução do clima (barras com o Open-Meteo)
        async function desenharEvolucao() {
            const cardEv = $$(".card", pg).find(c => { const h = $("h2", c); return h && normalizar(h.textContent) === "evolucao dos indicadores"; });
            if (!cardEv) return;
            const h2 = $("h2", cardEv), p = $(".card-cabecalho p", cardEv), tag = $(".periodo-card", cardEv);
            if (h2) h2.textContent = "Evolução do clima";
            if (tag) tag.textContent = PERIODOS[selects[1].selectedIndex].rotulo;
            if (p) p.textContent = `Temperatura máxima média em ${LOCAL.nome} (Open-Meteo).`;
            try {
                const hist = await climaHistorico(diasSelecionados(), false);
                const n = 5, tam = Math.max(1, Math.ceil(hist.length / n));
                const grupos = [];
                for (let i = 0; i < hist.length; i += tam) grupos.push(hist.slice(i, i + tam));
                const medias = grupos.map(g => mediaOuNull(g.map(x => x.tmax)));
                const escala = 45;
                const barras = $(".barras", cardEv);
                barras.innerHTML = grupos.map((g, i) => `
                    <div class="barra-grafico"><span style="height:0%" data-h="${Math.max(4, (medias[i] / escala) * 100)}" title="${fmtDec(medias[i], 1)}°C"></span>
                    <small>${diaMes(g[0].data)}</small></div>`).join("");
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    $$(".barra-grafico span", barras).forEach(s => { s.style.transition = "height .9s cubic-bezier(.2,.8,.2,1)"; s.style.height = s.dataset.h + "%"; });
                }));
                $$(".grafico-y span", cardEv).forEach((s, i) => { s.textContent = Math.round(escala * (4 - i) / 4) + "°C"; });
            } catch (e) {
                const barras = $(".barras", cardEv);
                if (barras) barras.innerHTML = `<p class="rel-nota" style="padding:24px">${escapar(e.message)}</p>`;
            }
        }

        // indicadores de desempenho com dados reais
        async function atualizarResumo(manual) {
            let sensor = null;
            try { sensor = await obterSensor(manual); } catch (e) { faixa(pg, "Sem comunicação com o sensor", e.message); }
            const r = resumoModelos();
            const barra = (rotulo, pct) => {
                const i = $$(".desempenho-item", pg).find(el => normalizar($("span", el).textContent) === normalizar(rotulo));
                const b = i && $(".barra span", i);
                if (b) { b.style.transition = "width 1s ease"; b.style.width = limitar(pct, 2, 100) + "%"; }
            };
            definirIndicador(pg, "Precisão média", fmtDec(r.precisao) + "%"); barra("Precisão média", r.precisao);
            definirIndicador(pg, "Modelos ativos", fmtInt(r.total)); barra("Modelos ativos", (r.total / 12) * 100);
            if (sensor) {
                const a = sensor.a;
                definirIndicador(pg, "Dados processados", fmtInt(a.n), "Leituras analisadas");
                definirIndicador(pg, "Dados válidos", fmtDec(a.pctValidos) + "%"); barra("Dados válidos", a.pctValidos);
                const q = $(".qualidade-dados", pg);
                if (q) {
                    $("strong", q).textContent = fmtDec(a.pctGeral) + "%";
                    const st = $(".status-verde", q);
                    if (st) st.textContent = a.pctGeral >= 97 ? "Excelente" : a.pctGeral >= 90 ? "Boa" : "Regular";
                }
                // modelos: atualiza "Previsão climática" e acrescenta os criados
                const lista = $(".lista-indicadores", pg);
                if (lista) {
                    $$(".modelo-indicador[data-meu]", lista).forEach(e => e.remove());
                    const temp = melhorModelo(a.ordenadas.map(l => l.temperatura));
                    const clim = $$(".modelo-indicador", lista).find(i => normalizar($(".modelo-nome span:last-child", i).textContent) === "previsao climatica");
                    if (clim && temp) $("strong", clim).textContent = fmtDec(temp.precisao) + "%";
                    lerSalvos().forEach(m => {
                        lista.insertAdjacentHTML("beforeend", `
                            <div class="modelo-indicador" data-meu="1"><div class="modelo-nome"><span class="bolinha ${m.precisao < 90 ? "amarelo" : "verde"}"></span><span>${escapar(m.nome)}</span></div><strong>${fmtDec(m.precisao)}%</strong></div>`);
                    });
                }
                faixa(pg, "Sistema de relatórios operacional", `Dados do sensor e do Open-Meteo atualizados às ${horaAgora()}.`);
            }
            try {
                const c = await climaPrevisao(7, false);
                const prev = gerarPrevisoes(sensor, c);
                definirIndicador(pg, "Previsões processadas", fmtInt(prev.linhas.length + prev.extras.length));
                barra("Previsões processadas", ((prev.linhas.length + prev.extras.length) / 20) * 100);
            } catch (e) { /* Open-Meteo opcional aqui */ }
        }

        // interações
        if (corpo) corpo.addEventListener("click", e => {
            const b = e.target.closest("[data-ver]");
            if (!b) return;
            const tr = b.closest("tr");
            abrirRelatorio(tr.dataset.relTipo, Number(tr.dataset.relDias));
        });
        $$(".relatorio-item", pg).forEach(item => {
            const btn = $("button", item);
            const nome = normalizar($("strong", item).textContent);
            const tipo = nome.includes("desempenho") ? "modelos" : nome.includes("qualidade") ? "dados" : nome.includes("safra") ? "previsoes" : "clima";
            if (btn) btn.addEventListener("click", () => abrirRelatorio(tipo, diasSelecionados()));
        });
        if (botaoFiltrar) botaoFiltrar.addEventListener("click", () => {
            montarTabela();
            desenharEvolucao();
            const n = renderizarTabela();
            aviso(n ? `${n} relatório(s) encontrado(s).` : "Nenhum relatório encontrado.");
        });
        selects[1].addEventListener("change", () => { montarTabela(); desenharEvolucao(); });
        selects[0].addEventListener("change", renderizarTabela);
        selects[2].addEventListener("change", renderizarTabela);
        if (botaoVerTodos) botaoVerTodos.addEventListener("click", () => {
            expandido = !expandido;
            botaoVerTodos.textContent = expandido ? "Ver menos" : "Ver todos";
            renderizarTabela();
        });
        setInterval(() => { if (corpo) $$("td[data-t]", corpo).forEach(td => { td.textContent = relativo(Number(td.dataset.t)).replace("há", "Há"); }); }, 15000);
        window.addEventListener("safra:modelos", () => atualizarResumo(false));

        // gerar relatório
        if (botaoGerar) botaoGerar.addEventListener("click", () => {
            const opTipos = Object.keys(CATALOGO).map(k => `<option value="${k}">${CATALOGO[k].tipo} — ${CATALOGO[k].titulo}</option>`).join("");
            const opPer = PERIODOS.map((p, i) => `<option value="${p.dias}" ${i === selects[1].selectedIndex ? "selected" : ""}>${p.rotulo}</option>`).join("");
            const modal = abrirModal(`
                <form id="formRelatorio" novalidate>
                    <div class="modal-topo"><div><h2>Gerar relatório</h2><p class="modal-sub">Os relatórios usam as leituras reais do sensor e os dados do Open-Meteo.</p></div>
                        <button type="button" class="modal-x" data-fechar-modal aria-label="Fechar">×</button></div>
                    <label class="campo"><span>Tipo de relatório</span><select name="tipo">${opTipos}</select></label>
                    <label class="campo"><span>Período <em>(vale para o clima)</em></span><select name="dias">${opPer}</select></label>
                    <label class="campo"><span>O que fazer ao terminar</span>
                        <select name="saida"><option value="ver">Visualizar na tela</option><option value="csv">Baixar CSV</option><option value="pdf">Imprimir / Salvar PDF</option></select></label>
                    <div class="modal-rodape"><button type="button" class="btn-secundario" data-fechar-modal>Cancelar</button><button type="submit" class="btn-principal">Gerar relatório</button></div>
                </form>`, 520);
            const form = $("#formRelatorio", modal);
            form.addEventListener("submit", async ev => {
                ev.preventDefault();
                const tipo = form.elements.tipo.value, dias = Number(form.elements.dias.value), saida = form.elements.saida.value;
                if (saida === "ver") {
                    fecharModal();
                    const rel = await abrirRelatorio(tipo, dias);
                    if (rel) registrar(tipo, dias);
                    return;
                }
                fundoModal.dataset.travado = "1";
                modal.innerHTML = `<div class="treino"><div class="treino-spinner"></div><h2>Gerando relatório...</h2><p>Reunindo dados reais.</p></div>`;
                try {
                    const rel = await construirRelatorio(tipo, dias);
                    delete fundoModal.dataset.travado;
                    fecharModal();
                    if (saida === "csv") { baixarArquivo(`safra-${tipo}-${isoData(new Date())}.csv`, relatorioParaCSV(rel), "text/csv;charset=utf-8;"); aviso("Relatório baixado em CSV."); }
                    else imprimirRelatorio(rel);
                    registrar(tipo, dias);
                } catch (e) {
                    delete fundoModal.dataset.travado;
                    fecharModal();
                    aviso(e.message);
                }
            });
        });

        function registrar(tipo, dias) {
            const lista = lerRelatorios();
            lista.unshift({ tipo, dias, criadoEm: Date.now() });
            gravarRelatorios(lista);
            montarTabela();
            const primeira = $("tr", corpo);
            if (primeira) primeira.classList.add("linha-nova");
            aviso("Relatório gerado e adicionado à lista.");
        }

        montarTabela();
        desenharEvolucao();
        atualizarResumo(false);
        window.SafraRelatorios = { atualizar: () => { desenharEvolucao(); return atualizarResumo(true); } };
    }

    // ==============================
    // INICIAR
    // ==============================

    function iniciar() {
        iniciarModelos();
        iniciarInicial();
        iniciarDados();
        iniciarPrevisoes();
        iniciarAlertas();
        iniciarRelatorios();
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
    else iniciar();

})();


/* ================= sair da conta ================= */

document.addEventListener("DOMContentLoaded", () => {

    const botoesSair = document.querySelectorAll(".sair, .btn-sair");

    botoesSair.forEach(botao => {
        botao.addEventListener("click", (evento) => {
            evento.preventDefault();

            const confirmar = confirm("Deseja realmente sair da sua conta?");

            if (confirmar) {
                sessionStorage.removeItem("safra_logado");
                window.location.replace("/Frontend/Login/login.html");
            }
        });
    });

});