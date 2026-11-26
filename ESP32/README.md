# ESP32 - Safra

## Ligacao (DHT11)
| Sensor | ESP32 |
|---|---|
| VCC (+) | 3V3 |
| DATA (OUT) | GPIO 4 |
| GND (-) | GND |

## Passos
1. Arduino IDE: suporte "esp32" + bibliotecas **DHT sensor library**, **Adafruit Unified Sensor** e **PubSubClient**.
2. Em `safra_esp32/`, copie `arduino_secrets.example.h` para `arduino_secrets.h` e preencha (ou acrescente as 3 linhas `SECRET_API_*` ao seu arquivo atual).
3. Backend: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
4. Firewall (PowerShell como administrador):
   `New-NetFirewallRule -DisplayName "Safra API 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow`
5. Upload e Monitor Serial em 115200: deve aparecer `[API] OK (201)` a cada 20 s.

O PC e o ESP32 precisam estar na mesma rede (ex.: hotspot do celular). Se o IP do PC mudar, atualize `SECRET_API_URL`.
