// Controle 2: proteção contra IDOR nos dispositivos.
// Toda rota com :id de dispositivo passa por exigirDono(), que compara o dono gravado no
// banco com o usuário da SESSÃO (req.usuarioId, vindo do token), nunca com algo enviado pelo cliente.
const express = require('express');
const { logBloqueio } = require('./missao');

const COMANDOS = ['reiniciar', 'ligar_irrigacao', 'desligar_irrigacao'];

// PROTECAO_IDOR=off reproduz o comportamento "antes" (só para o teste de antes e depois).
const protegido = () => (process.env.PROTECAO_IDOR || 'on').toLowerCase() !== 'off';

async function leiturasDoThingSpeak(canal, results) {
  const chave = process.env.THINGSPEAK_READ_KEY;
  const url = new URL(`https://api.thingspeak.com/channels/${canal}/feeds.json`);
  url.searchParams.set('results', results);
  if (chave) url.searchParams.set('api_key', chave);
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`ThingSpeak respondeu ${r.status}`);
  const dados = await r.json();
  const campoTemp = process.env.THINGSPEAK_FIELD_TEMP || 'field1';
  const campoUmid = process.env.THINGSPEAK_FIELD_UMID || 'field2';
  return (dados.feeds || []).map(f => ({
    data_hora: f.created_at,
    temperatura: f[campoTemp] != null ? Number(f[campoTemp]) : null,
    umidade: f[campoUmid] != null ? Number(f[campoUmid]) : null
  }));
}

function criarDispositivos({ pool, autenticar, registrarLog, descricaoDoAcesso, buscarLeituras = leiturasDoThingSpeak }) {
  const router = express.Router();

  async function exigirDono(req, res, next) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ sucesso: false, erro: 'Dispositivo não encontrado.' });
    try {
      const [l] = await pool.query('SELECT * FROM dispositivo WHERE id = ?', [id]);
      if (l.length === 0) return res.status(404).json({ sucesso: false, erro: 'Dispositivo não encontrado.' });

      // >>> verificação de dono: o dispositivo precisa pertencer ao usuário da sessão <<<
      if (protegido() && Number(l[0].usuario_id) !== Number(req.usuarioId)) {
        const linha = logBloqueio('IDOR', `usuario ${req.usuarioId} tentou ${req.method} ${req.originalUrl} (dispositivo ${id} é de outro usuário) • ${descricaoDoAcesso(req)}`);
        await registrarLog(req.usuarioId, 'Usuário', 'Acesso a dispositivo negado', linha, 'Falha');
        return res.status(404).json({ sucesso: false, erro: 'Dispositivo não encontrado.' }); // 404: não revela que o ID existe
      }
      req.dispositivo = l[0];
      next();
    } catch (erro) { res.status(500).json({ sucesso: false, erro: erro.message }); }
  }

  const publico = d => ({ id: d.id, nome: d.nome, intervalo_s: d.intervalo_s, limite_temp_max: Number(d.limite_temp_max) });

  // lista: o filtro por dono fica no próprio SQL
  router.get('/dispositivos', autenticar, async (req, res) => {
    try {
      const [l] = await pool.query('SELECT * FROM dispositivo WHERE usuario_id = ? ORDER BY id', [req.usuarioId]);
      res.json({ sucesso: true, dispositivos: l.map(publico) });
    } catch (erro) { res.status(500).json({ sucesso: false, erro: erro.message }); }
  });

  router.get('/dispositivos/:id', autenticar, exigirDono, (req, res) => {
    res.json({ sucesso: true, dispositivo: publico(req.dispositivo) });
  });

  router.get('/dispositivos/:id/leituras', autenticar, exigirDono, async (req, res) => {
    const canal = req.dispositivo.canal_thingspeak || process.env.THINGSPEAK_CHANNEL_ID;
    const results = Math.min(parseInt(req.query.results, 10) || 24, 500);
    let leituras = [], aviso;
    try {
      if (!canal) throw new Error('canal não configurado');
      leituras = await buscarLeituras(canal, results);
    } catch (erro) { aviso = `Leituras indisponíveis agora: ${erro.message}`; }
    res.json({ sucesso: true, dispositivo: publico(req.dispositivo), leituras, ...(aviso && { aviso }) });
  });

  router.put('/dispositivos/:id/configuracao', autenticar, exigirDono, async (req, res) => {
    const { intervalo_s, limite_temp_max } = req.body || {};
    const i = Number(intervalo_s), t = Number(limite_temp_max);
    if (!Number.isInteger(i) || i < 10 || i > 3600) return res.status(400).json({ sucesso: false, erro: 'intervalo_s deve ser inteiro de 10 a 3600.' });
    if (!Number.isFinite(t) || t < 0 || t > 80) return res.status(400).json({ sucesso: false, erro: 'limite_temp_max deve estar entre 0 e 80.' });
    try {
      await pool.query('UPDATE dispositivo SET intervalo_s = ?, limite_temp_max = ? WHERE id = ?', [i, t, req.dispositivo.id]);
      await registrarLog(req.usuarioId, 'Usuário', 'Configuração alterada', `dispositivo ${req.dispositivo.id}`);
      res.json({ sucesso: true, dispositivo: { ...publico(req.dispositivo), intervalo_s: i, limite_temp_max: t } });
    } catch (erro) { res.status(500).json({ sucesso: false, erro: erro.message }); }
  });

  router.post('/dispositivos/:id/comandos', autenticar, exigirDono, async (req, res) => {
    const comando = String((req.body || {}).comando || '');
    if (!COMANDOS.includes(comando)) return res.status(400).json({ sucesso: false, erro: `Comando inválido. Use: ${COMANDOS.join(', ')}.` });
    try {
      const [r] = await pool.query('INSERT INTO dispositivo_comando (dispositivo_id, usuario_id, comando) VALUES (?, ?, ?)', [req.dispositivo.id, req.usuarioId, comando]);
      await registrarLog(req.usuarioId, 'Usuário', 'Comando enviado', `${comando} → dispositivo ${req.dispositivo.id}`);
      res.status(202).json({ sucesso: true, comando_id: r.insertId, comando });
    } catch (erro) { res.status(500).json({ sucesso: false, erro: erro.message }); }
  });

  return { router };
}

module.exports = { criarDispositivos };
