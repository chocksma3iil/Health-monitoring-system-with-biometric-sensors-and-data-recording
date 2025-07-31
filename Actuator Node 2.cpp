#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <LiquidCrystal_I2C.h>

// Wi-Fi & MQTT
const char* ssid = "Wokwi-GUEST";
const char* password = "";
const char* mqtt_server = "test.mosquitto.org";
const char* data_topic = "sante/capteurs/utilisateur1";
const char* threshold_topic = "sante/seuils/utilisateur1";

WiFiClient espClient;
PubSubClient client(espClient);

// LCD
LiquidCrystal_I2C lcd(0x27, 16, 2);

// LEDs
#define LED_ROUGE_1 2
#define LED_ROUGE_2 4
#define LED_VERTE 15
#define LED_BLEUE 0

// Joystick
#define JOY_VERT 32
#define JOY_HORZ 33
const int SEUIL_HAUT = 3000;
const int SEUIL_BAS = 1000;

// Seuils modifiables
float seuilTempMin = 35.0;
float seuilTempMax = 38.0;
float seuilChuteMin = 5.0;
float seuilChuteMax = 15.0;

// Données
float tempCorp = 0.0;
float accZ = 0.0;
String etat = "ATTENTE";
bool dataReceived = false;
bool thresholdChanged = false;

// Timers
unsigned long previousMillis = 0;
const long interval = 500;
unsigned long lastJoystickUpdate = 0;
const long joystickInterval = 300;
bool ledState = false;

void publishThresholds() {
  StaticJsonDocument<200> doc;
  doc["tempMin"] = seuilTempMin;
  doc["tempMax"] = seuilTempMax;
  doc["chuteMin"] = seuilChuteMin;
  doc["chuteMax"] = seuilChuteMax;

  String payload;
  serializeJson(doc, payload);
  client.publish(threshold_topic, payload.c_str());
  Serial.println("📤 Seuils publiés: " + payload);
}

void updateEtat() {
  if (!dataReceived) {
    etat = "ATTENTE";
    return;
  }

  float accZ_abs = abs(accZ);
  bool chuteDetectee = (accZ_abs < seuilChuteMin || accZ_abs > seuilChuteMax);
  bool fievreDetectee = (tempCorp > seuilTempMax);
  bool hypothermieDetectee = (tempCorp < seuilTempMin);

  if (chuteDetectee || fievreDetectee) {
    if (chuteDetectee && fievreDetectee) etat = "INCENDIE_DOUBLE";
    else if (chuteDetectee && hypothermieDetectee) etat = "INCENDIE_CHUTE_FROID";
    else if (chuteDetectee) etat = "INCENDIE_CHUTE";
    else etat = "INCENDIE_FIEVRE";
  } else if (hypothermieDetectee) {
    etat = "HYPOTHERMIE";
  } else {
    etat = "NORMAL";
  }
}

void updateLEDs() {
  unsigned long currentMillis = millis();
  if (etat == "NORMAL") {
    digitalWrite(LED_VERTE, HIGH);
    digitalWrite(LED_ROUGE_1, LOW);
    digitalWrite(LED_ROUGE_2, LOW);
    digitalWrite(LED_BLEUE, LOW);
  } else if (etat == "ATTENTE") {
    digitalWrite(LED_VERTE, LOW);
    digitalWrite(LED_ROUGE_1, LOW);
    digitalWrite(LED_ROUGE_2, LOW);
    digitalWrite(LED_BLEUE, LOW);
  } else if (etat.startsWith("INCENDIE")) {
    digitalWrite(LED_VERTE, LOW);
    digitalWrite(LED_BLEUE, LOW);
    if (currentMillis - previousMillis >= interval) {
      previousMillis = currentMillis;
      ledState = !ledState;
      digitalWrite(LED_ROUGE_1, ledState);
      digitalWrite(LED_ROUGE_2, ledState);
    }
  } else if (etat == "HYPOTHERMIE") {
    digitalWrite(LED_VERTE, LOW);
    digitalWrite(LED_ROUGE_1, LOW);
    digitalWrite(LED_ROUGE_2, LOW);
    if (currentMillis - previousMillis >= interval) {
      previousMillis = currentMillis;
      ledState = !ledState;
      digitalWrite(LED_BLEUE, ledState);
    }
  } else {
    digitalWrite(LED_VERTE, LOW);
    digitalWrite(LED_ROUGE_1, LOW);
    digitalWrite(LED_ROUGE_2, LOW);
    if (currentMillis - previousMillis >= interval) {
      previousMillis = currentMillis;
      ledState = !ledState;
      digitalWrite(LED_BLEUE, ledState);
    }
  }
}

