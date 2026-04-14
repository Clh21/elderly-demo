#!/usr/bin/env python3
"""
Samsung Galaxy Watch 8 - Local Loopback Simulator
=================================================
Mimics the exact payload formats sent by the real watch,
but posts them to the local backend API instead.

Target watch: Demo Watch (Simulated) — watch_id = demo-watch-001
Backend endpoint: POST http://localhost:3100/api/samsung-watch?watchId=demo-watch-001

Alert sequence (fires every 2 minutes, cycles through in order):
  1. High heart rate
  2. Low heart rate
  3. High body temperature
  4. Low body temperature
  5. High stress (EDA)
  6. Low stress (EDA)
  7. Fall detection

Temperature behaviour:
  - Normal range : 35.5 – 37.0 degC  (most of the time)
  - Full range   : 34.0 – 39.0 degC
  - When high/low temp alert fires, sensor data is also spiked accordingly
"""

import time
import random
import json
import urllib.request
import urllib.error

# ── Config ──────────────────────────────────────────────────
BACKEND_URL  = "http://localhost:3100/api/samsung-watch"
WATCH_ID     = "demo-watch-001"
URL          = f"{BACKEND_URL}?watchId={WATCH_ID}"
ALERT_URL    = "http://localhost:3100/api"
RESIDENT_ID  = 5       # Demo Patient
ALERT_EVERY  = 120     # seconds between each alert in the sequence

# ── Normal sensor thresholds ─────────────────────────────────
TEMP_HIGH = 37.2   # degC
TEMP_LOW  = 35.5   # degC
HR_HIGH   = 100    # bpm — above this is considered high
HR_LOW    = 55     # bpm — below this is considered low
EDA_HIGH  = 4.0    # uS  — above this is high stress
EDA_LOW   = 0.05   # uS  — below this is low stress

# ── Base values ──────────────────────────────────────────────
HR_BASE   = 75.0
TEMP_BASE = 36.3
AMB_BASE  = 25.0
EDA_BASE  = 0.3

# ── Alert sequence ───────────────────────────────────────────
# Each entry: (alert_type, severity, message, sensor_override)
# sensor_override: dict with optional keys hr_bpm / wrist_temp / eda_value
ALERT_SEQUENCE = [
    (
        "heart_rate", "warning",
        "High heart rate detected (115 bpm)",
        {"hr_bpm": 115}
    ),
    (
        "heart_rate", "warning",
        "Low heart rate detected (42 bpm)",
        {"hr_bpm": 42}
    ),
    (
        "temperature", "warning",
        f"High body temperature detected (wrist: 38.2 degC, normal range: {TEMP_LOW}-{TEMP_HIGH} degC)",
        {"wrist_temp": 38.2}
    ),
    (
        "temperature", "warning",
        f"Low body temperature detected (wrist: 34.8 degC, normal range: {TEMP_LOW}-{TEMP_HIGH} degC)",
        {"wrist_temp": 34.8}
    ),
    (
        "eda", "warning",
        "High stress level detected (EDA: 5.2 uS)",
        {"eda_value": 5.2}
    ),
    (
        "eda", "warning",
        "Low stress level detected (EDA: 0.02 uS) — possible device issue",
        {"eda_value": 0.02}
    ),
    (
        "fall_detection", "critical",
        "Fall detected! Immediate attention required",
        {}
    ),
]


# ── Utilities ────────────────────────────────────────────────
def ms_timestamp():
    return int(time.time() * 1000)


def clamp(value, lo, hi):
    return max(lo, min(hi, value))


