-- Tabela de leituras do ESP32 (a API também cria sozinha na primeira chamada).
-- Rodar manualmente (opcional): mysql -h HOST -P PORTA -u USUARIO -p NOME_DO_BANCO < sql/leituras.sql
CREATE TABLE IF NOT EXISTS leituras (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id   VARCHAR(50)  NOT NULL,
  temperatura DECIMAL(5,2) NOT NULL,
  umidade     DECIMAL(5,2) NOT NULL,
  criado_em   DATETIME(3)  NOT NULL,            -- sempre em UTC
  INDEX idx_leituras_dispositivo_data (device_id, criado_em),
  INDEX idx_leituras_data (criado_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
