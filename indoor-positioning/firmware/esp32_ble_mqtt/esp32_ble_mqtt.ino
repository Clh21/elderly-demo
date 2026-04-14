/*
 * ============================================================
 * ESP32 BLE RSSI 采集 + 卡尔曼滤波 + WiFi + MQTT 发布
 * ============================================================
 * 硬件：ESP32-WROOM-32E
 * 功能：
 *   1. BLE 扫描目标信标（老人佩戴的手环/标签）
 *   2. 卡尔曼滤波平滑 RSSI
 *   3. 通过 WiFi 连接到局域网
 *   4. 通过 MQTT 发布 RSSI 数据到服务器
 *
 * MQTT Topic 格式:
 *   indoor/ble/{BEACON_ID}/rssi   -> JSON:
 *   {
 *     "raw": -65,
 *     "filtered": -62.3,
 *     "ts": 123456,
 *     "rx_epoch_ms": 1712490000123,
 *     "packet_slot": 6849960000,
 *     "adv_interval_ms": 250
 *   }
 *
 * 依赖库（在 Arduino Library Manager 中安装）：
 *   - PubSubClient by Nick O'Leary (MQTT)
 *   - ArduinoJson by Benoit Blanchon
 *   - ESP32 BLE Arduino（ESP32 核心自带，无需额外安装）
 *
 * ============================================================
 * 使用步骤：
 *   1. 修改同目录 device_config.h 中的 WiFi/MQTT/锚点参数
 *   2. 保存后重新烧录
 *   3. 选择开发板: ESP32 Dev Module
 *   4. 上传代码，打开串口监视器（115200）
 * ============================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>
#include <time.h>
#include <sys/time.h>
#include "device_config.h"

// =====================================================
// ============ 配置说明 ============
// =====================================================
// WiFi/MQTT/锚点/NTP 参数已经移到同目录的 device_config.h。
// 以后只需要修改 device_config.h，再重新烧录即可。

// =====================================================
// ============ 卡尔曼滤波参数 ============
// =====================================================
// 老人居家场景：移动缓慢，优先平滑
float kalman_x = -70.0;     // 初始估计值
float kalman_p = 10.0;      // 初始误差协方差
float kalman_q = 0.3;       // 过程噪声 (0.3-1.0, 越小越平滑)
float kalman_r = 12.0;      // 测量噪声 (5-15, 增大可抑制RSSI抖动)
float kalman_k = 0.0;       // 卡尔曼增益（自动计算）

// =====================================================
// ============ 扫描与运行参数 ============
// =====================================================
const int SCAN_TIME          = 1;       // BLE 扫描时间（秒）
const int SCAN_INTERVAL_MS   = 50;      // 扫描间隔（毫秒）
const unsigned long WIFI_RETRY_MS  = 5000;  // WiFi 重连间隔
const unsigned long MQTT_RETRY_MS  = 5000;  // MQTT 重连间隔
const unsigned long HEARTBEAT_MS   = 30000; // 心跳包间隔（30秒）

// 每 250ms 为一包 beacon 周期（老师要求：按同一发包周期对齐）
const uint32_t BEACON_ADV_INTERVAL_MS = 250;
const uint8_t  MAX_SLOT_SAMPLES = 16;

// =====================================================
// ============ 全局变量 ============
// =====================================================
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);
BLEScan* pBLEScan;

unsigned long lastHeartbeat = 0;

uint64_t epochBaseMs = 0;
bool timeSynced = false;

struct SlotSample {
    uint32_t slot;
    int raw;
    float filtered;
    uint64_t epochMs;
};

SlotSample slotSamples[MAX_SLOT_SAMPLES];
uint8_t slotSampleCount = 0;

// MQTT Topic（自动拼接）
char topicRSSI[64];
char topicStatus[64];

// =====================================================
// ============ 卡尔曼滤波函数 ============
// =====================================================
float kalmanFilter(float measurement) {
    // 预测步骤
    kalman_p = kalman_p + kalman_q;

    // 更新步骤
    kalman_k = kalman_p / (kalman_p + kalman_r);
    kalman_x = kalman_x + kalman_k * (measurement - kalman_x);
    kalman_p = (1.0 - kalman_k) * kalman_p;

    return kalman_x;
}

uint64_t getEpochMsNow() {
    if (!timeSynced) return 0;
    return epochBaseMs + (uint64_t)millis();
}

void clearSlotSamples() {
    slotSampleCount = 0;
}

void upsertSlotSample(uint32_t slot, int raw, float filtered, uint64_t epochMs) {
    for (uint8_t i = 0; i < slotSampleCount; i++) {
        if (slotSamples[i].slot == slot) {
            slotSamples[i].raw = raw;
            slotSamples[i].filtered = filtered;
            slotSamples[i].epochMs = epochMs;
            return;
        }
    }

    if (slotSampleCount < MAX_SLOT_SAMPLES) {
        slotSamples[slotSampleCount].slot = slot;
        slotSamples[slotSampleCount].raw = raw;
        slotSamples[slotSampleCount].filtered = filtered;
        slotSamples[slotSampleCount].epochMs = epochMs;
        slotSampleCount++;
        return;
    }

    // Buffer full: replace the oldest slot to keep most recent packets.
    uint8_t oldestIdx = 0;
    uint32_t oldestSlot = slotSamples[0].slot;
    for (uint8_t i = 1; i < MAX_SLOT_SAMPLES; i++) {
        if (slotSamples[i].slot < oldestSlot) {
            oldestSlot = slotSamples[i].slot;
            oldestIdx = i;
        }
    }

    slotSamples[oldestIdx].slot = slot;
    slotSamples[oldestIdx].raw = raw;
    slotSamples[oldestIdx].filtered = filtered;
    slotSamples[oldestIdx].epochMs = epochMs;
}

void sortSlotSamplesBySlot() {
    for (uint8_t i = 0; i < slotSampleCount; i++) {
        for (uint8_t j = i + 1; j < slotSampleCount; j++) {
            if (slotSamples[j].slot < slotSamples[i].slot) {
                SlotSample tmp = slotSamples[i];
                slotSamples[i] = slotSamples[j];
                slotSamples[j] = tmp;
            }
        }
    }
}

// =====================================================
// ============ BLE 扫描回调 ============
// =====================================================
class ScanCallbacks : public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice device) {
        String mac = device.getAddress().toString().c_str();
        if (mac.equalsIgnoreCase(TARGET_MAC)) {
            if (!timeSynced) return;

            int raw = device.getRSSI();
            float filtered = kalmanFilter((float)raw);
            uint64_t epochMs = getEpochMsNow();
            if (epochMs == 0) return;

            uint32_t slot = (uint32_t)(epochMs / (uint64_t)BEACON_ADV_INTERVAL_MS);
            upsertSlotSample(slot, raw, filtered, epochMs);
        }
    }
};

// =====================================================
// ============ WiFi 连接 ============
// =====================================================
void connectWiFi() {
    if (WiFi.status() == WL_CONNECTED) return;

    Serial.printf("[WiFi] 正在连接 %s\n", WIFI_SSID);

    // 关键：先彻底断开再重连，避免 "sta is connecting" 错误
    WiFi.disconnect(true);
    delay(1000);
    WiFi.mode(WIFI_STA);
    delay(500);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println(" 已连接!");
        Serial.printf("[WiFi] IP 地址: %s\n", WiFi.localIP().toString().c_str());
        Serial.printf("[WiFi] 信号强度: %d dBm\n", WiFi.RSSI());
    } else {
        Serial.println(" 连接失败! 将在下一轮重试");
        Serial.printf("[WiFi] 状态码: %d\n", WiFi.status());
    }
}

bool syncClock() {
    if (WiFi.status() != WL_CONNECTED) return false;
    if (timeSynced) return true;

    configTime(NTP_GMT_OFFSET_SEC, NTP_DAYLIGHT_OFFSET_SEC, NTP_SERVER);

    struct tm timeinfo;
    if (!getLocalTime(&timeinfo, 4000)) {
        Serial.println("[TIME] NTP sync failed (timeout)");
        return false;
    }

    struct timeval nowTv;
    if (gettimeofday(&nowTv, nullptr) != 0) {
        Serial.println("[TIME] NTP sync failed (gettimeofday)");
        return false;
    }

    if (nowTv.tv_sec < 100000) {
        Serial.println("[TIME] NTP sync failed (invalid epoch)");
        return false;
    }

    uint64_t nowMs = ((uint64_t)nowTv.tv_sec * 1000ULL) + ((uint64_t)nowTv.tv_usec / 1000ULL);
    epochBaseMs = nowMs - (uint64_t)millis();
    timeSynced = true;
    Serial.printf("[TIME] synced, epoch_ms=%llu\n", getEpochMsNow());
    return true;
}

// =====================================================
// ============ MQTT 连接 ============
// =====================================================
void connectMQTT() {
    if (mqttClient.connected()) return;
    if (WiFi.status() != WL_CONNECTED) return;

    Serial.printf("[MQTT] 正在连接 %s:%d ...", MQTT_SERVER, MQTT_PORT);

    // 构建遗嘱消息（离线时自动发布）
    // 这样服务器可以知道哪个锚点掉线了
    char willTopic[64];
    snprintf(willTopic, sizeof(willTopic), "indoor/ble/%s/status", BEACON_ID);
    const char* willMsg = "{\"online\":false}";

    bool connected = false;
    if (strlen(MQTT_USER) > 0) {
        connected = mqttClient.connect(MQTT_CLIENT, MQTT_USER, MQTT_PASS,
                                        willTopic, 1, true, willMsg);
    } else {
        connected = mqttClient.connect(MQTT_CLIENT,
                                        NULL, NULL,
                                        willTopic, 1, true, willMsg);
    }

    if (connected) {
        Serial.println(" 已连接!");

        // 发布上线消息
        mqttClient.publish(topicStatus, "{\"online\":true}", true);
        Serial.printf("[MQTT] 节点 %s 已上线\n", BEACON_ID);
    } else {
        Serial.printf(" 连接失败 (rc=%d)，将在下一轮重试\n", mqttClient.state());
    }
}

// =====================================================
// ============ 发布 RSSI 数据 ============
// =====================================================
void publishRSSI(int rawRSSI, float filteredRSSI, uint64_t rxEpochMs, uint32_t packetSlot) {
    if (!mqttClient.connected()) return;

    // 使用 ArduinoJson 构建 JSON
    JsonDocument doc;
    doc["anchor"]   = BEACON_ID;
    doc["target"]   = TARGET_MAC;
    doc["raw"]      = rawRSSI;
    doc["filtered"] = round(filteredRSSI * 10.0) / 10.0;  // 保留1位小数
    doc["ts"]       = millis();
    doc["rx_epoch_ms"] = rxEpochMs;
    doc["packet_slot"] = packetSlot;
    doc["adv_interval_ms"] = BEACON_ADV_INTERVAL_MS;

    char payload[256];
    serializeJson(doc, payload, sizeof(payload));

    mqttClient.publish(topicRSSI, payload);

    // 串口也输出，方便调试
    Serial.printf("[MQTT->] slot=%lu %s : %s\n", packetSlot, topicRSSI, payload);
}

// =====================================================
// ============ 发布心跳 ============
// =====================================================
void publishHeartbeat() {
    if (!mqttClient.connected()) return;

    JsonDocument doc;
    doc["online"]  = true;
    doc["anchor"]  = BEACON_ID;
    doc["uptime"]  = millis() / 1000;
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["free_heap"] = ESP.getFreeHeap();

    char payload[200];
    serializeJson(doc, payload, sizeof(payload));

    mqttClient.publish(topicStatus, payload, true);  // retained
}

// =====================================================
// ============ Setup ============
// =====================================================
void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("============================================");
    Serial.println("  ESP32 BLE + MQTT 室内定位锚点");
    Serial.printf("  节点 ID: %s\n", BEACON_ID);
    Serial.printf("  目标信标: %s\n", TARGET_MAC);
    Serial.println("============================================");

    // 构建 MQTT Topic
    snprintf(topicRSSI,   sizeof(topicRSSI),   "indoor/ble/%s/rssi",   BEACON_ID);
    snprintf(topicStatus, sizeof(topicStatus), "indoor/ble/%s/status", BEACON_ID);
    Serial.printf("[Topic] RSSI:   %s\n", topicRSSI);
    Serial.printf("[Topic] Status: %s\n", topicStatus);
    Serial.printf("[SYNC] packet slot interval: %lu ms\n", BEACON_ADV_INTERVAL_MS);

    // 初始化 WiFi（先彻底重置）
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);
    delay(1000);
    connectWiFi();
    syncClock();

    // 初始化 MQTT
    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setBufferSize(512);  // 确保足够大
    connectMQTT();

    // 初始化 BLE
    BLEDevice::init("ESP32_Anchor");
    pBLEScan = BLEDevice::getScan();
    pBLEScan->setAdvertisedDeviceCallbacks(new ScanCallbacks());
    pBLEScan->setActiveScan(true);
    pBLEScan->setInterval(100);
    pBLEScan->setWindow(99);

    Serial.println("\n[系统] 初始化完成，开始扫描...\n");
}

// =====================================================
// ============ Main Loop ============
// =====================================================
void loop() {
    // 1. 确保 WiFi 连接
    if (WiFi.status() != WL_CONNECTED) {
        connectWiFi();
    }

    // 1.1 确保时间同步（跨锚点同一 packet_slot 的基础）
    if (!timeSynced && WiFi.status() == WL_CONNECTED) {
        syncClock();
    }

    // 2. 确保 MQTT 连接
    if (!mqttClient.connected()) {
        connectMQTT();
    }
    mqttClient.loop();  // 处理 MQTT 消息队列

    if (!timeSynced) {
        delay(500);
        return;
    }

    // 3. BLE 扫描
    clearSlotSamples();
    pBLEScan->start(SCAN_TIME, false);

    if (slotSampleCount > 0) {
        sortSlotSamplesBySlot();
        for (uint8_t i = 0; i < slotSampleCount; i++) {
            publishRSSI(
                slotSamples[i].raw,
                slotSamples[i].filtered,
                slotSamples[i].epochMs,
                slotSamples[i].slot
            );
            mqttClient.loop();
        }
    } else {
        Serial.printf("[BLE] %lu - 信标丢失\n", millis());
    }

    pBLEScan->clearResults();

    // 4. 定期发送心跳
    if (millis() - lastHeartbeat > HEARTBEAT_MS) {
        publishHeartbeat();
        lastHeartbeat = millis();
    }

    delay(SCAN_INTERVAL_MS);
}
