// Controle 1: autenticação em dois fatores (TOTP) no login.
// - /login (index.js) só entrega o token depois do 2º fator quando o usuário tem 2FA ativo.
// - A verificação do código acontece AQUI, no servidor.
const crypto = require('crypto');
const express = require('express');
const totp = require('./totp');
const { logBloqueio } = require('./missao');

const DESAFIO_MS = 5 * 60 * 1000;
const MAX_TENTATIVAS = 5;                       // por desafio e por usuário
const BLOQUEIO_MS = 5 * 60 * 1000;
const janela = () => { const n = parseInt(process.env.OTP_JANELA, 10); return Number.isInteger(n) && n >= 0 ? n : 1; };

function criarDoisFatores({ pool, autenticar, registrarLog, criarSessao, descricaoDoAcesso }) {
  const ligado = () => (process.env.DOIS_FATORES || 'on').toLowerCase() !== 'off';
  const desafios = new Map();   // desafio -> { usuarioId, expira, tentativas }
  const falhas = new Map();     // usuarioId -> { n, ate }

  async function ativo(usuarioId) {
    const [l] = await pool.query('SELECT 1 FROM usuario_2fa WHERE usuario_id = ? AND ativo = 1', [usuarioId]);
    return l.length > 0;
  }

  // chamado pelo /login depois de conferir a senha
  async function exigeSegundoFator(usuarioId) {
    return ligado() && await ativo(usuarioId);
  }

  function abrirDesafio(usuarioId) {
    const id = crypto.randomBytes(24).toString('hex');
    desafios.set(id, { usuarioId, expira: Date.now() + DESAFIO_MS, tentativas: 0 });
    return id;
  }

  setInterval(() => {
    const agora = Date.now();
    for (const [k, d] of desafios) if (d.expira < agora) desafios.delete(k);
  }, 60 * 1000).unref();

  async function falhar(req, usuarioId, desafioId, motivo) {
    const d = desafios.get(desafioId);
    if (d) d.tentativas += 1;
    const f = falhas.get(usuarioId) || { n: 0, ate: 0 };
    f.n += 1;
    if (f.n >= MAX_TENTATIVAS) { f.ate = Date.now() + BLOQUEIO_MS; f.n = 0; desafios.delete(desafioId); }
    falhas.set(usuarioId, f);
    const linha = logBloqueio('2FA', `${motivo} (usuario ${usuarioId}) • ${descricaoDoAcesso(req)}`);
    await registrarLog(usuarioId, 'Login', 'Falha no segundo fator', linha, 'Falha');
  }

  const router = express.Router();

  // ---- 2ª etapa do login: troca desafio + código por um token de sessão ----
  router.post('/login/2fa', async (req, res) => {
    const { desafio, codigo } = req.body || {};
    const d = desafios.get(String(desafio || ''));
    if (!d || d.expira < Date.now()) {
      desafios.delete(String(desafio || ''));
      return res.status(401).json({ sucesso: false, erro: 'Desafio expirado. Entre novamente com e-mail e senha.' });
    }
    const f = falhas.get(d.usuarioId);
    if (f && f.ate > Date.now()) {
      logBloqueio('2FA', `usuario ${d.usuarioId} temporariamente bloqueado por excesso de tentativas • ${descricaoDoAcesso(req)}`);
      return res.status(429).json({ sucesso: false, erro: 'Muitas tentativas. Aguarde alguns minutos.' });
    }
    if (d.tentativas >= MAX_TENTATIVAS) {
      desafios.delete(String(desafio));
      return res.status(429).json({ sucesso: false, erro: 'Muitas tentativas. Entre novamente.' });
    }

    try {
      const texto = String(codigo || '').trim();
      let aceito = false;
      let via = 'totp';

      if (/^\d{6}$/.test(texto)) {
        const [l] = await pool.query('SELECT segredo_cifrado, ultimo_passo FROM usuario_2fa WHERE usuario_id = ? AND ativo = 1', [d.usuarioId]);
        if (l.length) {
          const passo = totp.verificarTotp(totp.decifrar(l[0].segredo_cifrado), texto,
            { janela: janela(), ultimoPasso: Number(l[0].ultimo_passo) });
          if (passo !== null) {
            // UPDATE condicional: só um pedido consegue gravar este passo (vale para corrida entre dois logins)
            const [r] = await pool.query(
              'UPDATE usuario_2fa SET ultimo_passo = ? WHERE usuario_id = ? AND ativo = 1 AND ultimo_passo < ?',
              [passo, d.usuarioId, passo]);
            aceito = r.affectedRows === 1;
          }
        }
      } else if (totp.normalizarRecuperacao(texto).length === 10) {
        via = 'recuperacao';
        const [r] = await pool.query(
          'UPDATE usuario_2fa_recuperacao SET usado_em = NOW() WHERE usuario_id = ? AND codigo_hash = ? AND usado_em IS NULL',
          [d.usuarioId, totp.hashRecuperacao(texto)]);
        aceito = r.affectedRows === 1;
      }

      if (!aceito) {
        await falhar(req, d.usuarioId, String(desafio), 'código ausente, errado, vencido ou já usado');
        return res.status(401).json({ sucesso: false, erro: 'Código inválido.' });
      }

      desafios.delete(String(desafio));
      falhas.delete(d.usuarioId);
      const [u] = await pool.query('SELECT id, nome, email, perfil FROM usuario WHERE id = ?', [d.usuarioId]);
      if (!u.length) return res.status(401).json({ sucesso: false, erro: 'Usuário não encontrado.' });
      await registrarLog(d.usuarioId, 'Login', 'Login realizado', `2FA (${via}) • ${descricaoDoAcesso(req)}`);
      res.json({
        sucesso: true,
        token: criarSessao(d.usuarioId, req),
        usuario: { id: u[0].id, nome: u[0].nome, email: u[0].email, perfil: u[0].perfil }
      });
    } catch (erro) {
      res.status(erro.http || 500).json({ sucesso: false, erro: erro.message });
    }
  });

  // ---- cadastro do segundo fator (usuário já logado) ----
  router.get('/2fa/estado', autenticar, async (req, res) => {
    try {
      const [rec] = await pool.query('SELECT COUNT(*) AS n FROM usuario_2fa_recuperacao WHERE usuario_id = ? AND usado_em IS NULL', [req.usuarioId]);
      res.json({ sucesso: true, ativo: await ativo(req.usuarioId), codigos_restantes: Number(rec[0].n) });
    } catch (erro) { res.status(500).json({ sucesso: false, erro: erro.message }); }
  });

  // gera um segredo novo (ainda inativo) e devolve a URI para o QR Code
  router.post('/2fa/configurar', autenticar, async (req, res) => {
    try {
      if (await ativo(req.usuarioId)) {
        return res.status(409).json({ sucesso: false, erro: 'O 2FA já está ativo nesta conta.' });
      }
      const [u] = await pool.query('SELECT email FROM usuario WHERE id = ?', [req.usuarioId]);
      const segredo = totp.gerarSegredo();
      await pool.query(
        `INSERT INTO usuario_2fa (usuario_id, segredo_cifrado, ativo, ultimo_passo) VALUES (?, ?, 0, 0)
         ON DUPLICATE KEY UPDATE segredo_cifrado = VALUES(segredo_cifrado), ativo = 0, ultimo_passo = 0`,
        [req.usuarioId, totp.cifrar(segredo)]);
      res.json({ sucesso: true, segredo, otpauth_uri: totp.uriOtpauth({ segredo, conta: u[0] ? u[0].email : String(req.usuarioId) }) });
    } catch (erro) { res.status(erro.http || 500).json({ sucesso: false, erro: erro.message }); }
  });

  async function emitirCodigosRecuperacao(usuarioId) {
    const codigos = totp.gerarCodigosRecuperacao(10);
    await pool.query('DELETE FROM usuario_2fa_recuperacao WHERE usuario_id = ?', [usuarioId]);
    for (const c of codigos) {
      await pool.query('INSERT INTO usuario_2fa_recuperacao (usuario_id, codigo_hash) VALUES (?, ?)', [usuarioId, totp.hashRecuperacao(c)]);
    }
    return codigos;
  }

  // confirma o cadastro com um código do app e entrega os códigos de recuperação (só desta vez)
  router.post('/2fa/ativar', autenticar, async (req, res) => {
    try {
      const [l] = await pool.query('SELECT segredo_cifrado FROM usuario_2fa WHERE usuario_id = ? AND ativo = 0', [req.usuarioId]);
      if (!l.length) return res.status(409).json({ sucesso: false, erro: 'Gere o QR Code primeiro (ou o 2FA já está ativo).' });
      const passo = totp.verificarTotp(totp.decifrar(l[0].segredo_cifrado), String((req.body || {}).codigo || ''), { janela: janela() });
      if (passo === null) {
        logBloqueio('2FA', `ativação recusada: código errado (usuario ${req.usuarioId})`);
        return res.status(400).json({ sucesso: false, erro: 'Código inválido. Confira o horário do celular.' });
      }
      await pool.query('UPDATE usuario_2fa SET ativo = 1, ultimo_passo = ? WHERE usuario_id = ?', [passo, req.usuarioId]);
      const codigos = await emitirCodigosRecuperacao(req.usuarioId);
      await registrarLog(req.usuarioId, 'Usuário', '2FA ativado', descricaoDoAcesso(req));
      res.json({ sucesso: true, codigos_recuperacao: codigos });
    } catch (erro) { res.status(erro.http || 500).json({ sucesso: false, erro: erro.message }); }
  });

  // invalida os códigos de recuperação antigos e emite novos (exige um código do app)
  router.post('/2fa/recuperacao/regenerar', autenticar, async (req, res) => {
    try {
      const [l] = await pool.query('SELECT segredo_cifrado, ultimo_passo FROM usuario_2fa WHERE usuario_id = ? AND ativo = 1', [req.usuarioId]);
      if (!l.length) return res.status(409).json({ sucesso: false, erro: '2FA não está ativo.' });
      const passo = totp.verificarTotp(totp.decifrar(l[0].segredo_cifrado), String((req.body || {}).codigo || ''),
        { janela: janela(), ultimoPasso: Number(l[0].ultimo_passo) });
      if (passo === null) {
        logBloqueio('2FA', `regeneração recusada: código errado (usuario ${req.usuarioId})`);
        return res.status(400).json({ sucesso: false, erro: 'Código inválido.' });
      }
      await pool.query('UPDATE usuario_2fa SET ultimo_passo = ? WHERE usuario_id = ?', [passo, req.usuarioId]);
      const codigos = await emitirCodigosRecuperacao(req.usuarioId);
      await registrarLog(req.usuarioId, 'Usuário', 'Códigos de recuperação renovados', descricaoDoAcesso(req));
      res.json({ sucesso: true, codigos_recuperacao: codigos });
    } catch (erro) { res.status(erro.http || 500).json({ sucesso: false, erro: erro.message }); }
  });

  return { router, exigeSegundoFator, abrirDesafio };
}

module.exports = { criarDoisFatores };
