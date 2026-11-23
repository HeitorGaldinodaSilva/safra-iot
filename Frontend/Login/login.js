document.addEventListener("DOMContentLoaded", () => {

    // Título: separa em palavras e letras para o efeito ao passar o mouse
    // (cada letra fica roxa e aumenta um pouco; veja .letra no login.css)
    function separarEmLetras(elemento) {
        [...elemento.childNodes].forEach(no => {
            if (no.nodeType === Node.ELEMENT_NODE) {
                return separarEmLetras(no);
            }
            if (no.nodeType !== Node.TEXT_NODE) return;

            const fragmento = document.createDocumentFragment();

            no.textContent.split(/(\s+)/).forEach(parte => {
                if (!parte) return;

                if (/^\s+$/.test(parte)) {
                    fragmento.appendChild(document.createTextNode(" "));
                    return;
                }

                const palavra = document.createElement("span");
                palavra.className = "palavra";

                [...parte].forEach(caractere => {
                    const letra = document.createElement("span");
                    letra.className = "letra";
                    letra.textContent = caractere;
                    palavra.appendChild(letra);
                });

                fragmento.appendChild(palavra);
            });

            no.replaceWith(fragmento);
        });
    }

    const titulo = document.querySelector(".conteudo-esquerdo h1");
    if (titulo) separarEmLetras(titulo);


    const formulario = document.querySelector("#formLogin");
    const campoEmail = document.querySelector("#email");
    const campoSenha = document.querySelector("#senha");
    const checkboxLembrar = document.querySelector(".lembrar input");
    const botaoEntrar = document.querySelector(".botao");
    const textoBotao = document.querySelector(".botao-texto");
    const botaoMostrarSenha = document.querySelector("#mostrarSenha");
    const linkEsqueciSenha = document.querySelector("#esqueciSenha");

    const API_LOGIN = "http://localhost:3001/login";

    const PAGINAS = {
        produtor: "/Frontend/Produtor/produtor.html",
        analista: "/Frontend/Analista/Analista.html",
        administrador: "/Frontend/ADM/adm.html"
    };

    // Mostrar / ocultar senha
    const ICONE_OCULTO = botaoMostrarSenha.innerHTML;
    const ICONE_VISIVEL = `<svg viewBox="0 0 24 24">
        <path d="M2 12c1.5-4 5.5-7 10-7s8.5 3 10 7c-1.5 4-5.5 7-10 7s-8.5-3-10-7Z"></path>
        <circle cx="12" cy="12" r="3"></circle></svg>`;

    botaoMostrarSenha.addEventListener("click", () => {
        const visivel = campoSenha.type === "text";
        campoSenha.type = visivel ? "password" : "text";
        botaoMostrarSenha.innerHTML = visivel ? ICONE_OCULTO : ICONE_VISIVEL;
        botaoMostrarSenha.setAttribute(
            "aria-label", visivel ? "Mostrar senha" : "Ocultar senha"
        );
    });

    // Lembrar e-mail
    const emailSalvo = localStorage.getItem("safra_email");
    if (emailSalvo) {
        campoEmail.value = emailSalvo;
        checkboxLembrar.checked = true;
    }

    // Esqueci a senha
    linkEsqueciSenha.addEventListener("click", e => {
        e.preventDefault();
        mostrarMensagem(
            "Entre em contato com o administrador para recuperar sua senha.",
            "info"
        );
    });

    // Validação e envio
    formulario.addEventListener("submit", e => {
        e.preventDefault();

        const email = campoEmail.value.trim();
        const senha = campoSenha.value.trim();

        if (!email) return erro("Digite seu e-mail para continuar.", campoEmail);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return erro("Digite um e-mail válido.", campoEmail);
        if (!senha) return erro("Digite sua senha para continuar.", campoSenha);

        entrar(email, senha);
    });

    function erro(texto, campo) {
        mostrarMensagem(texto, "erro");
        campo.focus();
    }

    async function entrar(email, senha) {
        botaoEntrar.disabled = true;
        textoBotao.textContent = "Entrando...";

        try {
            const resposta = await fetch(API_LOGIN, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, senha })
            });

            let dados = await resposta.json();

            // Segundo fator (2FA): a senha estava certa, falta o código do app autenticador
            if (dados.sucesso && dados.requer_2fa) {
                dados = await pedirSegundoFator(dados.desafio);
            }

            if (!dados || !dados.sucesso) {
                botaoEntrar.disabled = false;
                textoBotao.textContent = "Entrar";
                return mostrarMensagem((dados && dados.erro) || "Não foi possível entrar.", "erro");
            }

            const perfilNormalizado = dados.usuario.perfil
                .toLowerCase()
                .normalize("NFD")
                .replace(/[\u0300-\u036f]/g, "");

            if (checkboxLembrar.checked) {
                localStorage.setItem("safra_email", email);
            } else {
                localStorage.removeItem("safra_email");
            }

            sessionStorage.setItem("safra_logado", "1");
            sessionStorage.setItem("safra_usuario", JSON.stringify(dados.usuario));
            sessionStorage.setItem("safra_token", dados.token || "");

            mostrarMensagem("Login realizado com sucesso!", "sucesso");

            setTimeout(() => {
                window.location.href = PAGINAS[perfilNormalizado] || PAGINAS.produtor;
            }, 800);

        } catch (erroDeConexao) {
            botaoEntrar.disabled = false;
            textoBotao.textContent = "Entrar";
            mostrarMensagem("Não foi possível conectar ao servidor.", "erro");
        }
    }

    // Pergunta o código de 6 dígitos (ou um código de recuperação) e valida no servidor (/login/2fa).
    // Devolve a resposta do servidor, ou null se a pessoa cancelar.
    function pedirSegundoFator(desafio) {
        return new Promise(resolve => {
            const fundo = document.createElement("div");
            Object.assign(fundo.style, { position: "fixed", inset: "0", background: "rgba(0,0,0,.45)",
                display: "flex", alignItems: "center", justifyContent: "center", zIndex: "10000" });
            fundo.innerHTML = `<form style="background:#fff;padding:26px;border-radius:14px;width:340px;font-family:inherit">
                <h3 style="margin:0 0 6px">Verificação em duas etapas</h3>
                <p style="margin:0 0 14px;font-size:14px;color:#555">Digite o código de 6 dígitos do seu app autenticador ou um código de recuperação.</p>
                <input id="codigo2fa" autocomplete="one-time-code" inputmode="text" maxlength="12"
                       style="width:100%;padding:10px;font-size:18px;letter-spacing:3px;text-align:center;border:1px solid #ccc;border-radius:8px;box-sizing:border-box">
                <div style="display:flex;gap:8px;margin-top:14px">
                  <button type="button" id="cancela2fa" style="flex:1;padding:10px;border:1px solid #ccc;background:#fff;border-radius:8px;cursor:pointer">Cancelar</button>
                  <button type="submit" style="flex:1;padding:10px;border:0;background:#4b2e83;color:#fff;border-radius:8px;cursor:pointer">Confirmar</button>
                </div></form>`;
            document.body.appendChild(fundo);
            const campo = fundo.querySelector("#codigo2fa");
            campo.focus();
            fundo.querySelector("#cancela2fa").onclick = () => { fundo.remove(); resolve(null); };
            fundo.querySelector("form").onsubmit = async ev => {
                ev.preventDefault();
                try {
                    const r = await fetch(API_LOGIN + "/2fa", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ desafio, codigo: campo.value.trim() })
                    });
                    const d = await r.json();
                    if (d.sucesso) { fundo.remove(); return resolve(d); }
                    mostrarMensagem(d.erro || "Código inválido.", "erro");
                    if (r.status === 401 && /expirado/i.test(d.erro || "") || r.status === 429) { fundo.remove(); resolve(null); }
                    campo.value = ""; campo.focus();
                } catch (e) { mostrarMensagem("Não foi possível conectar ao servidor.", "erro"); }
            };
        });
    }

    function mostrarMensagem(texto, tipo = "sucesso") {
        const cores = { erro: "#c0392b", info: "#3478a8", sucesso: "#218149" };
        const m = document.createElement("div");
        m.textContent = texto;
        Object.assign(m.style, {
            position: "fixed", bottom: "25px", right: "25px",
            padding: "14px 20px", borderRadius: "10px", color: "#fff",
            fontSize: "14px", fontWeight: "600", zIndex: "9999",
            maxWidth: "360px", boxShadow: "0 5px 20px rgba(0,0,0,.15)",
            background: cores[tipo] || cores.sucesso
        });
        document.body.appendChild(m);
        setTimeout(() => m.remove(), 3000);
    }
});

window.addEventListener("pageshow", (evento) => {
    if (evento.persisted) {
        window.location.reload();
    }
});