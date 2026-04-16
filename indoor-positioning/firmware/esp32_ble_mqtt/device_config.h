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
static const char* TARGET_MAC = "20:a7:16:60:f9:b9";

// ----- NTP 时间同步（用于 packet_slot 对齐） -----
static const char* NTP_SERVER = "pool.ntp.org";
static const long NTP_GMT_OFFSET_SEC = 8 * 3600;
static const int NTP_DAYLIGHT_OFFSET_SEC = 0;
