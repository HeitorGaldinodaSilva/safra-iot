# Safra — Monitoramento ambiental com ESP32

Plataforma Full Stack que coleta temperatura e umidade reais com um **ESP32 + DHT11**, envia os dados por Wi-Fi para uma **API REST**, guarda tudo em um **banco MySQL** e mostra em um **dashboard web instalável (PWA)** com gráficos, histórico, filtros e **alertas configuráveis**.

> Ambiente monitorado: lavoura de uva/Petrolina-PE.
> Equipe: Heitor Galdino da Silva, Lucas Felipe Vaz de Lima Leite, Mayara Vithoria Cavalcanti e Maria Julia Lacet Cordeiro · Disciplina/Professor: Unidade de Extensão Mobile / Ícaro Santos Ferreira

```
ESP32 + DHT11 ──Wi-Fi──► API FastAPI ──► MySQL
                           (porta 8000)      ▲
                               │             │ (só o back-end acessa o banco)
                               ▼
                      Dashboard Web / PWA  (/monitor/)
```

O navegador **nunca** fala direto com o banco: tudo passa pela API.

---

## Estrutura do repositório

| Pasta | Conteúdo |
|---|---|
| `ESP32/` | Código do microcontrolador (`safra_esp32/safra_esp32.ino`) e modelo de credenciais |
| `Backend/` | API de leituras e alertas (**FastAPI**, `app/`) e API de login/usuários (**Node.js**, `index.js`) |
| `Frontend/` | Telas web. O dashboard do sensor/PWA está em `Frontend/Monitor/` |
| `Postman/` | Collection para testar a API |
| `seguranca/` | Modelo de ameaças, testes e evidências de segurança (OTP/2FA e IDOR) |

Organização do back-end: `app/routers/` (rotas), `app/services/` (regras), `app/clients/` (serviços externos), `app/db.py` e `app/config.py` (banco e configuração).

---

## Pré-requisitos

- Python 3.11+ e Node.js 18+
- MySQL (local ou em nuvem)
- Arduino IDE com suporte a "esp32" e as bibliotecas **DHT sensor library**, **Adafruit Unified Sensor** e **PubSubClient**
- ESP32 + sensor DHT11 (ou DHT22)

---

## Instalação e execução

### 1) Configurar o ambiente (`.env`)

```bash
cd Backend
cp .env.example .env        # Windows: copy .env.example .env
```

Preencha o `.env` com os dados do seu banco e uma chave para o ESP32. **O `.env` não vai para o GitHub** (está no `.gitignore`).

| Variável | Para que serve |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Conexão com o MySQL |
| `ESP32_API_KEY` | Chave que o ESP32 envia no cabeçalho `X-API-Key` (use 32+ caracteres aleatórios) |
| `LEITURAS_OFFLINE_MIN` | Minutos sem leitura para considerar o ESP32 sem comunicação (padrão 5) |
| `LEITURAS_GET_PUBLICO` | `true` = consultas abertas (modo demonstração, necessário para o dashboard sem login). O `POST` do ESP32 continua exigindo chave |
| `PORT` | Porta do back-end Node (padrão 3001) |

### 2) Banco de dados

As tabelas de leituras e alertas (`leituras`, `alertas_leituras`, `limites_alertas`) são **criadas automaticamente** na primeira chamada da API. As tabelas de usuários/2FA estão em `Backend/controles/schema.sql`:

```bash
mysql -u USUARIO -p NOME_DO_BANCO < controles/schema.sql
```

### 3) API de leituras e alertas (FastAPI, porta 8000)

