#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fake pressure-sensor switch for demo / integration testing.

This script acts as a software stand-in for real pressure mats under
furniture (sofa, bed, toilet). It publishes MQTT messages on the same
topic pattern the indoor positioning server expects:

    indoor/pressure/{location}/state

Payload:
    {
        "location": "sofa",
        "occupied": true,
        "raw_adc": 3500,
        "weight_kg": 50.0
    }

Run with GUI (default):
    python fake_pressure_switch.py

Run CLI-only:
    python fake_pressure_switch.py --cli

Press Ctrl+C or close the window to exit. All occupied sensors are
cleared on exit so the backend does not keep a stale override.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import threading
import time
from typing import Dict, Optional

import paho.mqtt.client as mqtt

try:
    from positioning_config import (
        FURNITURE,
        MQTT_BROKER,
        MQTT_PASSWORD,
        MQTT_PORT,
        MQTT_USERNAME,
    )
except ImportError:
    # Allow running from a different directory.
    sys.path.insert(0, __import__("os").path.dirname(__file__))
    from positioning_config import (
        FURNITURE,
        MQTT_BROKER,
        MQTT_PASSWORD,
        MQTT_PORT,
        MQTT_USERNAME,
    )


class FakePressureSwitch:
    def __init__(self) -> None:
        self.states: Dict[str, bool] = {loc: False for loc in FURNITURE}
        self.lock = threading.Lock()

        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="fake_pressure_switch",
        )
        if MQTT_USERNAME:
            self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect

        print(f"[MQTT] Connecting to {MQTT_BROKER}:{MQTT_PORT} ...")
        self.client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        self.client.loop_start()

        # Heartbeat keeps an "occupied" override alive while the switch is on.
        # The server gives a 3-second grace period per occupied message.
        self._heartbeat_active = True
        self._heartbeat_thread = threading.Thread(target=self._heartbeat_loop, daemon=True)
        self._heartbeat_thread.start()

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            print("[MQTT] Connected")
        else:
            print(f"[MQTT] Connection failed: rc={reason_code}")

    def _on_disconnect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code != 0:
            print(f"[MQTT] Disconnected unexpectedly: rc={reason_code}")

    def _make_payload(self, location: str, occupied: bool) -> dict:
        cfg = FURNITURE.get(location, {})
        threshold = int(cfg.get("threshold_adc", 3000))
        weight = float(cfg.get("calibration_weight_kg", 50.0))

        if occupied:
            # Slightly above threshold so it looks like a real person sitting/lying.
            raw_adc = threshold + random.randint(200, 800)
            weight_kg = weight + random.uniform(-2.0, 2.0)
        else:
            raw_adc = 0
            weight_kg = 0.0

        return {
            "location": location,
            "occupied": occupied,
            "raw_adc": raw_adc,
            "weight_kg": round(weight_kg, 1),
        }

    def publish(self, location: str, occupied: bool) -> None:
        topic = f"indoor/pressure/{location}/state"
        payload = json.dumps(self._make_payload(location, occupied))
        self.client.publish(topic, payload, qos=0)
        status = "OCCUPIED" if occupied else "vacant"
        print(f"[SWITCH] {location:10s} -> {status} | {payload}")

    def set_state(self, location: str, occupied: bool) -> None:
        with self.lock:
            self.states[location] = occupied
        self.publish(location, occupied)

    def toggle(self, location: str) -> bool:
        with self.lock:
            new_state = not self.states[location]
            self.states[location] = new_state
        self.publish(location, new_state)
        return new_state

    def all_off(self) -> None:
        with self.lock:
            locations = list(self.states.keys())
        for loc in locations:
            self.set_state(loc, False)

    def _heartbeat_loop(self) -> None:
        while self._heartbeat_active:
            time.sleep(1.0)
            with self.lock:
                active = [loc for loc, on in self.states.items() if on]
            for loc in active:
                self.publish(loc, True)

    def stop(self) -> None:
        print("\n[SYS] Clearing all pressure overrides...")
        self._heartbeat_active = False
        self.all_off()
        time.sleep(0.2)
        self.client.loop_stop()
        self.client.disconnect()


def run_cli(switch: FakePressureSwitch) -> None:
    locations = list(FURNITURE.keys())
    if not locations:
        print("[ERR] No furniture configured in positioning_config.py")
        return

    print("\nFake pressure sensor CLI")
    print("-" * 30)
    for i, loc in enumerate(locations, start=1):
        print(f"  {i}. {loc}")
    print("  0. Turn all off")
    print("  q. Quit")
    print("-" * 30)

    try:
        while True:
            choice = input("Toggle (number/q): ").strip().lower()
            if choice == "q":
                break
            if choice == "0":
                switch.all_off()
                continue
            try:
                idx = int(choice) - 1
                if 0 <= idx < len(locations):
                    new_state = switch.toggle(locations[idx])
                    print(f"  -> {'ON' if new_state else 'OFF'}")
                else:
                    print("  Invalid choice")
            except ValueError:
                print("  Invalid input")
    except (KeyboardInterrupt, EOFError):
        pass


def run_gui(switch: FakePressureSwitch) -> None:
    import tkinter as tk
    from tkinter import ttk

    root = tk.Tk()
    root.title("Fake Pressure Sensor Switch")
    root.geometry("360x220")
    root.resizable(False, False)

    style = ttk.Style()
    style.configure("TButton", font=("Microsoft YaHei", 12))

    ttk.Label(
        root,
        text="模拟压力传感器开关",
        font=("Microsoft YaHei", 14, "bold"),
    ).pack(pady=10)

    buttons: Dict[str, tk.Button] = {}

    def refresh_button(loc: str) -> None:
        on = switch.states[loc]
        btn = buttons[loc]
        if on:
            btn.config(text=f"{loc}: ON", bg="#4CAF50", fg="white")
        else:
            btn.config(text=f"{loc}: OFF", bg="#f0f0f0", fg="black")

    def on_toggle(loc: str) -> None:
        switch.toggle(loc)
        refresh_button(loc)

    frame = ttk.Frame(root)
    frame.pack(pady=5)

    for loc in FURNITURE:
        btn = tk.Button(
            frame,
            text=f"{loc}: OFF",
            width=18,
            height=2,
            command=lambda l=loc: on_toggle(l),
        )
        btn.pack(pady=4)
        buttons[loc] = btn

    def on_all_off() -> None:
        switch.all_off()
        for loc in FURNITURE:
            refresh_button(loc)

    ttk.Button(root, text="全部关闭 (All Off)", command=on_all_off).pack(pady=10)

    def on_close() -> None:
        switch.stop()
        root.destroy()

    root.protocol("WM_DELETE_WINDOW", on_close)

    try:
        root.mainloop()
    except KeyboardInterrupt:
        on_close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Fake pressure sensor switch")
    parser.add_argument("--cli", action="store_true", help="Use command-line interface")
    args = parser.parse_args()

    switch = FakePressureSwitch()

    try:
        if args.cli:
            run_cli(switch)
        else:
            run_gui(switch)
    finally:
        switch.stop()


if __name__ == "__main__":
    main()
