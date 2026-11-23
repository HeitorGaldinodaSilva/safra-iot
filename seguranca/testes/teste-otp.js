// Teste do controle 1 (2FA com OTP).
// Uso:  FASE=antes|depois node seguranca/testes/teste-otp.js
//   antes  -> servidor com DOIS_FATORES=off: mesmo com 2FA cadastrado, a senha sozinha entra.
//   depois -> servidor com o controle ligado (padrão): senha sozinha NÃO entra.
// O usuário de teste cadastra o 2FA na primeira execução; segredo e códigos ficam em .estado-otp.json
// (arquivo só com dados sintéticos, ignorado pelo Git).
const fs = require('fs');
const path = require('path');
const { http, escrever, verificar, finalizar, FASE, CODIGO, BASE } = require('./util');
const totp = require('../../Backend/controles/totp');

const U = { email: process.env.OTP_EMAIL || 'c.teste@safra.test', senha: process.env.OTP_SENHA || 'senha-teste-C' };
const ARQ = path.join(__dirname, '.estado-otp.json');
const estado = fs.existsSync(ARQ) ? JSON.parse(fs.readFileSync(ARQ, 'utf8')) : {};
const salvar = () => fs.writeFileSync(ARQ, JSON.stringify(estado, null, 2));
const dormir = ms => new Promise(r => setTimeout(r, ms));

const ok = s => s >= 200 && s < 300;
const recusado = s => s === 401 || s === 429;

async function login() { return http('POST', '/login', { corpo: U }); }
async function desafio() {
  const r = await login();
  if (!r.dados.desafio) throw new Error(`Esperava um desafio de 2FA, veio: ${r.status} ${JSON.stringify(r.dados)}`);
  return r.dados.desafio;
}
// espera o próximo passo de 30 s se o passo atual já foi consumido (o servidor recusa reuso)
async function codigoNovo() {
  while (totp.passoAtual() <= (estado.ultimoPasso || 0)) await dormir(1000);
  return totp.codigoAtual(estado.segredo);
}

(async () => {
  escrever(`# Teste OTP | missao ${CODIGO} | fase ${FASE} | ${BASE}`);

  // preparação: cadastra o 2FA do usuário de teste (se ainda não existir estado)
  if (!estado.segredo) {
    const l = await login();
    if (!l.dados.token) throw new Error('Para preparar, o usuário de teste não pode ter 2FA ativo sem o arquivo de estado. Zere usuario_2fa desse usuário.');
    const c = await http('POST', '/2fa/configurar', { token: l.dados.token });
    estado.segredo = c.dados.segredo;
    const cod = totp.codigoAtual(estado.segredo);
    const a = await http('POST', '/2fa/ativar', { token: l.dados.token, corpo: { codigo: cod } });
    if (!a.dados.codigos_recuperacao) throw new Error('Falha ao ativar o 2FA: ' + JSON.stringify(a.dados));
    estado.recuperacao = a.dados.codigos_recuperacao;
    estado.ultimoPasso = totp.passoAtual();
    salvar();
    escrever(`Preparação: 2FA cadastrado para ${U.email} e ${estado.recuperacao.length} códigos de recuperação emitidos.`);
  }

  escrever('');
  escrever('== Login só com a senha (2FA já está cadastrado para este usuário) ==');
  const s = await login();
  if (FASE === 'antes') {
    verificar('senha certa e sem código', { status: s.dados.token ? 200 : 401 }, ok, 'token emitido sem o 2º fator (vulnerável)');
    return finalizar('otp');
  }

  // ---- fase depois ----
  verificar('senha certa e sem código: não pode receber token', { status: s.dados.token ? 200 : 401 }, recusado, 'sem token (401)');
  verificar('desafio usado como token em rota protegida', await http('GET', '/configuracoes', { token: s.dados.desafio }), recusado, '401');

  escrever('');
  escrever('== Segundo fator ==');
  let d = await desafio();
  verificar('código errado (000000)', await http('POST', '/login/2fa', { corpo: { desafio: d, codigo: '000000' } }), recusado, '401');
  verificar('código vencido (de 150 s atrás)', await http('POST', '/login/2fa', { corpo: { desafio: d, codigo: totp.codigoAtual(estado.segredo, Date.now() - 150000) } }), recusado, '401');
  verificar('código com letras/formato inválido', await http('POST', '/login/2fa', { corpo: { desafio: d, codigo: 'abcdef' } }), recusado, '401');

  const cod = await codigoNovo();
  const v = await http('POST', '/login/2fa', { corpo: { desafio: d, codigo: cod } });
  verificar('código válido', v, ok, '200 + token');
  if (v.dados.token) { estado.ultimoPasso = totp.passoAtual(); salvar(); }
  verificar('token do 2FA acessa rota protegida', await http('GET', '/configuracoes', { token: v.dados.token }), ok, '200');

  d = await desafio();
  verificar('mesmo código usado de novo (replay)', await http('POST', '/login/2fa', { corpo: { desafio: d, codigo: cod } }), recusado, '401');

  escrever('');
  escrever('== Código de recuperação (uso único) ==');
  const rec = (estado.recuperacao || []).find(c => !(estado.usados || []).includes(c));
  if (!rec) {
    escrever('SEM CÓDIGOS DE RECUPERAÇÃO NOVOS no estado: apague .estado-otp.json e zere o 2FA do usuário para repetir esta parte.');
  } else {
    d = await desafio();
    verificar('código de recuperação (1º uso)', await http('POST', '/login/2fa', { corpo: { desafio: d, codigo: rec } }), ok, '200 + token');
    estado.usados = [...(estado.usados || []), rec]; salvar();
    d = await desafio();
    verificar('mesmo código de recuperação (2º uso)', await http('POST', '/login/2fa', { corpo: { desafio: d, codigo: rec } }), recusado, '401');
  }

  escrever('');
  escrever('== Tentativa de contorno: força bruta no código de 6 dígitos ==');
  d = await desafio();
  let ultimo;
  for (let i = 0; i < 7; i++) {
    ultimo = await http('POST', '/login/2fa', { corpo: { desafio: d, codigo: String(100000 + i * 7919).slice(0, 6) } });
  }
  verificar('após várias tentativas erradas o desafio é travado', ultimo, s2 => s2 === 429 || s2 === 401, '429 (ou 401 se o desafio já foi apagado)');
  const novo = await login();
  const outro = novo.dados.desafio ? await http('POST', '/login/2fa', { corpo: { desafio: novo.dados.desafio, codigo: totp.codigoAtual(estado.segredo, Date.now() + 30000) } }) : { status: 429 };
  verificar('novo login logo depois continua travado para este usuário', outro, s2 => s2 === 429, '429 (bloqueio de 5 min; reinicie o servidor para repetir)');
  finalizar('otp');
})().catch(e => { console.error(e.message); process.exit(2); });
