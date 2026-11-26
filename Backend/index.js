require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const pool = require('./db');
const { criarDoisFatores } = require('./controles/dois-fatores');
const { criarDispositivos } = require('./controles/dispositivos');

const app = express();
app.use(cors());
// limite maior: a foto de perfil chega como texto (base64)
app.use(express.json({ limit: '2mb' }));

app.get('/', (req, res) => {
  res.json({ mensagem: 'API do Safra VSF rodando!' });
});

app.get('/teste-banco', async (req, res) => {
  try {
    const [linhas] = await pool.query('SELECT NOW() AS agora');
    res.json({ conectado: true, horaDoBanco: linhas[0].agora });
  } catch (erro) {
    res.status(500).json({ conectado: false, erro: erro.message });
  }
});

// ---------- Sessões (token de login) ----------
// Depois do login, o servidor entrega um token. O frontend manda esse token em
// todas as rotas protegidas, assim cada pessoa só altera os próprios dados.
// As sessões ficam na memória: se o servidor reiniciar, é preciso entrar de novo.
const sessoes = new Map(); // token -> { usuarioId, expira, criadaEm, ultimoUso, ip, dispositivo }
const DURACAO_SESSAO_MS = 8 * 60 * 60 * 1000; // 8 horas

// "Chrome no Windows", "Firefox no Android"... a partir do User-Agent do navegador
function descreverNavegador(ua = '') {
  let navegador = 'Navegador desconhecido';
  if (/Edg\//.test(ua)) navegador = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) navegador = 'Opera';
  else if (/Firefox\//.test(ua)) navegador = 'Firefox';
  else if (/Chrome\//.test(ua)) navegador = 'Chrome';
  else if (/Safari\//.test(ua)) navegador = 'Safari';

  let sistema = '';
  if (/Android/.test(ua)) sistema = 'Android';
  else if (/iPhone|iPad|iOS/.test(ua)) sistema = 'iOS';
  else if (/Windows/.test(ua)) sistema = 'Windows';
  else if (/Mac OS X|Macintosh/.test(ua)) sistema = 'macOS';
  else if (/Linux/.test(ua)) sistema = 'Linux';

  return sistema ? `${navegador} no ${sistema}` : navegador;
}

function ipDe(req) {
  const encaminhado = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = (encaminhado || req.socket.remoteAddress || '').replace(/^::ffff:/, '');
  return ip === '::1' ? '127.0.0.1' : ip;
}

function descricaoDoAcesso(req) {
  return `${descreverNavegador(req.headers['user-agent'])} • IP ${ipDe(req)}`;
}

// identificador público da sessão (nunca expõe o token de verdade)
const idDaSessao = token => crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);

function criarSessao(usuarioId, req) {
  const token = crypto.randomBytes(32).toString('hex');
  const agora = Date.now();
  sessoes.set(token, {
    usuarioId,
    expira: agora + DURACAO_SESSAO_MS,
    criadaEm: agora,
    ultimoUso: agora,
    ip: ipDe(req),
    dispositivo: descreverNavegador(req.headers['user-agent'])
  });
  return token;
}

// limpa de tempos em tempos as sessões vencidas que ninguém usou mais
setInterval(() => {
  const agora = Date.now();
  for (const [token, sessao] of sessoes) {
    if (sessao.expira < agora) sessoes.delete(token);
  }
}, 10 * 60 * 1000).unref();

// Registra um evento na tabela log_sistema (aparece no histórico de acessos)
async function registrarLog(usuarioId, tipo, acao, descricao, status = 'Sucesso') {
  try {
    await pool.query(
      `INSERT INTO log_sistema (usuario_id, acao, tipo, descricao, data_hora, status)
       VALUES (?, ?, ?, ?, NOW(), ?)`,
      [usuarioId, acao, tipo, String(descricao || '').slice(0, 255), status]
    );
  } catch (erro) {
    console.warn('log_sistema:', erro.message); // o log nunca deve derrubar o login
  }
}

function autenticar(req, res, next) {
  const cabecalho = req.headers.authorization || '';
  const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : '';
  const sessao = sessoes.get(token);

  if (!sessao || sessao.expira < Date.now()) {
    sessoes.delete(token);
    return res.status(401).json({ sucesso: false, erro: 'Sessão expirada. Entre novamente.' });
  }

  sessao.expira = Date.now() + DURACAO_SESSAO_MS; // renova a cada uso
  sessao.ultimoUso = Date.now();
  req.usuarioId = sessao.usuarioId;
  req.token = token;
  next();
}

// ---------- Controles de segurança (pasta controles/) ----------
// 2FA com OTP (TOTP) e proteção contra IDOR nos dispositivos. Detalhes em seguranca/README.md
const dois = criarDoisFatores({ pool, autenticar, registrarLog, criarSessao, descricaoDoAcesso });
app.use(dois.router);
app.use(criarDispositivos({ pool, autenticar, registrarLog, descricaoDoAcesso }).router);

app.post('/login', async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ sucesso: false, erro: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const [linhas] = await pool.query(
      `SELECT id, nome, email, senha, status, perfil
       FROM usuario
       WHERE email = ?`,
      [email]
    );

    if (linhas.length === 0) {
      return res.status(401).json({ sucesso: false, erro: 'Usuário não encontrado.' });
    }

    const usuario = linhas[0];

    if (usuario.senha !== senha) {
      await registrarLog(usuario.id, 'Login', 'Falha de login', `Senha incorreta • ${descricaoDoAcesso(req)}`, 'Falha');
      return res.status(401).json({ sucesso: false, erro: 'Senha incorreta.' });
    }

    if (statusInativo(usuario.status)) {
      await registrarLog(usuario.id, 'Login', 'Falha de login', `Usuário inativo • ${descricaoDoAcesso(req)}`, 'Falha');
      return res.status(403).json({ sucesso: false, erro: 'Usuário inativo. Fale com o administrador.' });
    }

    // Segundo fator: com 2FA ativo, a senha sozinha NÃO gera token; o cliente precisa chamar /login/2fa
    if (await dois.exigeSegundoFator(usuario.id)) {
      return res.json({ sucesso: true, requer_2fa: true, desafio: dois.abrirDesafio(usuario.id) });
    }

    await registrarLog(usuario.id, 'Login', 'Login realizado', descricaoDoAcesso(req));

    res.json({
      sucesso: true,
      token: criarSessao(usuario.id, req),
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        perfil: usuario.perfil
      }
    });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// ---------- Configurações do usuário ----------
const CAMPOS_NOTIFICACAO = ['notif_producao', 'notif_clima', 'notif_exportacao', 'notif_relatorios'];
const OPCOES = {
  idioma: ['pt-BR', 'en'],
  unidade_peso: ['kg', 'ton'],
  unidade_area: ['ha', 'm2'],
  formato_data: ['DD/MM/AAAA', 'MM/DD/AAAA']
};

function prefsDoBanco(linha) {
  return {
    notif_producao: !!linha.notif_producao,
    notif_clima: !!linha.notif_clima,
    notif_exportacao: !!linha.notif_exportacao,
    notif_relatorios: !!linha.notif_relatorios,
    idioma: linha.idioma,
    unidade_peso: linha.unidade_peso,
    unidade_area: linha.unidade_area,
    formato_data: linha.formato_data
  };
}

// Carrega perfil + preferências de quem está logado
app.get('/configuracoes', autenticar, async (req, res) => {
  try {
    const [usuarios] = await pool.query(
      `SELECT id, nome, email, telefone, perfil, foto, senha_alterada_em
       FROM usuario WHERE id = ?`,
      [req.usuarioId]
    );
    if (usuarios.length === 0) {
      return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado.' });
    }

    // quem ainda não tem preferências recebe as padrão
    await pool.query('INSERT IGNORE INTO preferencia_usuario (usuario_id) VALUES (?)', [req.usuarioId]);
    const [prefs] = await pool.query('SELECT * FROM preferencia_usuario WHERE usuario_id = ?', [req.usuarioId]);

    res.json({ sucesso: true, usuario: usuarios[0], preferencias: prefsDoBanco(prefs[0]) });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// Salva perfil (nome, e-mail, telefone) + preferências de uma vez
app.put('/configuracoes', autenticar, async (req, res) => {
  const { nome, email, telefone, preferencias } = req.body || {};

  const nomeLimpo = String(nome || '').trim();
  const emailLimpo = String(email || '').trim();
  const telefoneLimpo = String(telefone || '').trim();
  const prefs = preferencias || {};

  if (nomeLimpo.length < 3 || nomeLimpo.length > 100) {
    return res.status(400).json({ sucesso: false, erro: 'Digite o nome completo (mínimo 3 letras).' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo) || emailLimpo.length > 100) {
    return res.status(400).json({ sucesso: false, erro: 'Digite um e-mail válido.' });
  }
  if (telefoneLimpo) {
    const digitos = telefoneLimpo.replace(/\D/g, '');
    if (digitos.length < 10 || digitos.length > 11 || telefoneLimpo.length > 20) {
      return res.status(400).json({ sucesso: false, erro: 'Digite um telefone válido com DDD.' });
    }
  }
  for (const campo of CAMPOS_NOTIFICACAO) {
    if (typeof prefs[campo] !== 'boolean') {
      return res.status(400).json({ sucesso: false, erro: `Preferência inválida: ${campo}.` });
    }
  }
  for (const [campo, validos] of Object.entries(OPCOES)) {
    if (!validos.includes(prefs[campo])) {
      return res.status(400).json({ sucesso: false, erro: `Preferência inválida: ${campo}.` });
    }
  }

  const conexao = await pool.getConnection();
  try {
    const [repetido] = await conexao.query(
      'SELECT id FROM usuario WHERE email = ? AND id <> ?',
      [emailLimpo, req.usuarioId]
    );
    if (repetido.length > 0) {
      return res.status(409).json({ sucesso: false, erro: 'Este e-mail já está em uso por outro usuário.' });
    }

    await conexao.beginTransaction();

    await conexao.query(
      'UPDATE usuario SET nome = ?, email = ?, telefone = ? WHERE id = ?',
      [nomeLimpo, emailLimpo, telefoneLimpo || null, req.usuarioId]
    );

    await conexao.query(
      `INSERT INTO preferencia_usuario
         (usuario_id, notif_producao, notif_clima, notif_exportacao, notif_relatorios,
          idioma, unidade_peso, unidade_area, formato_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         notif_producao = VALUES(notif_producao), notif_clima = VALUES(notif_clima),
         notif_exportacao = VALUES(notif_exportacao), notif_relatorios = VALUES(notif_relatorios),
         idioma = VALUES(idioma), unidade_peso = VALUES(unidade_peso),
         unidade_area = VALUES(unidade_area), formato_data = VALUES(formato_data)`,
      [req.usuarioId, prefs.notif_producao, prefs.notif_clima, prefs.notif_exportacao,
       prefs.notif_relatorios, prefs.idioma, prefs.unidade_peso, prefs.unidade_area,
       prefs.formato_data]
    );

    await conexao.commit();
    res.json({
      sucesso: true,
      usuario: { id: req.usuarioId, nome: nomeLimpo, email: emailLimpo, telefone: telefoneLimpo || null }
    });
  } catch (erro) {
    await conexao.rollback();
    res.status(500).json({ sucesso: false, erro: erro.message });
  } finally {
    conexao.release();
  }
});

// Foto de perfil (imagem em base64; null remove a foto)
app.put('/configuracoes/foto', autenticar, async (req, res) => {
  const { foto } = req.body || {};

  if (foto !== null) {
    const valida = typeof foto === 'string'
      && foto.length <= 400000
      && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto);
    if (!valida) {
      return res.status(400).json({ sucesso: false, erro: 'Imagem inválida ou grande demais.' });
    }
  }

  try {
    await pool.query('UPDATE usuario SET foto = ? WHERE id = ?', [foto, req.usuarioId]);
    res.json({ sucesso: true });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// Alterar senha (pede a senha atual)
app.put('/configuracoes/senha', autenticar, async (req, res) => {
  const { senha_atual, nova_senha } = req.body || {};

  if (!senha_atual || !nova_senha) {
    return res.status(400).json({ sucesso: false, erro: 'Preencha a senha atual e a nova senha.' });
  }
  if (String(nova_senha).length < 6 || String(nova_senha).length > 100) {
    return res.status(400).json({ sucesso: false, erro: 'A nova senha precisa ter de 6 a 100 caracteres.' });
  }
  if (nova_senha === senha_atual) {
    return res.status(400).json({ sucesso: false, erro: 'A nova senha precisa ser diferente da atual.' });
  }

  try {
    const [linhas] = await pool.query('SELECT senha FROM usuario WHERE id = ?', [req.usuarioId]);
    if (linhas.length === 0) {
      return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado.' });
    }
    // Obs.: o login atual compara a senha em texto puro; aqui segue o mesmo padrão.
    // (Melhoria futura: guardar a senha criptografada com bcrypt.)
    if (linhas[0].senha !== senha_atual) {
      return res.status(400).json({ sucesso: false, erro: 'A senha atual está incorreta.' });
    }

    await pool.query(
      'UPDATE usuario SET senha = ?, senha_alterada_em = NOW() WHERE id = ?',
      [nova_senha, req.usuarioId]
    );
    await registrarLog(req.usuarioId, 'Usuário', 'Senha alterada', descricaoDoAcesso(req));
    res.json({ sucesso: true });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// Sair: invalida o token
app.post('/logout', autenticar, async (req, res) => {
  const sessao = sessoes.get(req.token);
  sessoes.delete(req.token);
  await registrarLog(req.usuarioId, 'Login', 'Saída da conta', sessao ? `${sessao.dispositivo} • IP ${sessao.ip}` : descricaoDoAcesso(req));
  res.json({ sucesso: true });
});

// ---------- Segurança: sessões ativas e histórico de acessos ----------

// Onde a conta está conectada agora (a sessão atual vem marcada)
app.get('/configuracoes/sessoes', autenticar, (req, res) => {
  const agora = Date.now();
  const lista = [];

  for (const [token, sessao] of sessoes) {
    if (sessao.usuarioId !== req.usuarioId || sessao.expira < agora) continue;
    lista.push({
      id: idDaSessao(token),
      atual: token === req.token,
      dispositivo: sessao.dispositivo,
      ip: sessao.ip,
      criadaEm: new Date(sessao.criadaEm).toISOString(),
      ultimoUso: new Date(sessao.ultimoUso).toISOString()
    });
  }

  lista.sort((a, b) => (b.atual - a.atual) || b.ultimoUso.localeCompare(a.ultimoUso));
  res.json({ sucesso: true, sessoes: lista });
});

// Encerra UMA sessão (só as da própria pessoa, e nunca a atual: para isso existe o Sair)
app.delete('/configuracoes/sessoes/:id', autenticar, async (req, res) => {
  for (const [token, sessao] of sessoes) {
    if (idDaSessao(token) !== req.params.id || sessao.usuarioId !== req.usuarioId) continue;

    if (token === req.token) {
      return res.status(400).json({ sucesso: false, erro: 'Esta é a sua sessão atual. Use “Sair da conta” para encerrá-la.' });
    }

    sessoes.delete(token);
    await registrarLog(req.usuarioId, 'Login', 'Sessão encerrada', `${sessao.dispositivo} • IP ${sessao.ip}`);
    return res.json({ sucesso: true });
  }

  res.status(404).json({ sucesso: false, erro: 'Sessão não encontrada (talvez já tenha sido encerrada).' });
});

// Encerra TODAS as outras sessões da pessoa (mantém a atual)
app.delete('/configuracoes/sessoes', autenticar, async (req, res) => {
  let encerradas = 0;

  for (const [token, sessao] of sessoes) {
    if (sessao.usuarioId !== req.usuarioId || token === req.token) continue;
    sessoes.delete(token);
    encerradas++;
  }

  if (encerradas > 0) {
    await registrarLog(req.usuarioId, 'Login', 'Sessões encerradas', `${encerradas} outra(s) sessão(ões) encerrada(s) • ${descricaoDoAcesso(req)}`);
  }

  res.json({ sucesso: true, encerradas });
});

// Últimos 10 eventos de acesso (logins, falhas, saídas e sessões encerradas)
app.get('/configuracoes/acessos', autenticar, async (req, res) => {
  try {
    const [linhas] = await pool.query(
      `SELECT id, acao, status, descricao, data_hora
       FROM log_sistema
       WHERE usuario_id = ? AND tipo = 'Login'
       ORDER BY data_hora DESC, id DESC
       LIMIT 10`,
      [req.usuarioId]
    );
    res.json({ sucesso: true, acessos: linhas });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// ---------- ThingSpeak (dados do ESP32) ----------
// O backend consulta o canal para não expor a Read API Key no frontend.
app.get('/thingspeak', autenticar, async (req, res) => {
  const canal = process.env.THINGSPEAK_CHANNEL_ID;
  const chave = process.env.THINGSPEAK_READ_KEY;
  const campoTemp = process.env.THINGSPEAK_FIELD_TEMP || 'field1';
  const campoUmid = process.env.THINGSPEAK_FIELD_UMID || 'field2';

  if (!canal) {
    return res.status(500).json({ sucesso: false, erro: 'THINGSPEAK_CHANNEL_ID não configurado no .env' });
  }

  if (typeof fetch !== 'function') {
    return res.status(500).json({ sucesso: false, erro: 'Node muito antigo: atualize para Node 18 ou superior (node -v).' });
  }

  const results = Math.min(parseInt(req.query.results, 10) || 24, 500);
  const url = new URL(`https://api.thingspeak.com/channels/${canal}/feeds.json`);
  url.searchParams.set('results', results);
  if (chave) url.searchParams.set('api_key', chave);

  try {
    const resposta = await fetch(url);
    if (!resposta.ok) {
      return res.status(502).json({ sucesso: false, erro: `ThingSpeak respondeu ${resposta.status}` });
    }
    const dados = await resposta.json();

    const feedsBrutos = dados.feeds || [];
    const leituras = feedsBrutos
      .map(f => ({
        data_hora: f.created_at,
        temperatura: f[campoTemp] != null ? Number(f[campoTemp]) : null,
        umidade: f[campoUmid] != null ? Number(f[campoUmid]) : null
      }))
      .filter(l => l.temperatura !== null && !Number.isNaN(l.temperatura));

    if (leituras.length === 0) {
      const ultimo = feedsBrutos[feedsBrutos.length - 1] || {};
      const comValor = Object.keys(ultimo).filter(k => /^field\d$/.test(k) && ultimo[k] != null);
      const msg = feedsBrutos.length === 0
        ? 'O canal não tem nenhuma leitura (o ESP32 está publicando?).'
        : `Sem valor em ${campoTemp}. Campos com dados no canal: ${comValor.join(', ') || 'nenhum'}. Ajuste THINGSPEAK_FIELD_TEMP/UMID no .env.`;
      console.warn('ThingSpeak:', msg);
      return res.json({ sucesso: false, erro: msg });
    }

    // Status decidido aqui no servidor, a partir do horário real da última leitura.
    // O ThingSpeak não "pinga" o ESP32: o ESP32 é considerado offline quando
    // para de publicar por mais de THINGSPEAK_OFFLINE_MIN minutos (padrão 15).
    const ultima = leituras[leituras.length - 1];
    const limiteMin = parseInt(process.env.THINGSPEAK_OFFLINE_MIN, 10) || 15;
    const minutosSemDados = (Date.now() - new Date(ultima.data_hora).getTime()) / 60000;

    res.json({
      sucesso: true,
      canal: dados.channel ? dados.channel.name : null,
      ultima,
      leituras,
      status: {
        thingspeak: 'online',
        esp32: minutosSemDados <= limiteMin ? 'online' : 'offline',
        minutos_sem_dados: Math.round(minutosSemDados),
        limite_min: limiteMin
      }
    });
  } catch (erro) {
    console.warn('ThingSpeak:', erro.message);
    res.status(502).json({ sucesso: false, erro: erro.message });
  }
});

// ---------- Gestão de usuários (somente Administrador) ----------
// Rotas: GET /usuarios, GET /usuarios/resumo, POST /usuarios, PUT /usuarios/:id,
//        PUT /usuarios/:id/status, DELETE /usuarios/:id
const semAcento = t => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const PERFIS = { produtor: 'Produtor', analista: 'Analista', administrador: 'Administrador', exportador: 'Exportador' };
const STATUS_INATIVOS = ['inativo', 'inativa', 'desativado', 'desativada', 'bloqueado', 'bloqueada', '0', 'false'];

// só é "inativo" quando o banco diz isso de forma explícita (vazio/NULL continua ativo)
function statusInativo(valor) {
  return STATUS_INATIVOS.includes(semAcento(valor));
}

function chavePerfil(valor) {
  const n = semAcento(valor);
  return Object.keys(PERFIS).find(k => n === k || n.startsWith(k)) || n;
}

// Descobre como as colunas perfil/status estão definidas no banco (ENUM, número ou texto)
// e se existe uma coluna de data de cadastro. Assim a gravação respeita o seu esquema.
let esquemaUsuario = null;
async function carregarEsquema() {
  if (esquemaUsuario) return esquemaUsuario;
  const [colunas] = await pool.query('SHOW COLUMNS FROM usuario');
  const mapa = {};
  colunas.forEach(c => { mapa[c.Field.toLowerCase()] = c; });
  const valoresEnum = c => {
    const m = c && /^enum\((.*)\)$/i.exec(c.Type);
    return m ? [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map(x => x[1].replace(/''/g, "'")) : null;
  };
  const nomeData = ['criado_em', 'data_criacao', 'data_cadastro', 'created_at', 'criado'].find(n => mapa[n]);
  esquemaUsuario = {
    perfilEnum: valoresEnum(mapa.perfil),
    statusEnum: valoresEnum(mapa.status),
    statusNumerico: !!(mapa.status && /int|bit|decimal/i.test(mapa.status.Type)),
    colunaCriado: nomeData ? mapa[nomeData].Field : null
  };
  return esquemaUsuario;
}

function valorPerfilParaBanco(chave, esq) {
  if (esq.perfilEnum) {
    const v = esq.perfilEnum.find(x => semAcento(x) === chave) || esq.perfilEnum.find(x => semAcento(x).startsWith(chave));
    if (!v) throw Object.assign(new Error(`O banco não aceita o perfil "${PERFIS[chave]}".`), { http: 400 });
    return v;
  }
  return PERFIS[chave];
}

function valorStatusParaBanco(ativo, esq) {
  if (esq.statusNumerico) return ativo ? 1 : 0;
  if (esq.statusEnum) {
    const v = esq.statusEnum.find(x => ativo ? semAcento(x) === 'ativo' : STATUS_INATIVOS.includes(semAcento(x)));
    if (!v) throw Object.assign(new Error('O banco não aceita esse status.'), { http: 400 });
    return v;
  }
  return ativo ? 'Ativo' : 'Inativo';
}

function usuarioParaTela(l) {
  const inativo = statusInativo(l.status);
  const ultimo = l.ultimo_acesso ? new Date(l.ultimo_acesso).toISOString() : null;
  return {
    id: l.id,
    nome: l.nome,
    email: l.email,
    telefone: l.telefone || '',
    perfil: chavePerfil(l.perfil),
    // "pendente" = ativo que ainda nunca entrou no sistema
    status: inativo ? 'inativo' : (ultimo ? 'ativo' : 'pendente'),
    ultimo_acesso: ultimo,
    criado_em: l.criado_em ? new Date(l.criado_em).toISOString() : null
  };
}

async function somenteAdmin(req, res, next) {
  try {
    const [linhas] = await pool.query('SELECT perfil FROM usuario WHERE id = ?', [req.usuarioId]);
    if (linhas.length === 0 || chavePerfil(linhas[0].perfil) !== 'administrador') {
      return res.status(403).json({ sucesso: false, erro: 'Apenas administradores podem gerenciar usuários.' });
    }
    next();
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
}

function encerrarSessoesDe(usuarioId) {
  for (const [token, sessao] of sessoes) {
    if (sessao.usuarioId === usuarioId) sessoes.delete(token);
  }
}

function lerCorpoUsuario(corpo, { exigirSenha }) {
  const nome = String(corpo.nome || '').trim();
  const email = String(corpo.email || '').trim().toLowerCase();
  const telefone = String(corpo.telefone || '').trim();
  const perfil = semAcento(corpo.perfil);
  const senha = corpo.senha === undefined || corpo.senha === null ? '' : String(corpo.senha);

  if (nome.length < 3) return { erro: 'Digite o nome completo (mínimo 3 letras).' };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: 'Digite um e-mail válido.' };
  if (telefone) {
    const digitos = telefone.replace(/\D/g, '');
    if (digitos.length < 10 || digitos.length > 11) return { erro: 'Digite um telefone válido com DDD.' };
  }
  if (!PERFIS[perfil]) return { erro: 'Escolha um perfil válido.' };
  if (exigirSenha || senha) {
    if (senha.length < 6 || senha.length > 100) return { erro: 'A senha precisa ter de 6 a 100 caracteres.' };
  }
  return { nome, email, telefone: telefone || null, perfil, senha };
}

async function buscarUsuarioDaTela(id, esq) {
  const [linhas] = await pool.query(
    `SELECT u.id, u.nome, u.email, u.telefone, u.perfil, u.status
            ${esq.colunaCriado ? `, u.\`${esq.colunaCriado}\` AS criado_em` : ''},
            (SELECT MAX(l.data_hora) FROM log_sistema l
              WHERE l.usuario_id = u.id AND l.acao = 'Login realizado') AS ultimo_acesso
       FROM usuario u WHERE u.id = ?`,
    [id]
  );
  return linhas.length ? usuarioParaTela(linhas[0]) : null;
}

// ---------- Relatórios (somente administrador) ----------
// GET /relatorios/resumo?dias=30  -> números dos cards, das caixas e dos relatórios recentes
// GET /relatorios/:tipo?dias=30   -> tabela do relatório (usuarios, dados, atividades, sistema, alertas, geral)
//   &registrar=1 grava em log_sistema que o relatório foi gerado (usado ao baixar/imprimir).
const TIPOS_RELATORIO = {
  usuarios: 'Relatório de usuários', dados: 'Relatório de dados', atividades: 'Relatório de atividades',
  sistema: 'Relatório do sistema', alertas: 'Relatório de alertas', geral: 'Relatório geral'
};
const diasDe = req => { const d = parseInt(req.query.dias, 10); return [7, 30, 180, 365].includes(d) ? d : 30; };
const rotuloPeriodo = d => ({ 7: 'Últimos 7 dias', 30: 'Últimos 30 dias', 180: 'Últimos 6 meses', 365: 'Último ano' }[d]);
const fmtData = v => v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Recife' }) : '—';

async function contarRelatorios(dias) {
  const q = async (sql, p = []) => { try { return (await pool.query(sql, p))[0]; } catch (e) { return null; } };
  const usu = await q('SELECT perfil, status FROM usuario') || [];
  const ativos = usu.filter(l => !statusInativo(l.status)).length;
  const disp = await q('SELECT COUNT(*) AS n FROM dispositivo');
  const ev = (await q('SELECT COUNT(*) AS n FROM log_sistema WHERE data_hora >= NOW() - INTERVAL ? DAY', [dias]))[0].n;
  const falhas = (await q("SELECT COUNT(*) AS n FROM log_sistema WHERE status = 'Falha' AND data_hora >= NOW() - INTERVAL ? DAY", [dias]))[0].n;
  return { usuarios: usu.length, ativos, dispositivos: disp ? Number(disp[0].n) : 0, eventos: Number(ev), alertas: Number(falhas) };
}

app.get('/relatorios/resumo', autenticar, somenteAdmin, async (req, res) => {
  try {
    const dias = diasDe(req);
    const c = await contarRelatorios(dias);
    const [[m]] = await pool.query(
      `SELECT COUNT(*) AS n FROM log_sistema WHERE acao = 'Relatório gerado'
         AND YEAR(data_hora) = YEAR(NOW()) AND MONTH(data_hora) = MONTH(NOW())`);
    const [recentes] = await pool.query(
      `SELECT descricao, DATE(data_hora) = CURDATE() AS hoje, DATE(data_hora) = CURDATE() - INTERVAL 1 DAY AS ontem,
              DATE_FORMAT(data_hora, '%d/%m/%Y') AS data, DATE_FORMAT(data_hora, '%H:%i') AS hora
         FROM log_sistema WHERE acao = 'Relatório gerado' ORDER BY data_hora DESC, id DESC LIMIT 3`);
    res.json({
      sucesso: true, dias, periodo: rotuloPeriodo(dias), contagens: c, gerados_mes: Number(m.n),
      sistema_online_s: Math.round(process.uptime()), sessoes: sessoes.size,
      recentes: recentes.map(r => {
        const [tipo, formato, d] = String(r.descricao || '').split('|');
        return { tipo, formato, dias: Number(d) || 30, quando: `${r.hoje ? 'hoje' : r.ontem ? 'ontem' : r.data}, ${r.hora}` };
      })
    });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

async function montarRelatorio(tipo, dias) {
  const periodo = rotuloPeriodo(dias);
  const sql = async (texto, p = []) => (await pool.query(texto, p))[0];
  if (tipo === 'usuarios') {
    const esq = await carregarEsquema();
    const l = await sql(`SELECT u.nome, u.email, u.telefone, u.perfil, u.status
        ${esq.colunaCriado ? `, u.\`${esq.colunaCriado}\` AS criado_em` : ''},
        (SELECT MAX(x.data_hora) FROM log_sistema x WHERE x.usuario_id = u.id AND x.acao = 'Login realizado') AS ultimo_acesso
        FROM usuario u ORDER BY u.nome`);
    const linhas = l.map(u => {
      const t = usuarioParaTela(u);
      return [u.nome, u.email, u.telefone || '—', PERFIS[t.perfil] || t.perfil,
        t.status === 'ativo' ? 'Ativo' : t.status === 'inativo' ? 'Inativo' : 'Pendente', fmtData(u.ultimo_acesso)];
    });
    const ativos = l.filter(u => !statusInativo(u.status)).length;
    return { titulo: TIPOS_RELATORIO[tipo], periodo: 'Situação atual', colunas: ['Nome', 'E-mail', 'Telefone', 'Perfil', 'Status', 'Último acesso'],
      linhas, resumo: `${l.length} usuário(s) • ${ativos} ativo(s) • ${l.length - ativos} inativo(s)` };
  }
  if (tipo === 'atividades' || tipo === 'alertas') {
    const soFalhas = tipo === 'alertas';
    const l = await sql(
      `SELECT COALESCE(u.nome, 'Sistema') AS usuario, g.acao, g.tipo, g.descricao, g.status,
              DATE_FORMAT(g.data_hora, '%d/%m/%Y %H:%i:%s') AS quando
         FROM log_sistema g LEFT JOIN usuario u ON u.id = g.usuario_id
        WHERE g.data_hora >= NOW() - INTERVAL ? DAY ${soFalhas ? "AND g.status = 'Falha'" : ''}
        ORDER BY g.data_hora DESC, g.id DESC LIMIT 5000`, [dias]);
    return { titulo: TIPOS_RELATORIO[tipo], periodo, colunas: ['Data e hora', 'Usuário', 'Ação', 'Tipo', 'Descrição', 'Status'],
      linhas: l.map(e => [e.quando, e.usuario, e.acao, e.tipo, e.descricao || '—', e.status]),
      resumo: soFalhas ? `${l.length} alerta(s) de falha registrados` : `${l.length} evento(s) registrados` };
  }
  if (tipo === 'dados') {
    let l = [];
    try {
      l = await sql(
        `SELECT d.id, d.nome, COALESCE(u.nome, '—') AS dono, d.canal_thingspeak, d.intervalo_s, d.limite_temp_max,
                (SELECT COUNT(*) FROM dispositivo_comando c WHERE c.dispositivo_id = d.id
                    AND c.criado_em >= NOW() - INTERVAL ? DAY) AS comandos
           FROM dispositivo d LEFT JOIN usuario u ON u.id = d.usuario_id ORDER BY d.nome`, [dias]);
    } catch (e) { /* tabela ainda não criada */ }
    return { titulo: TIPOS_RELATORIO[tipo], periodo, colunas: ['Dispositivo', 'Responsável', 'Canal ThingSpeak', 'Intervalo (s)', 'Limite temp. (°C)', 'Comandos no período'],
      linhas: l.map(d => [d.nome, d.dono, d.canal_thingspeak || 'Padrão (.env)', d.intervalo_s, d.limite_temp_max, d.comandos]),
      resumo: `${l.length} dispositivo(s) cadastrado(s)` };
  }
  if (tipo === 'sistema') {
    const t0 = Date.now();
    const [[agora]] = await pool.query("SELECT DATE_FORMAT(NOW(), '%d/%m/%Y %H:%i:%s') AS agora");
    const ms = Date.now() - t0;
    const [[f]] = await pool.query("SELECT COUNT(*) AS n FROM log_sistema WHERE status = 'Falha' AND data_hora >= NOW() - INTERVAL ? DAY", [dias]);
    const [[e]] = await pool.query('SELECT COUNT(*) AS n FROM log_sistema WHERE data_hora >= NOW() - INTERVAL ? DAY', [dias]);
    const h = Math.floor(process.uptime() / 3600), m = Math.floor((process.uptime() % 3600) / 60);
    const taxa = e.n ? (100 - (f.n / e.n) * 100).toFixed(1).replace('.', ',') + '%' : '—';
    return { titulo: TIPOS_RELATORIO[tipo], periodo, colunas: ['Indicador', 'Valor'], linhas: [
      ['API Node (Safra)', 'Online'], ['Tempo ligado desde a última reinicialização', `${h} h ${m} min`],
      ['Banco de dados', `Conectado (${ms} ms)`], ['Hora do banco', agora.agora], ['Sessões ativas agora', sessoes.size],
      ['Eventos no período', Number(e.n)], ['Falhas no período', Number(f.n)], ['Taxa de eventos sem falha', taxa],
      ['Versão do Node.js', process.version]
    ], resumo: 'Funcionamento dos serviços Node e banco de dados' };
  }
  // geral
  const c = await contarRelatorios(dias);
  const [perf] = await pool.query('SELECT perfil FROM usuario');
  const porPerfil = {};
  perf.forEach(p => { const k = PERFIS[chavePerfil(p.perfil)] || 'Outro'; porPerfil[k] = (porPerfil[k] || 0) + 1; });
  const [porTipo] = await pool.query('SELECT tipo, COUNT(*) AS n FROM log_sistema WHERE data_hora >= NOW() - INTERVAL ? DAY GROUP BY tipo ORDER BY n DESC', [dias]);
  const linhas = [
    ['Usuários cadastrados', c.usuarios], ['Usuários ativos', c.ativos], ['Dispositivos cadastrados', c.dispositivos],
    ['Eventos registrados', c.eventos], ['Falhas / alertas', c.alertas], ['Sessões ativas agora', sessoes.size],
    ...Object.entries(porPerfil).map(([k, n]) => [`Usuários • ${k}`, n]),
    ...porTipo.map(t => [`Eventos • ${t.tipo}`, Number(t.n)])
  ];
  return { titulo: TIPOS_RELATORIO.geral, periodo, colunas: ['Indicador', 'Valor'], linhas, resumo: 'Visão consolidada dos indicadores do Safra' };
}

app.get('/relatorios/:tipo', autenticar, somenteAdmin, async (req, res) => {
  try {
    const tipo = req.params.tipo;
    if (!TIPOS_RELATORIO[tipo]) return res.status(404).json({ sucesso: false, erro: 'Relatório inexistente.' });
    const dias = diasDe(req);
    const rel = await montarRelatorio(tipo, dias);
    if (req.query.registrar === '1') {
      const fmt = ['pdf', 'xls', 'csv'].includes(req.query.formato) ? req.query.formato : 'tela';
      await registrarLog(req.usuarioId, 'Relatório', 'Relatório gerado', `${tipo}|${fmt}|${dias}`);
    }
    res.json({ sucesso: true, tipo, gerado_em: new Date().toISOString(), ...rel });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// ---------- Logs do sistema (somente administrador) ----------
// Lê a tabela log_sistema (preenchida por registrarLog) com busca, filtros e paginação.
app.get('/logs', autenticar, somenteAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 80);
    const tipo = String(req.query.tipo || '').trim();
    const periodo = String(req.query.periodo || '30');
    const todos = req.query.todos === '1'; // exportação: sem paginação (limite de 5000)
    const porPagina = todos ? 5000 : Math.min(Math.max(parseInt(req.query.por_pagina, 10) || 10, 1), 100);
    const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);

    const where = [];
    const params = [];
    if (periodo === 'hoje') where.push('DATE(l.data_hora) = CURDATE()');
    else if (periodo === '7') where.push('l.data_hora >= NOW() - INTERVAL 7 DAY');
    else if (periodo === '30') where.push('l.data_hora >= NOW() - INTERVAL 30 DAY');
    if (tipo === 'falha') where.push("l.status = 'Falha'");
    else if (tipo) { where.push('l.tipo = ?'); params.push(tipo); }
    if (q) {
      where.push('(u.nome LIKE ? OR l.acao LIKE ? OR l.descricao LIKE ?)');
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    const filtro = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const de = 'FROM log_sistema l LEFT JOIN usuario u ON u.id = l.usuario_id';

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${de} ${filtro}`, params);
    const [eventos] = await pool.query(
      `SELECT l.id, l.acao, l.tipo, l.descricao, l.status,
              DATE_FORMAT(l.data_hora, '%d/%m/%Y') AS data,
              DATE_FORMAT(l.data_hora, '%H:%i:%s') AS hora,
              DATE(l.data_hora) = CURDATE() AS hoje,
              COALESCE(u.nome, 'Sistema') AS usuario
       ${de} ${filtro}
       ORDER BY l.data_hora DESC, l.id DESC
       LIMIT ? OFFSET ?`,
      [...params, porPagina, (pagina - 1) * porPagina]
    );

    const [[r]] = await pool.query(
      `SELECT
         SUM(DATE(data_hora) = CURDATE()) AS hoje,
         SUM(tipo = 'Login' AND data_hora >= NOW() - INTERVAL 24 HOUR) AS acessos24h,
         SUM(status = 'Falha' AND tipo = 'Login' AND data_hora >= NOW() - INTERVAL 24 HOUR) AS avisos24h,
         SUM(status = 'Falha' AND tipo <> 'Login' AND data_hora >= NOW() - INTERVAL 24 HOUR) AS erros24h,
         TIMESTAMPDIFF(SECOND, MAX(data_hora), NOW()) AS segundos_ultimo
       FROM log_sistema`
    );

    res.json({
      sucesso: true,
      eventos: eventos.map(e => ({ ...e, hoje: !!e.hoje })),
      total,
      pagina,
      por_pagina: porPagina,
      resumo: {
        hoje: Number(r.hoje || 0),
        acessos24h: Number(r.acessos24h || 0),
        avisos24h: Number(r.avisos24h || 0),
        erros24h: Number(r.erros24h || 0),
        segundos_ultimo: r.segundos_ultimo === null ? null : Number(r.segundos_ultimo)
      }
    });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.get('/usuarios', autenticar, somenteAdmin, async (req, res) => {
  try {
    const esq = await carregarEsquema();
    const [linhas] = await pool.query(
      `SELECT u.id, u.nome, u.email, u.telefone, u.perfil, u.status
              ${esq.colunaCriado ? `, u.\`${esq.colunaCriado}\` AS criado_em` : ''},
              (SELECT MAX(l.data_hora) FROM log_sistema l
                WHERE l.usuario_id = u.id AND l.acao = 'Login realizado') AS ultimo_acesso
         FROM usuario u ORDER BY u.nome`
    );
    res.json({ sucesso: true, tem_data_cadastro: !!esq.colunaCriado, usuarios: linhas.map(usuarioParaTela) });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.get('/usuarios/resumo', autenticar, somenteAdmin, async (req, res) => {
  try {
    const [linhas] = await pool.query('SELECT perfil, status FROM usuario');
    const perfis = { produtor: 0, analista: 0, administrador: 0, exportador: 0 };
    let ativos = 0;
    linhas.forEach(l => {
      const k = chavePerfil(l.perfil);
      if (k in perfis) perfis[k] += 1;
      if (!statusInativo(l.status)) ativos += 1;
    });
    res.json({ sucesso: true, total: linhas.length, ativos, perfis });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.post('/usuarios', autenticar, somenteAdmin, async (req, res) => {
  const d = lerCorpoUsuario(req.body || {}, { exigirSenha: true });
  if (d.erro) return res.status(400).json({ sucesso: false, erro: d.erro });

  try {
    const esq = await carregarEsquema();
    const [existe] = await pool.query('SELECT id FROM usuario WHERE email = ?', [d.email]);
    if (existe.length) return res.status(409).json({ sucesso: false, erro: 'Já existe um usuário com este e-mail.' });

    // Obs.: o login atual compara a senha em texto puro; aqui segue o mesmo padrão.
    // (Melhoria futura: guardar a senha criptografada com bcrypt.)
    const [r] = await pool.query(
      'INSERT INTO usuario (nome, email, telefone, senha, perfil, status) VALUES (?, ?, ?, ?, ?, ?)',
      [d.nome, d.email, d.telefone, d.senha, valorPerfilParaBanco(d.perfil, esq), valorStatusParaBanco(true, esq)]
    );
    await pool.query('INSERT IGNORE INTO preferencia_usuario (usuario_id) VALUES (?)', [r.insertId]);
    await registrarLog(req.usuarioId, 'Usuário', 'Usuário criado', `${d.nome} (${PERFIS[d.perfil]})`);
    res.status(201).json({ sucesso: true, usuario: await buscarUsuarioDaTela(r.insertId, esq) });
  } catch (erro) {
    res.status(erro.http || 500).json({ sucesso: false, erro: erro.message });
  }
});

app.put('/usuarios/:id', autenticar, somenteAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const d = lerCorpoUsuario(req.body || {}, { exigirSenha: false });
  if (d.erro) return res.status(400).json({ sucesso: false, erro: d.erro });

  try {
    const esq = await carregarEsquema();
    const [atual] = await pool.query('SELECT id, perfil FROM usuario WHERE id = ?', [id]);
    if (atual.length === 0) return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado.' });

    if (id === req.usuarioId && d.perfil !== chavePerfil(atual[0].perfil)) {
      return res.status(400).json({ sucesso: false, erro: 'Você não pode alterar o seu próprio perfil.' });
    }
    const [outro] = await pool.query('SELECT id FROM usuario WHERE email = ? AND id <> ?', [d.email, id]);
    if (outro.length) return res.status(409).json({ sucesso: false, erro: 'Este e-mail já está em uso por outro usuário.' });

    const perfilMudou = d.perfil !== chavePerfil(atual[0].perfil);
    await pool.query(
      'UPDATE usuario SET nome = ?, email = ?, telefone = ?, perfil = ? WHERE id = ?',
      [d.nome, d.email, d.telefone, valorPerfilParaBanco(d.perfil, esq), id]
    );
    if (d.senha) {
      await pool.query('UPDATE usuario SET senha = ?, senha_alterada_em = NOW() WHERE id = ?', [d.senha, id]);
    }
    if ((perfilMudou || d.senha) && id !== req.usuarioId) encerrarSessoesDe(id);
    await registrarLog(req.usuarioId, 'Usuário', 'Usuário editado', `${d.nome}${perfilMudou ? ` → ${PERFIS[d.perfil]}` : ''}${d.senha ? ' • senha redefinida' : ''}`);
    res.json({ sucesso: true, usuario: await buscarUsuarioDaTela(id, esq) });
  } catch (erro) {
    res.status(erro.http || 500).json({ sucesso: false, erro: erro.message });
  }
});

app.put('/usuarios/:id/status', autenticar, somenteAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const ativo = !!(req.body || {}).ativo;
  if (id === req.usuarioId) {
    return res.status(400).json({ sucesso: false, erro: 'Você não pode desativar a sua própria conta.' });
  }
  try {
    const esq = await carregarEsquema();
    const [r] = await pool.query('UPDATE usuario SET status = ? WHERE id = ?', [valorStatusParaBanco(ativo, esq), id]);
    if (r.affectedRows === 0) return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado.' });
    if (!ativo) encerrarSessoesDe(id);
    await registrarLog(req.usuarioId, 'Usuário', ativo ? 'Usuário ativado' : 'Usuário desativado', `ID ${id}`);
    res.json({ sucesso: true, usuario: await buscarUsuarioDaTela(id, esq) });
  } catch (erro) {
    res.status(erro.http || 500).json({ sucesso: false, erro: erro.message });
  }
});

app.delete('/usuarios/:id', autenticar, somenteAdmin, async (req, res) => {
  const id = Number(req.params.id);
  if (id === req.usuarioId) {
    return res.status(400).json({ sucesso: false, erro: 'Você não pode excluir a sua própria conta.' });
  }
  try {
    const [alvo] = await pool.query('SELECT nome FROM usuario WHERE id = ?', [id]);
    if (alvo.length === 0) return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado.' });
    try {
      await pool.query('DELETE FROM preferencia_usuario WHERE usuario_id = ?', [id]);
      await pool.query('DELETE FROM usuario WHERE id = ?', [id]);
    } catch (erro) {
      if (erro.code === 'ER_ROW_IS_REFERENCED_2' || erro.errno === 1451) {
        return res.status(409).json({ sucesso: false, erro: 'Este usuário tem histórico no sistema e não pode ser excluído. Desative-o.' });
      }
      throw erro;
    }
    encerrarSessoesDe(id);
    await registrarLog(req.usuarioId, 'Usuário', 'Usuário excluído', alvo[0].nome);
    res.json({ sucesso: true });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

// ---------- Permissões por perfil ----------
// A matriz (perfil x recurso) fica na tabela perfil_permissao do MySQL, criada sozinha no primeiro uso.
// Tudo começa liberado (igual ao que cada perfil já via). O comum.js do frontend pergunta
// GET /permissoes/minhas e esconde os menus/telas bloqueados. Só o administrador altera.
const RECURSOS_PERMISSAO = {
  dashboard: 'Dashboard', lavouras: 'Lavouras', financeiro: 'Financeiro', modelos: 'Modelos preditivos',
  dados: 'Dados', usuarios: 'Usuários', permissoes: 'Permissões', logs: 'Logs do sistema',
  relatorios: 'Relatórios', alertas: 'Alertas', exportacao: 'Exportação'
};
// quais recursos têm tela em cada perfil (só esses fazem sentido na matriz)
const RECURSOS_DO_PERFIL = {
  produtor: ['dashboard', 'lavouras', 'financeiro', 'relatorios', 'alertas', 'exportacao'],
  analista: ['dashboard', 'modelos', 'dados', 'relatorios', 'alertas'],
  administrador: ['dashboard', 'usuarios', 'permissoes', 'dados', 'logs', 'relatorios', 'alertas']
};
// o administrador nunca pode perder essas duas (senão ninguém mais consegue liberar nada)
const RECURSOS_TRAVADOS = { administrador: ['usuarios', 'permissoes'] };
const PERFIS_PERMISSAO = {
  produtor: { nome: 'Produtor', curto: 'Produtor', descricao: 'Acesso às informações de produção, lavouras e histórico.' },
  analista: { nome: 'Analista de Dados', curto: 'Analista', descricao: 'Acesso aos dados, modelos preditivos e previsões.' },
  administrador: { nome: 'Administrador', curto: 'Administrador', descricao: 'Acesso completo ao gerenciamento do sistema.' }
};

let tabelaPermissoesPronta = null;
function garantirTabelaPermissoes() {
  if (!tabelaPermissoesPronta) {
    tabelaPermissoesPronta = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS perfil_permissao (
           perfil VARCHAR(20) NOT NULL,
           recurso VARCHAR(30) NOT NULL,
           permitido TINYINT(1) NOT NULL DEFAULT 1,
           atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           PRIMARY KEY (perfil, recurso)
         )`
      );
      const padrao = [];
      Object.keys(RECURSOS_DO_PERFIL).forEach(perfil => {
        RECURSOS_DO_PERFIL[perfil].forEach(recurso => padrao.push([perfil, recurso, 1]));
      });
      await pool.query('INSERT IGNORE INTO perfil_permissao (perfil, recurso, permitido) VALUES ?', [padrao]);
    })().catch(erro => { tabelaPermissoesPronta = null; throw erro; });
  }
  return tabelaPermissoesPronta;
}

async function lerMatrizPermissoes() {
  await garantirTabelaPermissoes();
  const [linhas] = await pool.query('SELECT perfil, recurso, permitido FROM perfil_permissao');
  const matriz = {};
  Object.keys(RECURSOS_DO_PERFIL).forEach(perfil => {
    matriz[perfil] = {};
    RECURSOS_DO_PERFIL[perfil].forEach(r => { matriz[perfil][r] = true; });
  });
  linhas.forEach(l => {
    if (matriz[l.perfil] && l.recurso in matriz[l.perfil]) matriz[l.perfil][l.recurso] = !!l.permitido;
  });
  Object.keys(RECURSOS_TRAVADOS).forEach(perfil => {
    RECURSOS_TRAVADOS[perfil].forEach(r => { matriz[perfil][r] = true; });
  });
  return matriz;
}

// o que o usuário logado pode abrir (usado pelo frontend de todos os perfis)
app.get('/permissoes/minhas', autenticar, async (req, res) => {
  try {
    const [u] = await pool.query('SELECT perfil FROM usuario WHERE id = ?', [req.usuarioId]);
    if (u.length === 0) return res.status(404).json({ sucesso: false, erro: 'Usuário não encontrado.' });
    const perfil = chavePerfil(u[0].perfil);
    const matriz = await lerMatrizPermissoes();
    res.json({ sucesso: true, perfil, recursos: matriz[perfil] || null });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.get('/permissoes', autenticar, somenteAdmin, async (req, res) => {
  try {
    const matriz = await lerMatrizPermissoes();
    const [usuarios] = await pool.query('SELECT perfil, status FROM usuario');
    const contagem = { produtor: 0, analista: 0, administrador: 0 };
    let ativos = 0;
    usuarios.forEach(l => {
      const k = chavePerfil(l.perfil);
      if (k in contagem) contagem[k] += 1;
      if (!statusInativo(l.status)) ativos += 1;
    });

    let alteracoes = 0;
    try {
      const [r] = await pool.query(
        "SELECT COUNT(*) AS n FROM log_sistema WHERE acao = 'Permissões alteradas' AND data_hora >= (NOW() - INTERVAL 7 DAY)"
      );
      alteracoes = Number(r[0].n) || 0;
    } catch (e) { /* sem log: segue com zero */ }

    const perfis = Object.keys(PERFIS_PERMISSAO).map(chave => ({
      chave,
      nome: PERFIS_PERMISSAO[chave].nome,
      curto: PERFIS_PERMISSAO[chave].curto,
      descricao: PERFIS_PERMISSAO[chave].descricao,
      usuarios: contagem[chave],
      aplica: RECURSOS_DO_PERFIL[chave],
      travadas: RECURSOS_TRAVADOS[chave] || []
    }));
    const recursos = Object.keys(RECURSOS_PERMISSAO).map(chave => ({ chave, rotulo: RECURSOS_PERMISSAO[chave] }));
    let ativas = 0, possiveis = 0;
    Object.keys(matriz).forEach(p => Object.keys(matriz[p]).forEach(r => { possiveis += 1; if (matriz[p][r]) ativas += 1; }));

    res.json({
      sucesso: true,
      perfis, recursos, matriz,
      cards: {
        perfis: perfis.length,
        usuarios_ativos: ativos,
        usuarios_total: usuarios.length,
        permissoes_ativas: ativas,
        permissoes_total: possiveis,
        alteracoes_7d: alteracoes
      }
    });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

app.put('/permissoes/:perfil', autenticar, somenteAdmin, async (req, res) => {
  try {
    const perfil = semAcento(req.params.perfil);
    if (!RECURSOS_DO_PERFIL[perfil]) return res.status(404).json({ sucesso: false, erro: 'Perfil não encontrado.' });
    const enviado = (req.body && req.body.recursos) || {};
    const atual = (await lerMatrizPermissoes())[perfil];
    const travadas = RECURSOS_TRAVADOS[perfil] || [];

    const linhas = [], mudancas = [];
    RECURSOS_DO_PERFIL[perfil].forEach(r => {
      let valor = typeof enviado[r] === 'boolean' ? enviado[r] : atual[r];
      if (travadas.includes(r)) valor = true;
      if (valor !== atual[r]) mudancas.push(`${valor ? '+' : '-'} ${RECURSOS_PERMISSAO[r]}`);
      linhas.push([perfil, r, valor ? 1 : 0]);
    });

    await garantirTabelaPermissoes();
    await pool.query(
      'INSERT INTO perfil_permissao (perfil, recurso, permitido) VALUES ? ON DUPLICATE KEY UPDATE permitido = VALUES(permitido)',
      [linhas]
    );
    if (mudancas.length) {
      await registrarLog(req.usuarioId, 'Permissão', 'Permissões alteradas', `${PERFIS_PERMISSAO[perfil].nome}: ${mudancas.join(', ')}`);
    }
    res.json({ sucesso: true, recursos: (await lerMatrizPermissoes())[perfil] });
  } catch (erro) {
    res.status(500).json({ sucesso: false, erro: erro.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});