#!/usr/bin/env python3
"""
Samsung Galaxy Watch 8 - Local Loopback Simulator
=================================================
Mimics the exact payload formats sent by the real watch,
but posts them to the local backend API instead.

Target watch: Demo Watch (Simulated) — watch_id = demo-watch-001
Backend endpoint: POST http://localhost:3001/api/samsung-watch?watchId=demo-watch-001

Temperature behaviour:
  - Normal range : 35.5 – 37.0 °C  (most of the time)
  - Full range   : 34.0 – 39.0 °C
  - Every 2 min  : inject one abnormal reading (high >37.2 or low <35.5)
  - Alert fired automatically when abnormal temp is detected
"""

import time
import random
import json
import urllib.request
import urllib.error

# ── Config ──────────────────────────────────────────────────
BACKEND_URL = "http://localhost:3001/api/samsung-watch"
WATCH_ID    = "demo-watch-001"
URL         = f"{BACKEND_URL}?watchId={WATCH_ID}"
ALERT_URL   = "http://localhost:3001/api"

# ── Thresholds ───────────────────────────────────────────────
TEMP_HIGH      = 37.2   # °C — above this: high temp alert
TEMP_LOW       = 35.5   # °C — below this: low temp alert
ABNORMAL_EVERY = 120    # seconds between injected abnormal readings

# ── Base values ──────────────────────────────────────────────
HR_BASE   = 75.0
TEMP_BASE = 36.3
AMB_BASE  = 25.0
EDA_BASE  = 0.3

RESIDENT_ID = 5  # Demo Patient


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
        # Abnormal temp injection state
        self.injecting_abnormal = False
        self.abnormal_target    = None
        self.abnormal_ticks     = 0

    def tick_hr(self):
        """Random walk heart rate, 45–120 bpm."""
        self.hr += random.gauss(0, 1.5)
        self.hr  = clamp(self.hr, 45, 120)
        return round(self.hr)

    def tick_temp(self, force_abnormal: str = None):
        """
        Generate wrist temperature.
        - Normal: random walk around 36.3°C, stays in 35.5–37.0°C most of the time
        - force_abnormal='high': inject a high temp reading (37.3–39.0°C)
        - force_abnormal='low' : inject a low temp reading (34.0–35.4°C)
        Returns (wrist_temp, ambient_temp)
        """
        if force_abnormal == 'high':
            # Spike to high abnormal range
            self.wrist_temp = random.uniform(37.3, 39.0)
        elif force_abnormal == 'low':
            # Drop to low abnormal range
            self.wrist_temp = random.uniform(34.0, 35.4)
        else:
            # Normal random walk — biased to stay in 35.5–37.0
            self.wrist_temp += random.gauss(0, 0.04)
            # Soft boundary: gently pull back toward 36.3 if drifting out
            if self.wrist_temp > 37.0:
                self.wrist_temp -= 0.08
            elif self.wrist_temp < 35.5:
                self.wrist_temp += 0.08
            self.wrist_temp = clamp(self.wrist_temp, 34.0, 39.0)

        self.ambient_temp += random.gauss(0, 0.02)
        self.ambient_temp  = clamp(self.ambient_temp, 15.0, 35.0)
        return round(self.wrist_temp, 6), round(self.ambient_temp, 6)

    def tick_eda(self):
        """Random walk EDA, 0.005–1.5 μS."""
        if random.random() < 0.03:
            self.eda += random.uniform(0.1, 0.4)
        self.eda += random.gauss(0, 0.02)
        self.eda  = clamp(self.eda, 0.005, 1.5)
        self.eda_label = "VARIABLE" if abs(random.gauss(0, 1)) > 1.8 else "STABLE"
        return round(self.eda, 3), self.eda_label


# ── Payload builders ─────────────────────────────────────────
def build_eda_payload(state: SensorState):
    conductance, label = state.tick_eda()
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


def build_heart_rate_payload(state: SensorState):
    bpm = state.tick_hr()
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


