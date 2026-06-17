"""Real-time indoor positioning service using BLE RSSI and trilateration.

This server consumes RSSI data published by ESP32 anchors to MQTT topic:
indoor/ble/{anchor_id}/rssi

Expected payload example:
{
  "anchor": "anchor_01",
  "target": "real-watch-001",
  "raw": -65,
  "filtered": -62.3,
    "ts": 123456,
    "rx_epoch_ms": 1712490000123,
    "packet_slot": 6849960000,
    "adv_interval_ms": 100
}
"""

from __future__ import annotations

import csv
from collections import deque
import itertools
import json
import math
from pathlib import Path
import threading
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple

import numpy as np
import paho.mqtt.client as mqtt

from positioning_config import (
    ALLOW_LOCAL_TIME_SYNC,
    ANCHOR_SYNC_WINDOW_SEC,
    ANCHORS,
    BEACON_ADV_INTERVAL_MS,
    CONFIDENCE_ERROR_SCALE_M,
    FALLBACK_IMPROVEMENT_MARGIN_M,
    FOUR_ANCHOR_SETTLE_SEC,
    FRAME_MATCH_TOLERANCE_SLOTS,
    FURNITURE,
    HOLD_MIN_CONFIDENCE_FOR_LOCK,
    LOCAL_TIME_SYNC_SPAN_LIMIT_SEC,
    LOW_CONFIDENCE_MAX_ALLOWED_JUMP_M,
    LOW_CONFIDENCE_JUMP_BASE_M,
    LOW_CONFIDENCE_JUMP_THRESHOLD,
    LOW_CONFIDENCE_MAX_SPEED_MPS,
    MAX_DISTANCE_M,
    MAX_READING_AGE_SEC,
    MIN_ANCHORS_PER_SYNC_FRAME,
    MIN_POSITION_CONFIDENCE_TO_PUBLISH,
    MIN_SNAPSHOT_SAMPLES_PER_ANCHOR,
    MIN_SYNC_FRAMES_PER_UPDATE,
    MIN_DISTANCE_M,
    MOTION_STATE_CONFIRM_UPDATES,
    MOTION_STATE_THRESHOLD_M,
    MQTT_BROKER,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_POSITION_TOPIC,
    MQTT_PRESSURE_TOPIC,
    MQTT_RSSI_TOPIC,
    MQTT_USERNAME,
    PATH_LOSS_EXPONENT,
    POSITIONING_WATCH_ID,
    POSITION_AGGREGATION_MODE,
    POSITION_AGGREGATION_WINDOW,
    POSITION_SMOOTHING_ALPHA,
    PRESSURE_FUSION_BLEND_WIDTH_M,
    PRESSURE_FUSION_RADIUS_M,
    PRELIMINARY_ALERT_TOPIC,
    PROLONGED_STILLNESS_COOLDOWN_SEC,
    PROLONGED_STILLNESS_DURATION_SEC,
    PROLONGED_STILLNESS_MIN_CONFIDENCE,
    RELAXED_ANCHOR_SYNC_WINDOW_SEC,
    RSSI_IQR_MULTIPLIER,
    RSSI_FINGERPRINT_BLEND,
    RSSI_FINGERPRINT_CSV,
    RSSI_FINGERPRINT_MAX_RMS_DB,
    RSSI_FINGERPRINT_MIN_ANCHORS,
    RSSI_FINGERPRINT_TOP_K,
    RSSI_FINGERPRINT_WEIGHT_POWER,
    ROOM_BOUNDS_MARGIN_M,
    SMOOTHING_ALPHA_MAX,
    SMOOTHING_ALPHA_MAX_DELTA_PER_UPDATE,
    SMOOTHING_ALPHA_MIN,
    SNAPSHOT_WINDOW_SEC,
    SLOT_OFFSET_MAX_STEP_PER_UPDATE,
    SLOT_OFFSET_SEARCH_RADIUS,
    SLOT_OVERLAP_TOLERANCE_SLOTS,
    SLOT_SYNC_REFERENCE_ANCHOR,
    STATIONARY_CONFIRM_UPDATES,
    STATIONARY_MOVE_THRESHOLD_M,
    STATIONARY_RELEASE_CONFIRM_UPDATES,
    STATIONARY_RELEASE_FACTOR,
    STRICT_INROOM_OUTPUT,
    THREE_ANCHOR_FALLBACK_WAIT_SEC,
    THREE_ANCHOR_CONFIDENCE_FACTOR,
    THREE_ANCHOR_INITIAL_CONFIRM_UPDATES,
    THREE_ANCHOR_JUMP_CONFIRM_RADIUS_M,
    THREE_ANCHOR_JUMP_CONFIRM_UPDATES,
    THREE_ANCHOR_LARGE_JUMP_M,
    THREE_ANCHOR_MAX_RESIDUAL_M,
    TRILATERATION_MAX_RMS_ERROR_M,
    USE_ADAPTIVE_SMOOTHING,
    USE_FILTERED_RSSI,
    USE_MOTION_STATE,
    USE_PACKET_SLOT_SYNC,
    USE_LATEST_SYNC_FRAME_ONLY,
    USE_LOW_CONFIDENCE_JUMP_GUARD,
    USE_POSITION_AGGREGATION,
    USE_POSITION_SMOOTHING,
    USE_PROLONGED_STILLNESS_ALERT,
    USE_RSSI_FINGERPRINT_FUSION,
    USE_RSSI_IQR_FILTER,
    USE_SOFT_PRESSURE_FUSION,
    USE_STATIONARY_HOLD,
    USE_TIME_SYNC_FALLBACK_AFTER_RELAX,
    USE_WEIGHTED_CENTROID_FALLBACK,
    VERBOSE_LOGGING,
    MAX_SYNC_FRAME_AGE_SEC,
)


@dataclass
class AnchorReading:
    rssi: float
    updated_at: float


@dataclass
class RssiSample:
    received_at: float
    rssi: float
    packet_slot: Optional[int]
    rx_epoch_ms: Optional[int]
    time_source: str = "ntp"


@dataclass
class PressureState:
    location: str
    occupied: bool
    x: float
    y: float
    label: str
    raw_adc: int
    weight_kg: float
    updated_at: float


@dataclass
class RssiFingerprint:
    x: float
    y: float
    rssi_by_anchor: Dict[str, float]


