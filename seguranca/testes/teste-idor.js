// Teste do controle 2 (IDOR): o usuário A tenta ler, alterar e comandar o dispositivo do usuário B.
// Uso:  FASE=antes|depois node seguranca/testes/teste-idor.js
//   antes  -> servidor iniciado com PROTECAO_IDOR=off  (as tentativas devem FUNCIONAR)
//   depois -> servidor com a proteção ligada (padrão)  (as tentativas devem dar 403/404)
const { http, escrever, verificar, finalizar, FASE, CODIGO, BASE } = require('./util');

const A = { email: process.env.A_EMAIL || 'a.teste@safra.test', senha: process.env.A_SENHA || 'senha-teste-A' };
const B = { email: process.env.B_EMAIL || 'b.teste@safra.test', senha: process.env.B_SENHA || 'senha-teste-B' };

const permitido = s => s >= 200 && s < 300;
const negado = s => s === 403 || s === 404;
// no "antes" a tentativa do atacante deve funcionar; no "depois" deve ser negada
const ataque = FASE === 'antes' ? permitido : negado;
const descAtaque = FASE === 'antes' ? '2xx (vulnerável)' : '403 ou 404';

async function entrar(u) {
  const r = await http('POST', '/login', { corpo: u });
  if (!r.dados.token) throw new Error(`Login de ${u.email} não devolveu token (${r.status}): ${JSON.stringify(r.dados)}. O usuário de teste tem 2FA ativo? Use outro usuário.`);
  return r.dados.token;
}

(async () => {
  escrever(`# Teste IDOR | missao ${CODIGO} | fase ${FASE} | ${BASE}`);
  const tA = await entrar(A), tB = await entrar(B);
  const devA = (await http('GET', '/dispositivos', { token: tA })).dados.dispositivos?.[0];
  const devB = (await http('GET', '/dispositivos', { token: tB })).dados.dispositivos?.[0];
  if (!devA || !devB) throw new Error('Cada usuário de teste precisa ter 1 dispositivo (rode seguranca/testes/preparar-dados.sql).');
  escrever(`Usuário A (${A.email}) dono do dispositivo ${devA.id}; usuário B (${B.email}) dono do dispositivo ${devB.id}`);
  escrever('');
  escrever('== Dono usando o próprio dispositivo (tem que continuar funcionando) ==');
  verificar('B lê as leituras do dispositivo B', await http('GET', `/dispositivos/${devB.id}/leituras`, { token: tB }), permitido, '2xx');
  verificar('A lê as leituras do dispositivo A', await http('GET', `/dispositivos/${devA.id}/leituras`, { token: tA }), permitido, '2xx');
  verificar('B altera a configuração do dispositivo B', await http('PUT', `/dispositivos/${devB.id}/configuracao`, { token: tB, corpo: { intervalo_s: 60, limite_temp_max: 32 } }), permitido, '2xx');
  verificar('B manda comando ao dispositivo B', await http('POST', `/dispositivos/${devB.id}/comandos`, { token: tB, corpo: { comando: 'reiniciar' } }), permitido, '2xx');

  escrever('');
  escrever(`== A troca o ID na requisição e mira o dispositivo de B (${devB.id}) ==`);
  verificar('A lê as leituras do dispositivo de B', await http('GET', `/dispositivos/${devB.id}/leituras`, { token: tA }), ataque, descAtaque);
  verificar('A altera a configuração do dispositivo de B', await http('PUT', `/dispositivos/${devB.id}/configuracao`, { token: tA, corpo: { intervalo_s: 999, limite_temp_max: 1 } }), ataque, descAtaque);
  verificar('A manda comando ao dispositivo de B', await http('POST', `/dispositivos/${devB.id}/comandos`, { token: tA, corpo: { comando: 'desligar_irrigacao' } }), ataque, descAtaque);

  escrever('');
  escrever('== Tentativas de contorno (todas devem falhar depois do controle) ==');
  verificar('ID com zeros à esquerda (000N)', await http('GET', `/dispositivos/000${devB.id}/leituras`, { token: tA }), ataque, descAtaque);
  verificar('ID com sufixo decimal (N.0)', await http('GET', `/dispositivos/${devB.id}.0/leituras`, { token: tA }), ataque, descAtaque);
  verificar('ID de B + ?usuario_id=A na query', await http('GET', `/dispositivos/${devB.id}/leituras?usuario_id=${devA.id}`, { token: tA }), ataque, descAtaque);
  verificar('ID de B + cabeçalho X-Usuario-Id', await http('GET', `/dispositivos/${devB.id}/leituras`, { token: tA, cabecalhos: { 'X-Usuario-Id': String(devB.id) } }), ataque, descAtaque);
  verificar('ID de B + usuario_id no corpo do comando', await http('POST', `/dispositivos/${devB.id}/comandos`, { token: tA, corpo: { comando: 'reiniciar', usuario_id: 'dono', dispositivo_id: devA.id } }), ataque, descAtaque);
  verificar('Sem token', await http('GET', `/dispositivos/${devB.id}/leituras`), s => s === 401, '401');

  // limpeza: devolve a configuração normal de B (o ataque do "antes" a alterou)
  await http('PUT', `/dispositivos/${devB.id}/configuracao`, { token: tB, corpo: { intervalo_s: 60, limite_temp_max: 32 } });
  const cfgB = (await http('GET', `/dispositivos/${devB.id}`, { token: tB })).dados.dispositivo;
  escrever('');
  escrever(`Configuração de B ao final (depois da limpeza): ${JSON.stringify(cfgB)}`);
  finalizar('idor');
})().catch(e => { console.error(e.message); process.exit(2); });