def post_json(url: str, payload: dict) -> bool:
    """POST JSON to url. Returns True on success."""
    data = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(
        url,
        data    = data,
        headers = {"Content-Type": "application/json"},
        method  = "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
            return result.get("success", False)
    except urllib.error.URLError as e:
        print(f"  [ERROR] {e.reason}")
        return False
    except Exception:
        return False


def post_alert(alert_type: str, severity: str, message: str) -> bool:
    """Send an alert to the backend."""
    return post_json(
        f"{ALERT_URL}/alerts/create",
        {
            "residentId": RESIDENT_ID,
            "type":       alert_type,
            "severity":   severity,
            "message":    message,
        }
    )


# ── Sensor state ─────────────────────────────────────────────
class SensorState:
    def __init__(self):
        self.hr           = HR_BASE
        self.wrist_temp   = TEMP_BASE
        self.ambient_temp = AMB_BASE
        self.eda          = EDA_BASE
        self.eda_label    = "STABLE"

    def tick_hr(self, override_bpm=None):
        """Random walk heart rate, 45-120 bpm. Override for alert injection."""
        if override_bpm is not None:
            self.hr = float(override_bpm)
        else:
            self.hr += random.gauss(0, 1.5)
            self.hr  = clamp(self.hr, 55, 100)
        return round(self.hr)

    def tick_temp(self, override_wrist=None):
        """
        Normal wrist temp: 35.5-37.0 degC with soft boundaries.
        Override for alert injection.
        """
        if override_wrist is not None:
            self.wrist_temp = float(override_wrist)
        else:
            self.wrist_temp += random.gauss(0, 0.04)
            if self.wrist_temp > 37.0:
                self.wrist_temp -= 0.08
            elif self.wrist_temp < 35.5:
                self.wrist_temp += 0.08
            self.wrist_temp = clamp(self.wrist_temp, 34.0, 39.0)

        self.ambient_temp += random.gauss(0, 0.02)
        self.ambient_temp  = clamp(self.ambient_temp, 15.0, 35.0)
        return round(self.wrist_temp, 6), round(self.ambient_temp, 6)

    def tick_eda(self, override_eda=None):
        """Random walk EDA 0.005-1.5 uS. Override for alert injection."""
        if override_eda is not None:
            self.eda = float(override_eda)
        else:
            if random.random() < 0.03:
                self.eda += random.uniform(0.1, 0.4)
            self.eda += random.gauss(0, 0.02)
            self.eda  = clamp(self.eda, 0.005, 1.5)
        self.eda_label = "VARIABLE" if abs(random.gauss(0, 1)) > 1.8 else "STABLE"
        return round(self.eda, 3), self.eda_label


# ── Payload builders ─────────────────────────────────────────
def build_eda_payload(state: SensorState, override_eda=None):
    conductance, label = state.tick_eda(override_eda)
    ts = ms_timestamp()
    return {
        "timestamp":  ts,
        "sensorType": "eda",
        "eda": {
            "label":            label,
            "validSampleCount": 1,
            "skinConductance":  conductance,
            "sampleTimestamp":  ts - random.randint(50, 200),
        },
    }


def build_heart_rate_payload(state: SensorState, override_bpm=None):
    bpm = state.tick_hr(override_bpm)
    ts  = ms_timestamp()
    return {
        "timestamp":  ts,
        "sensorType": "heart_rate",
        "heartRate": {
            "bpm":             bpm,
            "status":          1,
            "sampleTimestamp": ts - random.randint(5000, 30000),
        },
    }


def build_temperature_payload(state: SensorState, override_wrist=None):
    wrist, ambient = state.tick_temp(override_wrist)
    ts = ms_timestamp()
    return {
        "timestamp":  ts,
        "sensorType": "temperature",
        "temperature": {
            "wristSkinTemperature": wrist,
            "ambientTemperature":   ambient,
            "status":               "SUCCESSFUL_MEASUREMENT",
        },
    }


def build_wear_state_payload(is_worn: bool):
    return {
        "timestamp": ms_timestamp(),
        "event":     "wear_state",
        "isWorn":    is_worn,
        "state":     "WORN" if is_worn else "UNWORN",
    }


# ── Main simulation loop ──────────────────────────────────────
def main():
    print("="*60)
    print(" Samsung Galaxy Watch 8 — Local Loopback Simulator")
    print(f" Target : {URL}")
    print(f" Watch  : {WATCH_ID}")
    print("="*60)
    print(" Sensor rates : EDA / Heart Rate / Temperature every 1 second")
    print(f" Alert sequence: fires every {ALERT_EVERY}s, cycles through 7 types")
    print(f" Normal wrist range: {TEMP_LOW}-{TEMP_HIGH} degC")
    print(" Press Ctrl+C to stop.")
    print("="*60)
    print(" Alert order:")
    for i, (t, s, m, _) in enumerate(ALERT_SEQUENCE, 1):
        print(f"   {i}. [{s.upper()}] {t} — {m}")
    print("="*60)

    state = SensorState()

    # Send initial wear state
    print("\n[WEAR ] Sending initial WORN state...")
    post_json(URL, build_wear_state_payload(True))

    tick           = 0
    alert_index    = 0       # which alert fires next
    last_alert_t   = time.time()  # time of last alert

    try:
        while True:
            tick += 1
            now  = time.time()

            # ── Check if it's time to fire the next alert ────
            override = {}  # sensor overrides for this tick
            if now - last_alert_t >= ALERT_EVERY:
                alert_type, severity, message, sensor_override = \
                    ALERT_SEQUENCE[alert_index % len(ALERT_SEQUENCE)]
                override       = sensor_override
                alert_index   += 1
                last_alert_t   = now

                print(f"\n{'!'*60}")
                print(f"[ALERT #{alert_index}] {severity.upper()} — {alert_type}")
                print(f"  {message}")
                print(f"{'!'*60}\n")

                ok_alert = post_alert(alert_type, severity, message)
                print(f"[ALERT] Sent to backend: {'OK' if ok_alert else 'FAIL'}")

            # ── EDA ─────────────────────────────────────────
            payload = build_eda_payload(state, override.get('eda_value'))
            ok = post_json(URL, payload)
            eda_val = payload['eda']['skinConductance']
            eda_tag = ""
            if eda_val > EDA_HIGH:
                eda_tag = " *** HIGH STRESS ***"
            elif eda_val < EDA_LOW:
                eda_tag = " *** LOW STRESS ***"
            print(
                f"[EDA  ] tick={tick:04d} "
                f"conductance={eda_val:.3f} uS "
                f"label={payload['eda']['label']:<8}"
                f"{eda_tag} "
                f"{'OK' if ok else 'FAIL'}"
            )

            # ── Heart Rate ───────────────────────────────────
            payload = build_heart_rate_payload(state, override.get('hr_bpm'))
            ok = post_json(URL, payload)
            bpm = payload['heartRate']['bpm']
            hr_tag = ""
            if bpm > HR_HIGH:
                hr_tag = " *** HIGH ***"
            elif bpm < HR_LOW:
                hr_tag = " *** LOW ***"
            print(
                f"[HR   ] tick={tick:04d} "
                f"bpm={bpm}"
                f"{hr_tag} "
                f"{'OK' if ok else 'FAIL'}"
            )

            # ── Temperature ──────────────────────────────────
            payload = build_temperature_payload(state, override.get('wrist_temp'))
            ok = post_json(URL, payload)
            wrist = payload['temperature']['wristSkinTemperature']
            if wrist > TEMP_HIGH:
                temp_tag = f" *** HIGH (>{TEMP_HIGH} degC) ***"
            elif wrist < TEMP_LOW:
                temp_tag = f" *** LOW (<{TEMP_LOW} degC) ***"
            else:
                temp_tag = " [normal]"
            print(
                f"[TEMP ] tick={tick:04d} "
                f"wrist={wrist:.5f} degC"
                f"{temp_tag} "
                f"{'OK' if ok else 'FAIL'}"
            )

            time.sleep(1)

    except KeyboardInterrupt:
        print("\n[STOP ] Simulator stopped by user.")
        post_json(URL, build_wear_state_payload(False))
        print("[WEAR ] Sent UNWORN state. Bye!")


if __name__ == "__main__":
    main()
