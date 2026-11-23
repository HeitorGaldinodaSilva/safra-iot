# Modelos (fases 1 a 3): clima, irrigação, colheita, produtividade e preço

Tudo que a dashboard mostra sobre modelos vem da tabela `modelo_registro` (MySQL). Nenhum número é fixo.

## Como gerar os números reais
```bash
cd Backend
.venv\Scripts\activate
pip install -r requirements.txt
python -m app.ml.treinar            # treina os 5 modelos (clima, irrigação, colheita, produtividade, preço) (baixa ~5 anos do Open-Meteo, 1ª vez ~1 min)
```
- Na primeira execução cria as tabelas `modelo_registro` e `modelo_execucao` no banco do `.env` (só tabelas novas).
- Rode de novo quando quiser retreinar (ex.: 1x por semana). Depois de 14 dias sem retreino o modelo aparece como "Retreino recomendado".
- O histórico baixado fica em `Backend/.cache` (use `--sem-cache` para baixar de novo).

## O que cada modelo faz
| Modelo | Alvo | Dados |
|---|---|---|
| Previsão climática | temperatura média do **dia seguinte** (°C) | histórico Open-Meteo (ERA5) |
| Necessidade de irrigação | evapotranspiração ET0 do dia seguinte (mm); lâmina = Kc × ET0 − 0,8 × chuva | idem |

Algoritmo: regressão Ridge com defasagens (1–2 dias), média de 7 dias e sazonalidade anual.

## Como a precisão é medida (e por que dá para confiar)
1. Os últimos 365 dias ficam de fora do treino e servem de **teste**.
2. O modelo é comparado com duas **linhas de base**: "amanhã = hoje" e a climatologia (média histórica da data).
3. **Precisão** = 100% − erro percentual médio (MAPE) no teste.
4. O rótulo (Excelente/Bom/Regular) mede o **ganho sobre a melhor linha de base** (≥25% Excelente, ≥10% Bom).
5. Se o modelo **não vence** a linha de base, o status vira "Atenção" — mesmo com precisão alta.

Limitações: o histórico é de **modelo meteorológico** (reanálise), não de estação nem dos seus sensores; o Kc é provisório;
Só "Qualidade da produção" segue como "Planejado" (não há fonte aberta de dados de qualidade).

## Endpoint
`GET /analista/modelos` (perfil Analista) → `{ ok, resumo, modelos[] }`. Se o registro não existir ainda, devolve `ok:false` com o aviso.

## Fase 2 – Estimativa de colheita (graus-dia)
A videira precisa acumular uma **soma térmica** entre a poda e a colheita. Com a data da poda, o sistema soma os
graus-dia já observados (base 10 °C, método de Villa Nova et al. 1972) e projeta o que falta usando a **média histórica
de cada dia do ano**. Resultado: data estimada + janela de incerteza.

| Cultivar | Soma térmica | Ciclo | Fonte |
|---|---|---|---|
| Syrah | 1.939,3 GD | 118 dias | Moura et al. (2007), Embrapa Semiárido |
| Cabernet Sauvignon | 2.172 GD (média de 2.137 e 2.207) | 132–138 dias | Moura et al., Embrapa Semiárido |

**Como é medido:** com ciclos do passado, simula-se "poda em X → em que dia o modelo diria que colhe?" e compara-se com o
dia em que a soma térmica foi realmente atingida (só usando clima anterior ao período de teste). A linha de base é
"poda + N dias fixos". A janela exibida é ± o erro P80 medido (cobre ~80% dos ciclos do teste).

**Limitações (leia antes de apresentar):**
- O teste valida a **projeção climática** (a média histórica prevê bem quando a soma térmica será atingida). Ele **não** compara
  com datas reais de colheita: não temos esses registros. Se os parâmetros de graus-dia não representarem a sua cultivar/fazenda, a data real será outra.
- Os parâmetros vêm de ensaios antigos (2006–2007) de uma cultivar cada, em uvas de **vinho**. **Uva de mesa e manga não estão cobertas** (não achei parâmetros publicados que eu pudesse citar).
- Temperaturas observadas vêm do Open-Meteo (reanálise, fecha ~7 dias antes de hoje); os últimos dias são completados pela média histórica.

## Endpoint de colheita
`GET /analista/colheita?poda=AAAA-MM-DD&cultivar=syrah` (perfil Analista). Na tela: **Modelos → Estimativa de colheita → Ver modelo → Simular colheita**.
Precisa que o treino já tenha rodado (ele baixa o histórico que o endpoint reutiliza).

## Fase 3 – Produtividade e Preço (dados abertos oficiais)
Cada fonte falha sozinha: se o ComexStat estiver fora do ar, os outros modelos continuam sendo treinados.
`python -m app.ml.treinar --modelo preco` treina só um.

### Previsão de produtividade (IBGE SIDRA, tabela 1613 – PAM)
- **Dado:** rendimento médio anual (kg/ha) de **uva** e **manga** por município (padrão: **Petrolina**; configurável em `PAM_MUNICIPIOS`). Série de **2001** em diante: antes disso a manga usava outra unidade de medida no IBGE.
- **Modelo:** tendência linear das últimas 8 safras, projetada 1 ano à frente.
- **Teste:** origem móvel nas últimas 8 safras (cada previsão só vê os anos anteriores) contra "este ano = ano passado" e "média das últimas 3 safras".
- **Limites:** é **1 valor por ano** (poucos pontos) e o IBGE **revisa** os anos recentes (em 2026 corrigiu uva e manga de Juazeiro e Casa Nova). Com pouca variação ou ruído, o modelo pode não vencer a linha de base: aparecerá "Atenção", e isso é resultado válido.

### Previsão de preço (ComexStat/MDIC)
- **Dado:** exportações mensais (US$ FOB e kg) de **uva fresca** (SH6 0806.10) e **manga** (NCM 0804.50.20) com origem em **PE e BA**. Preço = FOB ÷ kg.
- **Modelo:** para cada horizonte (1 a 3 meses): nível dos últimos 12 meses (em log) + desvio sazonal médio do mês-alvo.
- **Teste:** origem móvel nos últimos 24 meses contra "igual ao último preço" e "igual ao mesmo mês do ano passado".
- **Limites:** é preço de **exportação** (mistura de destinos, variedades e épocas), em **dólar**, de dois estados inteiros. **Não é** o preço pago ao produtor nem o de mercado interno. A API do ComexStat limita requisições e o último mês publicado varia.

### Onde aparecem as previsões
Modelos → **Ver modelo** (produtividade e preço): previsão da safra (kg/ha) e dos próximos 3 meses (US$/kg), com a faixa de ± erro P80 do teste.