def build_temperature_payload(state: SensorState, force_abnormal: str = None):
    wrist, ambient = state.tick_temp(force_abnormal)
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
    print(" Rates:")
    print("   EDA          every 1 second")
    print("   Heart Rate   every 1 second")
    print("   Temperature  every 1 second")
    print(f"  Abnormal temp injected every {ABNORMAL_EVERY}s (alternates high/low)")
    print(f"  Normal wrist range: {TEMP_LOW}\u2013{TEMP_HIGH}\u00b0C")
    print(" Press Ctrl+C to stop.")
    print("="*60)

    state = SensorState()

    # Send initial wear state
    print("\n[WEAR ] Sending initial WORN state...")
    post_json(URL.replace("/api/samsung-watch", "").replace(BACKEND_URL, URL),
              build_wear_state_payload(True))
    post_json(URL, build_wear_state_payload(True))

    tick            = 0
    last_alert      = {'temp': None}   # throttle: 'high' | 'low' | None
    last_abnormal_t = time.time()      # time of last abnormal injection
    abnormal_cycle  = 0                # alternates: 0=high, 1=low

    try:
        while True:
            tick += 1
            now  = time.time()

            # ── Decide if this tick injects abnormal temp ────
            force_abnormal = None
            if now - last_abnormal_t >= ABNORMAL_EVERY:
                force_abnormal   = 'high' if abnormal_cycle % 2 == 0 else 'low'
                abnormal_cycle  += 1
                last_abnormal_t  = now
                print(f"\n{'!'*50}")
                print(f"[INJECT] Abnormal temperature: {force_abnormal.upper()}")
                print(f"{'!'*50}\n")

            # ── EDA ─────────────────────────────────────────
            payload = build_eda_payload(state)
            ok = post_json(URL, payload)
            print(
                f"[EDA  ] tick={tick:04d} "
                f"conductance={payload['eda']['skinConductance']:.3f} \u03bcS "
                f"label={payload['eda']['label']:<8} "
                f"{'OK' if ok else 'FAIL'}"
            )

            # ── Heart Rate ───────────────────────────────────
            payload = build_heart_rate_payload(state)
            ok = post_json(URL, payload)
            print(
                f"[HR   ] tick={tick:04d} "
                f"bpm={payload['heartRate']['bpm']} "
                f"{'OK' if ok else 'FAIL'}"
            )

            # ── Temperature ──────────────────────────────────
            payload = build_temperature_payload(state, force_abnormal)
            ok = post_json(URL, payload)
            wrist = payload['temperature']['wristSkinTemperature']

            # Determine status tag for display
            if wrist > TEMP_HIGH:
                status_tag = f"HIGH (>{TEMP_HIGH}\u00b0C) *** ALERT ***"
            elif wrist < TEMP_LOW:
                status_tag = f"LOW (<{TEMP_LOW}\u00b0C) *** ALERT ***"
            else:
                status_tag = "normal"

            print(
                f"[TEMP ] tick={tick:04d} "
                f"wrist={wrist:.5f}\u00b0C "
                f"ambient={payload['temperature']['ambientTemperature']:.5f}\u00b0C "
                f"[{status_tag}] "
                f"{'OK' if ok else 'FAIL'}"
            )

            # ── Temperature alert ────────────────────────────
            if wrist > TEMP_HIGH and last_alert.get('temp') != 'high':
                last_alert['temp'] = 'high'
                msg = (
                    f"High body temperature detected "
                    f"(wrist: {wrist:.1f}\u00b0C, "
                    f"normal range: {TEMP_LOW}\u2013{TEMP_HIGH}\u00b0C)"
                )
                ok_alert = post_alert("temperature", "warning", msg)
                print(f"[ALERT] >>> HIGH TEMP ALERT SENT: {msg} {'OK' if ok_alert else 'FAIL'}")

            elif wrist < TEMP_LOW and last_alert.get('temp') != 'low':
                last_alert['temp'] = 'low'
                msg = (
                    f"Low body temperature detected "
                    f"(wrist: {wrist:.1f}\u00b0C, "
                    f"normal range: {TEMP_LOW}\u2013{TEMP_HIGH}\u00b0C)"
                )
                ok_alert = post_alert("temperature", "warning", msg)
                print(f"[ALERT] >>> LOW TEMP ALERT SENT: {msg} {'OK' if ok_alert else 'FAIL'}")

            elif TEMP_LOW <= wrist <= TEMP_HIGH:
                last_alert['temp'] = None  # reset when back to normal

            time.sleep(1)

    except KeyboardInterrupt:
        print("\n[STOP ] Simulator stopped by user.")
        post_json(URL, build_wear_state_payload(False))
        print("[WEAR ] Sent UNWORN state. Bye!")


if __name__ == "__main__":
    main()
