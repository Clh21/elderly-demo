"""Sample and summarize indoor position at a fixed point.

Usage:
  python position_point_sampler.py
Then keep the target still for ~20 seconds and press Ctrl+C.
"""

from __future__ import annotations

import json
import time
from datetime import datetime
from typing import List, Tuple

import numpy as np
import paho.mqtt.client as mqtt

from positioning_config import (
    MQTT_BROKER,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_POSITION_TOPIC,
    MQTT_USERNAME,
)


samples: List[Tuple[float, float]] = []
start_time = time.time()


def summarize() -> None:
    if not samples:
        print("No samples collected.")
        return

    arr = np.array(samples, dtype=float)
    xs = arr[:, 0]
    ys = arr[:, 1]

    mean_x = float(np.mean(xs))
    mean_y = float(np.mean(ys))
    median_x = float(np.median(xs))
    median_y = float(np.median(ys))
    std_x = float(np.std(xs))
    std_y = float(np.std(ys))

    print("\n=== Sampling Summary ===")
    print(f"Samples: {len(samples)}")
    print(f"Duration: {time.time() - start_time:.1f}s")
    print(f"Mean:   x={mean_x:.3f}, y={mean_y:.3f}")
    print(f"Median: x={median_x:.3f}, y={median_y:.3f}")
    print(f"Std:    sx={std_x:.3f}, sy={std_y:.3f}")
    print("Suggested fixed coordinate (for report): use Median")


def on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code == 0:
        print(f"Connected to {MQTT_BROKER}:{MQTT_PORT}")
        print(f"Subscribed to {MQTT_POSITION_TOPIC}")
        print("Keep the tag still and collect samples... Press Ctrl+C to stop.")
        client.subscribe(MQTT_POSITION_TOPIC)
    else:
        print(f"Connection failed rc={reason_code}")


def on_message(client, userdata, msg):
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
        x = float(payload["x"])
        y = float(payload["y"])
    except (KeyError, ValueError, json.JSONDecodeError):
        return

    samples.append((x, y))
    now = datetime.now().strftime("%H:%M:%S")
    print(f"[{now}] x={x:.3f}, y={y:.3f} (n={len(samples)})")


def main() -> None:
    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="position_point_sampler",
    )
    if MQTT_USERNAME:
        client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

    client.on_connect = on_connect
    client.on_message = on_message

    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)

    try:
        client.loop_forever()
    except KeyboardInterrupt:
        print("\nStopping sampler...")
    finally:
        client.disconnect()
        summarize()


if __name__ == "__main__":
    main()
