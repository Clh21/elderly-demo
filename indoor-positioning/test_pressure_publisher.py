"""Test utility: simulate a pressure sensor node over MQTT.

Usage:
    python test_pressure_publisher.py --location sofa --occupied
    python test_pressure_publisher.py --location sofa --vacant
    python test_pressure_publisher.py --location sofa --toggle  # alternate every 5 seconds

This is useful for verifying the fusion logic in indoor_positioning_server.py
without having physical hardware connected.
"""

import argparse
import json
import time

import paho.mqtt.client as mqtt

from positioning_config import FURNITURE, MQTT_BROKER, MQTT_PORT


def build_payload(location: str, occupied: bool) -> dict:
    furniture = FURNITURE.get(location, {})
    threshold = furniture.get("threshold_adc", 500)
    raw_adc = threshold + 400 if occupied else 0
    weight_kg = furniture.get("calibration_weight_kg", 50.0) if occupied else 0.0
    return {
        "location": location,
        "occupied": occupied,
        "x": float(furniture["x"]),
        "y": float(furniture["y"]),
        "label": str(furniture.get("label", location)),
        "room": str(furniture.get("room", "")),
        "coordinate_type": "center",
        "raw_adc": raw_adc,
        "weight_kg": round(weight_kg, 1),
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
    }


def main():
    parser = argparse.ArgumentParser(description="Publish fake pressure sensor messages")
    parser.add_argument("--location", default="sofa", help="Furniture location id")
    parser.add_argument("--occupied", action="store_true", help="Publish occupied state")
    parser.add_argument("--vacant", action="store_true", help="Publish vacant state")
    parser.add_argument("--toggle", action="store_true", help="Toggle occupied/vacant every 5s")
    parser.add_argument("--interval", type=float, default=1.0, help="Publish interval in seconds")
    args = parser.parse_args()

    if args.location not in FURNITURE:
        print(f"[ERR] Unknown location '{args.location}'. Known: {list(FURNITURE.keys())}")
        return

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="test_pressure_publisher",
    )
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_start()

    topic = f"indoor/pressure/{args.location}/state"
    occupied = args.occupied or (not args.vacant and not args.toggle)

    try:
        while True:
            payload = build_payload(args.location, occupied)
            client.publish(topic, json.dumps(payload))
            print(f"[TEST] {topic}: {payload}")

            if args.toggle:
                time.sleep(5.0)
                occupied = not occupied
            else:
                time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\n[TEST] Stopping publisher...")
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
