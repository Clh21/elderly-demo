/*
 * ESP32 Samsung watch iBeacon RSSI collector with Kalman filtering.
 *
 * Serial output:
 * timestamp_ms,raw_rssi,filtered_rssi
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

float kalman_x = -70.0;
float kalman_p = 10.0;
float kalman_q = 0.5;
float kalman_r = 8.0;
float kalman_k = 0.0;

static const int SCAN_TIME_SECONDS = 1;

BLEScan* pBLEScan;
int latestRSSI = 0;
bool beaconFound = false;

float kalmanFilter(float measurement) {
    kalman_p += kalman_q;
    kalman_k = kalman_p / (kalman_p + kalman_r);
    kalman_x = kalman_x + kalman_k * (measurement - kalman_x);
    kalman_p = (1.0 - kalman_k) * kalman_p;
    return kalman_x;
}

bool isTargetIBeacon(BLEAdvertisedDevice& device) {
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

    const uint16_t major =
        (static_cast<uint16_t>(payload[20]) << 8) | payload[21];
    const uint16_t minor =
        (static_cast<uint16_t>(payload[22]) << 8) | payload[23];

    return major == TARGET_IBEACON_MAJOR && minor == TARGET_IBEACON_MINOR;
}

class WatchCallbacks : public BLEAdvertisedDeviceCallbacks {
    void onResult(BLEAdvertisedDevice device) {
        if (!isTargetIBeacon(device)) return;

        latestRSSI = device.getRSSI();
        beaconFound = true;
    }
};

void setup() {
    Serial.begin(115200);
    delay(1000);

    Serial.println("Samsung watch iBeacon RSSI + Kalman filter");
    Serial.printf(
        "Target: major=%u, minor=%u\n",
        TARGET_IBEACON_MAJOR,
        TARGET_IBEACON_MINOR
    );
    Serial.println("timestamp_ms,raw_rssi,filtered_rssi");

    BLEDevice::init("ESP32_Scanner");
    pBLEScan = BLEDevice::getScan();
    pBLEScan->setAdvertisedDeviceCallbacks(new WatchCallbacks(), true);
    pBLEScan->setActiveScan(false);
    pBLEScan->setInterval(100);
    pBLEScan->setWindow(99);
}

void loop() {
    beaconFound = false;
    pBLEScan->start(SCAN_TIME_SECONDS, false);

    if (beaconFound) {
        const float filtered = kalmanFilter(static_cast<float>(latestRSSI));
        Serial.printf("%lu,%d,%.1f\n", millis(), latestRSSI, filtered);
    } else {
        Serial.printf("%lu,LOST,LOST\n", millis());
    }

    pBLEScan->clearResults();
    delay(200);
}
