"""Fast whole-room RSSI calibration from known watch positions.

Usage:
  python quick_room_calibrator.py --points "0.8,1.6;1.0,3.0;2.6,1.0;3.75,1.0;3.75,3.0;5.5,2.0;6.4,1.0;6.4,3.0"

At each point, keep the watch still and press Enter. The script records RSSI
from all anchors at once, fits each anchor's tx_power/path_loss_n, and prints
the block to paste into positioning_config.py.
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from statistics import median, pstdev
from typing import Dict, List, Optional, Sequence, Tuple

import paho.mqtt.client as mqtt

from positioning_config import (
    ANCHORS,
    MQTT_BROKER,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_USERNAME,
)


# Default points for a 7.5 x 4 m room with anchor_02 moved to (1.5, 1.0).
# They cover left/center/right zones while avoiding very-near anchor samples.
DEFAULT_POINTS = "0.8,1.6;1.0,3.0;2.6,1.0;3.75,1.0;3.75,3.0;5.5,2.0;6.4,1.0;6.4,3.0"


@dataclass
class Point:
    x: float
    y: float


@dataclass
class Fit:
    tx_power: float
    path_loss_n: float
    r_squared: float
    rmse_db: float
    samples: int


def parse_points(value: str) -> List[Point]:
    points: List[Point] = []
    for item in value.split(";"):
        item = item.strip()
        if not item:
            continue
        parts = [part.strip() for part in item.split(",")]
        if len(parts) != 2:
            raise argparse.ArgumentTypeError("points must look like x,y;x,y")
        points.append(Point(float(parts[0]), float(parts[1])))
    if len(points) < 2:
        raise argparse.ArgumentTypeError("provide at least two calibration points")
    return points


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fast room-level calibration using known x/y positions."
    )
    parser.add_argument(
        "--points",
        type=parse_points,
        default=parse_points(DEFAULT_POINTS),
        help=f'Known watch positions, format "x,y;x,y" (default: {DEFAULT_POINTS})',
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=25.0,
        help="RSSI collection seconds at each point (default: 25).",
    )
    parser.add_argument(
        "--settle",
        type=float,
        default=5.0,
        help="Seconds discarded after moving the watch (default: 5).",
    )
    parser.add_argument(
        "--field",
        choices=("raw", "filtered"),
        default="raw",
        help="MQTT RSSI field to use (default: raw).",
    )
    parser.add_argument(
        "--broker",
        default=MQTT_BROKER,
        help=f"MQTT broker address (default: {MQTT_BROKER}).",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=MQTT_PORT,
        help=f"MQTT broker port (default: {MQTT_PORT}).",
    )
    parser.add_argument(
        "--output",
        default="",
        help="CSV output path. A timestamped filename is used by default.",
    )
    parser.add_argument(
        "--input",
        default="",
        help="Read an existing quick calibration CSV instead of collecting.",
    )
    parser.add_argument(
        "--yes",
        action="store_true",
        help="Start each point automatically without waiting for Enter.",
    )
    return parser.parse_args()


def iqr_filter(values: Sequence[float]) -> List[float]:
    ordered = sorted(float(value) for value in values)
    if len(ordered) < 4:
        return ordered

    def percentile(fraction: float) -> float:
        pos = (len(ordered) - 1) * fraction
        lo = int(math.floor(pos))
        hi = int(math.ceil(pos))
        if lo == hi:
            return ordered[lo]
        weight = pos - lo
        return ordered[lo] * (1.0 - weight) + ordered[hi] * weight

    q1 = percentile(0.25)
    q3 = percentile(0.75)
    spread = q3 - q1
    lower = q1 - 1.5 * spread
    upper = q3 + 1.5 * spread
    kept = [value for value in ordered if lower <= value <= upper]
    return kept or ordered


def fit_anchor(points: Sequence[Tuple[float, float]]) -> Optional[Fit]:
    """Fit RSSI = tx_power - 10*n*log10(distance)."""
    usable = [(distance, rssi) for distance, rssi in points if distance > 0.2]
    if len(usable) < 2:
        return None

    xs = [math.log10(distance) for distance, _ in usable]
    ys = [rssi for _, rssi in usable]
    x_mean = sum(xs) / len(xs)
    y_mean = sum(ys) / len(ys)
    denominator = sum((x - x_mean) ** 2 for x in xs)
    if denominator <= 1e-12:
        return None

    slope = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys)) / denominator
    intercept = y_mean - slope * x_mean
    path_loss_n = -slope / 10.0

    predictions = [intercept + slope * x for x in xs]
    residual_sum = sum((y - pred) ** 2 for y, pred in zip(ys, predictions))
    total_sum = sum((y - y_mean) ** 2 for y in ys)
    r_squared = 1.0 - residual_sum / total_sum if total_sum > 1e-12 else 1.0
    rmse_db = math.sqrt(residual_sum / len(ys))
    return Fit(
        tx_power=intercept,
        path_loss_n=path_loss_n,
        r_squared=r_squared,
        rmse_db=rmse_db,
        samples=len(usable),
    )


class Collector:
    def __init__(self, field: str, broker: str, port: int) -> None:
        self.field = field
        self.broker = broker
        self.port = port
        self.connected = threading.Event()
        self.lock = threading.Lock()
        self.collecting = False
        self.rows: List[Tuple[float, str, float]] = []

        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"quick_room_calibrator_{int(time.time())}",
        )
        if MQTT_USERNAME:
            self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message

    def on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            client.subscribe("indoor/ble/+/rssi")
            self.connected.set()
        else:
            print(f"[ERR] MQTT connection failed: rc={reason_code}")

    def on_message(self, client, userdata, message):
        try:
            payload = json.loads(message.payload.decode("utf-8"))
            anchor_id = str(payload.get("anchor", ""))
            if anchor_id not in ANCHORS:
                return
            if self.field in payload:
                rssi = float(payload[self.field])
            elif "raw" in payload:
                rssi = float(payload["raw"])
            else:
                return
        except (json.JSONDecodeError, TypeError, ValueError):
            return

        with self.lock:
            if self.collecting:
                self.rows.append((time.time(), anchor_id, rssi))

    def start(self) -> None:
        self.client.connect(self.broker, self.port, keepalive=60)
        self.client.loop_start()
        if not self.connected.wait(timeout=8.0):
            self.stop()
            raise RuntimeError(f"cannot connect to MQTT broker {self.broker}:{self.port}")

    def stop(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()

    def begin(self) -> None:
        with self.lock:
            self.rows = []
            self.collecting = True

    def end(self) -> List[Tuple[float, str, float]]:
        with self.lock:
            self.collecting = False
            return list(self.rows)

    def counts(self) -> Dict[str, int]:
        with self.lock:
            counts: Dict[str, int] = {}
            for _, anchor_id, _ in self.rows:
                counts[anchor_id] = counts.get(anchor_id, 0) + 1
            return counts


def wait_seconds(seconds: float, label: str, collector: Optional[Collector] = None) -> None:
    deadline = time.time() + max(0.0, seconds)
    last_display = -1
    while True:
        remaining = deadline - time.time()
        if remaining <= 0:
            break
        rounded = int(math.ceil(remaining))
        if rounded != last_display:
            suffix = ""
            if collector is not None:
                counts = collector.counts()
                suffix = " " + " ".join(
                    f"{anchor}:{counts.get(anchor, 0)}" for anchor in sorted(ANCHORS)
                )
            print(f"\r{label}: {rounded:2d}s{suffix}", end="", flush=True)
            last_display = rounded
        time.sleep(min(0.1, remaining))
    print()


def default_output_path() -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return Path(f"quick_room_calibration_{timestamp}.csv")


def write_csv(path: Path, field: str, stages: Sequence[Tuple[Point, Sequence[Tuple[float, str, float]]]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["point_x", "point_y", "field", "received_at", "anchor", "rssi_dbm"])
        for point, rows in stages:
            for received_at, anchor_id, rssi in rows:
                writer.writerow(
                    [
                        f"{point.x:.3f}",
                        f"{point.y:.3f}",
                        field,
                        f"{received_at:.3f}",
                        anchor_id,
                        f"{rssi:.3f}",
                    ]
                )


def read_csv(path: Path) -> Tuple[str, List[Tuple[Point, List[Tuple[float, str, float]]]]]:
    grouped: Dict[Tuple[float, float], List[Tuple[float, str, float]]] = {}
    field = "raw"
    with path.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            x = float(row["point_x"])
            y = float(row["point_y"])
            field = row.get("field", field)
            received_at = float(row["received_at"])
            anchor_id = row["anchor"]
            rssi = float(row["rssi_dbm"])
            grouped.setdefault((x, y), []).append((received_at, anchor_id, rssi))
    stages = [(Point(x, y), rows) for (x, y), rows in grouped.items()]
    return field, stages


def summarize_and_fit(stages: Sequence[Tuple[Point, Sequence[Tuple[float, str, float]]]]) -> None:
    per_anchor_points: Dict[str, List[Tuple[float, float]]] = {anchor: [] for anchor in ANCHORS}

    print("\n" + "=" * 86)
    print("POINT SUMMARY")
    print("=" * 86)
    for index, (point, rows) in enumerate(stages, start=1):
        print(f"P{index}: x={point.x:.2f}, y={point.y:.2f}")
        by_anchor: Dict[str, List[float]] = {anchor: [] for anchor in ANCHORS}
        for _, anchor_id, rssi in rows:
            if anchor_id in by_anchor:
                by_anchor[anchor_id].append(float(rssi))

        for anchor_id in sorted(ANCHORS):
            values = by_anchor[anchor_id]
            if not values:
                print(f"  {anchor_id}: no samples")
                continue

            kept = iqr_filter(values)
            median_rssi = median(kept)
            std = pstdev(kept) if len(kept) > 1 else 0.0
            cfg = ANCHORS[anchor_id]
            distance = math.hypot(point.x - float(cfg["x"]), point.y - float(cfg["y"]))
            per_anchor_points[anchor_id].append((distance, median_rssi))
            print(
                f"  {anchor_id}: d={distance:.2f}m "
                f"samples={len(values):3d}/kept={len(kept):3d} "
                f"median={median_rssi:6.1f} std={std:4.1f}"
            )

    print("\n" + "=" * 86)
    print("SUGGESTED ANCHORS")
    print("=" * 86)
    print("ANCHORS = {")
    for anchor_id in sorted(ANCHORS):
        fit = fit_anchor(per_anchor_points[anchor_id])
        cfg = ANCHORS[anchor_id]
        if fit is None:
            tx = float(cfg["tx_power"])
            n = float(cfg.get("path_loss_n", 2.0))
            note = "not enough data"
        else:
            tx = fit.tx_power
            n = fit.path_loss_n
            note = f"R2={fit.r_squared:.2f}, RMSE={fit.rmse_db:.2f}dB"
            if n < 1.0 or n > 5.0 or fit.r_squared < 0.55:
                note += " WARNING: weak fit, repeat this anchor/points"

        print(
            f'    "{anchor_id}": {{"x": {float(cfg["x"]):.1f}, '
            f'"y": {float(cfg["y"]):.1f}, "tx_power": {tx:.2f}, '
            f'"path_loss_n": {n:.3f}}},  # {note}'
        )
    print("}")


def collect(args: argparse.Namespace) -> Tuple[str, List[Tuple[Point, List[Tuple[float, str, float]]]]]:
    collector = Collector(args.field, args.broker, args.port)
    collector.start()
    stages: List[Tuple[Point, List[Tuple[float, str, float]]]] = []
    try:
        for index, point in enumerate(args.points, start=1):
            if not args.yes:
                answer = input(
                    f"\nP{index}/{len(args.points)}: place watch at "
                    f"x={point.x:g}, y={point.y:g}, then press Enter (q to stop): "
                ).strip().lower()
                if answer in {"q", "quit", "exit"}:
                    break
            else:
                print(f"\nStarting P{index}: x={point.x:g}, y={point.y:g}")

            wait_seconds(args.settle, "Settling")
            collector.begin()
            wait_seconds(args.duration, "Sampling", collector)
            rows = collector.end()
            stages.append((point, rows))
    finally:
        collector.stop()
    return args.field, stages


def main() -> int:
    args = parse_args()
    if args.duration <= 0 or args.settle < 0:
        print("[ERR] --duration must be > 0 and --settle must be >= 0")
        return 2

    if args.input:
        field, stages = read_csv(Path(args.input))
        print(f"[INFO] Loaded {len(stages)} point(s) from {args.input} ({field})")
    else:
        print("=" * 86)
        print("FAST WHOLE-ROOM RSSI CALIBRATION")
        print("=" * 86)
        print("Use 5-6 known positions across the room. Keep watch height/orientation stable.")
        print("Do not stand between the watch and anchors while sampling.")
        print("Default points:", "; ".join(f"({p.x:g},{p.y:g})" for p in args.points))
        if not args.yes:
            answer = input("\nCheck the points above, then press Enter to start (q to exit): ")
            if answer.strip().lower() in {"q", "quit", "exit"}:
                print("[INFO] Calibration cancelled before sampling.")
                return 0
        field, stages = collect(args)
        output = Path(args.output) if args.output else default_output_path()
        if stages:
            write_csv(output, field, stages)
            print(f"\nCSV saved: {output.resolve()}")

    if not stages:
        print("[ERR] No samples collected.")
        return 1

    summarize_and_fit(stages)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
