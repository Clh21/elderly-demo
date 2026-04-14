/*
 * ============================================
 * ESP32 BLE RSSI 采集 + 卡尔曼滤波
 * ============================================
 * 功能：持续追踪目标信标，用卡尔曼滤波平滑 RSSI，输出到串口
 * 这是第二步：在你已经找到信标 MAC 地址之后使用
 * 
 * 串口输出格式（方便后续用 Python 绘图分析）：
 * timestamp_ms, raw_rssi, filtered_rssi
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>

// ============ 必须修改：填入你的信标 MAC 地址 ============
String TARGET_BEACON_MAC = "20:a7:16:60:f9:b9";  // ← 改成你的！

// ============ 卡尔曼滤波参数 ============
// 这些参数针对老人居家场景优化（移动缓慢，优先平滑）
float kalman_x = -70.0;    // 初始估计值（RSSI 的典型值）
float kalman_p = 10.0;     // 初始误差协方差
float kalman_q = 0.5;      // 过程噪声 - 值越小越平滑，但响应越慢
                            // 老人场景建议 0.3-1.0
float kalman_r = 8.0;      // 测量噪声 - BLE RSSI 波动大，建议 5-15
float kalman_k = 0.0;      // 卡尔曼增益（自动计算）

// ============ 扫描设置 ============
const int SCAN_TIME = 1;  // 每轮扫描1秒，提高更新频率

BLEScan* pBLEScan;
int latestRSSI = 0;
bool beaconFound = false;

// ---------- 卡尔曼滤波函数 ----------
float kalmanFilter(float measurement) {
    // 预测步骤
    // x_predict = x (匀速模型，预测值等于上一次估计值)
    kalman_p = kalman_p + kalman_q;
    
    // 更新步骤
    kalman_k = kalman_p / (kalman_p + kalman_r);
    kalman_x = kalman_x + kalman_k * (measurement - kalman_x);
    kalman_p = (1 - kalman_k) * kalman_p;
    
    return kalman_x;
}

// ---------- BLE 扫描回调 ----------
class MyCallbacks : public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice device) {
        String mac = device.getAddress().toString().c_str();
        if (mac.equalsIgnoreCase(TARGET_BEACON_MAC)) {
            latestRSSI = device.getRSSI();
            beaconFound = true;
        }
    }
};

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println("====================================");
    Serial.println("  BLE RSSI 采集 + 卡尔曼滤波");
    Serial.printf("  目标信标: %s\n", TARGET_BEACON_MAC.c_str());
    Serial.println("====================================");
    Serial.println("timestamp_ms,raw_rssi,filtered_rssi");  // CSV 表头
    
    BLEDevice::init("ESP32_Scanner");
    pBLEScan = BLEDevice::getScan();
    pBLEScan->setAdvertisedDeviceCallbacks(new MyCallbacks());
    pBLEScan->setActiveScan(true);
    pBLEScan->setInterval(100);
    pBLEScan->setWindow(99);
}

void loop() {
    beaconFound = false;
    pBLEScan->start(SCAN_TIME, false);
    
    if (beaconFound) {
        float filtered = kalmanFilter((float)latestRSSI);
        
        // 输出 CSV 格式：时间戳, 原始RSSI, 滤波后RSSI
        Serial.printf("%lu,%d,%.1f\n", millis(), latestRSSI, filtered);
    } else {
        Serial.printf("%lu,LOST,LOST\n", millis());
    }
    
    pBLEScan->clearResults();
    delay(200);
}
