/*
 * ============================================================
 * ESP32-S3 压力传感器节点 + MQTT 发布
 * ============================================================
 * 硬件：ESP32-S3 N8R8 + RunesKee RP-L-170 薄膜压力传感器
 * 功能：
 *   1. 读取 ADC 中值滤波
 *   2. 阈值判断 + 去抖
 *   3. WiFi + MQTT 发布到 indoor/pressure/{node_id}/state
 *
 * MQTT Topic:
 *   indoor/pressure/sofa/state   -> JSON:
 *   {
 *     "location": "sofa",
 *     "occupied": true,
 *     "raw_adc": 1245,
 *     "weight_kg": 52.3,
 *     "ts": "2026-06-12T14:30:00.000Z"
 *   }
 *
 * 依赖库（Arduino Library Manager 安装）：
 *   - PubSubClient by Nick O'Leary
 *   - ArduinoJson by Benoit Blanchon
 * ============================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>
#include <sys/time.h>
#include "device_config.h"

// =====================================================
// 全局变量
// =====================================================
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

unsigned long lastPublish = 0;
unsigned long publishInterval = PUBLISH_INTERVAL_MS;

bool currentOccupied = false;

// 非重叠区间 majority vote（临时方案，应对硬件接触不良）
int blockCount = 0;
int blockAboveCount = 0;

bool timeSynced = false;
uint64_t epochBaseMs = 0;

char topicState[64];
char topicStatus[64];

// =====================================================
// ADC 读取（中值滤波）
// =====================================================
int readADCMedian(int pin, int samples, int delayMs) {
  if (samples <= 0) samples = 1;
  int values[32];
  if (samples > 32) samples = 32;

  for (int i = 0; i < samples; i++) {
    values[i] = analogRead(pin);
    if (delayMs > 0) delay(delayMs);
  }

  // 冒泡排序取中值
  for (int i = 0; i < samples - 1; i++) {
    for (int j = i + 1; j < samples; j++) {
      if (values[j] < values[i]) {
        int tmp = values[i];
        values[i] = values[j];
        values[j] = tmp;
      }
    }
  }
  return values[samples / 2];
}

// =====================================================
// 重量估算（线性插值）
// =====================================================
float estimateWeight(int rawADC) {
  if (CALIBRATION_PAIR_COUNT < 2) return 0.0;

  int idx = 0;
  for (int i = 0; i < CALIBRATION_PAIR_COUNT - 1; i++) {
    if (rawADC >= CALIBRATION_PAIRS[i][0] && rawADC <= CALIBRATION_PAIRS[i + 1][0]) {
      idx = i;
      break;
    }
    if (rawADC > CALIBRATION_PAIRS[i + 1][0]) {
      idx = i + 1;
    }
  }
  if (idx >= CALIBRATION_PAIR_COUNT - 1) idx = CALIBRATION_PAIR_COUNT - 2;

  float x0 = CALIBRATION_PAIRS[idx][0];
  float y0 = CALIBRATION_PAIRS[idx][1];
  float x1 = CALIBRATION_PAIRS[idx + 1][0];
  float y1 = CALIBRATION_PAIRS[idx + 1][1];

  if (x1 - x0 < 1e-6) return y0;

  float t = (float)(rawADC - x0) / (x1 - x0);
  float weight = y0 + t * (y1 - y0);
  return weight < 0 ? 0.0 : weight;
}

// =====================================================
// WiFi 连接
// =====================================================
void connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return;

  Serial.printf("[WiFi] 正在连接 %s\n", WIFI_SSID);
  WiFi.disconnect(true);
  delay(1000);
  WiFi.mode(WIFI_STA);
  delay(500);

  if (USE_ENTERPRISE_WIFI) {
    Serial.printf("[WiFi] 使用 WPA2-Enterprise 认证，用户名=%s\n", WIFI_EAP_USERNAME);
    WiFi.begin(
        WIFI_SSID,
        WPA2_AUTH_PEAP,
        WIFI_EAP_ANONYMOUS_IDENTITY,
        WIFI_EAP_USERNAME,
        WIFI_EAP_PASSWORD
    );
  } else {
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(" 已连接!");
    Serial.printf("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println(" 连接失败，稍后重试");
  }
}

// =====================================================
// NTP 时间同步
// =====================================================
bool syncClock() {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (timeSynced) return true;

  configTime(NTP_GMT_OFFSET_SEC, NTP_DAYLIGHT_OFFSET_SEC, NTP_SERVER);
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo, 4000)) {
    Serial.println("[TIME] NTP sync failed");
    return false;
  }

  struct timeval nowTv;
  if (gettimeofday(&nowTv, nullptr) != 0) return false;
  if (nowTv.tv_sec < 100000) return false;

  epochBaseMs = ((uint64_t)nowTv.tv_sec * 1000ULL) + ((uint64_t)nowTv.tv_usec / 1000ULL);
  timeSynced = true;
  Serial.printf("[TIME] synced, epoch_ms=%llu\n", epochBaseMs);
  return true;
}

String getISOTimestamp() {
  if (!timeSynced) return "";

  uint64_t epochMs = epochBaseMs + (uint64_t)millis();
  time_t sec = (time_t)(epochMs / 1000ULL);
  unsigned long ms = (unsigned long)(epochMs % 1000ULL);

  struct tm ti;
  gmtime_r(&sec, &ti);

  char buf[32];
  snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02d.%03luZ",
           ti.tm_year + 1900, ti.tm_mon + 1, ti.tm_mday,
           ti.tm_hour, ti.tm_min, ti.tm_sec, ms);
  return String(buf);
}

// =====================================================
// MQTT 连接
// =====================================================
void connectMQTT() {
  if (mqttClient.connected()) return;
  if (WiFi.status() != WL_CONNECTED) return;

  Serial.printf("[MQTT] 正在连接 %s:%d ...", MQTT_SERVER, MQTT_PORT);

  char willTopic[64];
  snprintf(willTopic, sizeof(willTopic), "indoor/pressure/%s/status", PRESSURE_NODE_ID);
  const char* willMsg = "{\"online\":false}";

  bool connected = false;
  if (strlen(MQTT_USER) > 0) {
    connected = mqttClient.connect(MQTT_CLIENT, MQTT_USER, MQTT_PASS,
                                    willTopic, 1, true, willMsg);
  } else {
    connected = mqttClient.connect(MQTT_CLIENT, NULL, NULL,
                                    willTopic, 1, true, willMsg);
  }

  if (connected) {
    Serial.println(" 已连接!");
    mqttClient.publish(topicStatus, "{\"online\":true}", true);
  } else {
    Serial.printf(" 失败 (rc=%d)\n", mqttClient.state());
  }
}

// =====================================================
// 发布压力状态
// =====================================================
void publishState(bool occupied, int rawADC, float weightKg) {
  if (!mqttClient.connected()) return;

  JsonDocument doc;
  doc["location"]  = PRESSURE_NODE_ID;
  doc["occupied"]  = occupied;
  doc["raw_adc"]   = rawADC;
  doc["weight_kg"] = round(weightKg * 10.0) / 10.0;
  doc["ts"]        = getISOTimestamp();

  char payload[256];
  serializeJson(doc, payload, sizeof(payload));
  mqttClient.publish(topicState, payload);

  Serial.printf("[MQTT->] %s : %s\n", topicState, payload);
}

void publishHeartbeat() {
  if (!mqttClient.connected()) return;

  JsonDocument doc;
  doc["online"]    = true;
  doc["node_id"]   = PRESSURE_NODE_ID;
  doc["uptime"]    = millis() / 1000;
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["free_heap"] = ESP.getFreeHeap();

  char payload[200];
  serializeJson(doc, payload, sizeof(payload));
  mqttClient.publish(topicStatus, payload, true);
}

// =====================================================
// Setup
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n============================================");
  Serial.println("  ESP32-S3 压力传感器节点");
  Serial.printf("  节点 ID: %s\n", PRESSURE_NODE_ID);
  Serial.println("============================================");

  // ADC 配置：12 位分辨率，11dB 衰减对应 0~3.3V
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  if (USE_INTERNAL_PULLDOWN) {
    pinMode(PRESSURE_ADC_PIN, INPUT_PULLDOWN);
    Serial.println("[ADC] Internal pulldown enabled (no external resistor)");
  } else {
    pinMode(PRESSURE_ADC_PIN, INPUT);
  }

  snprintf(topicState, sizeof(topicState), "indoor/pressure/%s/state", PRESSURE_NODE_ID);
  snprintf(topicStatus, sizeof(topicStatus), "indoor/pressure/%s/status", PRESSURE_NODE_ID);
  Serial.printf("[Topic] State:  %s\n", topicState);
  Serial.printf("[Topic] Status: %s\n", topicStatus);

  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  delay(1000);
  connectWiFi();
  syncClock();

  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setBufferSize(512);
  connectMQTT();

  Serial.println("\n[系统] 初始化完成，开始监测压力...\n");
}

// =====================================================
// Main Loop
// =====================================================
void loop() {
  // 网络维护
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }
  if (!timeSynced && WiFi.status() == WL_CONNECTED) {
    syncClock();
  }
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();

  // 读取 ADC 并判断占用状态
  int rawADC = readADCMedian(PRESSURE_ADC_PIN, ADC_SAMPLE_COUNT, ADC_DELAY_MS);

  // 非重叠区间 majority vote：每 BLOCK 次采样独立判断，不保持原状态
  blockCount++;
  if (rawADC > PRESSURE_THRESHOLD_ADC) blockAboveCount++;

  if (blockCount >= PRESSURE_BLOCK_SIZE) {
    // 每个区间结束都直接根据当前区间结果刷新状态
    if (blockAboveCount >= PRESSURE_BLOCK_OCCUPIED) {
      currentOccupied = true;
    } else {
      currentOccupied = false;
    }
    Serial.printf("[ADC] block end above=%2d/%2d currentOccupied=%d\n",
                  blockAboveCount, PRESSURE_BLOCK_SIZE, currentOccupied);
    blockCount = 0;
    blockAboveCount = 0;
  }

  Serial.printf("[ADC] raw=%4d block=%2d above=%2d readingOccupied=%d\n",
                rawADC, blockCount, blockAboveCount, currentOccupied);

  // 定时上报
  unsigned long now = millis();
  if ((now - lastPublish) >= publishInterval) {
    float weightKg = estimateWeight(rawADC);
    publishState(currentOccupied, rawADC, weightKg);
    lastPublish = now;
    publishInterval = PUBLISH_INTERVAL_MS;
  }

  // 心跳
  static unsigned long lastHeartbeat = 0;
  if (now - lastHeartbeat > 30000) {
    publishHeartbeat();
    lastHeartbeat = now;
  }

  delay(50);
}
