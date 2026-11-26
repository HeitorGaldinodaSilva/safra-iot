window.Safra = window.Safra || {};


/* =====================================================================
   1. PROTEÇÃO DE LOGIN
   Sem sessão iniciada, volta para a tela de login.
   ===================================================================== */

if (!sessionStorage.getItem("safra_logado")) {
    window.location.replace("/Frontend/Login/login.html");
}


/* =====================================================================
   2. AVISO RÁPIDO (antes era a função mostrarMensagem, copiada em cada tela)
   ===================================================================== */

Safra.avisar = function (texto) {
    const aviso = document.createElement("div");

    aviso.textContent = texto;

    Object.assign(aviso.style, {
        position: "fixed",
        bottom: "25px",
        right: "25px",
        background: "#218149",
        color: "#ffffff",
        padding: "13px 20px",
        borderRadius: "10px",
        fontSize: "14px",
        fontWeight: "600",
        zIndex: "9999",
        boxShadow: "0 5px 20px rgba(0, 0, 0, 0.15)"
    });

    document.body.appendChild(aviso);

    setTimeout(() => {
        aviso.remove();
    }, 2500);
};


/* =====================================================================
   3. COMPONENTES: MENU LATERAL E BARRA DO TOPO

   No HTML, cada tela tem apenas um "espaço" para o componente:

       <aside class="sidebar" data-componente="sidebar"></aside>
       <header class="topbar tb" data-componente="topbar"
               data-busca="Buscar alerta..."></header>

   O conteúdo de verdade fica uma única vez em <template id="tpl-sidebar">
   e <template id="tpl-topbar"> no começo do <body>. Para mudar o menu ou
   a barra do topo, basta editar o template.

   data-busca = texto (placeholder) do campo de busca daquela tela.
   ===================================================================== */

Safra.montarComponentes = function () {
    document.querySelectorAll("[data-componente]").forEach(espaco => {
        const modelo = document.getElementById("tpl-" + espaco.dataset.componente);
        if (!modelo) return;

        espaco.appendChild(modelo.content.cloneNode(true));

        const busca = espaco.querySelector(".tb-busca input");
        if (busca && espaco.dataset.busca) {
            busca.placeholder = espaco.dataset.busca;
        }
    });
};

Safra.montarComponentes();

/* =====================================================================
   3.2 MENU DO PERFIL (ao clicar no usuário, na barra do topo)
   Mostra nome, cargo e e-mail, os itens comuns aos 3 perfis e um atalho
   próprio de cada perfil. Os estilos (.tb-menu...) estão no tema.css.

   Para mudar o atalho de um perfil, edite a lista ATALHOS abaixo
   (pagina = id da tela que o atalho abre).
   ===================================================================== */

