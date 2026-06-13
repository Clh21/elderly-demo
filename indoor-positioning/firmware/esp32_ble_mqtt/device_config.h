#pragma once

// =====================================================
// ESP32 BLE + MQTT 配置文件
// 只改这个文件即可，无需改主逻辑代码。
// 修改完成后重新烧录 .ino。
// =====================================================

// ----- WiFi 设置 -----
// 当前网络：电脑个人热点 (WPA2-Personal)
// 如需改回企业 WiFi，把 USE_ENTERPRISE_WIFI 设 true 并填写 EAP 账号密码。
static const char* WIFI_SSID     = "我劝你最好别连";
static const bool  USE_ENTERPRISE_WIFI = false;
static const char* WIFI_EAP_USERNAME   = "25104351g";
static const char* WIFI_EAP_PASSWORD   = "Zhf@20030716zhf";
static const char* WIFI_EAP_ANONYMOUS_IDENTITY = "";  // 通常留空

// 普通家用 WiFi / 电脑热点密码
static const char* WIFI_PASSWORD = "66666666";

// ----- MQTT 设置 -----
// 当前电脑 IP（运行 MQTT broker / Python 服务的那台电脑）
// 热点网络下 Windows 热点默认网关 IP 是 192.168.137.1，可用 ipconfig 确认。
static const char* MQTT_SERVER   = "192.168.137.1";
static const int MQTT_PORT = 1883;
static const char* MQTT_USER = "";      // 无认证留空
static const char* MQTT_PASS = "";
static const char* MQTT_CLIENT = "esp32_beacon_01";  // 每个锚点必须唯一

// ----- 锚点与目标设备 -----
static const char* BEACON_ID = "anchor_01";          // anchor_01 / anchor_02 / anchor_03
static const char* TARGET_ID = "real-watch-001";
static const uint8_t TARGET_IBEACON_UUID[16] = {
    0x8F, 0x0A, 0x5A, 0x8C, 0x6C, 0x3A, 0x4C, 0x4F,
    0x9E, 0x2B, 0x2C, 0x9C, 0x9F, 0x3C, 0x9E, 0x10
};
static const uint16_t TARGET_IBEACON_MAJOR = 1;
static const uint16_t TARGET_IBEACON_MINOR = 1;

// ----- NTP 时间同步（用于 packet_slot 对齐） -----
// 当前电脑热点共享校园网，可上外网，优先使用公共 NTP 服务器。
// 备选列表包含国内 NTP 和本地网关，提高同步成功率。
static const char* NTP_SERVERS[] = {
    "pool.ntp.org",
    "cn.pool.ntp.org",
    "time.windows.com",
    "192.168.137.1"  // 本地 fallback（如果 Windows 装了 NTP 服务）
};
static const int NTP_SERVER_COUNT = sizeof(NTP_SERVERS) / sizeof(NTP_SERVERS[0]);
static const long NTP_GMT_OFFSET_SEC = 8 * 3600;
static const int NTP_DAYLIGHT_OFFSET_SEC = 0;

// 当所有 NTP 服务器都不可达时，是否使用本地 millis() 作为时间基准。
// true = 无外网也能工作；packet_slot 基于本地时间，Python 端会自动对齐各锚点偏移。
// false = 必须成功同步外网 NTP，否则不会发送 RSSI 数据。
static const bool USE_LOCAL_TIME_FALLBACK = true;
