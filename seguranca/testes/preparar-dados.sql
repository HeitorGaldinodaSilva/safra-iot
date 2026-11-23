-- Dados SINTÉTICOS para o teste (três usuários de teste e dois dispositivos). Rode depois de controles/schema.sql.
-- Senhas em texto puro porque o login atual do projeto compara texto puro (veja "Limitações" no README).
INSERT INTO usuario (nome, email, telefone, senha, perfil, status) VALUES
  ('Usuario Teste A', 'a.teste@safra.test', NULL, 'senha-teste-A', 'Produtor', 'Ativo'),
  ('Usuario Teste B', 'b.teste@safra.test', NULL, 'senha-teste-B', 'Produtor', 'Ativo'),
  ('Usuario Teste C', 'c.teste@safra.test', NULL, 'senha-teste-C', 'Produtor', 'Ativo');

INSERT INTO dispositivo (usuario_id, nome)
  SELECT id, 'ESP32 Teste A' FROM usuario WHERE email = 'a.teste@safra.test';
INSERT INTO dispositivo (usuario_id, nome)
  SELECT id, 'ESP32 Teste B' FROM usuario WHERE email = 'b.teste@safra.test';
