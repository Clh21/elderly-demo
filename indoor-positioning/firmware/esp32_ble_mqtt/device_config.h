#pragma once

// =====================================================
// ESP32 BLE + MQTT 配置文件
// 只改这个文件即可，无需改主逻辑代码。
// 修改完成后重新烧录 .ino。
// =====================================================

// ----- WiFi 设置 -----
static const char* WIFI_SSID = "Zhang";
static const char* WIFI_PASSWORD = "zhang8811";

// ----- MQTT 设置 -----
static const char* MQTT_SERVER = "192.168.1.11";
static const int MQTT_PORT = 1883;
static const char* MQTT_USER = "";      // 无认证留空
static const char* MQTT_PASS = "";
static const char* MQTT_CLIENT = "esp32_beacon_01";  // 每个锚点必须唯一

// ----- 锚点与目标设备 -----
static const char* BEACON_ID = "anchor_01";          // anchor_01 / anchor_02 / anchor_03

// Watch 广播使用 iBeacon 格式（Manufacturer Specific Data）。
// UUID/major/minor 必须与手表端保持一致。
static const uint8_t TARGET_IBEACON_UUID[16] = {
    0x8F, 0x0A, 0x5A, 0x8C, 0x6C, 0x3A, 0x4C, 0x4F,
    0x9E, 0x2B, 0x2C, 0x9C, 0x9F, 0x3C, 0x9E, 0x10
};
static const char* TARGET_IBEACON_UUID_STR = "8f0a5a8c-6c3a-4c4f-9e2b-2c9c9f3c9e10";
static const uint16_t TARGET_IBEACON_MAJOR = 1;
static const uint16_t TARGET_IBEACON_MINOR = 1;

// ----- NTP 时间同步（用于 packet_slot 对齐） -----
static const char* NTP_SERVER = "pool.ntp.org";
static const long NTP_GMT_OFFSET_SEC = 8 * 3600;
static const int NTP_DAYLIGHT_OFFSET_SEC = 0;
