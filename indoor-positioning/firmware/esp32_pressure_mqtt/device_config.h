#pragma once

// ============================================================
// ESP32-S3 压力传感器节点配置
// 对应位置：sofa（沙发）
// ============================================================

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
static const int   MQTT_PORT     = 1883;
static const char* MQTT_USER     = "";
static const char* MQTT_PASS     = "";
static const char* MQTT_CLIENT   = "esp32_pressure_sofa_01";

// ----- 压力传感器节点配置 -----
// 当前节点对应的家具 ID，必须和 positioning_config.py 里的 FURNITURE 字典键一致。
// 可多复制几份固件目录，分别改为 sofa / bed / toilet 后烧录到不同 ESP32。
// 对应 topic: indoor/pressure/{PRESSURE_NODE_ID}/state
static const char* PRESSURE_NODE_ID = "sofa";
static const char* FURNITURE_LABEL  = "Sofa";

// ----- ADC 配置 -----
// ESP32-S3 的 ADC1 可用引脚：GPIO1-10；WiFi 启用时请勿使用 ADC2。
static const int PRESSURE_ADC_PIN = 2;          // GPIO2 = ADC1_CH1
static const int ADC_SAMPLE_COUNT = 10;         // 中值滤波采样次数
static const int ADC_DELAY_MS     = 5;          // 采样间隔

// 没有外接下拉电阻时，打开 ESP32 内部下拉电阻（约 45kΩ）。
// 如果你有 10kΩ 外接电阻，请设为 false。
static const bool USE_INTERNAL_PULLDOWN = true;

// ----- 阈值（需根据实际标定调整） -----
// 空载时 raw_adc 通常接近 0；坐上沙发后应明显升高。
static const int PRESSURE_THRESHOLD_ADC = 3000;  // 超过此值视为有人坐下

// 硬件接触不良时的软件兜底：非重叠区间 majority vote。
// 每采集 BLOCK 次算一个区间，区间内超过阈值的次数达到 OCCUPIED 阈值则判定有人，
// 否则判定没人。每个区间结束后计数清零，不累积旧数据，也不保持原状态。
// 注意：这只是临时方案，不能替代正确的硬件接线。
static const int PRESSURE_BLOCK_SIZE = 20;
static const int PRESSURE_BLOCK_OCCUPIED = 13;  // 60% of 20

// ----- 重量标定（线性插值） -----
// 格式: {raw_adc, weight_kg}
// 至少保留 {0, 0.0}；其余点请用已知重量实测后填写。
static const float CALIBRATION_PAIRS[][2] = {
  {0,    0.0},   // 无负载
  {800,  50.0},  // 示例：需实测
  {2000, 80.0},  // 示例：需实测
};
static const int CALIBRATION_PAIR_COUNT = 3;

// ----- 发布间隔 -----
static const unsigned long PUBLISH_INTERVAL_MS     = 1000; // 正常状态上报间隔
static const unsigned long PUBLISH_INTERVAL_FAST_MS = 250; // 状态变化时快速上报

// ----- NTP 时间同步 -----
// 热点网络下优先用本地 broker 电脑的 IP（默认 192.168.137.1）。
static const char* NTP_SERVER              = "192.168.137.1";
static const long  NTP_GMT_OFFSET_SEC      = 8 * 3600;
static const int   NTP_DAYLIGHT_OFFSET_SEC = 0;
