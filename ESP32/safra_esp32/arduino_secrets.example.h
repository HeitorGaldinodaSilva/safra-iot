// Copie para "arduino_secrets.h" (mesma pasta do .ino) e preencha.
// O arduino_secrets.h NAO vai para o GitHub (esta no .gitignore).
#pragma once

// Wi-Fi (2.4 GHz)
#define SECRET_SSID "NOME_DA_REDE"
#define SECRET_PASS "SENHA_DA_REDE"

// ThingSpeak (MQTT)
#define SECRET_MQTT_CLIENT_ID "SEU_CLIENT_ID"
#define SECRET_MQTT_USERNAME  "SEU_USERNAME"
#define SECRET_MQTT_PASSWORD  "SUA_SENHA_MQTT"
#define SECRET_CHANNEL_ID     0000000

// API Safra
#define SECRET_API_URL   "http://192.168.43.10:8000/api/leituras"   // IP do PC (ipconfig -> IPv4)
#define SECRET_API_KEY   "MESMA_CHAVE_DO_ESP32_API_KEY_NO_ENV"
#define SECRET_DEVICE_ID "ESP32_01"
