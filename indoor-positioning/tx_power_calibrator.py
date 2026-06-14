"""Calibrate BLE tx_power and path_loss_n from MQTT RSSI measurements.

Recommended usage:
  python tx_power_calibrator.py --anchor anchor_01 --distances 1,2,3,4

For each distance, place the watch at the requested position and press Enter.
The script discards a short settling period, collects RSSI samples, removes IQR
outliers, and fits:

    RSSI(d) = tx_power - 10 * path_loss_n * log10(d)
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
from statistics import mean, median, pstdev
from typing import List, Optional, Sequence, Tuple

import paho.mqtt.client as mqtt

from positioning_config import (
    ANCHORS,
    MQTT_BROKER,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_USERNAME,
    PATH_LOSS_EXPONENT,
)


@dataclass
class DistanceResult:
    distance_m: float
    samples: List[float]
    filtered_samples: List[float]
    mean_rssi: float
    median_rssi: float
    std_rssi: float


@dataclass
class FitResult:
    tx_power: float
    path_loss_n: float
    r_squared: float
    rmse_db: float


def parse_distances(value: str) -> List[float]:
    distances: List[float] = []
    for item in value.split(","):
        item = item.strip()
        if not item:
            continue
        distance = float(item)
        if distance <= 0:
            raise argparse.ArgumentTypeError("all distances must be greater than 0")
        if distance not in distances:
            distances.append(distance)

    if not distances:
        raise argparse.ArgumentTypeError("provide at least one distance")
    return distances


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Measure RSSI at several distances and fit tx_power/path_loss_n."
    )
    parser.add_argument(
        "--anchor",
        required=True,
        help="Anchor id to calibrate, for example anchor_01.",
    )
    parser.add_argument(
        "--distances",
        type=parse_distances,
        default=parse_distances("1,2,3,4"),
        help="Comma-separated distances in meters (default: 1,2,3,4).",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=20.0,
        help="RSSI collection time at each distance in seconds (default: 20).",
    )
    parser.add_argument(
        "--settle",
        type=float,
        default=4.0,
        help="Seconds discarded after moving the watch (default: 4).",
    )
    parser.add_argument(
        "--field",
        choices=("raw", "filtered"),
        default="raw",
        help="MQTT RSSI field to use (default: raw).",
    )
    parser.add_argument(
        "--min-samples",
        type=int,
        default=12,
        help="Minimum samples required at each distance (default: 12).",
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
        "--yes",
        action="store_true",
        help="Start each distance automatically without waiting for Enter.",
    )
    return parser.parse_args()


def iqr_filter(values: Sequence[float]) -> List[float]:
    ordered = sorted(float(value) for value in values)
    if len(ordered) < 4:
        return ordered

    def percentile(fraction: float) -> float:
        position = (len(ordered) - 1) * fraction
        lower = int(math.floor(position))
        upper = int(math.ceil(position))
        if lower == upper:
            return ordered[lower]
        weight = position - lower
        return ordered[lower] * (1.0 - weight) + ordered[upper] * weight

    q1 = percentile(0.25)
    q3 = percentile(0.75)
    spread = q3 - q1
    lower_limit = q1 - 1.5 * spread
    upper_limit = q3 + 1.5 * spread
    filtered = [
        value for value in ordered if lower_limit <= value <= upper_limit
    ]
    return filtered or ordered


def summarize_distance(distance_m: float, samples: Sequence[float]) -> DistanceResult:
    raw_values = [float(value) for value in samples]
    filtered_values = iqr_filter(raw_values)
    return DistanceResult(
        distance_m=distance_m,
        samples=raw_values,
        filtered_samples=filtered_values,
        mean_rssi=mean(filtered_values),
        median_rssi=median(filtered_values),
        std_rssi=pstdev(filtered_values) if len(filtered_values) > 1 else 0.0,
    )


def fit_path_loss(results: Sequence[DistanceResult]) -> Optional[FitResult]:
    if len(results) < 2:
        return None

    xs = [math.log10(result.distance_m) for result in results]
    ys = [result.median_rssi for result in results]
    x_mean = mean(xs)
    y_mean = mean(ys)
    denominator = sum((x - x_mean) ** 2 for x in xs)
    if denominator <= 1e-12:
        return None

    slope = sum(
        (x - x_mean) * (y - y_mean) for x, y in zip(xs, ys)
    ) / denominator
    intercept = y_mean - slope * x_mean
    path_loss_n = -slope / 10.0

    predictions = [intercept + slope * x for x in xs]
    residual_sum = sum((actual - predicted) ** 2 for actual, predicted in zip(ys, predictions))
    total_sum = sum((actual - y_mean) ** 2 for actual in ys)
    r_squared = 1.0 - (residual_sum / total_sum) if total_sum > 1e-12 else 1.0
    rmse_db = math.sqrt(residual_sum / len(ys))

    return FitResult(
        tx_power=intercept,
        path_loss_n=path_loss_n,
        r_squared=r_squared,
        rmse_db=rmse_db,
    )


def one_meter_tx_power(
    results: Sequence[DistanceResult],
    fallback_n: float,
) -> float:
    nearest = min(results, key=lambda result: abs(result.distance_m - 1.0))
    if abs(nearest.distance_m - 1.0) <= 1e-6:
        return nearest.median_rssi
    return nearest.median_rssi + (
        10.0 * fallback_n * math.log10(nearest.distance_m)
    )


class MqttRssiCollector:
    def __init__(
        self,
        anchor_id: str,
        field: str,
        broker: str,
        port: int,
    ) -> None:
        self.anchor_id = anchor_id
        self.field = field
        self.broker = broker
        self.port = port
        self.connected = threading.Event()
        self.lock = threading.Lock()
        self.collecting = False
        self.current_samples: List[Tuple[float, float]] = []

        client_id = f"rssi_calibrator_{anchor_id}_{int(time.time())}"
        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=client_id,
        )
        if MQTT_USERNAME:
            self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)
        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message

    def on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            client.subscribe(f"indoor/ble/{self.anchor_id}/rssi")
            self.connected.set()
        else:
            print(f"[ERR] MQTT connection failed: rc={reason_code}")

    def on_message(self, client, userdata, message):
        try:
            payload = json.loads(message.payload.decode("utf-8"))
            anchor_id = str(payload.get("anchor", self.anchor_id))
            if anchor_id != self.anchor_id:
                return
            if self.field in payload:
                value = float(payload[self.field])
            elif "raw" in payload:
                value = float(payload["raw"])
            else:
                return
        except (json.JSONDecodeError, TypeError, ValueError):
            return

        with self.lock:
            if self.collecting:
                self.current_samples.append((time.time(), value))

    def start(self) -> None:
        self.client.connect(self.broker, self.port, keepalive=60)
        self.client.loop_start()
        if not self.connected.wait(timeout=8.0):
            self.stop()
            raise RuntimeError(
                f"cannot connect to MQTT broker {self.broker}:{self.port}"
            )

    def stop(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()

    def begin_stage(self) -> None:
        with self.lock:
            self.current_samples = []
            self.collecting = True

    def end_stage(self) -> List[Tuple[float, float]]:
        with self.lock:
            self.collecting = False
            return list(self.current_samples)

    def sample_count(self) -> int:
        with self.lock:
            return len(self.current_samples)


def wait_seconds(seconds: float, label: str, collector: Optional[MqttRssiCollector] = None) -> None:
    deadline = time.time() + max(0.0, seconds)
    last_display = -1
    while True:
        remaining = deadline - time.time()
        if remaining <= 0:
            break
        rounded = int(math.ceil(remaining))
        if rounded != last_display:
            suffix = (
                f", samples={collector.sample_count()}"
                if collector is not None
                else ""
            )
            print(f"\r{label}: {rounded:2d}s{suffix}", end="", flush=True)
            last_display = rounded
        time.sleep(min(0.1, remaining))
    print()


def default_output_path(anchor_id: str) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return Path(f"calibration_{anchor_id}_{timestamp}.csv")


def write_csv(
    output_path: Path,
    anchor_id: str,
    field: str,
    stage_rows: Sequence[Tuple[float, Sequence[Tuple[float, float]]]],
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            ["anchor", "distance_m", "field", "sample_index", "received_at", "rssi_dbm"]
        )
        for distance_m, rows in stage_rows:
            for index, (received_at, rssi) in enumerate(rows, start=1):
                writer.writerow(
                    [
                        anchor_id,
                        f"{distance_m:.3f}",
                        field,
                        index,
                        f"{received_at:.3f}",
                        f"{rssi:.3f}",
                    ]
                )


def print_results(
    anchor_id: str,
    results: Sequence[DistanceResult],
    fit: Optional[FitResult],
    min_samples: int,
) -> None:
    print("\n" + "=" * 76)
    print("CALIBRATION RESULT")
    print("=" * 76)
    print("distance | samples | kept | median RSSI | std RSSI | quality")
    for result in results:
        quality = "OK" if len(result.samples) >= min_samples else "LOW_SAMPLES"
        print(
            f"{result.distance_m:7.2f}m | "
            f"{len(result.samples):7d} | "
            f"{len(result.filtered_samples):4d} | "
            f"{result.median_rssi:11.2f} | "
            f"{result.std_rssi:8.2f} | {quality}"
        )

    direct_tx = one_meter_tx_power(results, PATH_LOSS_EXPONENT)
    print(f"\n1m median tx_power: {direct_tx:.2f} dBm")

    if fit is None:
        print("path_loss_n: not fitted; at least two different distances are required.")
        suggested_tx = direct_tx
        suggested_n = PATH_LOSS_EXPONENT
    else:
        print(f"fitted tx_power:    {fit.tx_power:.2f} dBm")
        print(f"fitted path_loss_n: {fit.path_loss_n:.3f}")
        print(f"fit R^2:            {fit.r_squared:.3f}")
        print(f"fit RMSE:           {fit.rmse_db:.2f} dB")
        suggested_tx = fit.tx_power
        suggested_n = fit.path_loss_n

        if not 1.0 <= fit.path_loss_n <= 5.0:
            print(
                "[WARN] path_loss_n is outside the usual indoor range 1.0-5.0. "
                "Repeat the measurement and check distance/line-of-sight."
            )
        if fit.r_squared < 0.75:
            print(
                "[WARN] Weak distance/RSSI fit. Increase sampling time or repeat "
                "measurements with less body blocking."
            )

    cfg = ANCHORS[anchor_id]
    print("\nPaste into positioning_config.py:")
    print(
        f'    "{anchor_id}": {{"x": {float(cfg["x"]):.1f}, '
        f'"y": {float(cfg["y"]):.1f}, "tx_power": {suggested_tx:.2f}, '
        f'"path_loss_n": {suggested_n:.3f}}},'
    )


def main() -> int:
    args = parse_args()
    anchor_id = args.anchor.strip()
    if anchor_id not in ANCHORS:
        print(f"[ERR] Unknown anchor: {anchor_id}")
        print(f"[INFO] Available anchors: {', '.join(ANCHORS)}")
        return 2
    if args.duration <= 0 or args.settle < 0:
        print("[ERR] --duration must be > 0 and --settle must be >= 0")
        return 2

    output_path = Path(args.output) if args.output else default_output_path(anchor_id)
    collector = MqttRssiCollector(
        anchor_id=anchor_id,
        field=args.field,
        broker=args.broker,
        port=args.port,
    )

    print("=" * 76)
    print("BLE RSSI MULTI-DISTANCE CALIBRATION")
    print(f"Anchor:       {anchor_id}")
    print(f"Distances:    {', '.join(f'{d:g}m' for d in args.distances)}")
    print(f"RSSI field:   {args.field}")
    print(f"Per distance: {args.settle:.1f}s settle + {args.duration:.1f}s sample")
    print(f"MQTT:         {args.broker}:{args.port}")
    print("=" * 76)
    print("Keep the watch and ESP32 at the same height and orientation.")
    print("Do not stand between them during sampling.")

    try:
        collector.start()
    except (OSError, RuntimeError) as exc:
        print(f"[ERR] {exc}")
        return 1

    stage_rows: List[Tuple[float, List[Tuple[float, float]]]] = []
    results: List[DistanceResult] = []

    try:
        for distance_m in args.distances:
            if not args.yes:
                answer = input(
                    f"\nPlace the watch {distance_m:g}m from {anchor_id}, "
                    "then press Enter (q to stop): "
                ).strip().lower()
                if answer in {"q", "quit", "exit"}:
                    break
            else:
                print(f"\nStarting {distance_m:g}m stage...")

            wait_seconds(args.settle, "Settling")
            collector.begin_stage()
            wait_seconds(args.duration, "Sampling", collector)
            rows = collector.end_stage()
            values = [value for _, value in rows]
            stage_rows.append((distance_m, rows))

            if not values:
                print(f"[WARN] No RSSI samples received at {distance_m:g}m.")
                continue

            result = summarize_distance(distance_m, values)
            results.append(result)
            print(
                f"[POINT] {distance_m:g}m: samples={len(values)}, "
                f"median={result.median_rssi:.2f} dBm, "
                f"std={result.std_rssi:.2f} dB"
            )
    except KeyboardInterrupt:
        print("\n[INFO] Calibration stopped by user.")
    finally:
        collector.stop()

    if stage_rows:
        write_csv(output_path, anchor_id, args.field, stage_rows)
        print(f"\nCSV saved: {output_path.resolve()}")

    if not results:
        print("[ERR] No usable RSSI samples were collected.")
        return 1

    fit = fit_path_loss(results)
    print_results(anchor_id, results, fit, args.min_samples)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
