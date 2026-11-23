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

    const filtros = document.querySelectorAll(
        "select"
    );


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
/* ================= analista.dados.js ================= */

document.addEventListener("DOMContentLoaded", () => {

    // ==============================
    // DADOS DA PÁGINA
    // ==============================

    const dados = {
        processados: "18.452",
        integridade: "98,7%",
        fontes: "8",
        atencao: "12"
    };


    // ==============================
    // ELEMENTOS DOS INDICADORES
    // ==============================

    const processados = document.querySelector(
        "#dadosProcessados, #processados, [data-dados='processados']"
    );

    const integridade = document.querySelector(
        "#integridade, [data-dados='integridade']"
    );

    const fontes = document.querySelector(
        "#fontesDados, #fontes, [data-dados='fontes']"
    );

    const atencao = document.querySelector(
        "#dadosAtencao, #atencao, [data-dados='atencao']"
    );


    // ==============================
    // PREENCHER OS INDICADORES
    // ==============================

    if (processados) {
        processados.textContent = dados.processados;
    }

    if (integridade) {
        integridade.textContent = dados.integridade;
    }

    if (fontes) {
        fontes.textContent = dados.fontes;
    }

    if (atencao) {
        atencao.textContent = dados.atencao;
    }


    // ==============================
    // FILTROS
    // ==============================

    const filtros = document.querySelectorAll(
        "select"
    );


    filtros.forEach(filtro => {

        filtro.addEventListener("change", () => {

            console.log(
                "Filtro selecionado:",
                filtro.value
            );

            mostrarMensagem(
                `Filtro "${filtro.value}" selecionado.`
            );

        });

    });


    // ==============================
    // BOTÕES DE ATUALIZAÇÃO
    // ==============================

    const botoesAtualizar = document.querySelectorAll(
        "#btnAtualizar, .btn-atualizar, .btn-atualizar-dados"
    );


    botoesAtualizar.forEach(botao => {

        botao.addEventListener("click", () => {

            botao.disabled = true;
            botao.textContent = "Atualizando...";


            setTimeout(() => {

                if (processados) {
                    processados.textContent =
                        dados.processados;
                }

                if (integridade) {
                    integridade.textContent =
                        dados.integridade;
                }

                if (fontes) {
                    fontes.textContent =
                        dados.fontes;
                }

                if (atencao) {
                    atencao.textContent =
                        dados.atencao;
                }


                botao.disabled = false;
                botao.textContent = "Atualizar dados";


                mostrarMensagem(
                    "Dados atualizados com sucesso!"
                );

            }, 800);

        });

    });


    // ==============================
    // FONTES DE DADOS
    // ==============================

    const fontesDados = document.querySelectorAll(
        ".fonte-dados, .card-fonte, .fonte-card"
    );


    fontesDados.forEach(fonte => {

        fonte.addEventListener("click", () => {

            const nomeFonte = fonte.querySelector(
                "h3, h4, .nome-fonte"
            );


            if (nomeFonte) {

                mostrarMensagem(
                    `Fonte selecionada: ${nomeFonte.textContent.trim()}`
                );

            } else {

                mostrarMensagem(
                    "Fonte de dados selecionada."
                );

            }

        });

    });


    // ==============================
    // STATUS DOS DADOS
    // ==============================

    const indicadores = document.querySelectorAll(
        ".indicador, .status-dado, .card-status"
    );


    indicadores.forEach(indicador => {

        indicador.addEventListener("click", () => {

            indicador.classList.toggle(
                "selecionado"
            );

        });

    });


    // ==============================
    // ANIMAÇÃO DOS CARDS
    // ==============================

    const cards = document.querySelectorAll(
        ".card, .stat-card, .indicador, .fonte-dados, .card-fonte"
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
/* ================= analista.modelo.js ================= */

document.addEventListener("DOMContentLoaded", () => {

    // ==============================
    // DADOS DOS MODELOS
    // ==============================

    const modelos = [
        {
            nome: "Previsão de produtividade",
            precisao: "96,2%",
            versao: "v2.4",
            status: "Ativo"
        },
        {
            nome: "Previsão climática",
            precisao: "94,7%",
            versao: "v3.1",
            status: "Ativo"
        },
        {
            nome: "Estimativa de colheita",
            precisao: "89,4%",
            versao: "v1.8",
            status: "Atenção"
        },
        {
            nome: "Previsão de preço",
            precisao: "93,1%",
            versao: "v2.1",
            status: "Ativo"
        },
        {
            nome: "Qualidade da produção",
            precisao: "91,8%",
            versao: "v1.5",
            status: "Em treinamento"
        },
        {
            nome: "Necessidade de irrigação",
            precisao: "92,6%",
            versao: "v2.0",
            status: "Em treinamento"
        }
    ];


    // ==============================
    // ELEMENTOS DA PÁGINA
    // ==============================

    const cardsModelos = document.querySelectorAll(
        ".modelo-card, .card-modelo"
    );


    // ==============================
    // FILTROS DOS MODELOS
    // ==============================

    const filtros = document.querySelectorAll(
        "select"
    );


    filtros.forEach(filtro => {

        filtro.addEventListener("change", () => {

            const valor = filtro.value
                .toLowerCase()
                .trim();

            cardsModelos.forEach(card => {

                const texto = card.textContent
                    .toLowerCase();

                if (
                    !valor ||
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

        });

    });


    // ==============================
    // BOTÃO CRIAR NOVO MODELO
    // ==============================

    const btnCriarModelo = document.querySelector(
        "#btnCriarModelo, .btn-criar-modelo"
    );


    if (btnCriarModelo) {

        btnCriarModelo.addEventListener("click", () => {

            mostrarMensagem(
                "Opção para criar um novo modelo selecionada."
            );

        });

    }


    // ==============================
    // BOTÕES DOS MODELOS
    // ==============================

    const botoesModelo = document.querySelectorAll(
        ".btn-detalhes, .ver-detalhes, .btn-modelo"
    );


    botoesModelo.forEach(botao => {

        botao.addEventListener("click", () => {

            const card = botao.closest(
                ".modelo-card, .card-modelo"
            );


            if (card) {

                const nome = card.querySelector(
                    "h3, h4, .nome-modelo"
                );


                if (nome) {

                    mostrarMensagem(
                        `Abrindo detalhes de ${nome.textContent.trim()}...`
                    );

                } else {

                    mostrarMensagem(
                        "Abrindo detalhes do modelo..."
                    );

                }

            }

        });

    });


    // ==============================
    // ATUALIZAÇÃO DOS MODELOS
    // ==============================

    const botoesAtualizar = document.querySelectorAll(
        ".btn-atualizar-modelo, .atualizar-modelo"
    );


    botoesAtualizar.forEach(botao => {

        botao.addEventListener("click", () => {

            botao.disabled = true;
            botao.textContent = "Atualizando...";


            setTimeout(() => {

                botao.disabled = false;
                botao.textContent = "Atualizar";

                mostrarMensagem(
                    "Modelo atualizado com sucesso!"
                );

            }, 800);

        });

    });


    // ==============================
    // ANIMAÇÃO DOS CARDS
    // ==============================

    cardsModelos.forEach((card, index) => {

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

    const filtros = document.querySelectorAll(
        "select"
    );

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
/* ================= telainicial.analista.js ================= */

document.addEventListener("DOMContentLoaded", () => {

    // Dados do Dashboard da Analista
    const dados = {
        modelos: "6",
        precisao: "94,8%",
        processados: "18.452",
        previsao: "842,3 ton"
    };

    // Elementos do HTML
    const modelos = document.getElementById("modelos");
    const precisao = document.getElementById("precisao");
    const processados = document.getElementById("processados");
    const previsao = document.getElementById("previsao");

    // Preenche os dados
    if (modelos) modelos.textContent = dados.modelos;
    if (precisao) precisao.textContent = dados.precisao;
    if (processados) processados.textContent = dados.processados;
    if (previsao) previsao.textContent = dados.previsao;

    // Botão atualizar
    const btnAtualizar = document.querySelector("#btnAtualizar, .btn-atualizar");

    if (btnAtualizar) {

        btnAtualizar.addEventListener("click", () => {

            btnAtualizar.disabled = true;
            btnAtualizar.textContent = "Atualizando...";

            setTimeout(() => {

                if (modelos) modelos.textContent = dados.modelos;
                if (precisao) precisao.textContent = dados.precisao;
                if (processados) processados.textContent = dados.processados;
                if (previsao) previsao.textContent = dados.previsao;

                btnAtualizar.disabled = false;
                btnAtualizar.textContent = "Atualizar";

                mostrarMensagem("Dados dos modelos atualizados!");

            }, 800);

        });

    }

    // Pequena animação nos cards
    const cards = document.querySelectorAll(
        ".card, .stat-card, .indicador"
    );

    cards.forEach((card, index) => {

        card.style.opacity = "0";
        card.style.transform = "translateY(10px)";

        setTimeout(() => {

            card.style.transition = "all .4s ease";
            card.style.opacity = "1";
            card.style.transform = "translateY(0)";

        }, index * 100);

    });

    // Mensagem de confirmação


});


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