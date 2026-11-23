-- Tabelas dos controles de segurança (2FA com OTP e proteção contra IDOR).
-- Rode uma vez no banco do projeto:  mysql -u USUARIO -p NOME_DO_BANCO < controles/schema.sql

CREATE TABLE IF NOT EXISTS usuario_2fa (
  usuario_id      INT PRIMARY KEY,
  segredo_cifrado VARCHAR(255) NOT NULL,
  ativo           TINYINT(1) NOT NULL DEFAULT 0,
  ultimo_passo    BIGINT NOT NULL DEFAULT 0,      -- último passo TOTP aceito (impede reuso do código)
  criado_em       DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS usuario_2fa_recuperacao (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT NOT NULL,
  codigo_hash CHAR(64) NOT NULL,                  -- só o hash; o código em si é mostrado uma vez
  usado_em    DATETIME NULL,
  INDEX (usuario_id)
);

-- Dispositivo (ESP32) com dono. Toda rota /dispositivos/:id confere usuario_id.
CREATE TABLE IF NOT EXISTS dispositivo (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id       INT NOT NULL,
  nome             VARCHAR(80) NOT NULL,
  canal_thingspeak VARCHAR(20) NULL,              -- NULL = usa THINGSPEAK_CHANNEL_ID do .env
  intervalo_s      INT NOT NULL DEFAULT 60,
  limite_temp_max  DECIMAL(5,2) NOT NULL DEFAULT 32,
  criado_em        DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX (usuario_id)
);

CREATE TABLE IF NOT EXISTS dispositivo_comando (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  dispositivo_id INT NOT NULL,
  usuario_id     INT NOT NULL,                    -- quem mandou o comando
  comando        VARCHAR(30) NOT NULL,
  criado_em      DATETIME DEFAULT CURRENT_TIMESTAMP,
  executado_em   DATETIME NULL
);
