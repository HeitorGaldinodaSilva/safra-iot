// Utilitários dos testes: chamadas HTTP, tabela de resultados e gravação do log em evidencias/.
const fs = require('fs');
const path = require('path');

const BASE = (process.env.BASE_URL || 'http://localhost:3001').replace(/\/$/, '');
const CODIGO = process.env.CODIGO_MISSAO || 'SEM-CODIGO';
const FASE = (process.env.FASE || '').toLowerCase();          // antes | depois
if (!['antes', 'depois'].includes(FASE)) {
  console.error('Defina FASE=antes ou FASE=depois (veja seguranca/README.md).');
  process.exit(2);
}

const linhas = [];
function escrever(texto = '') { console.log(texto); linhas.push(texto); }

async function http(metodo, caminho, { token, corpo, cabecalhos = {} } = {}) {
  const r = await fetch(BASE + caminho, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...cabecalhos },
    body: corpo ? JSON.stringify(corpo) : undefined
  });
  let dados = {};
  try { dados = await r.json(); } catch { /* resposta sem JSON */ }
  return { status: r.status, dados };
}

let falhas = 0;
// esperado: função (status) => boolean, mais um texto que descreve o esperado
function verificar(rotulo, resposta, aceita, descricaoEsperado) {
  const ok = aceita(resposta.status);
  if (!ok) falhas += 1;
  escrever(`${ok ? 'OK  ' : 'FALHA'} | ${rotulo.padEnd(62)} | HTTP ${resposta.status} | esperado: ${descricaoEsperado}`);
  return ok;
}

function finalizar(nome) {
  escrever('');
  escrever(falhas === 0 ? `RESULTADO (${FASE}): todas as verificações bateram com o esperado.` : `RESULTADO (${FASE}): ${falhas} verificação(ões) fora do esperado.`);
  const dir = path.join(__dirname, '..', 'evidencias');
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, `${CODIGO}-${nome}-${FASE}.log`);
  fs.writeFileSync(arquivo, [`# missao ${CODIGO} | ${nome} | fase ${FASE} | ${new Date().toISOString()} | ${BASE}`, ...linhas, ''].join('\n'));
  console.log(`\nLog gravado em ${arquivo}`);
  process.exit(falhas === 0 ? 0 : 1);
}

module.exports = { BASE, CODIGO, FASE, http, escrever, verificar, finalizar };