void updateLCD() {
  lcd.clear();
  float accZ_abs = abs(accZ);

  if (etat == "NORMAL") {
    lcd.setCursor(0, 0);
    lcd.print("ETAT: NORMAL");
    lcd.setCursor(0, 1);
    lcd.print("T:");
    lcd.print(tempCorp, 1);
    lcd.print("C Z:");
    lcd.print(accZ_abs, 1);
    delay(1000);
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("Seuils T:");
    lcd.print(seuilTempMin, 0);
    lcd.print("-");
    lcd.print(seuilTempMax, 0);
    lcd.setCursor(0, 1);
    lcd.print("Seuils Z:");
    lcd.print(seuilChuteMin, 0);
    lcd.print("-");
    lcd.print(seuilChuteMax, 0);
  } else if (etat == "ATTENTE") {
    lcd.setCursor(0, 0);
    lcd.print("SYSTEME PRET");
    lcd.setCursor(0, 1);
    lcd.print("Attente donnees");
  } else if (etat == "INCENDIE_FIEVRE") {
    lcd.setCursor(0, 0);
    lcd.print("ALERTE: FIEVRE");
    lcd.setCursor(0, 1);
    lcd.print("T:");
    lcd.print(tempCorp, 1);
  } else if (etat == "INCENDIE_CHUTE") {
    lcd.setCursor(0, 0);
    lcd.print("ALERTE: CHUTE");
    lcd.setCursor(0, 1);
    lcd.print("Z:");
    lcd.print(accZ_abs, 1);
  } else if (etat == "INCENDIE_DOUBLE") {
    lcd.setCursor(0, 0);
    lcd.print("URGENCE!");
    lcd.setCursor(0, 1);
    lcd.print("Fievre + Chute");
  } else if (etat == "HYPOTHERMIE") {
    lcd.setCursor(0, 0);
    lcd.print("HYPOTHERMIE");
    lcd.setCursor(0, 1);
    lcd.print("T:");
    lcd.print(tempCorp, 1);
    lcd.print(" < ");
    lcd.print(seuilTempMin, 0);
  } else {
    lcd.setCursor(0, 0);
    lcd.print("ETAT INCONNU");
  }
}

void callback(char* topic, byte* payload, unsigned int length) {
  payload[length] = '\0';
  String msg = String((char*)payload);
  Serial.print("MQTT: ");
  Serial.println(msg);

  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, msg);
  if (error) {
    Serial.println("Erreur JSON");
    return;
  }

  if (String(topic) == data_topic) {
    tempCorp = doc["tempCorp"] | 0.0;
    accZ = doc["accZ"] | 0.0;
    dataReceived = true;
    updateEtat();
    updateLCD();
  } else if (String(topic) == threshold_topic) {
    seuilTempMin = doc["tempMin"] | seuilTempMin;
    seuilTempMax = doc["tempMax"] | seuilTempMax;
    seuilChuteMin = doc["chuteMin"] | seuilChuteMin;
    seuilChuteMax = doc["chuteMax"] | seuilChuteMax;
    Serial.println("📥 Seuils mis à jour depuis MQTT");
    updateLCD();
  }
}

void connectWiFi() {
  Serial.print("Connexion WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connecté !");
}

void reconnectMQTT() {
  while (!client.connected()) {
    Serial.print("Connexion MQTT...");
    if (client.connect("ESP32Node2")) {
      Serial.println("Connecté");
      client.subscribe(data_topic);
      client.subscribe(threshold_topic);
    } else {
      Serial.print("Échec, code=");
      Serial.println(client.state());
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  lcd.init();
  lcd.backlight();

  pinMode(LED_ROUGE_1, OUTPUT);
  pinMode(LED_ROUGE_2, OUTPUT);
  pinMode(LED_VERTE, OUTPUT);
  pinMode(LED_BLEUE, OUTPUT);

  digitalWrite(LED_ROUGE_1, LOW);
  digitalWrite(LED_ROUGE_2, LOW);
  digitalWrite(LED_VERTE, LOW);
  digitalWrite(LED_BLEUE, LOW);

  connectWiFi();
  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);

  updateLCD();
}

void loop() {
  if (!client.connected()) {
    reconnectMQTT();
  }
  client.loop();

  int v = analogRead(JOY_VERT);
  int h = analogRead(JOY_HORZ);
  unsigned long now = millis();

  if (now - lastJoystickUpdate > joystickInterval) {
    if (v > SEUIL_HAUT) {
      seuilTempMax += 0.1;
      thresholdChanged = true;
    } else if (v < SEUIL_BAS) {
      seuilTempMax -= 0.1;
      thresholdChanged = true;
    }

    if (h > SEUIL_HAUT) {
      seuilChuteMax += 0.5;
      thresholdChanged = true;
    } else if (h < SEUIL_BAS) {
      seuilChuteMax -= 0.5;
      thresholdChanged = true;
    }

    if (thresholdChanged) {
      publishThresholds();
      updateLCD();
      thresholdChanged = false;
    }
    lastJoystickUpdate = now;
  }

  updateLEDs();
  delay(50);
}