```bash
cd Backend
python -m venv .venv
.venv\Scripts\activate            # Linux/Mac: source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- Documentação interativa (Swagger): http://127.0.0.1:8000/docs
- Dashboard / PWA: http://127.0.0.1:8000/monitor/

### 4) API de login e usuários (Node.js, porta 3001)

Em outro terminal:

```bash
cd Backend
npm install
npm run dev          # ou: node index.js
```

> O FastAPI valida o token de login perguntando ao Node. Para as telas com login (Analista, Produtor, ADM), **os dois servidores precisam estar rodando**. O dashboard do sensor (`/monitor/`) funciona só com o FastAPI quando `LEITURAS_GET_PUBLICO=true`.

### 5) ESP32

Ligação do DHT11:

| Sensor | ESP32 |
|---|---|
| VCC (+) | 3V3 |
| DATA (OUT) | GPIO 4 |
| GND (−) | GND |

1. Em `ESP32/safra_esp32/`, copie `arduino_secrets.example.h` para `arduino_secrets.h` e preencha (Wi-Fi 2,4 GHz, `SECRET_API_URL` com o IP do PC, `SECRET_API_KEY` igual ao `ESP32_API_KEY` do `.env`, `SECRET_DEVICE_ID`).
2. Libere a porta 8000 no firewall do Windows (PowerShell como administrador):
   ```powershell
   New-NetFirewallRule -DisplayName "Safra API 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow
   ```
3. Envie o código pela Arduino IDE e abra o Monitor Serial em 115200. Deve aparecer `[API] OK (201)` a cada 20 s.

O PC e o ESP32 precisam estar na mesma rede (ex.: hotspot do celular). Se o IP do PC mudar, atualize `SECRET_API_URL`.

**Tratamento de falhas no ESP32:** nova tentativa se o sensor falhar, reconexão automática do Wi-Fi e nenhum laço infinito — falha de sensor, rede ou API não trava o dispositivo.

---

## API REST

| Método | Endpoint | Função |
|---|---|---|
| POST | `/api/leituras` | Recebe uma medição (exige `X-API-Key`) |
| GET | `/api/leituras` | Histórico. Filtros: `periodo=24h\|7d\|30d`, `inicio`, `fim`, `device_id`, `limite` |
| GET | `/api/leituras/ultima` | Última leitura + indicador de comunicação |
| GET | `/api/dispositivos` | Dispositivos que já enviaram dados |
| GET | `/api/status` | Disponibilidade da API e do banco |
| GET / PUT | `/api/limites` | Lê / define os limites de alerta |
| GET | `/api/alertas` | Alertas registrados (filtro `periodo`) |

Exemplo de envio do ESP32:

```json
{ "device_id": "ESP32_01", "temperatura": 28.5, "umidade": 65.2 }
```

**Validação:** `device_id` (letras, números, `_`, `.`, `-`, até 50), temperatura entre −40 e 80 °C, umidade entre 0 e 100 %. Valores inválidos retornam `422`; chave incorreta retorna `401`; banco fora do ar retorna `503` sem derrubar a aplicação.

---

## Alertas configuráveis

- Limites padrão: temperatura máxima **30 °C**, umidade mínima **40 %**, umidade máxima **80 %**. Podem ser alterados no dashboard (campo "Salvar limites") ou por `PUT /api/limites`; ficam gravados no banco.
- A cada leitura recebida a API compara com os limites. Cada violação (`temperatura_alta`, `umidade_baixa`, `umidade_alta`) é **registrada** na tabela `alertas_leituras`.
- O dashboard mostra a faixa de alerta, destaca o card e lista os alertas registrados.

---

## PWA

O dashboard (`Frontend/Monitor/`) tem `manifest.json` e Service Worker (`sw.js`):

- Pode ser **instalado** (botão "Instalar app" ou ícone na barra do navegador).
- A interface básica abre **sem internet**.
- Sem conexão, mostra as últimas medições salvas no aparelho com o aviso de que **não são dados em tempo real**.

---

## Testes

```bash
cd Backend
python -m pytest -q                                   # testes automatizados
python teste_passo4_alertas.py --key SUA_ESP32_API_KEY  # teste de alertas contra a API rodando
```

Também há a collection `Postman/Safra_API_Leituras.postman_collection.json` (defina `base_url`, `api_key` e `token`).

### Checklist da demonstração

- [ ] O ESP32 realiza leituras reais do sensor (Monitor Serial)
- [ ] Os dados são transmitidos ao back-end (`[API] OK (201)`)
- [ ] A API recebe e valida as medições (Postman: 201, 401, 422)
- [ ] O banco armazena as informações (`GET /api/leituras`)
- [ ] O dashboard apresenta os valores recebidos
- [ ] Os gráficos exibem o histórico (24 h / 7 d / 30 d)
- [ ] Os alertas funcionam (limite ultrapassado → faixa vermelha + registro)
- [ ] O PWA pode ser instalado
- [ ] O PWA mostra dados salvos quando offline, avisando que não são em tempo real
- [ ] Uma falha de comunicação não encerra a aplicação (desligar o Wi-Fi/derrubar a API e voltar)

---

## Segurança

- Credenciais apenas no `.env` e no `arduino_secrets.h` (ambos fora do Git). Use `.env.example` e `arduino_secrets.example.h` como modelo.
- O ESP32 se identifica com a chave `X-API-Key`; comparação em tempo constante.
- Consultas exigem login, exceto no modo demonstração (`LEITURAS_GET_PUBLICO=true`). **Nesse modo qualquer pessoa na rede também consegue alterar os limites** — não use em produção.
- Login com 2FA (OTP) e proteção contra IDOR: veja `seguranca/`.

---

## Problemas comuns

| Sintoma | Solução |
|---|---|
| `uvicorn não é reconhecido` | Ative o `.venv` e use `python -m uvicorn ...` (após `python -m pip install -r requirements.txt`) |
| `/api/status` mostra `"banco":"indisponivel"` | Confira `DB_*` no `.env` e se o MySQL está acessível |
| ESP32 recebe `401` | `SECRET_API_KEY` diferente do `ESP32_API_KEY` do `.env` |
| ESP32 não conecta na API | Mesmo Wi-Fi que o PC, IP correto em `SECRET_API_URL` e porta 8000 liberada no firewall |
| Dashboard diz "A API exige login" | Defina `LEITURAS_GET_PUBLICO=true` no `.env` e reinicie a API |
| Selo "ESP32 sem comunicação" | Nenhuma leitura nos últimos `LEITURAS_OFFLINE_MIN` minutos: confira se o ESP32 está ligado e na rede |
