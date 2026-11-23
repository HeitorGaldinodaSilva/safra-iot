# Segurança no Safra: 2FA com OTP e proteção contra IDOR

## 1. Identificação
- **Código de missão:** `_CODIGO_` (também em `CODIGO_MISSAO` no `.env`; aparece nos logs de bloqueio)
- **Projeto do PI:** Safra (Lucas Special Edition)
- **Integrantes:**

| Nome | Usuário no GitHub |
|---|---|
| _preencher_ | _preencher_ |

## 2. O projeto
Painel para produtores de uva de Petrolina-PE. Um **ESP32** mede temperatura e umidade e publica no **ThingSpeak**. O **Backend Node/Express** (`Backend/index.js`, porta 3001) faz login, mantém sessões e acessa o **MySQL**. O **FastAPI** (`Backend/app/`) aplica o RBAC por perfil e entrega dados de clima, mercado e modelos. O **Frontend** (HTML/JS) tem os painéis de Produtor, Analista e ADM.

## 3. Controle 1: 2FA com OTP

### 3.1 A ameaça
Quem descobre a senha de um produtor ou do ADM entra como ele. O ADM pode criar, editar e apagar contas, então o impacto é o sistema inteiro.

### 3.2 O controle
- Segundo fator TOTP (RFC 6238, 6 dígitos, 30 s), compatível com Google/Microsoft Authenticator e Authy: [`Backend/controles/totp.js`](../Backend/controles/totp.js) (sem biblioteca externa).
- Login em duas etapas: [`Backend/index.js`](../Backend/index.js) (`/login` devolve `requer_2fa` e um `desafio` em vez do token) e [`Backend/controles/dois-fatores.js`](../Backend/controles/dois-fatores.js) (`/login/2fa` confere o código **no servidor**).
- Cadastro por QR Code: página [`Frontend/Seguranca/2fa.html`](../Frontend/Seguranca/2fa.html) (rotas `/2fa/configurar` e `/2fa/ativar`).
- 10 códigos de recuperação de uso único; no banco só vai o hash. Renovação em `/2fa/recuperacao/regenerar`.
- Tabelas em [`Backend/controles/schema.sql`](../Backend/controles/schema.sql).

**Decisões**
- Janela de ±1 passo (`OTP_JANELA`) para tolerar relógio do celular um pouco atrasado.
- Reuso bloqueado: o último passo aceito fica no banco e um `UPDATE ... WHERE ultimo_passo < ?` garante que só um pedido consegue usar o código (vale até em corrida).
- Recuperação também é consumida com `UPDATE ... WHERE usado_em IS NULL` (uso único).
- Segredo TOTP cifrado com AES-256-GCM, chave em `TOTP_CHAVE`. **Se a variável estiver vazia, o login de quem tem 2FA falha fechado (503)**, nunca passa sem o código.
- Limite de 5 tentativas por desafio e por usuário, depois bloqueio de 5 min (impede reiniciar o login para zerar a conta).
- Todo bloqueio gera log `[MISSAO <código>] 2FA bloqueou: ...` e linha em `log_sistema`.

### 3.3 Como testar
```bash
# uma vez: tabelas e dados sintéticos (no MySQL do projeto)
mysql -u USUARIO -p NOME_DO_BANCO < Backend/controles/schema.sql
mysql -u USUARIO -p NOME_DO_BANCO < seguranca/testes/preparar-dados.sql

# ANTES: servidor com o controle desligado
cd Backend && DOIS_FATORES=off PROTECAO_IDOR=off node index.js
CODIGO_MISSAO=<codigo> FASE=antes node seguranca/testes/teste-otp.js

# DEPOIS: reinicie o servidor normalmente (node index.js, com TOTP_CHAVE e CODIGO_MISSAO no .env)
CODIGO_MISSAO=<codigo> FASE=depois node seguranca/testes/teste-otp.js
```
Os logs saem em `seguranca/evidencias/<codigo>-otp-antes.log` e `...-depois.log`. Para repetir a parte de força bruta, reinicie o servidor (o bloqueio fica na memória).