Safra.montarMenuPerfil = function () {
    const ICONES = {
        perfil: '<path d="M20 21v-1.5a4.5 4.5 0 0 0-4.5-4.5h-7A4.5 4.5 0 0 0 4 19.5V21"/><circle cx="12" cy="8" r="4"/>',
        sair:   '<path d="M9 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
        folha:  '<path d="M12 21V12"/><path d="M12 13c0-4 3-7 8-7 0 4-3 7-8 7z"/><path d="M12 16c0-3-2.5-5.5-7-5.5 0 3 2.5 5.5 7 5.5z"/>',
        doc:    '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/>',
        lista:  '<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'
    };

    const ATALHOS = [
        { pagina: "lavoura",             rotulo: "Minha propriedade", detalhe: "Suas lavouras e talhões",    icone: "folha" },
        { pagina: "analista.relatorios", rotulo: "Meus relatórios",   detalhe: "Relatórios e análises",      icone: "doc"   },
        { pagina: "adm.logs",            rotulo: "Logs de atividade", detalhe: "Ações recentes no sistema",  icone: "lista" }
    ];

    const TELAS_CONFIG = ["configuracoes", "analista.configuracao", "adm.configuracoes"];

    // Só vale como tela o que for uma .safra-page (outros elementos podem ter o mesmo id).
    function telaExiste(id) {
        const el = document.getElementById(id);
        return !!(el && el.classList.contains("safra-page"));
    }

    function icone(nome) {
        return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" ' +
               'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONES[nome] + '</svg>';
    }

    function item(rotulo, detalhe, nomeIcone, extra) {
        const tag = extra.href ? "a" : "button";
        const el = document.createElement(tag);
        el.className = "tb-menu-item" + (extra.classe ? " " + extra.classe : "");
        el.setAttribute("role", "menuitem");
        if (extra.href) el.setAttribute("href", extra.href);
        else el.type = "button";
        if (extra.acao) el.dataset.acao = extra.acao;
        el.innerHTML = icone(nomeIcone) +
            '<span><strong></strong>' + (detalhe ? '<small></small>' : '') + '</span>';
        el.querySelector("strong").textContent = rotulo;
        if (detalhe) el.querySelector("small").textContent = detalhe;
        return el;
    }

    function separador() {
        const s = document.createElement("div");
        s.className = "tb-menu-sep";
        s.setAttribute("role", "separator");
        return s;
    }

    function criarMenu() {
        const menu = document.createElement("div");
        menu.className = "tb-menu";
        menu.setAttribute("role", "menu");
        menu.hidden = true;

        const topo = document.createElement("div");
        topo.className = "tb-menu-topo";
        menu.appendChild(topo);

        const configId = TELAS_CONFIG.find(telaExiste);
        if (configId) {
            menu.appendChild(item("Meu perfil e configurações", "Dados da conta e preferências", "perfil", { href: "#" + configId }));
        }

        const atalho = ATALHOS.find(a => telaExiste(a.pagina));
        if (atalho) {
            menu.appendChild(item(atalho.rotulo, atalho.detalhe, atalho.icone, { href: "#" + atalho.pagina }));
        }

        menu.appendChild(separador());
        menu.appendChild(item("Sair da conta", "", "sair", { acao: "sair", classe: "tb-menu-sair" }));

        return menu;
    }

    // Atualiza o topo do menu com os dados atuais (nome, cargo, foto, e-mail)
    function atualizarTopo(gatilho, menu) {
        const topo = menu.querySelector(".tb-menu-topo");
        const avatar = gatilho.querySelector(".tb-avatar");
        const nome = gatilho.querySelector(".tb-dados strong");
        const cargo = gatilho.querySelector(".tb-dados small");

        let email = "";
        try {
            email = (JSON.parse(sessionStorage.getItem("safra_usuario") || "null") || {}).email || "";
        } catch (e) { /* sem e-mail na sessão: a linha simplesmente não aparece */ }

        topo.innerHTML = "";
        if (avatar) topo.appendChild(avatar.cloneNode(true));

        const dados = document.createElement("div");
        dados.className = "tb-menu-dados";
        const n = document.createElement("strong");
        n.textContent = nome ? nome.textContent : "";
        dados.appendChild(n);

        if (email) {
            const e = document.createElement("span");
            e.className = "tb-menu-email";
            e.textContent = email;
            dados.appendChild(e);
        }
        if (cargo) {
            const c = document.createElement("small");
            c.textContent = cargo.textContent;
            dados.appendChild(c);
        }
        topo.appendChild(dados);
    }

    function menuDe(gatilho) {
        return gatilho.parentElement.querySelector(".tb-menu");
    }

    function fechar(gatilho) {
        const menu = menuDe(gatilho);
        gatilho.setAttribute("aria-expanded", "false");
        if (menu) menu.hidden = true;
    }

    function fecharTodos(exceto) {
        document.querySelectorAll(".tb-usuario[aria-expanded='true']").forEach(g => {
            if (g !== exceto) fechar(g);
        });
    }

    function abrir(gatilho) {
        const menu = menuDe(gatilho);
        if (!menu) return;
        fecharTodos(gatilho);
        atualizarTopo(gatilho, menu);
        menu.hidden = false;
        gatilho.setAttribute("aria-expanded", "true");
    }

    function alternar(gatilho) {
        if (gatilho.getAttribute("aria-expanded") === "true") fechar(gatilho);
        else abrir(gatilho);
    }

    // Monta um menu para cada barra do topo (cada tela tem a sua)
    document.querySelectorAll(".tb-usuario").forEach(gatilho => {
        if (menuDe(gatilho)) return;
        gatilho.setAttribute("aria-haspopup", "menu");
        gatilho.setAttribute("aria-expanded", "false");
        gatilho.parentElement.appendChild(criarMenu());
    });

    // Cliques: abrir/fechar, ações dos itens e fechar ao clicar fora
    document.addEventListener("click", function (e) {
        const gatilho = e.target.closest(".tb-usuario");
        if (gatilho) { alternar(gatilho); return; }

        const botao = e.target.closest(".tb-menu-item");
        if (botao) {
            const acao = botao.dataset.acao;
            fecharTodos();

            if (acao === "sair") {
                // Usa o mesmo botão "Sair" do menu lateral da tela aberta,
                // assim o comportamento é idêntico ao dele.
                const sair = document.querySelector(".safra-page.pagina-ativa .menu-item.sair");
                if (sair) sair.click();
                else {
                    ["safra_logado", "safra_usuario", "safra_token", "safra_preferencias"]
                        .forEach(chave => sessionStorage.removeItem(chave));
                    window.location.replace("/Frontend/Login/login.html");
                }
            }
            return;
        }

        if (!e.target.closest(".tb-menu")) fecharTodos();
    }, true);

    // Teclado: Enter/Espaço abrem, Esc fecha, setas percorrem os itens
    document.addEventListener("keydown", function (e) {
        const gatilho = e.target.closest && e.target.closest(".tb-usuario");

        if (gatilho && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            alternar(gatilho);
            return;
        }

        if (gatilho && e.key === "ArrowDown") {
            e.preventDefault();
            abrir(gatilho);
            const primeiro = menuDe(gatilho).querySelector(".tb-menu-item");
            if (primeiro) primeiro.focus();
            return;
        }

        const aberto = document.querySelector(".tb-usuario[aria-expanded='true']");
        if (!aberto) return;

        if (e.key === "Escape") {
            fechar(aberto);
            aberto.focus();
            return;
        }

        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            const itens = Array.from(menuDe(aberto).querySelectorAll(".tb-menu-item"));
            const atual = itens.indexOf(document.activeElement);
            const proximo = e.key === "ArrowDown"
                ? (atual + 1) % itens.length
                : (atual - 1 + itens.length) % itens.length;
            e.preventDefault();
            itens[proximo].focus();
        }
    });
};

