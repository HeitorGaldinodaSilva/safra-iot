# Uso de IA

**Ferramenta:** Claude (Anthropic), usado como assistente de programação.

**Para quê foi usada**
- Ler o código do projeto e propor onde entram os dois controles.
- Escrever o primeiro rascunho do código de `Backend/controles/` (TOTP, 2FA no login, verificação de dono nos dispositivos), da página `Frontend/Seguranca/2fa.html`, da etapa de código em `Frontend/Login/login.js`, dos scripts em `seguranca/testes/` e dos rascunhos dos documentos desta pasta.

**O que foi conferido ou alterado por nós** (preencher com o que de fato foi feito, por integrante)
- [ ] Li cada arquivo de `Backend/controles/` e consigo explicar linha a linha.
- [ ] Rodei os testes no nosso banco MySQL e usei as evidências geradas aqui, não as de outro lugar.
- [ ] Ajustes que fizemos no código sugerido: _descrever_
- [ ] Decisões nossas (valores de janela, limite de tentativas, 404 em vez de 403): _descrever_

**Verificação feita pela IA no ambiente dela:** o TOTP foi comparado com os vetores de teste da RFC 6238, e as duas baterias de teste rodaram contra um banco **simulado em memória**. Isso não substitui rodar no nosso MySQL real, e nenhuma evidência desta pasta veio dessa simulação.
