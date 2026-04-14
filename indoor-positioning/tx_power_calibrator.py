"""Estimate per-anchor tx_power from live MQTT RSSI samples.

Usage example (recommended):
  python tx_power_calibrator.py --anchor anchor_01 --duration 45 --distance 1.0

Run once for each anchor:
  1) Keep only one anchor close to the tag at known distance.
  2) Keep line-of-sight and reduce body blocking.
  3) Use the printed tx_power value in positioning_config.ANCHORS[anchor_id].
"""

from __future__ import annotations

import argparse
import json
import math
import time
from collections import defaultdict
from statistics import mean, median, pstdev
from typing import Dict, List

import paho.mqtt.client as mqtt

from positioning_config import (
    ANCHORS,
    MQTT_BROKER,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_RSSI_TOPIC,
    MQTT_USERNAME,
    PATH_LOSS_EXPONENT,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Calibrate tx_power for BLE anchors")
    parser.add_argument(
        "--anchor",
        type=str,
        default="",
        help="Anchor id to calibrate (e.g. anchor_01). Empty means collect all anchors.",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=45.0,
        help="Sampling duration in seconds (recommended 30-60).",
    )
    parser.add_argument(
        "--distance",
        type=float,
        default=1.0,
        help="Known anchor-tag distance in meters during sampling.",
    )
    parser.add_argument(
        "--use-raw",
        action="store_true",
        help="Use raw RSSI instead of filtered RSSI.",
    )
    parser.add_argument(
        "--n",
        type=float,
        default=PATH_LOSS_EXPONENT,
        help="Path-loss exponent used to back-calculate tx_power.",
    )
    parser.add_argument(
        "--min-samples",
        type=int,
        default=15,
        help="Minimum samples required to report a reliable result.",
    )
    return parser.parse_args()


def estimate_tx_power(avg_rssi: float, distance_m: float, path_loss_n: float) -> float:
    # d = 10 ^ ((tx - rssi) / (10*n)) -> tx = rssi + 10*n*log10(d)
    return avg_rssi + (10.0 * path_loss_n * math.log10(max(distance_m, 1e-6)))


def main() -> None:
    args = parse_args()
    target_anchor = args.anchor.strip()
    source_field = "raw" if args.use_raw else "filtered"

    if target_anchor and target_anchor not in ANCHORS:
        print(f"[ERR] Unknown anchor: {target_anchor}")
        print(f"[INFO] Available anchors: {list(ANCHORS.keys())}")
        return

    if args.duration <= 0:
        print("[ERR] --duration must be > 0")
        return

    if args.distance <= 0:
        print("[ERR] --distance must be > 0")
        return

    samples: Dict[str, List[float]] = defaultdict(list)
    connected = False

    def on_connect(client, userdata, flags, reason_code, properties=None):
        nonlocal connected
        if reason_code == 0:
            connected = True
            client.subscribe(MQTT_RSSI_TOPIC)
            print(f"[MQTT] Connected to {MQTT_BROKER}:{MQTT_PORT}")
            print(f"[MQTT] Subscribed: {MQTT_RSSI_TOPIC}")
        else:
            print(f"[ERR] MQTT connect failed: rc={reason_code}")

    def on_message(client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except json.JSONDecodeError:
            return

        topic_anchor = msg.topic.split("/")[2] if msg.topic.count("/") >= 3 else ""
        anchor_id = str(payload.get("anchor") or topic_anchor)
        if not anchor_id:
            return

        if target_anchor and anchor_id != target_anchor:
            return

        if source_field in payload:
            value = float(payload[source_field])
        elif "raw" in payload:
            value = float(payload["raw"])
        else:
            return

        samples[anchor_id].append(value)

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="tx_power_calibrator",
    )
    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_start()

    print("=" * 60)
    print("TX POWER CALIBRATION")
    print(f"[INFO] Source RSSI field: {source_field}")
    print(f"[INFO] Anchor filter: {target_anchor or 'ALL'}")
    print(f"[INFO] Duration: {args.duration:.1f}s")
    print(f"[INFO] Distance: {args.distance:.2f}m")
    print(f"[INFO] Path-loss exponent n: {args.n:.2f}")
    print("=" * 60)

    start = time.time()
    next_report = start + 2.0

    try:
        while time.time() - start < args.duration:
            now = time.time()
            if now >= next_report:
                counts = {k: len(v) for k, v in samples.items()}
                if counts:
                    print(f"[LIVE] sample counts: {counts}")
                else:
                    print("[LIVE] waiting for RSSI messages...")
                next_report = now + 2.0
            time.sleep(0.05)
    finally:
        client.loop_stop()
        client.disconnect()

    if not connected:
        print("[ERR] MQTT was not connected. Please check broker status.")
        return

    print("\n" + "=" * 60)
    print("CALIBRATION RESULT")
    print("=" * 60)

    if not samples:
        print("[ERR] No samples collected.")
        return

    for anchor_id in sorted(samples.keys()):
        values = samples[anchor_id]
        count = len(values)
        avg = mean(values)
        med = median(values)
        std = pstdev(values) if count > 1 else 0.0
        tx_est = estimate_tx_power(avg, args.distance, args.n)

        quality = "OK" if count >= args.min_samples else "LOW_SAMPLES"
        print(f"Anchor: {anchor_id}")
        print(f"  samples: {count} ({quality})")
        print(f"  mean_rssi:   {avg:.2f} dBm")
        print(f"  median_rssi: {med:.2f} dBm")
        print(f"  std_rssi:    {std:.2f} dBm")
        print(f"  suggested tx_power: {tx_est:.2f} dBm")

        if anchor_id in ANCHORS:
            x = float(ANCHORS[anchor_id]["x"])
            y = float(ANCHORS[anchor_id]["y"])
            print("  paste into positioning_config.ANCHORS:")
            print(
                f"    \"{anchor_id}\": {{\"x\": {x}, \"y\": {y}, \"tx_power\": {tx_est:.2f}}},"
            )

    print("\n[TIP] Run this once per anchor (anchor_01, anchor_02, anchor_03).")
    print("[TIP] At 1.0m distance, tx_power is usually close to the measured mean RSSI.")


if __name__ == "__main__":
    main()
