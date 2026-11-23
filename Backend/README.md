# Safra API (FastAPI) – Analista › Inicial

Primeira etapa da migração dos dados fixos para dados reais. Escopo: **apenas a dashboard "Inicial" do perfil Analista**.

## Como rodar
```bash
cd Backend_FastAPI
python -m venv .venv && .venv\Scripts\activate      # Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                               # Linux/Mac: cp .env.example .env  -> preencha
uvicorn app.main:app --reload --port 8000
```
- Documentação interativa: http://localhost:8000/docs
- Testes: `python -m pytest -q`
- O **Backend Node continua rodando na porta 3001** (login/sessões). O FastAPI valida o token perguntando ao Node.

## INMET
- Estação padrão: **A307 – Petrolina/PE** (`INMET_ESTACAO`).
- Os dados horários exigem **token** (solicite em https://portal.inmet.gov.br → `INMET_TOKEN`).
  Sem token, a dashboard funciona só com o sensor e mostra o aviso "INMET indisponível".

## Endpoint
`GET /analista/inicial` (Bearer token do login; perfil `analista`)

## Mapa de requisitos
| Req. | Onde |
|---|---|
| RF02 | `app/clients/thingspeak.py` (channel feeds) |
| RF05 | `app/services/tratamento.py` (duplicadas, incompletas, fora da faixa) |
| RF07 | gráfico Sensor x INMET e cards da página |
| RF08 | `app/auth.py` (RBAC por perfil) |
| RF09 | `app/services/alertas.py` |
| RNF02 | chaves só no `.env` do servidor |
| RNF04 | cache TTL (`app/cache.py`) |
| RNF05 | `tests/` |
| RNF09 | código modular: clients / services / routers |
| RNF11 | cache de 15 s no ThingSpeak |

## Ainda fixo nesta página (depende de requisitos futuros)
"Modelos ativos" e "Status dos modelos" (RF06 – previsões/modelos) continuam estáticos.
Limiares da "janela favorável à colheita" são **provisórios** (`.env`): valide antes de apresentar.
