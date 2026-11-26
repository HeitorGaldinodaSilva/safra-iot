/* ================= sino.js =================
   Sino de notificações da barra do topo (Administrador, Produtor e Analista).
   Cada perfil entrega suas notificações com:
     Safra.sino.atualizar({ itens, naoLidos, destino, aoLer(id), aoLerTodos(), erro })
       itens: [{ id, titulo, mensagem, prioridade: "urgente"|"atencao"|"informativo", categoria, quando, lido }]
   O número vermelho = naoLidos; ao clicar abre a lista. Safra.sino.ligada("notif_clima") diz se o usuário
   deixou aquele tipo de aviso ligado em Configurações > Notificações. */
(function () {
    "use strict";
    window.Safra = window.Safra || {};
    const ORDEM = { urgente: 0, atencao: 1, informativo: 2 };
    const PADRAO = { notif_producao: true, notif_clima: true, notif_exportacao: true, notif_relatorios: false };
    let estado = { itens: [], naoLidos: 0, destino: "#", aoLer: null, aoLerTodos: null, erro: null };

    function ligada(chave) {
        if (!chave) return true;
        try {
            const p = JSON.parse(sessionStorage.getItem("safra_preferencias") || "{}");
            return p[chave] === undefined ? PADRAO[chave] !== false : !!p[chave];
        } catch (e) { return PADRAO[chave] !== false; }
    }

    function criar(tag, classe, texto) {
        const el = document.createElement(tag);
        if (classe) el.className = classe;
        if (texto !== undefined) el.textContent = texto;
        return el;
    }

    function quando(v) {
        const d = new Date(v);
        if (!v || isNaN(d)) return "";
        const h = new Date(), dois = (n) => String(n).padStart(2, "0");
        const dia = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
        const hora = `${dois(d.getHours())}:${dois(d.getMinutes())}`;
        const dif = Math.round((dia(h) - dia(d)) / 86400000);
        if (dif === 0) return `Hoje às ${hora}`;
        if (dif === 1) return `Ontem às ${hora}`;
        return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} às ${hora}`;
    }

    function css() {
        if (document.getElementById("sinoCss")) return;
        const s = document.createElement("style");
        s.id = "sinoCss";
        s.textContent = `
.tb-conta{position:relative}
.sino-painel{position:absolute;top:calc(100% + 10px);right:0;z-index:60;width:380px;max-width:calc(100vw - 32px);background:#fff;border:1px solid #e1e4dd;border-radius:16px;box-shadow:0 18px 40px rgba(23,63,53,.18);overflow:hidden;text-align:left}
.sino-painel[hidden]{display:none}
.sino-topo{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;border-bottom:1px solid #eceee8}
.sino-topo strong{display:block;color:#173f35;font-size:15px}
.sino-topo small{color:#647872;font-size:12px}
.sino-topo button{border:none;background:none;color:#218149;font-weight:700;font-size:12px;cursor:pointer;padding:6px 8px;border-radius:8px}
.sino-topo button:hover{background:#eef6f0}
.sino-lista{max-height:360px;overflow:auto}
.sino-item{display:flex;gap:12px;padding:12px 16px;border-bottom:1px solid #f0f2ed;color:inherit;text-decoration:none}
.sino-item:hover{background:#f6faf7}
.sino-item.lido{opacity:.55}
.sino-ponto{flex:none;width:10px;height:10px;border-radius:50%;margin-top:6px;background:#e5484d}
.sino-item.atencao .sino-ponto{background:#e0a21b}
.sino-item.informativo .sino-ponto{background:#3b82c4}
.sino-item.lido .sino-ponto{background:#c9d3cd}
.sino-item strong{display:block;color:#173f35;font-size:13px;line-height:1.3}
.sino-item span{display:block;color:#5f6d68;font-size:12px;line-height:1.35;margin-top:2px}
.sino-item small{display:block;color:#8a9892;font-size:11px;margin-top:4px}
.sino-vazio{padding:26px 16px;text-align:center;color:#647872;font-size:13px}
.sino-rodape{display:block;padding:12px 16px;text-align:center;color:#218149;font-weight:700;font-size:13px;text-decoration:none;background:#f6faf7}
.sino-rodape:hover{background:#eaf4ed}`;
        document.head.appendChild(s);
    }

    function fechar() {
        document.querySelectorAll(".sino-painel").forEach((p) => { p.hidden = true; });
        document.querySelectorAll(".tb-sino").forEach((b) => b.setAttribute("aria-expanded", "false"));
    }

    function desenharPainel(painel) {
        const lista = estado.itens.slice().sort((a, b) =>
            (!!a.lido - !!b.lido) || ((ORDEM[a.prioridade] ?? 3) - (ORDEM[b.prioridade] ?? 3)) || (new Date(b.quando) - new Date(a.quando)));
        painel.replaceChildren();
        const topo = criar("div", "sino-topo");
        const t = criar("div");
        t.append(criar("strong", "", "Notificações"), criar("small", "", estado.naoLidos ? `${estado.naoLidos} não lida(s)` : "Tudo em dia"));
        topo.append(t);
        if (estado.naoLidos && estado.aoLerTodos) {
            const b = criar("button", "", "Marcar todas como lidas");
            b.type = "button";
            b.addEventListener("click", () => estado.aoLerTodos());
            topo.append(b);
        }
        painel.append(topo);
        const caixa = criar("div", "sino-lista");
        if (!lista.length) caixa.append(criar("div", "sino-vazio", estado.erro || "Nenhuma notificação no momento."));
        lista.slice(0, 6).forEach((a) => {
            const it = criar("a", `sino-item ${a.prioridade}${a.lido ? " lido" : ""}`);
            it.href = estado.destino;
            const corpo = criar("div");
            corpo.append(criar("strong", "", a.titulo), criar("span", "", a.mensagem));
            const rod = [quando(a.quando), a.categoria].filter(Boolean).join(" • ");
            if (rod) corpo.append(criar("small", "", rod));
            it.append(criar("i", "sino-ponto"), corpo);
            it.addEventListener("click", () => { fechar(); if (estado.aoLer) setTimeout(() => estado.aoLer(a.id), 0); });
            caixa.append(it);
        });
        painel.append(caixa);
        const rod = criar("a", "sino-rodape", "Ver todos os alertas");
        rod.href = estado.destino;
        rod.addEventListener("click", fechar);
        painel.append(rod);
    }

    function montar() {
        css();
        document.querySelectorAll(".tb-conta").forEach((conta) => {
            if (conta.dataset.sino) return;
            const btn = conta.querySelector(".tb-sino");
            if (!btn) return;
            conta.dataset.sino = "1";
            const painel = criar("div", "sino-painel");
            painel.hidden = true;
            conta.append(painel);
            btn.setAttribute("aria-haspopup", "true");
            btn.setAttribute("aria-expanded", "false");
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const abrir = painel.hidden;
                fechar();
                if (abrir) { painel.hidden = false; btn.setAttribute("aria-expanded", "true"); desenharPainel(painel); }
            });
            painel.addEventListener("click", (e) => e.stopPropagation());
        });
    }

    function atualizar(novo) {
        estado = Object.assign({ itens: [], naoLidos: 0, destino: "#", aoLer: null, aoLerTodos: null, erro: null }, novo);
        montar();
        const n = estado.naoLidos;
        document.querySelectorAll(".tb-badge").forEach((b) => {
            b.textContent = n > 99 ? "99+" : String(n);
            b.style.display = n ? "" : "none";
        });
        document.querySelectorAll(".tb-sino").forEach((b) =>
            b.setAttribute("aria-label", n ? `Notificações: ${n} ${n === 1 ? "nova" : "novas"}` : "Notificações: nenhuma nova"));
        document.querySelectorAll(".sino-painel:not([hidden])").forEach(desenharPainel);
    }

    Safra.sino = { atualizar, montar, ligada };
    document.addEventListener("click", fechar);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") fechar(); });
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", montar); else montar();
})();