Safra.montarMenuPerfil();


/* =====================================================================
   3.1 EFEITO DE ENTRADA (FADE) DOS BLOCOS DA TELA
   Cada bloco da tela (cabeçalho, cards, painéis, tabelas...) aparece
   suavemente, ganhando opacidade, assim que entra na área visível.
   Blocos de um mesmo grupo entram em sequência (pequeno atraso).
   Roda toda vez que se troca de tela pelo menu.
   As classes .reveal / .visivel estão no final do tema.css.
   ===================================================================== */

Safra.revelar = function (pagina) {
    if (!pagina || !("IntersectionObserver" in window)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Contêineres em grade: aqui cada filho entra separado, em sequência.
    const GRUPOS = [
        "cards", "cards-resumo", "stats-grid", "financial-cards", "resumo-grid",
        "lotes-grid", "lavouras-grid", "modelos-grid", "grid-paineis",
        "painel-grid", "charts-grid", "bottom-grid", "grid-principal",
        "grid-inferior", "grid-relatorios", "indicadores"
    ];

    const conteudo = pagina.querySelector(".conteudo");
    if (!conteudo) return;

    // Só o conteúdo da tela é animado: menu lateral e barra do topo ficam fora.
    const alvos = [];

    Array.from(conteudo.children).forEach(bloco => {
        if (bloco.classList.contains("topbar")) return;
        if (["SCRIPT", "STYLE", "TEMPLATE"].includes(bloco.tagName)) return;

        const ehGrupo = GRUPOS.some(c => bloco.classList.contains(c));
        if (ehGrupo && bloco.children.length) {
            Array.from(bloco.children).forEach(filho => alvos.push(filho));
        } else {
            alvos.push(bloco);
        }
    });

    // 1) Só LÊ (sem alterar nada ainda).
    const lista = alvos.filter(el => getComputedStyle(el).position !== "fixed");

    // Interrompe a observação da rodada anterior.
    if (Safra._observadorRevelar) Safra._observadorRevelar.disconnect();

    // 2) Limpa a animação antiga dos cards (opacity/transform direto no
    //    elemento, vinda dos scripts de cada tela) e reinicia a classe.
    lista.forEach(el => {
        el.classList.remove("reveal", "visivel");
        el.style.opacity = "";
        el.style.transform = "";
        el.style.transition = "";
        el.__revelarId = (el.__revelarId || 0) + 1;
    });

    void conteudo.offsetHeight;   // garante que a animação recomece do zero

    const observador = new IntersectionObserver(entradas => {
        entradas.forEach(entrada => {
            if (!entrada.isIntersecting) return;

            const el = entrada.target;
            const id = el.__revelarId;

            el.classList.add("visivel");
            observador.unobserve(el);

            // Depois da animação devolve o elemento ao estado normal.
            setTimeout(() => {
                if (el.__revelarId === id) el.classList.remove("reveal", "visivel");
            }, 1600);
        });
    }, { threshold: 0, rootMargin: "0px 0px -30px 0px" });

    Safra._observadorRevelar = observador;

    // 3) Deixa tudo invisível (animação pausada) e começa a observar:
    //    o que já está na tela aparece na hora, o resto aparece ao rolar.
    const posicao = new Map();

    lista.forEach(el => {
        const i = posicao.get(el.parentElement) || 0;
        posicao.set(el.parentElement, i + 1);

        el.style.setProperty("--delay", Math.min(i, 6) * 80 + "ms");
        el.classList.add("reveal");
        observador.observe(el);
    });
};


/* =====================================================================
   4. NAVEGAÇÃO DAS TELAS UNIFICADAS
   Cada perfil possui vários dashboards dentro de um único HTML.
   Só uma tela fica visível por vez; o link #id do menu troca de tela.

   Tela inicial: a que estiver no endereço (#id); se não houver, a indicada
   em <body data-pagina-padrao="id">; se também não houver, a primeira.
   ===================================================================== */

(function () {
    function normalizarId(href) {
        if (!href) return null;
        href = href.trim();
        if (!href.startsWith("#")) return null;
        return decodeURIComponent(href.substring(1));
    }

    function mostrarPagina(id, alterarHash = true) {
        // Perfil sem permissão para esta tela: abre a primeira que ele pode ver.
        if (!paginaPermitida(id)) {
            const alternativa = primeiraPaginaPermitida();
            if (!alternativa) return;
            id = alternativa;
        }

        const paginas = Array.from(document.querySelectorAll(".safra-page"));
        if (!paginas.length) return;

        const destino = document.getElementById(id);
        const pagina = destino && destino.classList.contains("safra-page")
            ? destino
            : paginas.find(p => p.id === id);

        if (!pagina) return;

        paginas.forEach(p => {
            const ativa = p === pagina;
            p.classList.toggle("pagina-ativa", ativa);
            p.hidden = !ativa;
            p.setAttribute("aria-hidden", String(!ativa));

            // Algumas seções do HTML já vêm com style="display:none" fixo no
            // próprio elemento. Esse estilo inline tem prioridade sobre o
            // [hidden] do navegador, então é preciso atualizar o display também.
            p.style.display = ativa ? "" : "none";
        });

        // Atualiza o estado visual dos menus em todas as telas unificadas.
        document.querySelectorAll(".menu-item").forEach(item => {
            const href = item.getAttribute("href");
            item.classList.toggle("ativo", href === "#" + pagina.id);
        });

        // Mantém o título da aba de acordo com a dashboard aberta.
        const titulo = pagina.dataset.pageTitle;
        if (titulo) document.title = titulo;

        if (alterarHash) {
            try {
                history.replaceState(null, "", "#" + encodeURIComponent(pagina.id));
            } catch (e) {
                location.hash = pagina.id;
            }
        }

        Safra.revelar(pagina);

        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function iniciarNavegacao() {
        const paginas = document.querySelectorAll(".safra-page");
        if (!paginas.length) return;

        // Intercepta somente links internos de dashboard (#id).
        document.addEventListener("click", function (event) {
            const link = event.target.closest("a[href]");
            if (!link) return;

            const id = normalizarId(link.getAttribute("href"));
            if (!id) return;

            const destino = document.getElementById(id);
            if (!destino || !destino.classList.contains("safra-page")) return;

            event.preventDefault();
            event.stopPropagation();
            mostrarPagina(id, true);
        }, true);

        // Abre diretamente a dashboard presente na URL, se houver.
        const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
        const inicial = hash && document.getElementById(hash);

        const idPadrao = document.body.dataset.paginaPadrao;
        const paginaPadrao = idPadrao && document.getElementById(idPadrao);

        // Se a página define uma tela padrão (data-pagina-padrao), ela sempre abre
        // nessa tela ao entrar ou recarregar (F5), ignorando o #hash da URL.
        const padraoValido = paginaPadrao && paginaPadrao.classList.contains("safra-page");
        if (padraoValido) {
            mostrarPagina(paginaPadrao.id, true);
            return;
        }

        mostrarPagina(
            inicial && inicial.classList.contains("safra-page")
                ? inicial.id
                : paginas[0].id,
            false
        );
    }

    /* ================= PERMISSÕES POR PERFIL =================
       A matriz fica no banco (Administrador > Permissões). Aqui o menu e as telas bloqueadas
       para o perfil de quem está logado são escondidos. Se o servidor não responder,
       nada é bloqueado (o login e as APIs continuam checando o perfil). */
    const PAGINA_RECURSO = {
        "adm.inicial": "dashboard", "analista.inicial": "dashboard", "telainicial": "dashboard",
        "adm.usuarios": "usuarios", "adm.permissoes": "permissoes", "adm.logs": "logs",
        "adm.dados": "dados", "analista.dados": "dados",
        "adm.relatorios": "relatorios", "analista.relatorios": "relatorios", "relatorio": "relatorios",
        "adm.alertas": "alertas", "analista.alertas": "alertas", "alertas": "alertas",
        "analista.modelos": "modelos", "analista.previsoes": "modelos",
        "lavoura": "lavouras", "financeiro": "financeiro", "exportacao": "exportacao"
    };
    const API_NODE = (window.SAFRA_API_NODE || "http://localhost:3001").replace(/\/$/, "");

    function lerCachePermissoes() {
        try {
            const c = JSON.parse(sessionStorage.getItem("safra_permissoes") || "null");
            if (c && c.token && c.token === sessionStorage.getItem("safra_token")) return c.recursos || null;
        } catch (e) { /* sem cache */ }
        return null;
    }

    let recursosPermitidos = lerCachePermissoes();

    function paginaPermitida(id) {
        const recurso = PAGINA_RECURSO[id];
        return !recursosPermitidos || !recurso || recursosPermitidos[recurso] !== false;
    }

    function primeiraPaginaPermitida() {
        const ids = Array.from(document.querySelectorAll(".safra-page")).map(p => p.id);
        const padrao = document.body.dataset.paginaPadrao;
        if (padrao) ids.unshift(padrao);
        return ids.find(paginaPermitida) || null;
    }

    function aplicarPermissoesNoMenu() {
        document.querySelectorAll(".menu-item").forEach(item => {
            const id = normalizarId(item.getAttribute("href"));
            if (id) item.style.display = paginaPermitida(id) ? "" : "none";
        });
    }

    async function carregarPermissoes() {
        const token = sessionStorage.getItem("safra_token");
        if (!token) return;
        try {
            const resp = await fetch(API_NODE + "/permissoes/minhas", { headers: { Authorization: "Bearer " + token } });
            if (!resp.ok) return;
            const d = await resp.json();
            recursosPermitidos = d && d.recursos ? d.recursos : null;
            try { sessionStorage.setItem("safra_permissoes", JSON.stringify({ token: token, recursos: recursosPermitidos })); } catch (e) { /* ok */ }
            aplicarPermissoesNoMenu();
            const ativa = document.querySelector(".safra-page.pagina-ativa");
            if (ativa && !paginaPermitida(ativa.id)) {
                const alternativa = primeiraPaginaPermitida();
                if (alternativa) mostrarPagina(alternativa, true);
            }
        } catch (e) { /* servidor fora do ar: não bloqueia nada */ }
    }

    window.Safra.recarregarPermissoes = carregarPermissoes;

    function iniciarTudo() {
        iniciarNavegacao();
        aplicarPermissoesNoMenu();
        carregarPermissoes();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", iniciarTudo);
    } else {
        iniciarTudo();
    }
})();