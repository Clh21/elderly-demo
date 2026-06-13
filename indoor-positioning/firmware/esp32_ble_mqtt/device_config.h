#pragma once

// =====================================================
// ESP32 BLE + MQTT 配置文件
// 只改这个文件即可，无需改主逻辑代码。
// 修改完成后重新烧录 .ino。
// =====================================================

// ----- WiFi 设置 -----
// 当前网络：电脑个人热点 (WPA2-Personal)
// 如需改回企业 WiFi，把 USE_ENTERPRISE_WIFI 设 true 并填写 EAP 账号密码。
static const char* WIFI_SSID     = "DESKTOP-027GF58 1239";
static const bool  USE_ENTERPRISE_WIFI = false;
static const char* WIFI_EAP_USERNAME   = "25104351g";
static const char* WIFI_EAP_PASSWORD   = "Zhf@20030716zhf";
static const char* WIFI_EAP_ANONYMOUS_IDENTITY = "";  // 通常留空

// 普通家用 WiFi / 电脑热点密码
static const char* WIFI_PASSWORD = "17C00w2/";

// ----- MQTT 设置 -----
// 当前电脑 IP（运行 MQTT broker / Python 服务的那台电脑）
// 热点网络下 Windows 热点默认网关 IP 是 192.168.137.1，可用 ipconfig 确认。
static const char* MQTT_SERVER   = "192.168.137.1";
static const int MQTT_PORT = 1883;
static const char* MQTT_USER = "";      // 无认证留空
static const char* MQTT_PASS = "";
static const char* MQTT_CLIENT = "esp32_beacon_03";  // 每个锚点必须唯一

// ----- 锚点与目标设备 -----
static const char* BEACON_ID = "anchor_03";          // anchor_01 / anchor_02 / anchor_03
static const char* TARGET_MAC = "20:a7:16:60:f9:b9";

// ----- NTP 时间同步（用于 packet_slot 对齐） -----
// 热点网络下优先用本地 broker 电脑的 IP（默认 192.168.137.1）。
// 若该电脑没有 NTP 服务，请启用 USE_LOCAL_TIME_FALLBACK。
static const char* NTP_SERVER = "192.168.137.1";
static const long NTP_GMT_OFFSET_SEC = 8 * 3600;
static const int NTP_DAYLIGHT_OFFSET_SEC = 0;

// 当 NTP 服务器不可达时，是否使用本地 millis() 作为时间基准。
// true = 无外网也能工作；packet_slot 基于本地时间，Python 端会自动对齐各锚点偏移。
// false = 必须成功同步外网 NTP，否则不会发送 RSSI 数据。
static const bool USE_LOCAL_TIME_FALLBACK = true;