### 3.4 Resultado
- Antes: senha certa devolve token mesmo com 2FA cadastrado. Evidência: `evidencias/<codigo>-otp-antes.log`
- Depois: sem código, código errado, vencido e reutilizado são recusados; código válido e recuperação (uma vez) funcionam; força bruta é travada. Evidência: `evidencias/<codigo>-otp-depois.log` e vídeo `evidencias/<codigo>-otp-depois.mp4`

### 3.5 Limitações
- O 2FA é opcional por usuário: quem não cadastrou continua só com senha (próximo passo: exigir para ADM).
- Senhas seguem em texto puro no banco (ameaça 3 do modelo de ameaças).
- Sessões e desafios ficam na memória do Node (reiniciar o servidor derruba tudo e zera o bloqueio).
- Não há limite de tentativas na etapa da senha.

## 4. Controle 2: proteção contra IDOR

### 4.1 A ameaça
O projeto não tinha dono de dispositivo. Em qualquer API com `/dispositivos/:id`, um usuário trocando o ID leria dados de outra propriedade e poderia mudar a configuração ou mandar comando ao equipamento alheio.

### 4.2 O controle
- Criamos a versão mínima do modelo: tabela `dispositivo` com `usuario_id` e rotas `GET /dispositivos`, `GET /dispositivos/:id`, `GET /dispositivos/:id/leituras`, `PUT /dispositivos/:id/configuracao`, `POST /dispositivos/:id/comandos` em [`Backend/controles/dispositivos.js`](../Backend/controles/dispositivos.js).
- A função `exigirDono` roda em **toda** rota com `:id` e compara `dispositivo.usuario_id` com `req.usuarioId`, que vem da sessão (token), nunca do cliente. A linha que decide bloquear tem o comentário `verificação de dono`.
- A listagem filtra por dono no próprio SQL.
- Também passou a exigir login a rota `/thingspeak` (antes aberta) e o `thingspeak.js` envia o token.

**Decisões**
- Responde **404** (não 403), para não revelar que o ID existe.
- Compara o dono depois de buscar o dispositivo, assim o log diz quem tentou e em qual dispositivo.
- ID inválido (`abc`, `0`, negativo) também dá 404.

### 4.3 Como testar
```bash
# ANTES (servidor com PROTECAO_IDOR=off)
CODIGO_MISSAO=<codigo> FASE=antes node seguranca/testes/teste-idor.js
# DEPOIS (servidor normal)
CODIGO_MISSAO=<codigo> FASE=depois node seguranca/testes/teste-idor.js
```
O script usa dois usuários sintéticos (A e B), confere que o dono continua usando o dispositivo, tenta leitura, configuração e comando cruzados e faz contornos (zeros à esquerda, `N.0`, `usuario_id` na query, cabeçalho e corpo, sem token).

### 4.4 Resultado
- Antes: as tentativas de A no dispositivo de B funcionam (2xx). Evidência: `evidencias/<codigo>-idor-antes.log`
- Depois: todas dão 404 e o dono segue normal; o servidor registra `[MISSAO <codigo>] IDOR bloqueou: ...`. Evidência: `evidencias/<codigo>-idor-depois.log` e `...-idor-depois.mp4`

### 4.5 Limitações
- Só cobre as rotas de `/dispositivos`. As rotas do FastAPI (`/produtor/lavouras`, financeiro) e o `lavouras.json` ainda são globais, sem dono por usuário; é o próximo passo.
- Os comandos ficam numa fila no banco; o firmware do ESP32 ainda não os consome.
- O ADM não tem exceção: só enxerga os próprios dispositivos nestas rotas.

## 5. Uso de IA
Declarado em [`uso-de-ia.md`](uso-de-ia.md).
