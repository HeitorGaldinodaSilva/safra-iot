/*
  Safra - ESP32 + DHT11  ->  Wi-Fi  ->  API Safra (POST /api/leituras)
                                    ->  ThingSpeak (MQTT, mantem as telas atuais)

  - Envia para a API a cada INTERVALO_MS identificando o dispositivo (device_id)
  - Continua publicando no ThingSpeak (best effort: se falhar, nao derruba a API)
  - Nenhum laco infinito: falha de sensor, Wi-Fi, MQTT ou API nao trava o ESP32
  - Credenciais ficam em arduino_secrets.h (NAO vai para o GitHub)

  Bibliotecas: DHT sensor library (Adafruit), Adafruit Unified Sensor, PubSubClient
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <PubSubClient.h>
#include <DHT.h>
#include "arduino_secrets.h"

#define DHT_PIN  4
#define DHT_TYPE DHT11

const unsigned long INTERVALO_MS = 20000UL;   // >= 15 s (limite do ThingSpeak gratuito)
const int LEITURA_TENTATIVAS = 3;             // tentativas se o sensor falhar
const int MAX_CICLOS_COM_FALHA = 20;          // ciclos seguidos sem enviar a API -> reinicia

const char* mqttServer = "mqtt3.thingspeak.com";
const int   mqttPort   = 1883;

DHT dht(DHT_PIN, DHT_TYPE);
WiFiClient espClient;
PubSubClient mqtt(espClient);

unsigned long ultimaColeta = 0;
int ciclosComFalha = 0;

bool conectarWiFi(unsigned long timeoutMs = 15000) {
  if (WiFi.status() == WL_CONNECTED) return true;

  Serial.printf("[WiFi] Conectando em \"%s\"", SECRET_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  WiFi.begin(SECRET_SSID, SECRET_PASS);

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < timeoutMs) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WiFi] Conectado. IP do ESP32: ");
    Serial.println(WiFi.localIP());
    return true;
  }
  Serial.println("[WiFi] Sem conexao. Tento de novo no proximo ciclo.");
  return false;
}

bool lerSensor(float &temperatura, float &umidade) {
  for (int i = 1; i <= LEITURA_TENTATIVAS; i++) {
    float u = dht.readHumidity();
    float t = dht.readTemperature();
    if (!isnan(t) && !isnan(u) && !(t == 0 && u == 0)) {
      temperatura = t;
      umidade = u;
      return true;
    }
    Serial.printf("[DHT] Falha na leitura (tentativa %d/%d)\n", i, LEITURA_TENTATIVAS);
    delay(2000);
  }
  return false;
}

// Envio principal: API do Safra
bool enviarParaApi(float temperatura, float umidade) {
  char corpo[128];
  snprintf(corpo, sizeof(corpo),
           "{\"device_id\":\"%s\",\"temperatura\":%.1f,\"umidade\":%.1f}",
           SECRET_DEVICE_ID, temperatura, umidade);

  WiFiClient cliente;
  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(cliente, SECRET_API_URL)) {
    Serial.println("[API] URL invalida.");
    return false;
  }
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-API-Key", SECRET_API_KEY);

  int codigo = http.POST(String(corpo));
  bool ok = (codigo == 201);
  if (ok) {
    Serial.printf("[API] OK (201) -> %s\n", corpo);
  } else if (codigo > 0) {
    Serial.printf("[API] Rejeitado (HTTP %d): %s\n", codigo, http.getString().c_str());
  } else {
    Serial.printf("[API] Falha de comunicacao: %s\n", HTTPClient::errorToString(codigo).c_str());
  }
  http.end();
  return ok;
}

// Envio secundario: ThingSpeak via MQTT (uma tentativa, sem travar)
void enviarParaThingSpeak(float temperatura, float umidade) {
  if (!mqtt.connected()) {
    if (!mqtt.connect(SECRET_MQTT_CLIENT_ID, SECRET_MQTT_USERNAME, SECRET_MQTT_PASSWORD)) {
      Serial.printf("[ThingSpeak] Falha ao conectar (estado %d). Ignorando neste ciclo.\n", mqtt.state());
      return;
    }
  }
  char payload[100];
  snprintf(payload, sizeof(payload), "field1=%.2f&field2=%.2f", temperatura, umidade);
  String topico = "channels/" + String((unsigned long)SECRET_CHANNEL_ID) + "/publish";
  bool ok = mqtt.publish(topico.c_str(), payload);
  Serial.printf("[ThingSpeak] %s -> %s\n", ok ? "Publicado" : "Falha ao publicar", payload);
  mqtt.loop();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=== Safra ESP32 ===");
  Serial.printf("Dispositivo: %s | Intervalo: %lu s\n", SECRET_DEVICE_ID, INTERVALO_MS / 1000UL);

  dht.begin();
  WiFi.setAutoReconnect(true);
  mqtt.setServer(mqttServer, mqttPort);
  mqtt.setSocketTimeout(5);
  conectarWiFi();

  ultimaColeta = millis() - INTERVALO_MS;   // primeira coleta logo ao ligar
}

void loop() {
  if (millis() - ultimaColeta < INTERVALO_MS) {
    delay(100);
    return;
  }
  ultimaColeta = millis();

  float temperatura, umidade;
  bool enviouApi = false;

  if (!lerSensor(temperatura, umidade)) {
    Serial.println("[DHT] Sensor sem resposta. Verifique fiacao/pino. Proximo ciclo.");
  } else {
    Serial.printf("[DHT] Temperatura: %.1f C | Umidade: %.1f %%\n", temperatura, umidade);
    if (conectarWiFi()) {
      enviouApi = enviarParaApi(temperatura, umidade);
      enviarParaThingSpeak(temperatura, umidade);
    }
  }

  ciclosComFalha = enviouApi ? 0 : ciclosComFalha + 1;
  if (ciclosComFalha >= MAX_CICLOS_COM_FALHA) {
    Serial.println("[SISTEMA] Muitas falhas seguidas. Reiniciando o ESP32...");
    delay(500);
    ESP.restart();
  }
}
