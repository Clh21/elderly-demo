/*
 * ESP32 scanner for the Samsung watch iBeacon.
 *
 * Expected watch values:
 * UUID:  8f0a5a8c-6c3a-4c4f-9e2b-2c9c9f3c9e10
 * Major: 1
 * Minor: 1
 */

#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEScan.h>

static const uint8_t TARGET_IBEACON_UUID[16] = {
    0x8F, 0x0A, 0x5A, 0x8C, 0x6C, 0x3A, 0x4C, 0x4F,
    0x9E, 0x2B, 0x2C, 0x9C, 0x9F, 0x3C, 0x9E, 0x10
};
static const uint16_t TARGET_IBEACON_MAJOR = 1;
static const uint16_t TARGET_IBEACON_MINOR = 1;
static const int SCAN_TIME_SECONDS = 3;

BLEScan* pBLEScan;

bool parseTargetIBeacon(
    BLEAdvertisedDevice& device,
    uint16_t& major,
    uint16_t& minor,
    int8_t& measuredPower
) {
    if (!device.haveManufacturerData()) return false;

    String manufacturerData = device.getManufacturerData();
    if (manufacturerData.length() < 25) return false;

    const uint8_t* payload =
        reinterpret_cast<const uint8_t*>(manufacturerData.c_str());

    if (payload[0] != 0x4C || payload[1] != 0x00 ||
        payload[2] != 0x02 || payload[3] != 0x15) {
        return false;
    }

    if (memcmp(payload + 4, TARGET_IBEACON_UUID, sizeof(TARGET_IBEACON_UUID)) != 0) {
        return false;
    }

    major = (static_cast<uint16_t>(payload[20]) << 8) | payload[21];
    minor = (static_cast<uint16_t>(payload[22]) << 8) | payload[23];
    measuredPower = static_cast<int8_t>(payload[24]);

    return major == TARGET_IBEACON_MAJOR && minor == TARGET_IBEACON_MINOR;
}

class WatchScanCallbacks : public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice device) {
        uint16_t major = 0;
        uint16_t minor = 0;
        int8_t measuredPower = 0;
        if (!parseTargetIBeacon(device, major, minor, measuredPower)) return;

        Serial.printf(
            "[WATCH] RSSI=%d dBm | major=%u | minor=%u | power=%d | MAC=%s\n",
            device.getRSSI(),
            major,
            minor,
            measuredPower,
            device.getAddress().toString().c_str()
        );
    }
};

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println();
    Serial.println("ESP32 Samsung watch iBeacon scanner");
    Serial.printf(
        "Target: major=%u, minor=%u\n",
        TARGET_IBEACON_MAJOR,
        TARGET_IBEACON_MINOR
    );

    BLEDevice::init("ESP32_Scanner");
    pBLEScan = BLEDevice::getScan();
    pBLEScan->setAdvertisedDeviceCallbacks(new WatchScanCallbacks(), true);
    pBLEScan->setActiveScan(false);
    pBLEScan->setInterval(100);
    pBLEScan->setWindow(99);
}

void loop() {
    Serial.println("[BLE] Scanning...");
    pBLEScan->start(SCAN_TIME_SECONDS, false);
    pBLEScan->clearResults();
    delay(500);
}
