"""Interactive MQTT simulator for a high-heart-rate alert.

Commands:
  high          activate the configured high heart rate
  high 155      activate with a specific bpm
  normal        release the override and restore real watch data
  status        show the local simulator state
  quit          release the override and exit
"""

from __future__ import annotations

import argparse
import json
import time

import paho.mqtt.client as mqtt

from positioning_config import MQTT_BROKER, MQTT_PORT, POSITIONING_WATCH_ID


TOPIC = "indoor/simulation/heart-rate"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Simulate a high heart rate through MQTT.")
    parser.add_argument("--broker", default=MQTT_BROKER)
    parser.add_argument("--port", type=int, default=MQTT_PORT)
    parser.add_argument("--watch-id", default=POSITIONING_WATCH_ID)
    parser.add_argument("--bpm", type=float, default=145.0)
    parser.add_argument("--email", default="", help="Optional recipient for this activation.")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--activate", action="store_true", help="Publish high state once and exit.")
    action.add_argument("--clear", action="store_true", help="Publish normal state once and exit.")
    return parser.parse_args()


def publish_state(
    client: mqtt.Client,
    watch_id: str,
    active: bool,
    bpm: float,
    email: str,
) -> None:
    payload = {
        "watch_id": watch_id,
        "active": active,
        "state": "high" if active else "normal",
        "bpm": round(bpm, 1),
        "source": "heart_rate_alert_simulator",
        "ts": int(time.time() * 1000),
    }
    if active and email.strip():
        payload["email"] = email.strip()

    info = client.publish(TOPIC, json.dumps(payload), qos=1, retain=False)
    info.wait_for_publish(timeout=5)
    if info.rc != mqtt.MQTT_ERR_SUCCESS:
        raise RuntimeError(f"MQTT publish failed with code {info.rc}")

    state = "HIGH" if active else "NORMAL"
    print(f"[HR SIM] {watch_id} -> {state}, {bpm:.0f} bpm | {TOPIC}")


def print_help() -> None:
    print("\nCommands:")
    print("  high          activate high heart rate")
    print("  high 155      activate at 155 bpm")
    print("  normal        restore actual watch heart rate")
    print("  status        show current simulator state")
    print("  quit          restore actual data and exit\n")


def main() -> int:
    args = parse_args()
    if not 101.0 <= args.bpm <= 240.0:
        print("[ERR] --bpm must be between 101 and 240.")
        return 2

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"heart_rate_alert_simulator_{int(time.time())}",
    )
    try:
        client.connect(args.broker, args.port, keepalive=60)
    except OSError as exc:
        print(f"[ERR] Cannot connect to MQTT {args.broker}:{args.port}: {exc}")
        return 1

    client.loop_start()
    active = False
    current_bpm = args.bpm
    print(f"[HR SIM] Connected to MQTT {args.broker}:{args.port}")

    try:
        if args.activate:
            publish_state(client, args.watch_id, True, current_bpm, args.email)
            return 0
        if args.clear:
            publish_state(client, args.watch_id, False, current_bpm, args.email)
            return 0

        print_help()
        while True:
            raw = input("heart-rate> ").strip()
            if not raw:
                continue

            parts = raw.split()
            command = parts[0].lower()
            if command in {"q", "quit", "exit"}:
                break
            if command in {"h", "help", "?"}:
                print_help()
                continue
            if command == "status":
                state = "high" if active else "normal"
                print(f"[HR SIM] watch={args.watch_id} state={state} bpm={current_bpm:.0f}")
                continue
            if command in {"normal", "off", "clear"}:
                publish_state(client, args.watch_id, False, current_bpm, args.email)
                active = False
                continue
            if command in {"high", "on", "start"}:
                if len(parts) > 1:
                    try:
                        requested_bpm = float(parts[1])
                    except ValueError:
                        print(f"[ERR] Invalid bpm '{parts[1]}'.")
                        continue
                    if not 101.0 <= requested_bpm <= 240.0:
                        print("[ERR] bpm must be between 101 and 240.")
                        continue
                    current_bpm = requested_bpm

                publish_state(client, args.watch_id, True, current_bpm, args.email)
                active = True
                continue

            print(f"[ERR] Unknown command '{command}'. Use high, normal, status, or quit.")
    except KeyboardInterrupt:
        print("\n[HR SIM] Interrupted.")
    finally:
        if active and not args.activate:
            try:
                publish_state(client, args.watch_id, False, current_bpm, args.email)
            except Exception as exc:
                print(f"[WARN] Could not restore normal state: {exc}")
        client.loop_stop()
        client.disconnect()
        print("[HR SIM] Disconnected.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
