// Código de missão da equipe (enviado pelo professor). Aparece em TODA mensagem de log
// gerada quando um controle de segurança bloqueia algo.
require('dotenv').config();

const CODIGO_MISSAO = (process.env.CODIGO_MISSAO || 'SEM-CODIGO').trim();

function logBloqueio(controle, detalhe) {
  const linha = `[MISSAO ${CODIGO_MISSAO}] ${controle} bloqueou: ${detalhe}`;
  console.warn(linha);
  return linha;
}

module.exports = { CODIGO_MISSAO, logBloqueio };
