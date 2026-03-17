#!/usr/bin/env python3
"""
Samsung Galaxy Watch 8 - Local Loopback Simulator
=================================================
Mimics the exact payload formats sent by the real watch,
but posts them to the local backend API instead.

Target watch: Demo Watch (Simulated) — watch_id = demo-watch-001
Backend endpoint: POST http://localhost:3001/api/samsung-watch?watchId=demo-watch-001

Data rates (matching real watch behaviour observed in watch_payloads.jsonl):
  EDA         — every ~1 second
  Heart Rate  — every ~3-5 minutes
  Temperature — every ~1 minute
  Wear State  — on state change only
"""

import time
import random
import json
import math
import urllib.request
import urllib.error
from datetime import datetime

# ── Config ──────────────────────────────────────────────────
BACKEND_URL = "http://localhost:3001/api/samsung-watch"
WATCH_ID    = "demo-watch-001"
URL         = f"{BACKEND_URL}?watchId={WATCH_ID}"

# ── Realistic base values (matching real watch ranges in JSONL) ──
HR_BASE   = 75.0    # bpm
TEMP_BASE = 33.0    # °C  (wrist skin temperature)
AMB_BASE  = 31.0    # °C  (ambient temperature)
EDA_BASE  = 0.3     # μS  (skin conductance)


# ── Helpers ──────────────────────────────────────────────────
def ms_timestamp():
    """Current time as milliseconds epoch (matches watch timestamp field)."""
    return int(time.time() * 1000)


def post_payload(payload: dict):
    """POST a payload dict to the backend. Returns True on success."""
    data = json.dumps(payload).encode("utf-8")
    req  = urllib.request.Request(
        URL,
        data    = data,
        headers = {"Content-Type": "application/json"},
        method  = "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
            return result.get("success", False)
    except urllib.error.URLError as e:
        print(f"  [ERROR] Could not reach backend: {e.reason}")
        return False


def clamp(value, lo, hi):
    return max(lo, min(hi, value))


# ── Sensor state (persisted across ticks for realistic drift) ──
class SensorState:
    def __init__(self):
        self.hr           = HR_BASE
        self.wrist_temp   = TEMP_BASE
        self.ambient_temp = AMB_BASE
        self.eda          = EDA_BASE
        self.is_worn      = True
        self.eda_label    = "STABLE"

    def tick_hr(self):
        """Random walk heart rate, 45–120 bpm."""
        self.hr += random.gauss(0, 2)
        self.hr  = clamp(self.hr, 45, 120)
        return round(self.hr)

    def tick_temp(self):
        """Random walk temperatures."""
        self.wrist_temp   += random.gauss(0, 0.05)
        self.ambient_temp += random.gauss(0, 0.03)
        self.wrist_temp    = clamp(self.wrist_temp,   28.0, 38.5)
        self.ambient_temp  = clamp(self.ambient_temp, 20.0, 36.0)
        return round(self.wrist_temp, 6), round(self.ambient_temp, 6)

    def tick_eda(self):
        """Random walk EDA with occasional spikes, 0.005–1.5 μS."""
        # Occasional spike
        if random.random() < 0.03:
            self.eda += random.uniform(0.1, 0.4)
        self.eda += random.gauss(0, 0.02)
        self.eda  = clamp(self.eda, 0.005, 1.5)
        # Label: STABLE most of the time, VARIABLE when changing fast
        self.eda_label = "VARIABLE" if abs(random.gauss(0, 1)) > 1.8 else "STABLE"
        return round(self.eda, 3), self.eda_label


# ── Payload builders (exact format from watch_payloads.jsonl) ──
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


def build_temperature_payload(state: SensorState):
    wrist, ambient = state.tick_temp()
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
    print("   Heart Rate   every 3 minutes")
    print("   Temperature  every 1 minute")
    print(" Press Ctrl+C to stop.")
    print("="*60)

    state = SensorState()

    # Send initial wear state
    print("\n[WEAR ] Sending initial WORN state...")
    post_payload(build_wear_state_payload(True))

    last_hr_time   = 0
    last_temp_time = 0
    tick           = 0

    try:
        while True:
            now = time.time()
            tick += 1

            # ── EDA: every tick (1 second) ──────────────────
            payload = build_eda_payload(state)
            ok = post_payload(payload)
            print(
                f"[EDA  ] tick={tick:04d} "
                f"conductance={payload['eda']['skinConductance']:.3f} μS "
                f"label={payload['eda']['label']:<8} "
                f"{'OK' if ok else 'FAIL'}"
            )

            # ── Heart Rate: every 3 minutes ─────────────────
            if now - last_hr_time >= 180:
                payload = build_heart_rate_payload(state)
                ok = post_payload(payload)
                print(
                    f"[HR   ] bpm={payload['heartRate']['bpm']} "
                    f"{'OK' if ok else 'FAIL'}"
                )
                last_hr_time = now

            # ── Temperature: every 1 minute ─────────────────
            if now - last_temp_time >= 60:
                payload = build_temperature_payload(state)
                ok = post_payload(payload)
                print(
                    f"[TEMP ] wrist={payload['temperature']['wristSkinTemperature']:.5f}°C "
                    f"ambient={payload['temperature']['ambientTemperature']:.5f}°C "
                    f"{'OK' if ok else 'FAIL'}"
                )
                last_temp_time = now

            time.sleep(1)

    except KeyboardInterrupt:
        print("\n[STOP ] Simulator stopped by user.")
        # Send UNWORN state on exit
        post_payload(build_wear_state_payload(False))
        print("[WEAR ] Sent UNWORN state. Bye!")


if __name__ == "__main__":
    main()