class IndoorPositioningServer:
    def __init__(self) -> None:
        self.readings: Dict[str, AnchorReading] = {}
        self.rssi_history: Dict[str, deque[RssiSample]] = {
            anchor_id: deque(maxlen=4000) for anchor_id in ANCHORS
        }
        self.last_position: Optional[Tuple[float, float]] = None
        self.output_position: Optional[Tuple[float, float]] = None
        self.last_jump_guard_position: Optional[Tuple[float, float]] = None
        self.last_jump_guard_at: Optional[float] = None
        self.position_window: deque[Tuple[float, float]] = deque(
            maxlen=max(1, POSITION_AGGREGATION_WINDOW)
        )
        self.stationary_count = 0
        self.stationary_hold_active = False
        self.release_count = 0
        self.last_alpha = POSITION_SMOOTHING_ALPHA
        self.pending_three_anchor_position: Optional[Tuple[float, float]] = None
        self.pending_three_anchor_count = 0

        # Motion state
        self.motion_state = "unknown"
        self.motion_state_count = 0
        self.last_motion_position: Optional[Tuple[float, float]] = None
        self.stillness_started_at: Optional[float] = None
        self.last_stillness_alert_at: float = 0.0

        # Pressure sensor fusion state
        self.pressure_states: Dict[str, PressureState] = {}
        self.pressure_override_active = False
        self.pressure_override_location: Optional[str] = None
        self.pressure_override_expires_at: float = 0.0

        self.sync_reference_anchor = (
            SLOT_SYNC_REFERENCE_ANCHOR
            if SLOT_SYNC_REFERENCE_ANCHOR in ANCHORS
            else sorted(ANCHORS.keys())[0]
        )
        self.slot_offset_state: Dict[str, int] = {self.sync_reference_anchor: 0}
        self.last_published_sync_frame_ts = 0.0
        self.last_published_fallback_sample_ts = 0.0
        self.data_lock = threading.RLock()
        self.data_ready = threading.Event()
        self.pending_anchor_samples: Dict[str, float] = {}
        self.batch_started_at: Optional[float] = None
        self.rssi_fingerprints = self.load_rssi_fingerprints()

        xs = [float(cfg["x"]) for cfg in ANCHORS.values()]
        ys = [float(cfg["y"]) for cfg in ANCHORS.values()]
        self.strict_min_x = min(0.0, min(xs))
        self.strict_max_x = max(xs)
        self.strict_min_y = min(0.0, min(ys))
        self.strict_max_y = max(ys)
        self.min_x = min(0.0, min(xs)) - max(0.0, ROOM_BOUNDS_MARGIN_M)
        self.max_x = max(xs) + max(0.0, ROOM_BOUNDS_MARGIN_M)
        self.min_y = min(0.0, min(ys)) - max(0.0, ROOM_BOUNDS_MARGIN_M)
        self.max_y = max(ys) + max(0.0, ROOM_BOUNDS_MARGIN_M)

        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="indoor_positioning_server",
        )
        if MQTT_USERNAME:
            self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.on_disconnect = self.on_disconnect

    def on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            print(f"[MQTT] Connected to {MQTT_BROKER}:{MQTT_PORT}")
            client.subscribe(MQTT_RSSI_TOPIC)
            print(f"[MQTT] Subscribed: {MQTT_RSSI_TOPIC}")
            client.subscribe(MQTT_PRESSURE_TOPIC)
            print(f"[MQTT] Subscribed: {MQTT_PRESSURE_TOPIC}")
        else:
            print(f"[MQTT] Connection failed: rc={reason_code}")

    def on_disconnect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code != 0:
            print(f"[MQTT] Disconnected unexpectedly: rc={reason_code}")

    def on_message(self, client, userdata, msg):
        # Route pressure sensor messages separately
        if msg.topic.startswith("indoor/pressure/"):
            self._handle_pressure_message(msg)
            return

        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except json.JSONDecodeError:
            print(f"[WARN] Invalid JSON: {msg.payload}")
            return

        topic_anchor = msg.topic.split("/")[2] if msg.topic.count("/") >= 3 else None
        anchor_id = payload.get("anchor") or topic_anchor

        if not anchor_id or anchor_id not in ANCHORS:
            if VERBOSE_LOGGING:
                print(f"[WARN] Unknown anchor in message: {anchor_id}")
            return

        if USE_FILTERED_RSSI and "filtered" in payload:
            rssi = float(payload["filtered"])
        elif "raw" in payload:
            rssi = float(payload["raw"])
        else:
            if VERBOSE_LOGGING:
                print(f"[WARN] Missing RSSI fields in payload: {payload}")
            return

        packet_slot: Optional[int] = None
        if "packet_slot" in payload:
            try:
                packet_slot = int(payload["packet_slot"])
            except (TypeError, ValueError):
                packet_slot = None

        rx_epoch_ms: Optional[int] = None
        if "rx_epoch_ms" in payload:
            try:
                rx_epoch_ms = int(payload["rx_epoch_ms"])
            except (TypeError, ValueError):
                rx_epoch_ms = None

        time_source = str(payload.get("time_source", "ntp")).lower()

        now = time.time()
        with self.data_lock:
            self.readings[anchor_id] = AnchorReading(rssi=rssi, updated_at=now)
            self.rssi_history[anchor_id].append(
                RssiSample(
                    received_at=now,
                    rssi=rssi,
                    packet_slot=packet_slot,
                    rx_epoch_ms=rx_epoch_ms,
                    time_source=time_source,
                )
            )
            if self.batch_started_at is None:
                self.batch_started_at = now
            self.pending_anchor_samples[anchor_id] = now
        self.data_ready.set()

    def _handle_pressure_message(self, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except json.JSONDecodeError:
            print(f"[WARN] Invalid pressure JSON: {msg.payload}")
            return

        location = payload.get("location")
        if not location or location not in FURNITURE:
            if VERBOSE_LOGGING:
                print(f"[WARN] Unknown pressure location: {location}")
            return

        occupied = bool(payload.get("occupied", False))
        raw_adc = int(payload.get("raw_adc", 0))
        weight_kg = float(payload.get("weight_kg", 0.0))
        furniture = FURNITURE[location]

        try:
            x = float(payload.get("x", furniture["x"]))
            y = float(payload.get("y", furniture["y"]))
        except (TypeError, ValueError):
            x = float(furniture["x"])
            y = float(furniture["y"])

        if not math.isfinite(x) or not math.isfinite(y):
            x = float(furniture["x"])
            y = float(furniture["y"])

        x = self.clamp(x, self.strict_min_x, self.strict_max_x)
        y = self.clamp(y, self.strict_min_y, self.strict_max_y)
        label = str(payload.get("label") or furniture.get("label", location))

        now = time.time()
        self.pressure_states[location] = PressureState(
            location=location,
            occupied=occupied,
            x=x,
            y=y,
            label=label,
            raw_adc=raw_adc,
            weight_kg=weight_kg,
            updated_at=now,
        )

        if VERBOSE_LOGGING:
            status = "OCCUPIED" if occupied else "vacant"
            print(
                f"[PRESSURE] {location} {status} | "
                f"center=({x:.2f},{y:.2f}) "
                f"adc={raw_adc} weight={weight_kg:.1f}kg"
            )

        # Manage override state with hysteresis / grace period
        if occupied:
            self.pressure_override_active = True
            self.pressure_override_location = location
            self.pressure_override_expires_at = now + 3.0
        elif self.pressure_override_location == location and not occupied:
            self.pressure_override_active = False
            self.pressure_override_location = None
            self.pressure_override_expires_at = 0.0
            self.last_position = None
            self.output_position = None
            self.position_window.clear()
            self.stationary_hold_active = False
            self.stationary_count = 0
            self.release_count = 0
            if VERBOSE_LOGGING:
                print(f"[PRESSURE] {location} released; BLE positioning resumed")

        self.data_ready.set()

    def get_pressure_override_target(
        self,
    ) -> Optional[Tuple[float, float, str]]:
        location = self.pressure_override_location
        if not location:
            return None

        state = self.pressure_states.get(location)
        if state is not None and state.occupied:
            return state.x, state.y, state.label

        furniture = FURNITURE.get(location)
        if furniture is None:
            return None

        return (
            float(furniture["x"]),
            float(furniture["y"]),
            str(furniture.get("label", location)),
        )

    def wait_for_position_batch(
        self,
    ) -> Tuple[Set[str], Optional[float], Dict[str, float], bool]:
        """Wait until four anchors are ready or the three-anchor deadline expires."""
        fallback_wait = max(0.1, float(THREE_ANCHOR_FALLBACK_WAIT_SEC))
        four_anchor_settle = max(0.0, float(FOUR_ANCHOR_SETTLE_SEC))
        four_anchor_deadline: Optional[float] = None

        while True:
            with self.data_lock:
                now = time.time()
                pending_snapshot = dict(self.pending_anchor_samples)
                pending_ids = set(pending_snapshot)
                batch_started_at = self.batch_started_at
                signaled = self.data_ready.is_set()

                if len(pending_ids) >= 4:
                    if four_anchor_deadline is None:
                        four_anchor_deadline = now + four_anchor_settle
                    remaining = four_anchor_deadline - now
                    if remaining <= 0.0:
                        self.data_ready.clear()
                        return pending_ids, batch_started_at, pending_snapshot, False
                    wait_timeout: Optional[float] = remaining
                elif batch_started_at is not None:
                    remaining = fallback_wait - (now - batch_started_at)
                    if remaining <= 0.0:
                        self.data_ready.clear()
                        return pending_ids, batch_started_at, pending_snapshot, True
                    wait_timeout: Optional[float] = remaining
                else:
                    wait_timeout = None

                if signaled and not pending_ids and self.pressure_override_active:
                    self.data_ready.clear()
                    return pending_ids, None, pending_snapshot, False

                self.data_ready.clear()

            self.data_ready.wait(timeout=wait_timeout)

    def finish_position_batch(self, processed_samples: Dict[str, float]) -> None:
        """Consume only samples seen by this calculation and preserve newer arrivals."""
        if not processed_samples:
            return

        with self.data_lock:
            for anchor_id, processed_at in processed_samples.items():
                current_at = self.pending_anchor_samples.get(anchor_id)
                if current_at is not None and current_at <= processed_at:
                    self.pending_anchor_samples.pop(anchor_id, None)

            if self.pending_anchor_samples:
                self.batch_started_at = min(self.pending_anchor_samples.values())
                self.data_ready.set()
            else:
                self.batch_started_at = None


    @staticmethod
    def rssi_to_distance(rssi: float, tx_power: float, n: float) -> float:
        return 10 ** ((tx_power - rssi) / (10 * n))

    @staticmethod
    def clamp(value: float, min_value: float, max_value: float) -> float:
        return max(min_value, min(value, max_value))

    @staticmethod
    def iqr_filtered_values(values: List[float]) -> List[float]:
        if len(values) < 4:
            return list(values)

        ordered = np.array(sorted(float(value) for value in values), dtype=float)
        q1 = float(np.percentile(ordered, 25))
        q3 = float(np.percentile(ordered, 75))
        iqr = q3 - q1
        lower = q1 - RSSI_IQR_MULTIPLIER * iqr
        upper = q3 + RSSI_IQR_MULTIPLIER * iqr
        filtered = [float(value) for value in ordered if lower <= value <= upper]
        return filtered or [float(value) for value in ordered]

    def resolve_rssi_fingerprint_csv(self) -> Optional[Path]:
        configured = str(RSSI_FINGERPRINT_CSV).strip()
        if configured:
            path = Path(configured)
            if not path.is_absolute():
                path = Path(__file__).resolve().parent / path
            return path

        candidates = sorted(
            Path(__file__).resolve().parent.glob("quick_room_calibration_*.csv"),
            key=lambda path: path.stat().st_mtime,
            reverse=True,
        )
        return candidates[0] if candidates else None

    def load_rssi_fingerprints(self) -> List[RssiFingerprint]:
        if not USE_RSSI_FINGERPRINT_FUSION:
            return []

        path = self.resolve_rssi_fingerprint_csv()
        if path is None or not path.exists():
            if VERBOSE_LOGGING:
                print("[FP] No quick-room calibration CSV found; fingerprint fusion disabled.")
            return []

        grouped: Dict[Tuple[float, float], Dict[str, List[float]]] = {}
        try:
            with path.open(newline="", encoding="utf-8") as handle:
                reader = csv.DictReader(handle)
                required = {"point_x", "point_y", "anchor", "rssi_dbm"}
                if not required.issubset(set(reader.fieldnames or [])):
                    print(f"[FP] Calibration CSV missing columns: {path}")
                    return []

                for row in reader:
                    anchor_id = str(row["anchor"])
                    if anchor_id not in ANCHORS:
                        continue
                    point = (float(row["point_x"]), float(row["point_y"]))
                    rssi = float(row["rssi_dbm"])
                    grouped.setdefault(point, {}).setdefault(anchor_id, []).append(rssi)
        except (OSError, ValueError) as exc:
            print(f"[FP] Failed to read calibration CSV {path}: {exc}")
            return []

        fingerprints: List[RssiFingerprint] = []
        min_anchors = max(1, int(RSSI_FINGERPRINT_MIN_ANCHORS))
        for (x, y), by_anchor in grouped.items():
            medians = {
                anchor_id: float(np.median(np.array(self.iqr_filtered_values(values), dtype=float)))
                for anchor_id, values in by_anchor.items()
                if values
            }
            if len(medians) >= min_anchors:
                fingerprints.append(RssiFingerprint(x=x, y=y, rssi_by_anchor=medians))

        if VERBOSE_LOGGING:
            print(f"[FP] Loaded {len(fingerprints)} RSSI fingerprint point(s) from {path.name}")
        return fingerprints

    def get_fresh_anchor_data(self) -> List[Tuple[str, float, float, float, float, float]]:
        now = time.time()
        data: List[Tuple[str, float, float, float, float, float]] = []

        for anchor_id, cfg in ANCHORS.items():
            reading = self.readings.get(anchor_id)
            if not reading:
                continue
            if now - reading.updated_at > MAX_READING_AGE_SEC:
                continue

            path_loss_n = float(cfg.get("path_loss_n", PATH_LOSS_EXPONENT))
            distance = self.rssi_to_distance(
                rssi=reading.rssi,
                tx_power=float(cfg["tx_power"]),
                n=path_loss_n,
            )
            distance = self.clamp(distance, MIN_DISTANCE_M, MAX_DISTANCE_M)
            data.append(
                (
                    anchor_id,
                    float(cfg["x"]),
                    float(cfg["y"]),
                    distance,
                    reading.updated_at,
                    rssi,
                )
            )

        return data

    def get_snapshot_anchor_data(
        self,
        allowed_anchor_ids: Optional[Set[str]] = None,
        since: Optional[float] = None,
    ) -> Tuple[List[Tuple[str, float, float, float, float, str, float]], Dict[str, int]]:
        now = time.time()
        window_sec = max(1.0, float(SNAPSHOT_WINDOW_SEC))
        window_start = now - window_sec
        sample_start = max(window_start, since) if since is not None else window_start

        data: List[Tuple[str, float, float, float, float, str, float]] = []
        sample_counts: Dict[str, int] = {}

        for anchor_id, cfg in ANCHORS.items():
            if allowed_anchor_ids is not None and anchor_id not in allowed_anchor_ids:
                continue

            history = self.rssi_history.get(anchor_id)
            if history is None:
                continue

            while history and history[0].received_at < window_start:
                history.popleft()

            batch_history = [
                item for item in history if item.received_at >= sample_start
            ]
            sample_counts[anchor_id] = len(batch_history)
            use_window = len(batch_history) >= max(
                1,
                MIN_SNAPSHOT_SAMPLES_PER_ANCHOR,
            )

            if use_window:
                rssi_values = np.array(
                    [item.rssi for item in batch_history],
                    dtype=float,
                )
                if (
                    USE_RSSI_IQR_FILTER
                    and len(rssi_values) >= 4
                ):
                    q1 = float(np.percentile(rssi_values, 25))
                    q3 = float(np.percentile(rssi_values, 75))
                    iqr = q3 - q1
                    lower = q1 - RSSI_IQR_MULTIPLIER * iqr
                    upper = q3 + RSSI_IQR_MULTIPLIER * iqr
                    mask = (rssi_values >= lower) & (rssi_values <= upper)
                    filtered = rssi_values[mask]
                    if len(filtered) >= 2:
                        rssi_values = filtered
                        if VERBOSE_LOGGING:
                            removed = len(batch_history) - len(filtered)
                            if removed > 0:
                                print(
                                    f"[IQR] {anchor_id}: removed {removed} outlier(s), "
                                    f"kept {len(filtered)}"
                                )
                rssi = float(np.median(rssi_values))
                updated_at = float(batch_history[-1].received_at)
                time_source = str(batch_history[-1].time_source)
            else:
                reading = self.readings.get(anchor_id)
                if not reading:
                    continue
                if reading.updated_at < sample_start:
                    continue
                if now - reading.updated_at > max(MAX_READING_AGE_SEC, window_sec):
                    continue
                rssi = float(reading.rssi)
                updated_at = float(reading.updated_at)
                time_source = "ntp"

            path_loss_n = float(cfg.get("path_loss_n", PATH_LOSS_EXPONENT))
            distance = self.rssi_to_distance(
                rssi=rssi,
                tx_power=float(cfg["tx_power"]),
                n=path_loss_n,
            )
            distance = self.clamp(distance, MIN_DISTANCE_M, MAX_DISTANCE_M)
            data.append(
                (
                    anchor_id,
                    float(cfg["x"]),
                    float(cfg["y"]),
                    distance,
                    updated_at,
                    time_source,
                    rssi,
                )
            )

        return data, sample_counts

    @staticmethod
    def derive_packet_slot(sample: RssiSample) -> Optional[int]:
        if sample.packet_slot is not None:
            return int(sample.packet_slot)

        if sample.rx_epoch_ms is not None:
            interval_ms = max(1, int(BEACON_ADV_INTERVAL_MS))
            return int(sample.rx_epoch_ms // interval_ms)

        return None

    @staticmethod
    def count_slot_overlap(
        values: List[int],
        reference_slots: set[int],
        candidate_offset: int,
        tolerance_slots: int,
    ) -> int:
        if not values or not reference_slots:
            return 0

        tolerance = max(0, int(tolerance_slots))
        overlap = 0
        for slot in values:
            aligned_slot = slot - candidate_offset
            matched = False
            for delta in range(-tolerance, tolerance + 1):
                if (aligned_slot + delta) in reference_slots:
                    matched = True
                    break
            if matched:
                overlap += 1
        return overlap

    def estimate_anchor_slot_offsets(
        self,
        slot_series: Dict[str, List[int]],
    ) -> Dict[str, int]:
        usable = {anchor_id: values for anchor_id, values in slot_series.items() if values}
        if not usable:
            return {}

        if self.sync_reference_anchor in usable:
            reference_anchor = self.sync_reference_anchor
        else:
            reference_anchor = max(usable, key=lambda anchor_id: len(usable[anchor_id]))

        reference_values = usable[reference_anchor]
        reference_slots = set(reference_values)
        reference_center = int(np.median(np.array(reference_values, dtype=float)))
        tolerance_slots = max(0, int(SLOT_OVERLAP_TOLERANCE_SLOTS))
        max_step = max(1, int(SLOT_OFFSET_MAX_STEP_PER_UPDATE))
        search_radius = max(12, int(SLOT_OFFSET_SEARCH_RADIUS))

        offsets: Dict[str, int] = {reference_anchor: 0}
        for anchor_id, values in usable.items():
            if anchor_id == reference_anchor:
                continue

            anchor_center = int(np.median(np.array(values, dtype=float)))
            coarse_offset = anchor_center - reference_center
            prev_offset = self.slot_offset_state.get(anchor_id)

            best_offset = prev_offset if prev_offset is not None else coarse_offset
            best_overlap = -1
            best_penalty = float("inf")

            def evaluate(candidate: int) -> None:
                nonlocal best_offset, best_overlap, best_penalty
                overlap = self.count_slot_overlap(
                    values,
                    reference_slots,
                    candidate,
                    tolerance_slots,
                )
                target = prev_offset if prev_offset is not None else coarse_offset
                penalty = abs(candidate - target)
                if overlap > best_overlap:
                    best_offset = candidate
                    best_overlap = overlap
                    best_penalty = penalty
                elif overlap == best_overlap and penalty < best_penalty:
                    best_offset = candidate
                    best_penalty = penalty

            for candidate in range(coarse_offset - search_radius, coarse_offset + search_radius + 1):
                evaluate(candidate)

            if prev_offset is not None:
                local_radius = max(6, max_step * 3)
                for candidate in range(prev_offset - local_radius, prev_offset + local_radius + 1):
                    evaluate(candidate)

            min_required = max(2, min(6, len(values) // 3))
            chosen_offset = best_offset
            if best_overlap < min_required:
                chosen_offset = prev_offset if prev_offset is not None else coarse_offset
            elif prev_offset is not None:
                delta = chosen_offset - prev_offset
                if abs(delta) > max_step:
                    prev_overlap = self.count_slot_overlap(
                        values,
                        reference_slots,
                        prev_offset,
                        tolerance_slots,
                    )
                    if best_overlap <= prev_overlap + 1:
                        chosen_offset = prev_offset + (max_step if delta > 0 else -max_step)

            offsets[anchor_id] = int(chosen_offset)

        if reference_anchor == self.sync_reference_anchor:
            self.slot_offset_state = dict(offsets)
            self.slot_offset_state[self.sync_reference_anchor] = 0
        elif reference_anchor in self.slot_offset_state:
            reference_absolute = int(self.slot_offset_state[reference_anchor])
            for anchor_id, offset in offsets.items():
                if anchor_id == reference_anchor:
                    self.slot_offset_state[anchor_id] = reference_absolute
                else:
                    self.slot_offset_state[anchor_id] = reference_absolute + int(offset)
            self.slot_offset_state[self.sync_reference_anchor] = 0

        return offsets

    def get_packet_synced_anchor_frames(
        self,
        allowed_anchor_ids: Optional[Set[str]] = None,
        since: Optional[float] = None,
    ) -> Tuple[List[List[Tuple[str, float, float, float, float, str, float]]], Dict[str, int], int]:
        now = time.time()
        window_sec = max(1.0, float(SNAPSHOT_WINDOW_SEC))
        window_start = now - window_sec
        sample_start = max(window_start, since) if since is not None else window_start

        sample_counts: Dict[str, int] = {}
        slot_samples_by_anchor: Dict[str, List[Tuple[int, RssiSample]]] = {}
        samples_with_slot = 0

        for anchor_id in ANCHORS:
            if allowed_anchor_ids is not None and anchor_id not in allowed_anchor_ids:
                continue

            history = self.rssi_history.get(anchor_id)
            if history is None:
                continue

            while history and history[0].received_at < window_start:
                history.popleft()

            batch_samples = [
                sample for sample in history if sample.received_at >= sample_start
            ]
            sample_counts[anchor_id] = len(batch_samples)

            for sample in batch_samples:
                raw_slot = self.derive_packet_slot(sample)
                if raw_slot is None:
                    continue

                samples_with_slot += 1
                slot_samples_by_anchor.setdefault(anchor_id, []).append((raw_slot, sample))

        slot_series = {
            anchor_id: [entry[0] for entry in entries]
            for anchor_id, entries in slot_samples_by_anchor.items()
        }
        uses_global_slots = all(
            sample.rx_epoch_ms is not None and sample.time_source != "local"
            for entries in slot_samples_by_anchor.values()
            for _, sample in entries
        )
        if uses_global_slots:
            slot_offsets = {anchor_id: 0 for anchor_id in slot_samples_by_anchor}
        else:
            slot_offsets = self.estimate_anchor_slot_offsets(slot_series)

        if VERBOSE_LOGGING and slot_offsets:
            non_zero_offsets = {k: v for k, v in slot_offsets.items() if v != 0}
            if non_zero_offsets:
                print(f"[SYNC] estimated slot offsets: {non_zero_offsets}")

        aligned_samples_by_anchor: Dict[str, List[Tuple[int, RssiSample]]] = {}
        for anchor_id, entries in slot_samples_by_anchor.items():
            anchor_offset = slot_offsets.get(anchor_id, 0)
            latest_by_slot: Dict[int, RssiSample] = {}
            for raw_slot, sample in entries:
                aligned_slot = raw_slot - anchor_offset
                previous = latest_by_slot.get(aligned_slot)
                if previous is None or sample.received_at > previous.received_at:
                    latest_by_slot[aligned_slot] = sample
            aligned_samples_by_anchor[anchor_id] = sorted(latest_by_slot.items())

        frames: List[List[Tuple[str, float, float, float, float, str, float]]] = []
        min_frame_anchors = max(3, int(MIN_ANCHORS_PER_SYNC_FRAME))
        slot_tolerance = max(0, int(FRAME_MATCH_TOLERANCE_SLOTS))
        center_slots = sorted(
            {
                slot_id
                for entries in aligned_samples_by_anchor.values()
                for slot_id, _ in entries
            }
        )
        seen_frames: Set[Tuple[Tuple[str, int, float], ...]] = set()

        for center_slot in center_slots:
            grouped: Dict[str, Tuple[int, RssiSample]] = {}
            for anchor_id, entries in aligned_samples_by_anchor.items():
                candidates = [
                    (abs(slot_id - center_slot), -sample.received_at, slot_id, sample)
                    for slot_id, sample in entries
                    if abs(slot_id - center_slot) <= slot_tolerance
                ]
                if not candidates:
                    continue

                _, _, selected_slot, selected_sample = min(candidates)
                grouped[anchor_id] = (selected_slot, selected_sample)

            if len(grouped) < min_frame_anchors:
                continue

            frame: List[Tuple[str, float, float, float, float, str, float]] = []
            frame_key_parts: List[Tuple[str, int, float]] = []
            for anchor_id, (slot_id, sample) in grouped.items():
                cfg = ANCHORS[anchor_id]
                path_loss_n = float(cfg.get("path_loss_n", PATH_LOSS_EXPONENT))
                distance = self.rssi_to_distance(
                    rssi=sample.rssi,
                    tx_power=float(cfg["tx_power"]),
                    n=path_loss_n,
                )
                distance = self.clamp(distance, MIN_DISTANCE_M, MAX_DISTANCE_M)

                timestamp_s = sample.received_at
                if sample.rx_epoch_ms is not None and sample.time_source != "local":
                    timestamp_s = float(sample.rx_epoch_ms) / 1000.0

                frame.append(
                    (
                        anchor_id,
                        float(cfg["x"]),
                        float(cfg["y"]),
                        distance,
                        float(timestamp_s),
                        str(sample.time_source),
                        float(sample.rssi),
                    )
                )
                frame_key_parts.append((anchor_id, slot_id, round(sample.received_at, 6)))

            if len(frame) >= min_frame_anchors:
                frame_key = tuple(sorted(frame_key_parts))
                if frame_key in seen_frames:
                    continue
                seen_frames.add(frame_key)
                frame.sort(key=lambda item: item[0])
                frames.append(frame)

        return frames, sample_counts, samples_with_slot

    @staticmethod
    def is_time_synchronized(
        anchor_data: List[Tuple[str, float, float, float, float, str, float]],
        limit_override_sec: Optional[float] = None,
    ) -> Tuple[bool, float]:
        if len(anchor_data) < 3:
            return False, float("inf")
        timestamps = [item[4] for item in anchor_data]
        span = max(timestamps) - min(timestamps)
        time_sources = {item[5] for item in anchor_data}
        is_local = "local" in time_sources
        if limit_override_sec is not None:
            limit = max(0.0, float(limit_override_sec))
        else:
            limit = (
                LOCAL_TIME_SYNC_SPAN_LIMIT_SEC
                if (is_local and ALLOW_LOCAL_TIME_SYNC)
                else ANCHOR_SYNC_WINDOW_SEC
            )
        return span <= limit, span

    def try_relaxed_snapshot_fallback(
        self,
        allowed_anchor_ids: Optional[Set[str]] = None,
        since: Optional[float] = None,
    ) -> Tuple[
        Optional[Tuple[float, float]],
        float,
        str,
        float,
        Dict[str, int],
        List[Tuple[str, float, float, float]],
        Dict[str, float],
        str,
        float,
    ]:
        fallback_since = since
        if fallback_since is None:
            fallback_since = time.time() - max(
                0.1,
                float(RELAXED_ANCHOR_SYNC_WINDOW_SEC),
            )

        anchor_data, sample_counts = self.get_snapshot_anchor_data(
            allowed_anchor_ids=allowed_anchor_ids,
            since=fallback_since,
        )
        min_anchor_count = max(3, int(MIN_ANCHORS_PER_SYNC_FRAME))
        if len(anchor_data) < min_anchor_count:
            online = [item[0] for item in anchor_data]
            return (
                None,
                float("inf"),
                "unknown",
                float("inf"),
                sample_counts,
                [],
                {},
                (
                    f"fallback snapshot anchors={len(online)} "
                    f"(< {min_anchor_count}) -> {online}"
                ),
                0.0,
            )

        synchronized_subset, span = self.select_best_synchronized_subset(
            anchor_data,
            max_span_sec=RELAXED_ANCHOR_SYNC_WINDOW_SEC,
            min_anchor_count=min_anchor_count,
        )
        if len(synchronized_subset) < min_anchor_count:
            return (
                None,
                float("inf"),
                "unknown",
                span,
                sample_counts,
                [],
                {},
                (
                    f"fallback snapshot span too large: {span:.2f}s "
                    f"(limit={RELAXED_ANCHOR_SYNC_WINDOW_SEC:.2f}s)"
                ),
                0.0,
            )

        latest_sample_ts = max(float(item[4]) for item in synchronized_subset)
        fallback_age_sec = time.time() - latest_sample_ts
        max_fallback_age_sec = max(0.1, float(MAX_SYNC_FRAME_AGE_SEC))
        if fallback_age_sec > max_fallback_age_sec:
            return (
                None,
                float("inf"),
                "unknown",
                span,
                sample_counts,
                [],
                {},
                (
                    f"fallback snapshot is stale: age={fallback_age_sec:.2f}s "
                    f"(limit={max_fallback_age_sec:.2f}s)"
                ),
                latest_sample_ts,
            )

        last_published_sample_ts = max(
            self.last_published_fallback_sample_ts,
            self.last_published_sync_frame_ts,
        )
        if latest_sample_ts <= last_published_sample_ts + 1e-6:
            return (
                None,
                float("inf"),
                "unknown",
                span,
                sample_counts,
                [],
                {},
                "fallback snapshot has no newer anchor sample",
                latest_sample_ts,
            )

        anchor_distances = [item[:4] for item in synchronized_subset]
        rssi_by_anchor = {str(item[0]): float(item[6]) for item in synchronized_subset}
        position, residual_rms_m, solver, used_anchors = self.solve_anchor_distances(
            anchor_distances
        )
        if position is None:
            return (
                None,
                float("inf"),
                "unknown",
                span,
                sample_counts,
                [],
                rssi_by_anchor,
                "fallback trilateration failed",
                latest_sample_ts,
            )

        if len(synchronized_subset) == 3:
            solver = f"{solver}+three_anchor_fallback"

        return (
            self.bound_position(position[0], position[1]),
            residual_rms_m,
            f"{solver}+time_fallback",
            span,
            sample_counts,
            used_anchors,
            rssi_by_anchor,
            "",
            latest_sample_ts,
        )

    @staticmethod
    def select_best_synchronized_subset(
        anchor_data: List[Tuple[str, float, float, float, float, str, float]],
        max_span_sec: float,
        min_anchor_count: int = 3,
    ) -> Tuple[List[Tuple[str, float, float, float, float, str, float]], float]:
        """Prefer the largest fresh anchor set within the allowed time span."""
        min_size = max(3, int(min_anchor_count))
        if len(anchor_data) < min_size:
            return [], float("inf")

        limit = max(0.0, float(max_span_sec))
        max_size = min(4, len(anchor_data))
        best_rejected_span = float("inf")

        for subset_size in range(max_size, min_size - 1, -1):
            candidates = []
            for subset in itertools.combinations(anchor_data, subset_size):
                timestamps = [float(item[4]) for item in subset]
                span = max(timestamps) - min(timestamps)
                best_rejected_span = min(best_rejected_span, span)
                if span <= limit:
                    candidates.append(
                        (
                            span,
                            -min(timestamps),
                            tuple(sorted(item[0] for item in subset)),
                            list(subset),
                        )
                    )

            if candidates:
                candidates.sort(key=lambda item: (item[0], item[1], item[2]))
                best = candidates[0]
                return best[3], float(best[0])

        return [], best_rejected_span

    @staticmethod
    def frame_timestamp(
        frame: List[Tuple[str, float, float, float, float, str, float]]
    ) -> float:
        if not frame:
            return 0.0
        return max(float(item[4]) for item in frame)

    def estimate_position_from_fingerprint(
        self,
        rssi_by_anchor: Dict[str, float],
    ) -> Tuple[Optional[Tuple[float, float]], float, int, Optional[Tuple[float, float]]]:
        if not self.rssi_fingerprints or not USE_RSSI_FINGERPRINT_FUSION:
            return None, float("inf"), 0, None

        min_anchors = max(1, int(RSSI_FINGERPRINT_MIN_ANCHORS))
        scored: List[Tuple[float, RssiFingerprint, int]] = []
        for fingerprint in self.rssi_fingerprints:
            common = [
                anchor_id
                for anchor_id in rssi_by_anchor
                if anchor_id in fingerprint.rssi_by_anchor
            ]
            if len(common) < min_anchors:
                continue

            rms_db = math.sqrt(
                sum(
                    (float(rssi_by_anchor[anchor_id]) - fingerprint.rssi_by_anchor[anchor_id])
                    ** 2
                    for anchor_id in common
                )
                / len(common)
            )
            scored.append((float(rms_db), fingerprint, len(common)))

        if not scored:
            return None, float("inf"), 0, None

        scored.sort(key=lambda item: item[0])
        best_rms, best_fingerprint, best_count = scored[0]
        if best_rms > max(0.1, float(RSSI_FINGERPRINT_MAX_RMS_DB)):
            return None, best_rms, best_count, (best_fingerprint.x, best_fingerprint.y)

        top_k = max(1, int(RSSI_FINGERPRINT_TOP_K))
        power = max(0.1, float(RSSI_FINGERPRINT_WEIGHT_POWER))
        weighted_x = 0.0
        weighted_y = 0.0
        weight_sum = 0.0
        for rms_db, fingerprint, _ in scored[:top_k]:
            weight = 1.0 / (max(1.0, rms_db) ** power)
            weighted_x += weight * fingerprint.x
            weighted_y += weight * fingerprint.y
            weight_sum += weight

        if weight_sum <= 1e-9:
            return None, best_rms, best_count, (best_fingerprint.x, best_fingerprint.y)

        return (
            weighted_x / weight_sum,
            weighted_y / weight_sum,
        ), best_rms, best_count, (best_fingerprint.x, best_fingerprint.y)

    def apply_rssi_fingerprint_fusion(
        self,
        x: float,
        y: float,
        confidence: float,
        solver: str,
        residual_rms_m: float,
        rssi_by_anchor: Dict[str, float],
    ) -> Tuple[float, float, float, str, float]:
        fingerprint_position, rms_db, anchor_count, best_point = (
            self.estimate_position_from_fingerprint(rssi_by_anchor)
        )
        if fingerprint_position is None:
            if VERBOSE_LOGGING and math.isfinite(rms_db):
                print(
                    "[FP] No fingerprint correction: "
                    f"best_rms={rms_db:.1f}dB, anchors={anchor_count}"
                )
            return x, y, confidence, solver, residual_rms_m

        blend = self.clamp(float(RSSI_FINGERPRINT_BLEND), 0.0, 1.0)
        fx, fy = self.bound_position(fingerprint_position[0], fingerprint_position[1])
        fused_x = (1.0 - blend) * x + blend * fx
        fused_y = (1.0 - blend) * y + blend * fy
        fused_confidence = max(confidence, self.clamp(1.0 - rms_db / 12.0, 0.55, 0.95))
        fused_residual = residual_rms_m * (1.0 - 0.35 * blend)
        fused_solver = f"fingerprint({solver})"

        if VERBOSE_LOGGING:
            best = (
                f"best=({best_point[0]:.2f},{best_point[1]:.2f})"
                if best_point is not None
                else "best=unknown"
            )
            print(
                "[FP] RSSI fingerprint correction: "
                f"rms={rms_db:.1f}dB, anchors={anchor_count}, {best}, "
                f"fp=({fx:.2f},{fy:.2f}), "
                f"ble=({x:.2f},{y:.2f}), "
                f"out=({fused_x:.2f},{fused_y:.2f})"
            )

        return fused_x, fused_y, fused_confidence, fused_solver, fused_residual

    def smooth_position(
        self, x: float, y: float, confidence: float = 0.5
    ) -> Tuple[float, float]:
        if not USE_POSITION_SMOOTHING:
            return x, y

        if self.last_position is None:
            self.last_position = (x, y)
            return x, y

        if USE_ADAPTIVE_SMOOTHING:
            # High confidence -> more smoothing (lower alpha).
            # Low confidence -> more responsive (higher alpha).
            target_alpha = SMOOTHING_ALPHA_MIN + (1.0 - confidence) * (
                SMOOTHING_ALPHA_MAX - SMOOTHING_ALPHA_MIN
            )
            # Limit change per update to avoid oscillation at confidence boundaries.
            max_delta = SMOOTHING_ALPHA_MAX_DELTA_PER_UPDATE
            if self.last_alpha is not None:
                target_alpha = self.clamp(
                    target_alpha,
                    self.last_alpha - max_delta,
                    self.last_alpha + max_delta,
                )
            alpha = self.clamp(target_alpha, SMOOTHING_ALPHA_MIN, SMOOTHING_ALPHA_MAX)
        else:
            alpha = self.clamp(POSITION_SMOOTHING_ALPHA, 0.0, 1.0)

        self.last_alpha = alpha
        sx = alpha * x + (1.0 - alpha) * self.last_position[0]
        sy = alpha * y + (1.0 - alpha) * self.last_position[1]
        self.last_position = (sx, sy)

        if VERBOSE_LOGGING and USE_ADAPTIVE_SMOOTHING:
            print(f"[ADAPTIVE] alpha={alpha:.3f} conf={confidence:.2f}")

        return sx, sy

    def guard_low_confidence_jump(
        self,
        x: float,
        y: float,
        confidence: float,
        now: Optional[float] = None,
    ) -> Tuple[float, float, bool]:
        """Hold the previous accepted point when a weak result jumps implausibly far."""
        timestamp = time.time() if now is None else float(now)

        if not USE_LOW_CONFIDENCE_JUMP_GUARD:
            self.last_jump_guard_position = (x, y)
            self.last_jump_guard_at = timestamp
            return x, y, False

        if (
            self.last_jump_guard_position is None
            or self.last_jump_guard_at is None
        ):
            self.last_jump_guard_position = (x, y)
            self.last_jump_guard_at = timestamp
            return x, y, False

        elapsed = max(0.0, timestamp - self.last_jump_guard_at)
        allowed_movement = max(0.0, float(LOW_CONFIDENCE_JUMP_BASE_M)) + (
            max(0.0, float(LOW_CONFIDENCE_MAX_SPEED_MPS)) * elapsed
        )
        max_allowed_jump = max(0.0, float(LOW_CONFIDENCE_MAX_ALLOWED_JUMP_M))
        if max_allowed_jump > 0.0:
            allowed_movement = min(allowed_movement, max_allowed_jump)
        previous_x, previous_y = self.last_jump_guard_position
        movement = math.hypot(x - previous_x, y - previous_y)

        if (
            confidence < float(LOW_CONFIDENCE_JUMP_THRESHOLD)
            and movement > allowed_movement
        ):
            if VERBOSE_LOGGING:
                print(
                    "[JUMP] Rejected low-confidence position: "
                    f"movement={movement:.2f}m, allowed={allowed_movement:.2f}m, "
                    f"confidence={confidence:.2f}"
                )
            return previous_x, previous_y, True

        self.last_jump_guard_position = (x, y)
        self.last_jump_guard_at = timestamp
        return x, y, False

    def guard_unstable_position(
        self,
        x: float,
        y: float,
        confidence: float,
        residual_rms_m: float,
        anchor_count: int,
    ) -> bool:
        """Reject weak or unconfirmed three-anchor points before smoothing."""
        min_confidence = self.clamp(float(MIN_POSITION_CONFIDENCE_TO_PUBLISH), 0.0, 1.0)
        if confidence < min_confidence:
            if VERBOSE_LOGGING:
                print(
                    "[DROP] Position confidence below publish threshold: "
                    f"confidence={confidence:.2f}, min={min_confidence:.2f}"
                )
            return True

        if anchor_count >= 4:
            self.pending_three_anchor_position = None
            self.pending_three_anchor_count = 0
            return False

        if residual_rms_m > max(0.1, float(THREE_ANCHOR_MAX_RESIDUAL_M)):
            if VERBOSE_LOGGING:
                print(
                    "[DROP] Three-anchor residual too high: "
                    f"residual={residual_rms_m:.2f}m, "
                    f"max={float(THREE_ANCHOR_MAX_RESIDUAL_M):.2f}m"
                )
            return True

        previous = self.last_jump_guard_position or self.output_position
        large_jump_threshold = max(0.1, float(THREE_ANCHOR_LARGE_JUMP_M))
        required_updates = max(1, int(THREE_ANCHOR_JUMP_CONFIRM_UPDATES))
        if previous is None:
            self.pending_three_anchor_position = None
            self.pending_three_anchor_count = 0
            return False
        else:
            movement = math.hypot(x - previous[0], y - previous[1])
            required_updates = max(
                required_updates,
                max(1, int(THREE_ANCHOR_INITIAL_CONFIRM_UPDATES)),
            )

        if movement <= large_jump_threshold:
            self.pending_three_anchor_position = None
            self.pending_three_anchor_count = 0
            return False

        cluster_radius = max(0.1, float(THREE_ANCHOR_JUMP_CONFIRM_RADIUS_M))
        pending = self.pending_three_anchor_position
        if pending is None or math.hypot(x - pending[0], y - pending[1]) > cluster_radius:
            self.pending_three_anchor_position = (x, y)
            self.pending_three_anchor_count = 1
        else:
            self.pending_three_anchor_count += 1

        if self.pending_three_anchor_count < required_updates:
            if VERBOSE_LOGGING:
                print(
                    "[WAIT] Three-anchor jump waiting for confirmation: "
                    f"movement={movement:.2f}m, "
                    f"count={self.pending_three_anchor_count}/{required_updates}, "
                    f"confidence={confidence:.2f}, residual={residual_rms_m:.2f}m"
                )
            return True

        if VERBOSE_LOGGING:
            print(
                "[SYNC] Three-anchor jump confirmed: "
                f"movement={movement:.2f}m, "
                f"count={self.pending_three_anchor_count}/{required_updates}"
            )
        self.pending_three_anchor_position = None
        self.pending_three_anchor_count = 0
        return False

    def bound_position(self, x: float, y: float) -> Tuple[float, float]:
        bx = self.clamp(x, self.min_x, self.max_x)
        by = self.clamp(y, self.min_y, self.max_y)
        return bx, by

    def bound_position_strict(self, x: float, y: float) -> Tuple[float, float]:
        bx = self.clamp(x, self.strict_min_x, self.strict_max_x)
        by = self.clamp(y, self.strict_min_y, self.strict_max_y)
        return bx, by

    def apply_stationary_hold(self, x: float, y: float) -> Tuple[float, float, bool]:
        if not USE_STATIONARY_HOLD:
            self.output_position = (x, y)
            return x, y, False
            
        threshold = max(0.01, STATIONARY_MOVE_THRESHOLD_M)
        release_threshold = threshold * max(1.1, STATIONARY_RELEASE_FACTOR)

        if self.output_position is None:
            self.output_position = (x, y)
            self.stationary_count = 0
            self.stationary_hold_active = False
            self.release_count = 0
            return x, y, False

        ox, oy = self.output_position
        movement = math.hypot(x - ox, y - oy)

        if self.stationary_hold_active:
            if movement > release_threshold:
                self.release_count += 1
                if self.release_count >= max(1, STATIONARY_RELEASE_CONFIRM_UPDATES):
                    self.stationary_hold_active = False
                    self.stationary_count = 0
                    self.release_count = 0
                    self.output_position = (x, y)
                    return x, y, False
                return ox, oy, True
            self.release_count = 0
            return ox, oy, True

        if movement <= threshold:
            self.stationary_count += 1
            if self.stationary_count >= max(1, STATIONARY_CONFIRM_UPDATES):
                self.stationary_hold_active = True
                self.release_count = 0
            return ox, oy, self.stationary_hold_active

        self.stationary_count = 0
        self.release_count = 0
        self.output_position = (x, y)
        return x, y, False

    def force_release_hold(self, x: float, y: float) -> None:
        self.stationary_count = 0
        self.stationary_hold_active = False
        self.release_count = 0
        self.output_position = (x, y)

    def aggregate_position(self, x: float, y: float) -> Tuple[float, float, float]:
        self.position_window.append((x, y))
        if not USE_POSITION_AGGREGATION:
            return x, y, 0.0

        xs = np.array([p[0] for p in self.position_window], dtype=float)
        ys = np.array([p[1] for p in self.position_window], dtype=float)

        if POSITION_AGGREGATION_MODE.lower() == "mean":
            ax = float(np.mean(xs))
            ay = float(np.mean(ys))
        else:
            ax = float(np.median(xs))
            ay = float(np.median(ys))

        spread = float(np.sqrt(np.var(xs) + np.var(ys)))
        return ax, ay, spread

    def apply_pressure_fusion(
        self,
        x: float,
        y: float,
        confidence: float,
        solver: str,
        residual_rms_m: float,
        anchor_distances: List[Tuple[str, float, float, float]],
    ) -> Tuple[
        float,
        float,
        float,
        str,
        float,
        List[Tuple[str, float, float, float]],
        Optional[str],
        str,
    ]:
        """Blend BLE coordinate with furniture center when pressure sensor is active.

        Returns (px, py, pconf, psolver, presidual, panchors, semantic, source).
        """
        if not (self.pressure_override_active and self.pressure_override_location):
            return x, y, confidence, solver, residual_rms_m, anchor_distances, None, "ble"

        pressure_target = self.get_pressure_override_target()
        if pressure_target is None:
            return x, y, confidence, solver, residual_rms_m, anchor_distances, None, "ble"

        fx, fy, semantic = pressure_target

        if not USE_SOFT_PRESSURE_FUSION:
            return fx, fy, 1.0, "pressure", 0.0, [], semantic, "pressure"

        dist = math.hypot(x - fx, y - fy)
        start = PRESSURE_FUSION_RADIUS_M
        end = PRESSURE_FUSION_RADIUS_M + PRESSURE_FUSION_BLEND_WIDTH_M

        if dist <= start:
            blend = 1.0
        elif dist >= end:
            blend = 0.0
        else:
            blend = 1.0 - (dist - start) / (end - start)

        if blend <= 0.01:
            return x, y, confidence, solver, residual_rms_m, anchor_distances, None, "ble"

        px = blend * fx + (1.0 - blend) * x
        py = blend * fy + (1.0 - blend) * y
        pconf = max(confidence, 0.5 + 0.5 * blend)
        if blend >= 0.99:
            psolver = "pressure"
            presidual = 0.0
            panchors: List[Tuple[str, float, float, float]] = []
            psource = "pressure"
        else:
            psolver = f"fusion({solver})"
            presidual = residual_rms_m * (1.0 - blend)
            panchors = anchor_distances
            psource = "fusion"

        if VERBOSE_LOGGING:
            print(
                f"[FUSION] {self.pressure_override_location} blend={blend:.2f} "
                f"dist={dist:.2f}m source={psource}"
            )

        return px, py, pconf, psolver, presidual, panchors, semantic, psource

    def detect_motion_state(self, x: float, y: float) -> str:
        if not USE_MOTION_STATE:
            return "unknown"

        if self.last_motion_position is None:
            self.last_motion_position = (x, y)
            return "unknown"

        movement = math.hypot(
            x - self.last_motion_position[0],
            y - self.last_motion_position[1],
        )
        self.last_motion_position = (x, y)

        target = "moving" if movement > MOTION_STATE_THRESHOLD_M else "stationary"

        if target == self.motion_state:
            self.motion_state_count = 0
            return self.motion_state

        self.motion_state_count += 1
        if self.motion_state_count >= max(1, MOTION_STATE_CONFIRM_UPDATES):
            self.motion_state = target
            self.motion_state_count = 0
            if VERBOSE_LOGGING:
                print(f"[MOTION] state={self.motion_state} movement={movement:.3f}m")
        return self.motion_state

    def evaluate_prolonged_stillness(
        self,
        x: float,
        y: float,
        confidence: float,
        activity_state: str,
        source: str,
        semantic_location: Optional[str],
    ) -> None:
        if not USE_PROLONGED_STILLNESS_ALERT:
            return

        now = time.time()
        if (
            activity_state != "stationary"
            or confidence < PROLONGED_STILLNESS_MIN_CONFIDENCE
        ):
            self.stillness_started_at = None
            return

        if self.stillness_started_at is None:
            self.stillness_started_at = now
            return

        duration_seconds = now - self.stillness_started_at
        if duration_seconds < PROLONGED_STILLNESS_DURATION_SEC:
            return
        if now - self.last_stillness_alert_at < PROLONGED_STILLNESS_COOLDOWN_SEC:
            return

        payload = {
            "type": "abnormal_stillness",
            "severity": "WARNING",
            "watch_id": POSITIONING_WATCH_ID,
            "message": (
                f"No meaningful indoor movement was detected for "
                f"{duration_seconds / 60:.0f} minutes."
            ),
            "duration_seconds": round(duration_seconds, 1),
            "position_confidence": round(confidence, 3),
            "position": {"x": round(x, 3), "y": round(y, 3)},
            "activity_state": activity_state,
            "semantic_location": semantic_location,
            "source": source,
            "ts": datetime.now().isoformat(timespec="milliseconds"),
        }
        self.client.publish(
            PRELIMINARY_ALERT_TOPIC,
            json.dumps(payload),
            qos=1,
        )
        self.last_stillness_alert_at = now
        if VERBOSE_LOGGING:
            print(
                "[ALERT] Prolonged stillness preliminary warning: "
                f"duration={duration_seconds / 60:.1f}min "
                f"confidence={confidence:.2f}"
            )

    @staticmethod
    def weighted_centroid(
        anchor_distances: List[Tuple[str, float, float, float]]
    ) -> Optional[Tuple[float, float]]:
        if len(anchor_distances) < 3:
            return None

        weighted_x = 0.0
        weighted_y = 0.0
        weight_sum = 0.0

        for _, xi, yi, di in anchor_distances:
            weight = 1.0 / (max(0.35, di) ** 2)
            weighted_x += weight * xi
            weighted_y += weight * yi
            weight_sum += weight

        if weight_sum <= 1e-9:
            return None

        return weighted_x / weight_sum, weighted_y / weight_sum

    @staticmethod
    def residual_rms(
        x: float,
        y: float,
        anchor_distances: List[Tuple[str, float, float, float]],
    ) -> float:
        if not anchor_distances:
            return float("inf")

        residuals = []
        for _, xi, yi, di in anchor_distances:
            predicted = math.hypot(x - xi, y - yi)
            residuals.append((predicted - di) ** 2)

        return float(math.sqrt(sum(residuals) / len(residuals)))

    @classmethod
    def trilaterate_nonlinear(
        cls,
        anchor_distances: List[Tuple[str, float, float, float]],
    ) -> Optional[Tuple[float, float]]:
        if len(anchor_distances) < 3:
            return None

        init = cls.weighted_centroid(anchor_distances)
        if init is None:
            return None

        x, y = init

        for _ in range(12):
            jacobian_rows = []
            residual_rows = []
            weights = []

            for _, xi, yi, di in anchor_distances:
                dx = x - xi
                dy = y - yi
                predicted = math.hypot(dx, dy)
                predicted = max(predicted, 1e-6)

                residual = predicted - di
                jacobian_rows.append([dx / predicted, dy / predicted])
                residual_rows.append(residual)

                # Near anchors are generally more reliable for RSSI ranging.
                weights.append(1.0 / (max(0.35, di) ** 2))

            j = np.array(jacobian_rows, dtype=float)
            r = np.array(residual_rows, dtype=float)
            w = np.diag(np.array(weights, dtype=float))

            h = j.T @ w @ j
            g = j.T @ w @ r

            try:
                delta = np.linalg.solve(h + 1e-6 * np.eye(2), g)
            except np.linalg.LinAlgError:
                return None

            step = float(math.hypot(delta[0], delta[1]))
            x -= float(delta[0])
            y -= float(delta[1])

            if step < 1e-3:
                break

        return x, y

    def solve_anchor_distances(
        self,
        anchor_distances: List[Tuple[str, float, float, float]],
    ) -> Tuple[Optional[Tuple[float, float]], float, str, List[Tuple[str, float, float, float]]]:
        """Solve position from anchor distances.

        With 4 anchors, try the full set and all 3-subsets, then pick the
        solution with the lowest residual. If the full-set residual is close
        to the best subset residual, prefer the full set so all anchors count.
        This makes the system robust against one bad anchor reading without
        reflashing existing nodes.
        """
        candidates: List[Tuple[Tuple[float, float], float, str, List[Tuple[str, float, float, float]]]] = []

        # Full anchor set
        full_position = self.trilaterate_nonlinear(anchor_distances)
        if full_position is not None:
            full_residual = self.residual_rms(
                full_position[0], full_position[1], anchor_distances
            )
            candidates.append(
                (full_position, full_residual, "trilateration", list(anchor_distances))
            )

        force_all_anchors = int(MIN_ANCHORS_PER_SYNC_FRAME) >= 4

        # For exactly 4 anchors, optionally evaluate every 3-anchor subset.
        # This rejects one outlier anchor while keeping 3 valid ones. In
        # forced-4-anchor mode, keep the full set so the published coordinate
        # is truly calculated from all four ESP32 nodes.
        if len(anchor_distances) == 4 and not force_all_anchors:
            for subset in itertools.combinations(anchor_distances, 3):
                subset_list = list(subset)
                subset_position = self.trilaterate_nonlinear(subset_list)
                if subset_position is None:
                    continue
                subset_residual = self.residual_rms(
                    subset_position[0], subset_position[1], subset_list
                )
                excluded_ids = [
                    item[0] for item in anchor_distances if item not in subset_list
                ]
                solver_name = f"trilateration(exclude {','.join(excluded_ids)})"
                candidates.append(
                    (subset_position, subset_residual, solver_name, subset_list)
                )

        position: Optional[Tuple[float, float]] = None
        residual_rms_m = float("inf")
        solver = "unknown"
        used_anchors = list(anchor_distances)

        if candidates:
            best = min(candidates, key=lambda c: c[1])
            # Prefer the full set if its residual is within a small margin of
            # the best subset. This avoids dropping a valid anchor needlessly.
            full_candidate = candidates[0]
            subset_preference_margin_m = 0.15
            if full_candidate[1] <= best[1] + subset_preference_margin_m:
                position, residual_rms_m, solver, used_anchors = full_candidate
            else:
                position, residual_rms_m, solver, used_anchors = best

        centroid_position = None
        centroid_residual = float("inf")
        if USE_WEIGHTED_CENTROID_FALLBACK:
            centroid_position = self.weighted_centroid(used_anchors)
            if centroid_position is not None:
                centroid_residual = self.residual_rms(
                    centroid_position[0],
                    centroid_position[1],
                    used_anchors,
                )

        if position is None and centroid_position is not None:
            position = centroid_position
            residual_rms_m = centroid_residual
            solver = "centroid_fallback"

        if (
            position is not None
            and solver.startswith("trilateration")
            and centroid_position is not None
            and residual_rms_m > TRILATERATION_MAX_RMS_ERROR_M
        ):
            if centroid_residual + FALLBACK_IMPROVEMENT_MARGIN_M < residual_rms_m:
                position = centroid_position
                residual_rms_m = centroid_residual
                solver = "centroid_fallback"

        return position, residual_rms_m, solver, used_anchors

    def compute_confidence(
        self,
        residual_rms_m: float,
        sync_span_s: float,
        spread_m: float,
        anchor_count: int = 4,
    ) -> float:
        err_scale = max(0.3, CONFIDENCE_ERROR_SCALE_M)
        residual_term = math.exp(-max(0.0, residual_rms_m) / err_scale)
        spread_term = math.exp(-max(0.0, spread_m) / err_scale)

        sync_den = max(0.2, ANCHOR_SYNC_WINDOW_SEC)
        sync_ratio = self.clamp(sync_span_s / sync_den, 0.0, 1.0)
        sync_term = 1.0 - sync_ratio

        confidence = (0.55 * residual_term) + (0.25 * spread_term) + (0.20 * sync_term)
        if anchor_count <= 3:
            confidence *= self.clamp(
                float(THREE_ANCHOR_CONFIDENCE_FACTOR),
                0.0,
                1.0,
            )
        return self.clamp(confidence, 0.0, 1.0)

    def publish_position(
        self,
        x: float,
        y: float,
        raw_x: float,
        raw_y: float,
        spread_m: float,
        sync_span_s: float,
        sync_frames: int,
        confidence: float,
        solver: str,
        residual_rms_m: float,
        anchor_distances: List[Tuple[str, float, float, float]],
        semantic_location: Optional[str] = None,
        source: str = "ble",
        activity_state: str = "unknown",
        stationary_hold: bool = False,
    ) -> None:
        payload = {
            "x": round(x, 3),
            "y": round(y, 3),
            "raw_x": round(raw_x, 3),
            "raw_y": round(raw_y, 3),
            "spread_m": round(spread_m, 3),
            "sync_span_s": round(sync_span_s, 3),
            "sync_frames": int(sync_frames),
            "confidence": round(confidence, 3),
            "solver": solver,
            "residual_rms_m": round(residual_rms_m, 3),
            "unit": "m",
            "anchors_used": [item[0] for item in anchor_distances],
            "distances_m": {item[0]: round(item[3], 3) for item in anchor_distances},
            "semanticLocation": semantic_location,
            "source": source,
            "activity_state": activity_state,
            "stationary_hold": stationary_hold,
            "ts": datetime.now().isoformat(timespec="milliseconds"),
        }
        self.client.publish(MQTT_POSITION_TOPIC, json.dumps(payload), qos=0)

        if VERBOSE_LOGGING:
            sem_str = f" | semantic={semantic_location}" if semantic_location else ""
            src_str = f" | source={source}"
            act_str = f" | activity={activity_state}"
            hold_str = " | HOLD" if stationary_hold else ""
            print(
                f"[LOC] x={payload['x']:.3f}, y={payload['y']:.3f} | "
                f"spread={payload['spread_m']:.3f}m | "
                f"sync_frames={payload['sync_frames']} | "
                f"residual={payload['residual_rms_m']:.3f}m | "
                f"conf={payload['confidence']:.2f} | solver={payload['solver']} | "
                f"anchors={payload['anchors_used']}{sem_str}{src_str}{act_str}{hold_str}"
            )

    def run(self) -> None:
        try:
            self.client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        except OSError as exc:
            print(f"[ERR] Cannot connect to MQTT broker {MQTT_BROKER}:{MQTT_PORT}: {exc}")
            print("[TIP] Start Mosquitto first, then retry indoor_positioning_server.py")
            return

        self.client.loop_start()

        print("[SYS] Indoor positioning server started.")
        print(
            "[SYS] Event-driven positioning enabled: "
            f"4 anchors settle for {FOUR_ANCHOR_SETTLE_SEC:.2f}s, "
            f"3 anchors wait up to {THREE_ANCHOR_FALLBACK_WAIT_SEC:.1f}s, "
            f"sample window={SNAPSHOT_WINDOW_SEC:.1f}s"
        )
        if USE_PACKET_SLOT_SYNC:
            print(
                "[SYS] Strict packet-slot sync enabled: "
                f"slot={BEACON_ADV_INTERVAL_MS}ms, "
                f"min_anchors={max(3, int(MIN_ANCHORS_PER_SYNC_FRAME))}, "
                f"min_frames={max(1, MIN_SYNC_FRAMES_PER_UPDATE)}"
            )
            print(
                "[SYS] Slot alignment tuning: "
                f"ref={self.sync_reference_anchor}, "
                f"tol=+/-{max(0, int(SLOT_OVERLAP_TOLERANCE_SLOTS))} slot, "
                f"frame_match=+/-{max(0, int(FRAME_MATCH_TOLERANCE_SLOTS))} slots, "
                f"max_step={max(1, int(SLOT_OFFSET_MAX_STEP_PER_UPDATE))}"
            )
            print(
                "[SYS] Packet sync fallback: "
                f"time_fallback={USE_TIME_SYNC_FALLBACK_AFTER_RELAX}, "
                f"relaxed_window={RELAXED_ANCHOR_SYNC_WINDOW_SEC:.1f}s, "
                f"latest_only={USE_LATEST_SYNC_FRAME_ONLY}, "
                f"max_frame_age={MAX_SYNC_FRAME_AGE_SEC:.1f}s"
            )
        print(
            "[SYS] Waiting for snapshot data from at least "
            f"{max(3, int(MIN_ANCHORS_PER_SYNC_FRAME))} anchors..."
        )
        if FURNITURE:
            print(f"[SYS] Pressure fusion enabled for furniture: {list(FURNITURE.keys())}")

        try:
            while True:
                (
                    pending_anchor_ids,
                    batch_started_at,
                    processed_samples,
                    allow_three_anchor_fallback,
                ) = self.wait_for_position_batch()
                now = time.time()

                position: Optional[Tuple[float, float]] = None
                residual_rms_m = float("inf")
                solver = "unknown"
                span = 0.0
                snapshot_spread = 0.0
                sync_frames = 0
                sample_counts: Dict[str, int] = {}
                anchor_distances: List[Tuple[str, float, float, float]] = []
                rssi_by_anchor: Dict[str, float] = {}

                if USE_PACKET_SLOT_SYNC:
                    strict_required_frames = max(1, int(MIN_SYNC_FRAMES_PER_UPDATE))
                    with self.data_lock:
                        (
                            frames,
                            sample_counts,
                            samples_with_slot,
                        ) = self.get_packet_synced_anchor_frames()

                    min_frame_anchors = max(3, int(MIN_ANCHORS_PER_SYNC_FRAME))
                    frames = [frame for frame in frames if len(frame) >= min_frame_anchors]
                    wait_detail = ""

                    selected_frame_ts = 0.0
                    if frames and USE_LATEST_SYNC_FRAME_ONLY:
                        max_frame_age_sec = max(0.1, float(MAX_SYNC_FRAME_AGE_SEC))
                        fresh_frames = []
                        stale_count = 0
                        for frame in frames:
                            frame_ts = self.frame_timestamp(frame)
                            frame_age = now - frame_ts
                            if frame_age <= max_frame_age_sec:
                                fresh_frames.append(frame)
                            else:
                                stale_count += 1

                        if fresh_frames:
                            fresh_frames.sort(
                                key=lambda frame: (self.frame_timestamp(frame), len(frame))
                            )
                            latest_frame = fresh_frames[-1]
                            selected_frame_ts = self.frame_timestamp(latest_frame)
                            if selected_frame_ts <= self.last_published_sync_frame_ts + 1e-6:
                                frames = []
                                wait_detail = (
                                    "No newer synchronized frame to publish | "
                                    f"last_frame_ts={self.last_published_sync_frame_ts:.3f}"
                                )
                            else:
                                frames = [latest_frame]
                                if VERBOSE_LOGGING and stale_count > 0:
                                    print(
                                        "[SYNC] Dropped stale synchronized frame(s): "
                                        f"count={stale_count}, max_age={max_frame_age_sec:.1f}s"
                                    )
                        else:
                            frames = []
                            wait_detail = (
                                "No fresh synchronized frame in latest window | "
                                f"dropped_stale={stale_count}, "
                                f"max_age={max_frame_age_sec:.1f}s, "
                                f"sample_counts={sample_counts}"
                            )

                    if frames:
                        solved_positions: List[Tuple[float, float]] = []
                        solved_residuals: List[float] = []
                        solved_spans: List[float] = []
                        solver_votes: Dict[str, int] = {}

                        for frame in frames:
                            # Frames are already grouped by aligned packet_slot, so they are
                            # synchronized by definition. Use 0 span to avoid penalizing
                            # anchors that use local millis() fallback instead of NTP.
                            frame_span = 0.0
                            frame_anchor_distances = [item[:4] for item in frame]
                            frame_rssi_by_anchor = {
                                str(item[0]): float(item[6]) for item in frame
                            }

                            (
                                frame_position,
                                frame_residual,
                                frame_solver,
                                frame_anchor_distances,
                            ) = self.solve_anchor_distances(frame_anchor_distances)
                            if frame_position is None:
                                continue

                            bounded_frame = self.bound_position(
                                frame_position[0],
                                frame_position[1],
                            )
                            solved_positions.append(bounded_frame)
                            solved_residuals.append(frame_residual)
                            solved_spans.append(frame_span)
                            solver_votes[frame_solver] = solver_votes.get(frame_solver, 0) + 1
                            anchor_distances = frame_anchor_distances
                            rssi_by_anchor = frame_rssi_by_anchor

                        sync_frames = len(solved_positions)
                        can_use_packet_result = sync_frames >= strict_required_frames

                        if can_use_packet_result:
                            xs = np.array([p[0] for p in solved_positions], dtype=float)
                            ys = np.array([p[1] for p in solved_positions], dtype=float)
                            position = (float(np.median(xs)), float(np.median(ys)))
                            snapshot_spread = float(np.sqrt(np.var(xs) + np.var(ys)))
                            residual_rms_m = float(np.median(np.array(solved_residuals, dtype=float)))
                            span = (
                                float(np.median(np.array(solved_spans, dtype=float)))
                                if solved_spans
                                else 0.0
                            )
                            if solver_votes:
                                solver = max(solver_votes, key=solver_votes.get)

                            if (
                                len(anchor_distances) == 3
                            ):
                                solver = f"{solver}+three_anchor_sync"
                            if selected_frame_ts > 0.0:
                                self.last_published_sync_frame_ts = selected_frame_ts
                        else:
                            wait_detail = (
                                f"synchronized frames={sync_frames} "
                                f"(< {strict_required_frames}) | "
                                f"sample_counts={sample_counts}"
                            )
                    else:
                        if wait_detail:
                            pass
                        elif samples_with_slot == 0:
                            wait_detail = (
                                "No packet_slot data in snapshot window. "
                                "Flash updated ESP32 firmware and ensure NTP sync is ready."
                            )
                        else:
                            wait_detail = (
                                "packet_slot samples exist but no same-slot 3-anchor frame | "
                                f"sample_counts={sample_counts}"
                            )

                    if position is None:
                        if USE_TIME_SYNC_FALLBACK_AFTER_RELAX:
                            (
                                fallback_position,
                                fallback_residual,
                                fallback_solver,
                                fallback_span,
                                fallback_sample_counts,
                                fallback_anchor_distances,
                                fallback_rssi_by_anchor,
                                fallback_reason,
                                fallback_sample_ts,
                            ) = self.try_relaxed_snapshot_fallback(
                                allowed_anchor_ids=None,
                                since=None,
                            )

                            if fallback_position is not None:
                                position = fallback_position
                                residual_rms_m = fallback_residual
                                solver = fallback_solver
                                span = fallback_span
                                snapshot_spread = 0.0
                                sync_frames = 1
                                anchor_distances = fallback_anchor_distances
                                rssi_by_anchor = fallback_rssi_by_anchor
                                sample_counts = fallback_sample_counts or sample_counts
                                self.last_published_fallback_sample_ts = fallback_sample_ts
                                if VERBOSE_LOGGING:
                                    print(
                                        "[RELAX] Using latest-four-anchor time fallback: "
                                        f"span={span:.2f}s | sample_counts={sample_counts}"
                                    )
                            elif VERBOSE_LOGGING:
                                print(f"[WAIT] {wait_detail}")
                                print(f"[WAIT] {fallback_reason}")
                        elif VERBOSE_LOGGING:
                            print(f"[WAIT] {wait_detail}")

                    if (
                        position is None
                        and not (
                            self.pressure_override_active
                            and self.pressure_override_location
                        )
                    ):
                        if USE_PACKET_SLOT_SYNC or allow_three_anchor_fallback:
                            self.finish_position_batch(processed_samples)
                        continue
                else:
                    with self.data_lock:
                        anchor_data, sample_counts = self.get_snapshot_anchor_data(
                            allowed_anchor_ids=pending_anchor_ids,
                            since=batch_started_at,
                        )
                    enough_anchors = (
                        len(anchor_data) >= 4
                        or (
                            allow_three_anchor_fallback
                            and len(anchor_data) >= 3
                        )
                    )
                    if enough_anchors:
                        sync_ok, span = self.is_time_synchronized(anchor_data)
                        if sync_ok:
                            anchor_distances = [item[:4] for item in anchor_data]
                            rssi_by_anchor = {
                                str(item[0]): float(item[6]) for item in anchor_data
                            }
                            (
                                position,
                                residual_rms_m,
                                solver,
                                anchor_distances,
                            ) = self.solve_anchor_distances(anchor_distances)
                            if len(anchor_distances) == 3:
                                solver = f"{solver}+three_anchor_fallback"
                            sync_frames = 1
                        elif VERBOSE_LOGGING:
                            print(
                                f"[WAIT] Anchor timestamps span too large: {span:.2f}s "
                                f"(limit={ANCHOR_SYNC_WINDOW_SEC}s)"
                            )
                    elif VERBOSE_LOGGING:
                        online = [a[0] for a in anchor_data]
                        print(
                            f"[WAIT] Snapshot anchors={len(online)} -> {online} | "
                            f"sample_counts={sample_counts}"
                        )

                    if (
                        position is None
                        and allow_three_anchor_fallback
                        and not (
                            self.pressure_override_active
                            and self.pressure_override_location
                        )
                    ):
                        self.finish_position_batch(processed_samples)
                        continue

                # When furniture is occupied, pressure state owns the published
                # location and BLE output is paused until a vacant message arrives.
                if (
                    self.pressure_override_active
                    and self.pressure_override_location
                ):
                    pressure_target = self.get_pressure_override_target()
                    if pressure_target:
                        fx, fy, semantic = pressure_target
                        activity_state = self.detect_motion_state(fx, fy)
                        self.evaluate_prolonged_stillness(
                            fx,
                            fy,
                            1.0,
                            activity_state,
                            "pressure",
                            semantic,
                        )
                        self.publish_position(
                            fx,
                            fy,
                            fx,
                            fy,
                            0.0,
                            0.0,
                            0,
                            1.0,
                            "pressure",
                            0.0,
                            [],
                            semantic_location=semantic,
                            source="pressure",
                            activity_state=activity_state,
                            stationary_hold=False,
                        )
                        self.finish_position_batch(processed_samples)
                        continue

                if position is not None and anchor_distances:
                    # Preliminary confidence for adaptive smoothing.
                    prelim_confidence = self.compute_confidence(
                        residual_rms_m=residual_rms_m,
                        sync_span_s=span,
                        spread_m=snapshot_spread,
                        anchor_count=len(anchor_distances),
                    )

                    if rssi_by_anchor:
                        (
                            fused_x,
                            fused_y,
                            prelim_confidence,
                            solver,
                            residual_rms_m,
                        ) = self.apply_rssi_fingerprint_fusion(
                            position[0],
                            position[1],
                            prelim_confidence,
                            solver,
                            residual_rms_m,
                            rssi_by_anchor,
                        )
                        position = (fused_x, fused_y)

                    guarded_x, guarded_y, jump_guarded = (
                        self.guard_low_confidence_jump(
                            position[0],
                            position[1],
                            prelim_confidence,
                            now=now,
                        )
                    )
                    if jump_guarded:
                        if VERBOSE_LOGGING:
                            print(
                                "[DROP] Invalid jump result was not published; "
                                "frontend keeps the previous valid position."
                            )
                        self.finish_position_batch(processed_samples)
                        continue

                    smoothed = self.smooth_position(
                        guarded_x,
                        guarded_y,
                        confidence=prelim_confidence,
                    )
                    bounded = self.bound_position(smoothed[0], smoothed[1])
                    if VERBOSE_LOGGING:
                        if (
                            abs(bounded[0] - smoothed[0]) > 1e-6
                            or abs(bounded[1] - smoothed[1]) > 1e-6
                        ):
                            print(
                                "[CLAMP] Position limited to room bounds "
                                f"raw=({smoothed[0]:.3f},{smoothed[1]:.3f}) "
                                f"bounded=({bounded[0]:.3f},{bounded[1]:.3f})"
                            )

                    agg_x, agg_y, agg_spread = self.aggregate_position(
                        bounded[0], bounded[1]
                    )
                    spread_m = max(snapshot_spread, agg_spread)

                    if STRICT_INROOM_OUTPUT:
                        agg_x, agg_y = self.bound_position_strict(agg_x, agg_y)

                    confidence = self.compute_confidence(
                        residual_rms_m=residual_rms_m,
                        sync_span_s=span,
                        spread_m=spread_m,
                        anchor_count=len(anchor_distances),
                    )

                    if confidence < HOLD_MIN_CONFIDENCE_FOR_LOCK:
                        self.force_release_hold(agg_x, agg_y)
                        report_x, report_y = agg_x, agg_y
                    else:
                        report_x, report_y, _ = self.apply_stationary_hold(
                            agg_x,
                            agg_y,
                        )

                    if STRICT_INROOM_OUTPUT:
                        report_x, report_y = self.bound_position_strict(
                            report_x,
                            report_y,
                        )

                    # Soft pressure-BLE fusion.
                    (
                        publish_x,
                        publish_y,
                        publish_confidence,
                        publish_solver,
                        publish_residual,
                        publish_anchor_distances,
                        semantic_location,
                        source,
                    ) = self.apply_pressure_fusion(
                        report_x,
                        report_y,
                        confidence,
                        solver,
                        residual_rms_m,
                        anchor_distances,
                    )

                    activity_state = self.detect_motion_state(publish_x, publish_y)
                    self.evaluate_prolonged_stillness(
                        publish_x,
                        publish_y,
                        publish_confidence,
                        activity_state,
                        source,
                        semantic_location,
                    )

                    self.publish_position(
                        publish_x,
                        publish_y,
                        bounded[0],
                        bounded[1],
                        spread_m,
                        span,
                        sync_frames,
                        publish_confidence,
                        publish_solver,
                        publish_residual,
                        publish_anchor_distances,
                        semantic_location=semantic_location,
                        source=source,
                        activity_state=activity_state,
                        stationary_hold=self.stationary_hold_active,
                    )
                elif VERBOSE_LOGGING:
                    print("[WARN] Trilateration failed due to unstable geometry")

                if position is not None:
                    self.finish_position_batch(processed_samples)
        except KeyboardInterrupt:
            print("\n[SYS] Stopping server...")
        finally:
            self.client.loop_stop()
            self.client.disconnect()


if __name__ == "__main__":
    server = IndoorPositioningServer()
    server.run()
