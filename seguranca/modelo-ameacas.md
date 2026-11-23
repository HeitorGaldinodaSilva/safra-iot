# Modelo de ameaças (Safra)

Sistema: dashboards (Produtor, Analista, ADM) que leem um ESP32 (temperatura e umidade) via ThingSpeak; API Node/Express (login, sessões, MySQL) e FastAPI (RBAC, dados). Código de missão: **_CODIGO_**.

| # | Ameaça (STRIDE) | Impacto no projeto | Tratada por | Situação |
|---|---|---|---|---|
| 1 | **Spoofing:** senha vazada ou adivinhada e uso da conta de um produtor/ADM | Acesso a lavouras, financeiro e gestão de usuários; o ADM pode criar e apagar contas | **2FA com OTP** | Tratada para contas com 2FA ativo; contas sem 2FA continuam só com senha |
| 2 | **Elevação / Info disclosure (IDOR):** usuário A troca o ID e lê, configura ou comanda o dispositivo de B | Leitura de dados de outra propriedade; mudar intervalo/limite ou mandar irrigar/reiniciar o equipamento alheio | **Proteção contra IDOR** (`exigirDono`) | Tratada nas rotas `/dispositivos/:id/*` |
| 3 | **Info disclosure:** senhas em texto puro na tabela `usuario`; `.env` com segredos | Vazamento do banco expõe todas as senhas | Nenhum | **Aberta** (próximo passo: bcrypt/argon2; revogar credenciais do `.env`) |
| 4 | **Tampering:** rotas do FastAPI (`/produtor/lavouras`, financeiro) sem dono por usuário; lavouras ficam num JSON global | Qualquer produtor autenticado altera ou apaga dados de outro | Parcial (mesmo padrão do IDOR, ainda não aplicado) | **Aberta** |
| 5 | **Denial of service / força bruta:** tentativas em massa no `/login` | Bloqueio ou tentativa de adivinhar senhas | Parcial: o 2FA limita tentativas do código (5 por desafio e por usuário), mas a senha não tem limite | **Aberta** |

**Prioridade:** 1 e 2 primeiro, porque a conta e o dispositivo são o que o sistema entrega ao usuário; 3 vem em seguida por ter o maior impacto se o banco vazar.
