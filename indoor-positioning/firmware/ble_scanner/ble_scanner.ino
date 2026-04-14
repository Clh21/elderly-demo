/*
 * ============================================
 * ESP32 BLE 信标扫描器 - 入门版
 * ============================================
 * 功能：扫描周围的 BLE 设备，找到你的信标并打印 RSSI 值
 * 硬件：ESP32-WROOM-32E
 * 
 * 使用步骤：
 * 1. 在 Arduino IDE 中打开此文件
 * 2. 选择开发板: ESP32 Dev Module
 * 3. 选择正确的串口
 * 4. 上传代码
 * 5. 打开串口监视器（波特率 115200）
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>

// ============ 配置区域 ============
// 把这里改成你的 BLE 信标的 MAC 地址（先运行一次，从串口输出中找到）
// 格式示例: "aa:bb:cc:dd:ee:ff"
// 第一次运行时先留空字符串 ""，用来扫描发现你的信标
String TARGET_BEACON_MAC = "20:a7:16:60:f9:b9";

// 扫描时间（秒）
const int SCAN_TIME = 3;

// ============ 全局变量 ============
BLEScan* pBLEScan;

// 扫描回调 - 每发现一个设备就调用一次
class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice advertisedDevice) {
        // 获取设备信息
        String mac = advertisedDevice.getAddress().toString().c_str();
        int rssi = advertisedDevice.getRSSI();
        String name = "";
        
        if (advertisedDevice.haveName()) {
            name = advertisedDevice.getName().c_str();
        }

        // 如果没有设置目标信标，打印所有发现的设备（用于第一次找到你的信标）
        if (TARGET_BEACON_MAC == "") {
            Serial.printf("[发现设备] MAC: %s | RSSI: %d dBm", mac.c_str(), rssi);
            if (name != "") {
                Serial.printf(" | 名称: %s", name.c_str());
            }
            Serial.println();
        }
        // 如果设置了目标，只打印目标信标的信息
        else if (mac.equalsIgnoreCase(TARGET_BEACON_MAC)) {
            Serial.printf("[目标信标] RSSI: %d dBm | MAC: %s", rssi, mac.c_str());
            if (name != "") {
                Serial.printf(" | 名称: %s", name.c_str());
            }
            Serial.println();
        }
    }
};

void setup() {
    Serial.begin(115200);
    delay(1000);
    
    Serial.println();
    Serial.println("====================================");
    Serial.println("  ESP32 BLE 信标扫描器 启动");
    Serial.println("====================================");
    
    if (TARGET_BEACON_MAC == "") {
        Serial.println(">>> 模式: 扫描所有设备（请找到你的信标 MAC 地址）");
        Serial.println(">>> 找到后，把 MAC 地址填入代码中的 TARGET_BEACON_MAC");
    } else {
        Serial.printf(">>> 模式: 追踪目标信标 [%s]\n", TARGET_BEACON_MAC.c_str());
    }
    Serial.println("====================================");
    Serial.println();

    // 初始化 BLE
    BLEDevice::init("ESP32_Scanner");
    pBLEScan = BLEDevice::getScan();
    pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
    // 主动扫描可以获取更多信息
    pBLEScan->setActiveScan(true);
    // 扫描间隔和窗口（单位: 0.625ms）
    pBLEScan->setInterval(100);
    pBLEScan->setWindow(99);
}

void loop() {
    Serial.println("--- 开始扫描 ---");
    
    // 执行扫描
    BLEScanResults* foundDevices = pBLEScan->start(SCAN_TIME, false);
    
    int count = foundDevices->getCount();
    Serial.printf("--- 扫描完成，发现 %d 个设备 ---\n\n", count);
    
    // 清除扫描结果释放内存
    pBLEScan->clearResults();
    
    // 等待一小段时间再开始下一轮扫描
    delay(500);
}
