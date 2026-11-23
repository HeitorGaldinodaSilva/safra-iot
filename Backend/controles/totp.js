// TOTP (RFC 6238) feito só com o módulo crypto do Node, sem biblioteca externa.
const crypto = require('crypto');

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Codificar(buf) {
  let bits = 0, valor = 0, saida = '';
  for (const b of buf) {
    valor = ((valor << 8) | b) & 0xFFFFF;
    bits += 8;
    while (bits >= 5) { saida += ALFABETO[(valor >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31];
  return saida;
}

function base32Decodificar(texto) {
  const limpo = String(texto).replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0, valor = 0;
  const saida = [];
  for (const c of limpo) {
    const i = ALFABETO.indexOf(c);
    if (i < 0) throw new Error('base32 inválido');
    valor = ((valor << 5) | i) & 0xFFFFF;
    bits += 5;
    if (bits >= 8) { saida.push((valor >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(saida);
}

function gerarSegredo() {
  return base32Codificar(crypto.randomBytes(20)); // 160 bits, o tamanho recomendado
}

function hotp(segredo, contador, digitos = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(contador));
  const h = crypto.createHmac('sha1', segredo).update(msg).digest();
  const off = h[19] & 15;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digitos).padStart(digitos, '0');
}

function iguais(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function passoAtual(agora = Date.now(), periodo = 30) {
  return Math.floor(agora / 1000 / periodo);
}

function codigoAtual(segredoB32, agora = Date.now(), periodo = 30) {
  return hotp(base32Decodificar(segredoB32), passoAtual(agora, periodo));
}

// Devolve o "passo" de tempo que casou, ou null se o código for inválido, vencido
// ou já usado (passo <= ultimoPasso). Quem chama grava o passo para impedir reuso.
// janela = quantos passos de 30 s são aceitos para cada lado (relógio dessincronizado).
function verificarTotp(segredoB32, codigo, { agora = Date.now(), janela = 1, periodo = 30, ultimoPasso = 0 } = {}) {
  if (!/^\d{6}$/.test(String(codigo))) return null;
  const segredo = base32Decodificar(segredoB32);
  const atual = passoAtual(agora, periodo);
  let achado = null;
  for (let d = -janela; d <= janela; d++) {
    const passo = atual + d;
    if (iguais(hotp(segredo, passo), String(codigo)) && passo > ultimoPasso) achado = passo;
  }
  return achado;
}

function uriOtpauth({ segredo, conta, emissor = 'Safra' }) {
  const rotulo = encodeURIComponent(`${emissor}:${conta}`);
  return `otpauth://totp/${rotulo}?secret=${segredo}&issuer=${encodeURIComponent(emissor)}&algorithm=SHA1&digits=6&period=30`;
}

// ---- segredo cifrado no banco (AES-256-GCM, chave vem do ambiente: TOTP_CHAVE) ----
function chave() {
  const hex = process.env.TOTP_CHAVE || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw Object.assign(new Error('TOTP_CHAVE ausente ou inválida (64 caracteres hexadecimais).'), { http: 503 });
  }
  return Buffer.from(hex, 'hex');
}

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', chave(), iv);
  const ct = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map(b => b.toString('base64')).join('.');
}

function decifrar(armazenado) {
  const [iv, tag, ct] = String(armazenado).split('.').map(p => Buffer.from(p, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', chave(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

// ---- códigos de recuperação (uso único; no banco só vai o hash) ----
function gerarCodigosRecuperacao(qtd = 10) {
  return Array.from({ length: qtd }, () => {
    const c = base32Codificar(crypto.randomBytes(8)).slice(0, 10);
    return `${c.slice(0, 5)}-${c.slice(5)}`;
  });
}

function normalizarRecuperacao(texto) {
  return String(texto || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
}

function hashRecuperacao(texto) {
  return crypto.createHash('sha256').update(normalizarRecuperacao(texto)).digest('hex');
}

module.exports = {
  base32Codificar, base32Decodificar, gerarSegredo, hotp, codigoAtual, verificarTotp, passoAtual,
  uriOtpauth, cifrar, decifrar, gerarCodigosRecuperacao, normalizarRecuperacao, hashRecuperacao
};
