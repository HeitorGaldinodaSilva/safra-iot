/* ================= preferencias.js =================
   Aplica as preferências de Configurações no site inteiro e traz um formulário em janela (modal) reutilizável.
     Safra.fmt.peso(ton)   -> "2.500 kg" ou "2,5 t"       (Unidade de peso)
     Safra.fmt.preco(brlKg)-> "R$ 8,50/kg" ou "R$ 8.500/t"
     Safra.fmt.area(ha)    -> "24,5 ha" ou "245.000 m²"   (Unidade de área)
     Safra.fmt.data(iso)   -> "31/12/2026" ou "12/31/2026" (Formato de data); Safra.fmt.dm(iso) = dia/mês
     Safra.formulario({...}) -> janela com campos; as telas só chamam esta função.
   As preferências vêm de sessionStorage("safra_preferencias"), gravadas pelo configuracoes.js quando você salva. */
(function () {
    "use strict";
    window.Safra = window.Safra || {};
    const PADRAO = { notif_producao: true, notif_clima: true, notif_exportacao: true, notif_relatorios: false,
        idioma: "pt-BR", unidade_peso: "kg", unidade_area: "ha", formato_data: "DD/MM/AAAA" };

    function pref() {
        try { return Object.assign({}, PADRAO, JSON.parse(sessionStorage.getItem("safra_preferencias") || "{}")); }
        catch (e) { return Object.assign({}, PADRAO); }
    }
    const loc = () => (pref().idioma === "en" ? "en-US" : "pt-BR");
    const nf = (v, c) => Number(v).toLocaleString(loc(), { minimumFractionDigits: c, maximumFractionDigits: c });
    const ok = (v) => v !== null && v !== undefined && v !== "" && !Number.isNaN(Number(v));

    const fmt = {
        peso(ton, casas) { if (!ok(ton)) return "—"; return pref().unidade_peso === "kg" ? `${nf(ton * 1000, 0)} kg` : `${nf(ton, casas == null ? 1 : casas)} t`; },
        preco(brlKg) {
            if (!ok(brlKg)) return "—";
            const kg = pref().unidade_peso === "kg", v = kg ? Number(brlKg) : Number(brlKg) * 1000;
            return `${v.toLocaleString(loc(), { style: "currency", currency: "BRL", minimumFractionDigits: kg ? 2 : 0, maximumFractionDigits: kg ? 2 : 0 })}/${kg ? "kg" : "t"}`;
        },
        area(ha, casas) { if (!ok(ha)) return "—"; return pref().unidade_area === "m2" ? `${nf(ha * 10000, 0)} m²` : `${nf(ha, casas == null ? 1 : casas)} ha`; },
        data(iso) {
            if (!iso) return "—"; const [a, m, d] = String(iso).slice(0, 10).split("-");
            return pref().formato_data === "MM/DD/AAAA" ? `${m}/${d}/${a}` : `${d}/${m}/${a}`;
        },
        dm(iso) {
            if (!iso) return "--"; const [, m, d] = String(iso).slice(0, 10).split("-");
            return pref().formato_data === "MM/DD/AAAA" ? `${m}/${d}` : `${d}/${m}`;
        },
        rotuloPeso: () => (pref().unidade_peso === "kg" ? "kg" : "t"),
        rotuloArea: () => (pref().unidade_area === "m2" ? "m²" : "ha"),
        /* texto digitado pelo usuário (aceita vírgula) -> número */
        numero(t) { return Number(String(t).trim().replace(/\./g, (m, i, s) => (s.includes(",") ? "" : m)).replace(",", ".")); },
    };
    Safra.pref = pref; Safra.fmt = fmt;

    /* ---------- janela com formulário ---------- */
    function css() {
        if (document.getElementById("safra-form-css")) return;
        const s = document.createElement("style"); s.id = "safra-form-css";
        s.textContent = `
        .sf-fundo{position:fixed;inset:0;background:rgba(15,25,20,.55);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px}
        .sf-caixa{background:#fff;color:#1d2b24;border-radius:16px;width:100%;max-width:520px;max-height:92vh;overflow:auto;padding:22px 24px;box-shadow:0 20px 60px rgba(0,0,0,.3);font-family:inherit}
        .sf-caixa h2{margin:0 0 4px;font-size:1.25rem}.sf-caixa p.sf-sub{margin:0 0 16px;font-size:.9rem;opacity:.7}
        .sf-grade{display:grid;grid-template-columns:1fr 1fr;gap:12px 14px}
        .sf-campo{display:flex;flex-direction:column;gap:4px;font-size:.85rem}.sf-campo.sf-inteira{grid-column:1/-1}
        .sf-campo label{font-weight:600}.sf-campo small{opacity:.65}
        .sf-campo input,.sf-campo select{padding:9px 10px;border:1px solid #c9d3cd;border-radius:10px;font:inherit;background:#fff;color:#1d2b24}
        .sf-campo input:focus,.sf-campo select:focus{outline:2px solid #218149;border-color:#218149}
        .sf-erro{margin-top:12px;padding:8px 10px;border-radius:10px;background:#fdecea;color:#a32619;font-size:.85rem}
        .sf-erro:empty{display:none}
        .sf-acoes{display:flex;justify-content:flex-end;gap:10px;margin-top:18px}
        .sf-acoes button{padding:10px 18px;border-radius:10px;border:1px solid #c9d3cd;background:#fff;color:#1d2b24;font:inherit;font-weight:600;cursor:pointer}
        .sf-acoes button.sf-ok{background:#218149;border-color:#218149;color:#fff}.sf-acoes button:disabled{opacity:.6;cursor:wait}
        @media(max-width:520px){.sf-grade{grid-template-columns:1fr}}`;
        document.head.appendChild(s);
    }
    function el(t, c, x) { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }

    /* campos: [{nome, rotulo, tipo: texto|numero|data|select, opcoes:[[valor,rotulo]], valor, obrigatorio, ajuda, inteira}] */
    Safra.formulario = function ({ titulo, subtitulo, campos, confirmar, aoConfirmar }) {
        css();
        const fundo = el("div", "sf-fundo"), caixa = el("form", "sf-caixa"), grade = el("div", "sf-grade");
        caixa.noValidate = true; caixa.setAttribute("role", "dialog"); caixa.setAttribute("aria-modal", "true");
        caixa.appendChild(el("h2", null, titulo)); if (subtitulo) caixa.appendChild(el("p", "sf-sub", subtitulo));
        const inputs = {};
        campos.forEach((c) => {
            const w = el("div", "sf-campo" + (c.inteira ? " sf-inteira" : "")), id = "sf-" + c.nome;
            const lb = el("label", null, c.rotulo + (c.obrigatorio ? " *" : "")); lb.htmlFor = id; w.appendChild(lb);
            let i;
            if (c.tipo === "select") {
                i = el("select"); (c.opcoes || []).forEach(([v, r]) => { const o = el("option", null, r); o.value = v; i.appendChild(o); });
                if (c.valor != null) i.value = c.valor;
            } else {
                i = el("input"); i.type = c.tipo === "data" ? "date" : "text";
                if (c.tipo === "numero") i.inputMode = "decimal";
                if (c.valor != null) i.value = c.valor; if (c.placeholder) i.placeholder = c.placeholder;
            }
            i.id = id; w.appendChild(i); if (c.ajuda) w.appendChild(el("small", null, c.ajuda));
            inputs[c.nome] = i; grade.appendChild(w);
        });
        caixa.appendChild(grade);
        const erro = el("div", "sf-erro"); erro.setAttribute("role", "alert"); caixa.appendChild(erro);
        const acoes = el("div", "sf-acoes"), cancelar = el("button", null, "Cancelar"), salvar = el("button", "sf-ok", confirmar || "Salvar");
        cancelar.type = "button"; salvar.type = "submit"; acoes.append(cancelar, salvar); caixa.appendChild(acoes);
        fundo.appendChild(caixa); document.body.appendChild(fundo);
        const fechar = () => { document.removeEventListener("keydown", tecla); fundo.remove(); };
        const tecla = (e) => { if (e.key === "Escape") fechar(); };
        document.addEventListener("keydown", tecla);
        cancelar.addEventListener("click", fechar);
        fundo.addEventListener("mousedown", (e) => { if (e.target === fundo) fechar(); });
        caixa.addEventListener("submit", async (e) => {
            e.preventDefault(); erro.textContent = "";
            const v = {};
            for (const c of campos) {
                let x = inputs[c.nome].value.trim();
                if (c.obrigatorio && !x) { erro.textContent = `Preencha: ${c.rotulo}.`; inputs[c.nome].focus(); return; }
                if (c.tipo === "numero" && x) { const n = fmt.numero(x); if (!Number.isFinite(n) || n <= 0) { erro.textContent = `Valor inválido em: ${c.rotulo}.`; inputs[c.nome].focus(); return; } x = n; }
                v[c.nome] = x === "" ? null : x;
            }
            salvar.disabled = true; const txt = salvar.textContent; salvar.textContent = "Salvando...";
            try { await aoConfirmar(v); fechar(); }
            catch (err) { erro.textContent = err.message || "Não foi possível salvar."; salvar.disabled = false; salvar.textContent = txt; }
        });
        const primeiro = caixa.querySelector("input,select"); if (primeiro) primeiro.focus();
    };
})();
