/* =====================================================================
   O que faz:
   - carrega perfil e preferências do usuário logado (GET /configuracoes)
   - salva nome, e-mail, telefone e preferências (PUT /configuracoes)
   - troca a foto de perfil e a senha
   - mostra as sessões ativas (e encerra) e o histórico de acessos
   - filtra os blocos pela busca do topo
   - encerra a sessão (Sair da conta e Sair do menu)

   Os campos são ligados por atributos no HTML:
     data-config="nome | email | telefone | tipo | avatar | ..."   (campo de busca: .tb-busca input)
     data-pref="notif_producao | idioma | unidade_peso | ..."
   ===================================================================== */

(() => {
    "use strict";

    const API = "http://localhost:3001";
    const PAGINA_LOGIN = "/Frontend/Login/login.html";

    const raiz = document.querySelector("[data-config-page]");
    if (!raiz) return;

    const campo = nome => raiz.querySelector(`[data-config="${nome}"]`);
    const camposPref = () => [...raiz.querySelectorAll("[data-pref]")];


    /* =================================================================
       SESSÃO
    ================================================================= */

    function usuarioDaSessao() {
        try {
            return JSON.parse(sessionStorage.getItem("safra_usuario") || "null");
        } catch {
            return null;
        }
    }

    const token = () => sessionStorage.getItem("safra_token") || "";

    function limparSessao() {
        ["safra_logado", "safra_usuario", "safra_token", "safra_preferencias"]
            .forEach(chave => sessionStorage.removeItem(chave));
    }

    function irParaLogin() {
        window.location.href = PAGINA_LOGIN;
    }

    async function sairDaConta() {
        try {
            await fetch(`${API}/logout`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token()}` }
            });
        } catch {
            /* sem conexão: segue e limpa a sessão do navegador mesmo assim */
        }
        limparSessao();
        irParaLogin();
    }


    /* =================================================================
       COMUNICAÇÃO COM O SERVIDOR
    ================================================================= */

    async function api(metodo, caminho, corpo) {
        let resposta;

        try {
            resposta = await fetch(API + caminho, {
                method: metodo,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token()}`
                },
                body: corpo !== undefined ? JSON.stringify(corpo) : undefined
            });
        } catch {
            throw new Error("Não foi possível conectar ao servidor.");
        }

        let dados = {};
        try {
            dados = await resposta.json();
        } catch {
            /* resposta sem JSON */
        }

        if (resposta.status === 401) {
            limparSessao();
            avisar("Sua sessão expirou. Entre novamente.", "erro");
            setTimeout(irParaLogin, 1500);
            throw new Error("Sessão expirada.");
        }

        if (!resposta.ok || dados.sucesso === false) {
            throw new Error(dados.erro || "Algo deu errado. Tente novamente.");
        }

        return dados;
    }


    /* =================================================================
       AVISOS (toast) E JANELAS (modal)
    ================================================================= */

    function criar(tag, classe, texto) {
        const elemento = document.createElement(tag);
        if (classe) elemento.className = classe;
        if (texto !== undefined) elemento.textContent = texto;
        return elemento;
    }

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

        setTimeout(() => {
            aviso.classList.add("saindo");
            setTimeout(() => aviso.remove(), 300);
        }, 3500);
    }

    /* Janela de confirmação / formulário.
       aoConfirmar() pode lançar um Error: a mensagem aparece dentro da janela
       e ela continua aberta. */
    function abrirJanela({ titulo, texto, conteudo, confirmar = "Confirmar", perigo = false, larga = false, aoConfirmar }) {
        const fundo = criar("div", "safra-modal-fundo");
        const caixa = criar("div", "safra-modal");
        const focoAnterior = document.activeElement;

        if (larga) caixa.classList.add("larga");
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
        /* confirmar: null = janela só para consulta (aparece apenas o botão Fechar) */
        const cancelar = criar("button", "safra-btn", confirmar ? "Cancelar" : "Fechar");
        const ok = confirmar ? criar("button", `safra-btn ${perigo ? "perigo" : "primario"}`, confirmar) : null;
        cancelar.type = "button";
        botoes.append(cancelar);
        if (ok) {
            ok.type = "button";
            botoes.append(ok);
        }
        caixa.appendChild(botoes);

        fundo.appendChild(caixa);
        document.body.appendChild(fundo);

        function fechar() {
            document.removeEventListener("keydown", teclado);
            fundo.remove();
            if (focoAnterior && focoAnterior.focus) focoAnterior.focus();
        }

        async function confirmarAcao() {
            if (!ok) return;
            erro.textContent = "";
            ok.disabled = cancelar.disabled = true;
            const textoOriginal = ok.textContent;
            ok.textContent = "Aguarde...";

            try {
                await aoConfirmar();
                fechar();
            } catch (e) {
                erro.textContent = e.message;
                ok.disabled = cancelar.disabled = false;
                ok.textContent = textoOriginal;
            }
        }

        function teclado(e) {
            if (e.key === "Escape") fechar();
            if (e.key === "Enter" && ok && e.target.tagName === "INPUT") {
                e.preventDefault();
                confirmarAcao();
            }
        }

        cancelar.addEventListener("click", fechar);
        if (ok) ok.addEventListener("click", confirmarAcao);
        fundo.addEventListener("mousedown", e => { if (e.target === fundo) fechar(); });
        document.addEventListener("keydown", teclado);

        const primeiro = caixa.querySelector("input") || ok || cancelar;
        primeiro.focus();

        return { fechar };
    }


    /* =================================================================
       FOTO E INICIAIS
    ================================================================= */

    function iniciais(nome) {
        const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
        if (partes.length === 0) return "?";
        if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
        return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
    }

    function pintarAvatar(elemento, nome, foto) {
        if (foto) {
            elemento.textContent = "";
            elemento.style.backgroundImage = `url("${foto}")`;
            elemento.style.backgroundSize = "cover";
            elemento.style.backgroundPosition = "center";
        } else {
            elemento.textContent = iniciais(nome);
            elemento.style.backgroundImage = "";
        }
    }

    let usuarioAtual = usuarioDaSessao() || {};

    /* Atualiza nome, iniciais e foto em todos os lugares da página */
    function aplicarUsuario(usuario) {
        usuarioAtual = { ...usuarioAtual, ...usuario };
        const { nome, foto } = usuarioAtual;
        if (!nome) return;

        document.querySelectorAll(".tb-avatar, .perfil-avatar")
            .forEach(el => pintarAvatar(el, nome, foto));

        document.querySelectorAll(".tb-dados strong")
            .forEach(el => { el.textContent = nome; });

        document.querySelectorAll(".tb-usuario")
            .forEach(el => el.setAttribute("aria-label", `Conta de ${nome}`));

        const nomeExibido = campo("nome-exibido");
        if (nomeExibido) nomeExibido.textContent = nome;

        const remover = campo("remover-foto");
        if (remover) remover.hidden = !foto;
    }

    /* Lê a imagem escolhida, corta em quadrado e reduz para 256 x 256 */
    function prepararFoto(arquivo) {
        return new Promise((resolver, rejeitar) => {
            const tiposAceitos = ["image/jpeg", "image/png", "image/webp"];

            if (!tiposAceitos.includes(arquivo.type)) {
                return rejeitar(new Error("Escolha uma imagem JPG, PNG ou WEBP."));
            }
            if (arquivo.size > 8 * 1024 * 1024) {
                return rejeitar(new Error("A imagem é muito grande (máximo de 8 MB)."));
            }

            const url = URL.createObjectURL(arquivo);
            const imagem = new Image();

            imagem.onload = () => {
                const lado = Math.min(imagem.width, imagem.height);
                const tela = document.createElement("canvas");
                tela.width = tela.height = 256;
                tela.getContext("2d").drawImage(
                    imagem,
                    (imagem.width - lado) / 2, (imagem.height - lado) / 2, lado, lado,
                    0, 0, 256, 256
                );
                URL.revokeObjectURL(url);
                resolver(tela.toDataURL("image/jpeg", 0.85));
            };

            imagem.onerror = () => {
                URL.revokeObjectURL(url);
                rejeitar(new Error("Não foi possível ler essa imagem."));
            };

            imagem.src = url;
        });
    }

    async function trocarFoto(arquivo) {
        try {
            const foto = await prepararFoto(arquivo);
            await api("PUT", "/configuracoes/foto", { foto });
            aplicarUsuario({ foto });
            avisar("Foto atualizada!");
        } catch (e) {
            avisar(e.message, "erro");
        }
    }

    async function removerFoto() {
        try {
            await api("PUT", "/configuracoes/foto", { foto: null });
            aplicarUsuario({ foto: null });
            avisar("Foto removida.");
        } catch (e) {
            avisar(e.message, "erro");
        }
    }


    /* =================================================================
       FORMULÁRIO: LER, PREENCHER E COMPARAR
    ================================================================= */

    function mascaraTelefone(texto) {
        const d = texto.replace(/\D/g, "").slice(0, 11);
        if (d.length === 0) return "";
        if (d.length <= 2) return `(${d}`;
        if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
        if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }

    function lerFormulario() {
        const preferencias = {};

        camposPref().forEach(el => {
            preferencias[el.dataset.pref] = el.type === "checkbox" ? el.checked : el.value;
        });

        return {
            nome: campo("nome").value.trim(),
            email: campo("email").value.trim(),
            telefone: campo("telefone").value.trim(),
            preferencias
        };
    }

    function preencherFormulario(usuario, preferencias) {
        campo("nome").value = usuario.nome || "";
        campo("email").value = usuario.email || "";
        campo("telefone").value = usuario.telefone || "";
        campo("tipo").value = usuario.perfil || campo("tipo").value;

        const exibido = campo("perfil-exibido");
        if (exibido) exibido.textContent = usuario.perfil || exibido.textContent;

        camposPref().forEach(el => {
            const valor = preferencias[el.dataset.pref];
            if (valor === undefined) return;
            if (el.type === "checkbox") el.checked = !!valor;
            else el.value = valor;
        });

        textoSenha(usuario.senha_alterada_em);
    }

    /* O que está salvo no servidor, para saber se há alterações pendentes */
    let salvo = "";

    const botaoSalvar = campo("salvar");

    function marcarComoSalvo() {
        salvo = JSON.stringify(lerFormulario());
        atualizarBotaoSalvar();
    }

    function temAlteracoes() {
        /* antes de carregar os dados do servidor não há o que comparar */
        if (!salvo) return false;
        return JSON.stringify(lerFormulario()) !== salvo;
    }

    function atualizarBotaoSalvar() {
        if (botaoSalvar) botaoSalvar.disabled = !temAlteracoes();
    }

    function textoSenha(dataIso) {
        const info = campo("senha-info");
        if (!info) return;

        if (!dataIso) {
            info.textContent = "Senha definida no cadastro";
            return;
        }

        const dias = Math.floor((Date.now() - new Date(dataIso).getTime()) / 86400000);

        if (dias < 1) info.textContent = "Última alteração hoje";
        else if (dias === 1) info.textContent = "Última alteração ontem";
        else if (dias < 30) info.textContent = `Última alteração há ${dias} dias`;
        else if (dias < 365) {
            const meses = Math.floor(dias / 30);
            info.textContent = `Última alteração há ${meses} ${meses === 1 ? "mês" : "meses"}`;
        } else {
            const anos = Math.floor(dias / 365);
            info.textContent = `Última alteração há ${anos} ${anos === 1 ? "ano" : "anos"}`;
        }
    }

    /* Deixa as preferências à mão para as outras telas usarem (unidades, data...) */
    function publicarPreferencias(preferencias) {
        sessionStorage.setItem("safra_preferencias", JSON.stringify(preferencias));
        document.documentElement.lang = preferencias.idioma === "en" ? "en" : "pt-BR";
        window.dispatchEvent(new CustomEvent("safra:preferencias", { detail: preferencias }));
    }


    /* =================================================================
       VALIDAÇÃO
    ================================================================= */

    function limparErros() {
        raiz.querySelectorAll(".invalido").forEach(el => el.classList.remove("invalido"));
        raiz.querySelectorAll(".campo-erro").forEach(el => el.remove());
    }

    function marcarErro(elemento, mensagem) {
        elemento.classList.add("invalido");
        const aviso = criar("small", "campo-erro", mensagem);
        elemento.insertAdjacentElement("afterend", aviso);
    }

    function validar(dados) {
        limparErros();
        let primeiro = null;

        const falha = (elemento, mensagem) => {
            marcarErro(elemento, mensagem);
            if (!primeiro) primeiro = elemento;
        };

        if (dados.nome.length < 3) {
            falha(campo("nome"), "Digite o nome completo (mínimo 3 letras).");
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dados.email)) {
            falha(campo("email"), "Digite um e-mail válido.");
        }
        if (dados.telefone) {
            const digitos = dados.telefone.replace(/\D/g, "");
            if (digitos.length < 10 || digitos.length > 11) {
                falha(campo("telefone"), "Digite um telefone válido com DDD.");
            }
        }

        if (primeiro) primeiro.focus();
        return !primeiro;
    }


    /* =================================================================
       SALVAR
    ================================================================= */

    async function salvar() {
        if (!temAlteracoes()) return;

        const dados = lerFormulario();
        if (!validar(dados)) {
            avisar("Corrija os campos em vermelho.", "erro");
            return;
        }

        const textoBotao = [...botaoSalvar.childNodes].reverse().find(n => n.nodeType === Node.TEXT_NODE);
        const textoOriginal = textoBotao ? textoBotao.textContent : "";
        botaoSalvar.disabled = true;
        if (textoBotao) textoBotao.textContent = " Salvando...";

        try {
            const resposta = await api("PUT", "/configuracoes", dados);

            aplicarUsuario(resposta.usuario);
            campo("telefone").value = resposta.usuario.telefone || "";
            sessionStorage.setItem("safra_usuario", JSON.stringify({
                ...(usuarioDaSessao() || {}),
                id: resposta.usuario.id,
                nome: resposta.usuario.nome,
                email: resposta.usuario.email
            }));

            publicarPreferencias(dados.preferencias);
            marcarComoSalvo();
            avisar("Alterações salvas com sucesso!");
        } catch (e) {
            avisar(e.message, "erro");
            atualizarBotaoSalvar();
        } finally {
            if (textoBotao) textoBotao.textContent = textoOriginal;
        }
    }


    /* =================================================================
       ALTERAR SENHA
    ================================================================= */

    function abrirJanelaSenha() {
        const conteudo = criar("div");

        const entrada = (rotulo, nome, autocomplete) => {
            const label = criar("label", "", rotulo);
            const input = criar("input");
            input.type = "password";
            input.name = nome;
            input.autocomplete = autocomplete;
            label.appendChild(input);
            conteudo.appendChild(label);
            return input;
        };

        const atual = entrada("Senha atual", "senha_atual", "current-password");
        const nova = entrada("Nova senha (mínimo 6 caracteres)", "nova_senha", "new-password");
        const confirmacao = entrada("Confirmar nova senha", "confirmacao", "new-password");

        abrirJanela({
            titulo: "Alterar senha",
            texto: "Informe sua senha atual e escolha uma nova.",
            conteudo,
            confirmar: "Salvar senha",
            aoConfirmar: async () => {
                if (!atual.value || !nova.value || !confirmacao.value) {
                    throw new Error("Preencha os três campos.");
                }
                if (nova.value.length < 6) {
                    throw new Error("A nova senha precisa ter pelo menos 6 caracteres.");
                }
                if (nova.value === atual.value) {
                    throw new Error("A nova senha precisa ser diferente da atual.");
                }
                if (nova.value !== confirmacao.value) {
                    throw new Error("A confirmação não confere com a nova senha.");
                }

                await api("PUT", "/configuracoes/senha", {
                    senha_atual: atual.value,
                    nova_senha: nova.value
                });

                textoSenha(new Date().toISOString());
                avisar("Senha alterada com sucesso!");
            }
        });
    }


    /* =================================================================
       SEGURANÇA: SESSÕES ATIVAS E HISTÓRICO DE ACESSOS
    ================================================================= */

    const ICONE_SESSOES = '<rect x="3" y="4" width="18" height="12" rx="2"></rect><path d="M8 20h8M12 16v4"></path>';
    const ICONE_HISTORICO = '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 2"></path>';

    /* Data e hora no formato escolhido nas Preferências (DD/MM/AAAA ou MM/DD/AAAA) */
    function formatarDataHora(valor) {
        const data = new Date(valor);
        if (Number.isNaN(data.getTime())) return "";

        let formato = "DD/MM/AAAA";
        try {
            formato = (JSON.parse(sessionStorage.getItem("safra_preferencias") || "{}").formato_data) || formato;
        } catch {
            /* usa o padrão */
        }

        const dois = n => String(n).padStart(2, "0");
        const dia = dois(data.getDate());
        const mes = dois(data.getMonth() + 1);
        const hora = `${dois(data.getHours())}:${dois(data.getMinutes())}`;

        return (formato === "MM/DD/AAAA" ? `${mes}/${dia}/${data.getFullYear()}` : `${dia}/${mes}/${data.getFullYear()}`) + ` às ${hora}`;
    }

    function tempoRelativo(valor) {
        const minutos = Math.floor((Date.now() - new Date(valor).getTime()) / 60000);
        if (minutos < 1) return "agora mesmo";
        if (minutos < 60) return `há ${minutos} min`;
        const horas = Math.floor(minutos / 60);
        if (horas < 24) return `há ${horas} h`;
        return formatarDataHora(valor);
    }

    /* Cria o ícone, o título e a descrição de um item de lista (sempre com textContent: nada de HTML) */
    function itemDeLista(icone, titulo, detalhe, selo, tipoSelo) {
        const item = criar("div", "safra-item");

        const caixaIcone = criar("div", "safra-item-icone");
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.innerHTML = icone;
        caixaIcone.appendChild(svg);

        const corpo = criar("div", "safra-item-corpo");
        const linhaTitulo = criar("strong", "", titulo);
        if (selo) linhaTitulo.appendChild(criar("span", `safra-selo ${tipoSelo || ""}`, selo));
        corpo.appendChild(linhaTitulo);
        corpo.appendChild(criar("small", "", detalhe));

        item.append(caixaIcone, corpo);
        return item;
    }

    function listaVazia(texto) {
        return criar("p", "safra-lista-vazia", texto);
    }

    async function abrirSessoes() {
        const lista = criar("div", "safra-lista");

        abrirJanela({
            titulo: "Sessões ativas",
            texto: "Aparelhos e navegadores em que a sua conta está conectada agora. Se algum não for seu, encerre.",
            conteudo: lista,
            confirmar: null,
            larga: true
        });

        function desenhar(sessoes) {
            lista.replaceChildren();

            if (sessoes.length === 0) {
                lista.appendChild(listaVazia("Nenhuma sessão ativa."));
                return;
            }

            sessoes.forEach(sessao => {
                const detalhe = `IP ${sessao.ip || "desconhecido"} · entrou ${formatarDataHora(sessao.criadaEm)} · último uso ${tempoRelativo(sessao.ultimoUso)}`;
                const item = itemDeLista(ICONE_SESSOES, sessao.dispositivo, detalhe,
                    sessao.atual ? "Esta sessão" : "", "atual");

                if (!sessao.atual) {
                    const encerrar = criar("button", "safra-btn", "Encerrar");
                    encerrar.type = "button";
                    encerrar.addEventListener("click", async () => {
                        encerrar.disabled = true;
                        try {
                            await api("DELETE", `/configuracoes/sessoes/${sessao.id}`);
                            avisar("Sessão encerrada.");
                        } catch (e) {
                            avisar(e.message, "erro");
                        }
                        carregar();
                    });
                    item.appendChild(encerrar);
                }

                lista.appendChild(item);
            });

            if (sessoes.length > 1) {
                const todas = criar("button", "safra-btn perigo", "Encerrar todas as outras sessões");
                todas.type = "button";
                todas.addEventListener("click", async () => {
                    todas.disabled = true;
                    try {
                        const r = await api("DELETE", "/configuracoes/sessoes");
                        avisar(`${r.encerradas} sessão(ões) encerrada(s).`);
                    } catch (e) {
                        avisar(e.message, "erro");
                    }
                    carregar();
                });
                lista.appendChild(todas);
            }
        }

        async function carregar() {
            try {
                const dados = await api("GET", "/configuracoes/sessoes");
                desenhar(dados.sessoes);
            } catch (e) {
                lista.replaceChildren(listaVazia(e.message));
            }
        }

        lista.appendChild(listaVazia("Carregando..."));
        carregar();
    }

    async function abrirHistorico() {
        const lista = criar("div", "safra-lista");

        abrirJanela({
            titulo: "Histórico de acessos",
            texto: "Os últimos 10 acessos à sua conta. Se ver algo estranho, troque a senha.",
            conteudo: lista,
            confirmar: null,
            larga: true
        });

        lista.appendChild(listaVazia("Carregando..."));

        try {
            const { acessos } = await api("GET", "/configuracoes/acessos");
            lista.replaceChildren();

            if (acessos.length === 0) {
                lista.appendChild(listaVazia("Nenhum acesso registrado ainda."));
                return;
            }

            acessos.forEach(acesso => {
                const deuCerto = acesso.status === "Sucesso";
                const detalhe = `${formatarDataHora(acesso.data_hora)}${acesso.descricao ? " · " + acesso.descricao : ""}`;
                lista.appendChild(itemDeLista(ICONE_HISTORICO, acesso.acao, detalhe,
                    deuCerto ? "Sucesso" : "Falha", deuCerto ? "ok" : "erro"));
            });
        } catch (e) {
            lista.replaceChildren(listaVazia(e.message));
        }
    }

    /* Troca a linha antiga "Autenticação em duas etapas" (que só guardava um
       botão e não protegia nada) por duas linhas reais, copiando o visual da linha "Senha". */
    function montarSegurancaExtra() {
        const botaoSenha = campo("alterar-senha");
        const linhaSenha = botaoSenha && botaoSenha.closest(".seguranca");
        if (!linhaSenha) return;

        function novaLinha(icone, titulo, texto, rotuloBotao, acao) {
            const linha = linhaSenha.cloneNode(true);
            linha.querySelectorAll("[data-config]").forEach(el => el.removeAttribute("data-config"));
            linha.querySelector("strong").textContent = titulo;
            linha.querySelector(".seguranca-info span").textContent = texto;
            linha.querySelector(".seguranca-icon svg").innerHTML = icone;

            const botao = linha.querySelector("button");
            botao.textContent = rotuloBotao;
            botao.addEventListener("click", acao);
            return linha;
        }

        const sessoes = novaLinha(ICONE_SESSOES, "Sessões ativas",
            "Veja onde sua conta está conectada e encerre acessos que você não reconhece.", "Gerenciar", abrirSessoes);
        const historico = novaLinha(ICONE_HISTORICO, "Histórico de acessos",
            "Últimos logins e tentativas de entrada na sua conta.", "Ver histórico", abrirHistorico);

        const antiga = raiz.querySelector('[data-pref="autenticacao_2fa"]');
        const linhaAntiga = antiga && antiga.closest(".seguranca");

        linhaSenha.insertAdjacentElement("afterend", sessoes);
        sessoes.insertAdjacentElement("afterend", historico);
        if (linhaAntiga) linhaAntiga.remove();
    }


    /* =================================================================
       BUSCA DO TOPO ("Buscar configuração...")
    ================================================================= */

    const semAcento = texto => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    function filtrarBlocos(termo) {
        const busca = semAcento(termo.trim());
        let encontrou = false;

        raiz.querySelectorAll(".config-card").forEach(bloco => {
            const visivel = !busca || semAcento(bloco.textContent).includes(busca);
            bloco.style.display = visivel ? "" : "none";
            if (visivel) encontrou = true;
        });

        let vazio = raiz.querySelector(".config-vazio");

        if (!encontrou) {
            if (!vazio) {
                vazio = criar("p", "config-vazio");
                const rodape = raiz.querySelector(".rodape");
                if (rodape) rodape.insertAdjacentElement("beforebegin", vazio);
                else raiz.appendChild(vazio);
            }
            vazio.textContent = `Nenhuma configuração encontrada para “${termo.trim()}”.`;
        } else if (vazio) {
            vazio.remove();
        }
    }


    /* =================================================================
       LIGAÇÕES (eventos)
    ================================================================= */

    function ligarEventos() {
        /* Alterações pendentes: habilita/desabilita o botão Salvar */
        raiz.addEventListener("input", atualizarBotaoSalvar);
        raiz.addEventListener("change", atualizarBotaoSalvar);

        /* Erro some quando a pessoa volta a digitar no campo */
        raiz.addEventListener("input", e => {
            if (!e.target.classList.contains("invalido")) return;
            e.target.classList.remove("invalido");
            const aviso = e.target.nextElementSibling;
            if (aviso && aviso.classList.contains("campo-erro")) aviso.remove();
        });

        campo("telefone").addEventListener("input", e => {
            e.target.value = mascaraTelefone(e.target.value);
        });

        if (botaoSalvar) botaoSalvar.addEventListener("click", salvar);

        /* Foto */
        const seletorFoto = criar("input");
        seletorFoto.type = "file";
        seletorFoto.accept = "image/jpeg,image/png,image/webp";
        seletorFoto.hidden = true;
        seletorFoto.dataset.config = "arquivo-foto";
        document.body.appendChild(seletorFoto);

        const botaoFoto = campo("alterar-foto");
        if (botaoFoto) {
            botaoFoto.addEventListener("click", () => seletorFoto.click());

            const remover = criar("button", "btn-foto btn-foto-remover", "Remover foto");
            remover.type = "button";
            remover.hidden = true;
            remover.dataset.config = "remover-foto";
            remover.addEventListener("click", removerFoto);
            botaoFoto.insertAdjacentElement("afterend", remover);
        }

        seletorFoto.addEventListener("change", () => {
            const arquivo = seletorFoto.files[0];
            seletorFoto.value = "";
            if (arquivo) trocarFoto(arquivo);
        });

        /* Senha */
        const botaoSenha = campo("alterar-senha");
        if (botaoSenha) botaoSenha.addEventListener("click", abrirJanelaSenha);

        /* Busca */
        const busca = raiz.querySelector(".tb-busca input");
        if (busca) busca.addEventListener("input", () => filtrarBlocos(busca.value));

        /* Sair da conta (com confirmação) */
        const botaoSair = campo("sair");
        if (botaoSair) {
            botaoSair.addEventListener("click", () => {
                abrirJanela({
                    titulo: "Sair da conta",
                    texto: "Deseja encerrar sua sessão no Safra?",
                    confirmar: "Sair",
                    perigo: true,
                    aoConfirmar: sairDaConta
                });
            });
        }

        /* "Sair" do menu lateral (todas as telas): encerra a sessão de verdade */
        document.addEventListener("click", e => {
            const menuSair = e.target.closest(".menu-item.sair");
            if (!menuSair) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            sairDaConta();
        }, true);

        /* Avisa antes de fechar a página com alterações não salvas */
        window.addEventListener("beforeunload", e => {
            if (temAlteracoes()) {
                e.preventDefault();
                e.returnValue = "";
            }
        });
    }


    /* =================================================================
       INÍCIO
    ================================================================= */

    async function iniciar() {
        /* nome e iniciais já aparecem na hora, com o que veio do login */
        aplicarUsuario(usuarioAtual);

        if (botaoSalvar) botaoSalvar.disabled = true;
        montarSegurancaExtra();
        ligarEventos();

        try {
            const dados = await api("GET", "/configuracoes");

            aplicarUsuario(dados.usuario);
            preencherFormulario(dados.usuario, dados.preferencias);
            publicarPreferencias(dados.preferencias);
            marcarComoSalvo();
        } catch (e) {
            if (e.message !== "Sessão expirada.") {
                avisar(e.message, "erro");
            }
        }
    }

    iniciar();
})();