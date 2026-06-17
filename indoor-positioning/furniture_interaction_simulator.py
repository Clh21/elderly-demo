"""Interactive MQTT simulator for furniture occupancy.

Commands:
  bed        toggle bed occupied/vacant
  sofa       toggle sofa occupied/vacant
  wc         toggle toilet occupied/vacant
  bed on     mark bed occupied
  sofa off   mark sofa vacant
  status     show current simulated state
  clear      mark all furniture vacant
  quit       exit
"""

from __future__ import annotations

import json
import time
from typing import Dict

import paho.mqtt.client as mqtt

from positioning_config import FURNITURE, MQTT_BROKER, MQTT_PORT


ALIASES = {
    "bed": "bed",
    "beds": "bed",
    "bedroom": "bed",
    "sofa": "sofa",
    "living": "sofa",
    "living_room": "sofa",
    "wc": "toilet",
    "toilet": "toilet",
    "bathroom": "toilet",
}

DISPLAY = {
    "bed": "BED",
    "sofa": "SOFA",
    "toilet": "WC",
}


def build_payload(location: str, occupied: bool) -> dict:
    furniture = FURNITURE[location]
    threshold = int(furniture.get("threshold_adc", 3000))
    weight_kg = float(furniture.get("calibration_weight_kg", 50.0))
    return {
        "location": location,
        "occupied": bool(occupied),
        "x": float(furniture["x"]),
        "y": float(furniture["y"]),
        "label": str(furniture.get("label", location)),
        "room": str(furniture.get("room", "")),
        "coordinate_type": "center",
        "raw_adc": threshold + 400 if occupied else 0,
        "weight_kg": round(weight_kg if occupied else 0.0, 1),
        "source": "furniture_interaction_simulator",
        "ts": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime()),
    }


def publish_state(client: mqtt.Client, location: str, occupied: bool) -> None:
    topic = f"indoor/pressure/{location}/state"
    payload = build_payload(location, occupied)
    client.publish(topic, json.dumps(payload), qos=1, retain=False)
    state = "OCCUPIED" if occupied else "VACANT"
    print(
        f"[SIM] {DISPLAY.get(location, location).upper():<4} -> {state} "
        f"at ({payload['x']:.2f}, {payload['y']:.2f}) | {topic}"
    )


def normalize_location(value: str) -> str:
    key = value.strip().lower().replace("-", "_")
    return ALIASES.get(key, "")


def print_help() -> None:
    print("\nCommands:")
    print("  bed / sofa / wc       toggle furniture occupancy")
    print("  bed on / sofa off     explicitly occupy or release")
    print("  status                show simulator state")
    print("  clear                 release all furniture")
    print("  quit                  exit\n")


def print_status(states: Dict[str, bool]) -> None:
    parts = []
    for location in ("bed", "sofa", "toilet"):
        label = DISPLAY.get(location, location).upper()
        state = "occupied" if states.get(location, False) else "vacant"
        parts.append(f"{label}={state}")
    print("[SIM] " + " | ".join(parts))


def main() -> int:
    missing = [location for location in ("bed", "sofa", "toilet") if location not in FURNITURE]
    if missing:
        print(f"[ERR] Missing furniture config: {missing}")
        return 2

    client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id=f"furniture_interaction_simulator_{int(time.time())}",
    )
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
    client.loop_start()

    states: Dict[str, bool] = {location: False for location in ("bed", "sofa", "toilet")}
    print(f"[SIM] Connected to MQTT {MQTT_BROKER}:{MQTT_PORT}")
    print_help()

    try:
        while True:
            raw = input("furniture> ").strip()
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
                print_status(states)
                continue
            if command == "clear":
                for location in states:
                    states[location] = False
                    publish_state(client, location, False)
                continue

            location = normalize_location(parts[0])
            if not location:
                print(f"[ERR] Unknown furniture '{parts[0]}'. Use bed, sofa, wc.")
                continue

            if len(parts) == 1:
                next_state = not states[location]
            else:
                action = parts[1].lower()
                if action in {"on", "occupy", "occupied", "1", "true"}:
                    next_state = True
                elif action in {"off", "release", "vacant", "0", "false"}:
                    next_state = False
                else:
                    print(f"[ERR] Unknown action '{parts[1]}'. Use on/off.")
                    continue

            if next_state:
                for other in states:
                    if other != location and states[other]:
                        states[other] = False
                        publish_state(client, other, False)

            states[location] = next_state
            publish_state(client, location, next_state)
    except KeyboardInterrupt:
        print("\n[SIM] Interrupted.")
    finally:
        client.loop_stop()
        client.disconnect()
        print("[SIM] Disconnected.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
