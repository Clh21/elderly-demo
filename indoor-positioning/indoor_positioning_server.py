"""Real-time indoor positioning service using BLE RSSI and trilateration.

This server consumes RSSI data published by ESP32 anchors to MQTT topic:
indoor/ble/{anchor_id}/rssi

Expected payload example:
{
  "anchor": "anchor_01",
  "target": "20:a7:16:60:f9:b9",
  "raw": -65,
  "filtered": -62.3,
    "ts": 123456,
    "rx_epoch_ms": 1712490000123,
    "packet_slot": 6849960000,
    "adv_interval_ms": 250
}
"""

from __future__ import annotations

from collections import deque
import json
import math
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import numpy as np
import paho.mqtt.client as mqtt

from positioning_config import (
    ANCHOR_SYNC_WINDOW_SEC,
    ANCHORS,
    BEACON_ADV_INTERVAL_MS,
    CONFIDENCE_ERROR_SCALE_M,
    FALLBACK_IMPROVEMENT_MARGIN_M,
    HOLD_MIN_CONFIDENCE_FOR_LOCK,
    MAX_DISTANCE_M,
    MAX_READING_AGE_SEC,
    MIN_SNAPSHOT_SAMPLES_PER_ANCHOR,
    MIN_SYNC_FRAMES_PER_UPDATE,
    MIN_DISTANCE_M,
    MQTT_BROKER,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_POSITION_TOPIC,
    MQTT_RSSI_TOPIC,
    MQTT_USERNAME,
    PATH_LOSS_EXPONENT,
    POSITION_AGGREGATION_MODE,
    POSITION_AGGREGATION_WINDOW,
    POSITION_SMOOTHING_ALPHA,
    POSITION_UPDATE_INTERVAL_SEC,
    ROOM_BOUNDS_MARGIN_M,
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
    TRILATERATION_MAX_RMS_ERROR_M,
    USE_FILTERED_RSSI,
    USE_PACKET_SLOT_SYNC,
    USE_POSITION_AGGREGATION,
    USE_POSITION_SMOOTHING,
    USE_STATIONARY_HOLD,
    USE_WEIGHTED_CENTROID_FALLBACK,
    VERBOSE_LOGGING,
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


class IndoorPositioningServer:
    def __init__(self) -> None:
        self.readings: Dict[str, AnchorReading] = {}
        self.rssi_history: Dict[str, deque[RssiSample]] = {
            anchor_id: deque(maxlen=4000) for anchor_id in ANCHORS
        }
        self.last_position: Optional[Tuple[float, float]] = None
        self.output_position: Optional[Tuple[float, float]] = None
        self.position_window: deque[Tuple[float, float]] = deque(
            maxlen=max(1, POSITION_AGGREGATION_WINDOW)
        )
        self.stationary_count = 0
        self.stationary_hold_active = False
        self.release_count = 0
        self.sync_reference_anchor = (
            SLOT_SYNC_REFERENCE_ANCHOR
            if SLOT_SYNC_REFERENCE_ANCHOR in ANCHORS
            else sorted(ANCHORS.keys())[0]
        )
        self.slot_offset_state: Dict[str, int] = {self.sync_reference_anchor: 0}

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
        else:
            print(f"[MQTT] Connection failed: rc={reason_code}")

    def on_disconnect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code != 0:
            print(f"[MQTT] Disconnected unexpectedly: rc={reason_code}")

    def on_message(self, client, userdata, msg):
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

        now = time.time()
        self.readings[anchor_id] = AnchorReading(rssi=rssi, updated_at=now)
        self.rssi_history[anchor_id].append(
            RssiSample(
                received_at=now,
                rssi=rssi,
                packet_slot=packet_slot,
                rx_epoch_ms=rx_epoch_ms,
            )
        )

    @staticmethod
    def rssi_to_distance(rssi: float, tx_power: float, n: float) -> float:
        return 10 ** ((tx_power - rssi) / (10 * n))

    @staticmethod
    def clamp(value: float, min_value: float, max_value: float) -> float:
        return max(min_value, min(value, max_value))

    def get_fresh_anchor_data(self) -> List[Tuple[str, float, float, float, float]]:
        now = time.time()
        data: List[Tuple[str, float, float, float, float]] = []

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
                (anchor_id, float(cfg["x"]), float(cfg["y"]), distance, reading.updated_at)
            )

        return data

    def get_snapshot_anchor_data(
        self,
    ) -> Tuple[List[Tuple[str, float, float, float, float]], Dict[str, int]]:
        now = time.time()
        window_sec = max(1.0, float(SNAPSHOT_WINDOW_SEC))
        window_start = now - window_sec

        data: List[Tuple[str, float, float, float, float]] = []
        sample_counts: Dict[str, int] = {}

        for anchor_id, cfg in ANCHORS.items():
            history = self.rssi_history.get(anchor_id)
            if history is None:
                continue

            while history and history[0].received_at < window_start:
                history.popleft()

            sample_counts[anchor_id] = len(history)
            use_window = len(history) >= max(1, MIN_SNAPSHOT_SAMPLES_PER_ANCHOR)

            if use_window:
                rssi_values = [item.rssi for item in history]
                rssi = float(np.median(np.array(rssi_values, dtype=float)))
                updated_at = float(history[-1].received_at)
            else:
                reading = self.readings.get(anchor_id)
                if not reading:
                    continue
                if now - reading.updated_at > max(MAX_READING_AGE_SEC, window_sec):
                    continue
                rssi = float(reading.rssi)
                updated_at = float(reading.updated_at)

            path_loss_n = float(cfg.get("path_loss_n", PATH_LOSS_EXPONENT))
            distance = self.rssi_to_distance(
                rssi=rssi,
                tx_power=float(cfg["tx_power"]),
                n=path_loss_n,
            )
            distance = self.clamp(distance, MIN_DISTANCE_M, MAX_DISTANCE_M)
            data.append(
                (anchor_id, float(cfg["x"]), float(cfg["y"]), distance, updated_at)
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
    ) -> Tuple[List[List[Tuple[str, float, float, float, float]]], Dict[str, int], int]:
        now = time.time()
        window_sec = max(1.0, float(SNAPSHOT_WINDOW_SEC))
        window_start = now - window_sec

        sample_counts: Dict[str, int] = {}
        slot_samples_by_anchor: Dict[str, List[Tuple[int, RssiSample]]] = {}
        slot_to_anchor_samples: Dict[int, Dict[str, RssiSample]] = {}
        samples_with_slot = 0

        for anchor_id in ANCHORS:
            history = self.rssi_history.get(anchor_id)
            if history is None:
                continue

            while history and history[0].received_at < window_start:
                history.popleft()

            sample_counts[anchor_id] = len(history)

            for sample in history:
                raw_slot = self.derive_packet_slot(sample)
                if raw_slot is None:
                    continue

                samples_with_slot += 1
                slot_samples_by_anchor.setdefault(anchor_id, []).append((raw_slot, sample))

        slot_series = {
            anchor_id: [entry[0] for entry in entries]
            for anchor_id, entries in slot_samples_by_anchor.items()
        }
        slot_offsets = self.estimate_anchor_slot_offsets(slot_series)

        if VERBOSE_LOGGING and slot_offsets:
            non_zero_offsets = {k: v for k, v in slot_offsets.items() if v != 0}
            if non_zero_offsets:
                print(f"[SYNC] estimated slot offsets: {non_zero_offsets}")

        for anchor_id, entries in slot_samples_by_anchor.items():
            anchor_offset = slot_offsets.get(anchor_id, 0)
            for raw_slot, sample in entries:
                aligned_slot = raw_slot - anchor_offset
                slot_samples = slot_to_anchor_samples.setdefault(aligned_slot, {})
                previous = slot_samples.get(anchor_id)
                if previous is None or sample.received_at > previous.received_at:
                    slot_samples[anchor_id] = sample

        frames: List[List[Tuple[str, float, float, float, float]]] = []

        for slot_id in sorted(slot_to_anchor_samples.keys()):
            grouped = slot_to_anchor_samples[slot_id]
            if len(grouped) < 3:
                continue

            frame: List[Tuple[str, float, float, float, float]] = []
            for anchor_id, sample in grouped.items():
                cfg = ANCHORS[anchor_id]
                path_loss_n = float(cfg.get("path_loss_n", PATH_LOSS_EXPONENT))
                distance = self.rssi_to_distance(
                    rssi=sample.rssi,
                    tx_power=float(cfg["tx_power"]),
                    n=path_loss_n,
                )
                distance = self.clamp(distance, MIN_DISTANCE_M, MAX_DISTANCE_M)

                timestamp_s = sample.received_at
                if sample.rx_epoch_ms is not None:
                    timestamp_s = float(sample.rx_epoch_ms) / 1000.0

                frame.append(
                    (
                        anchor_id,
                        float(cfg["x"]),
                        float(cfg["y"]),
                        distance,
                        float(timestamp_s),
                    )
                )

            if len(frame) >= 3:
                frame.sort(key=lambda item: item[0])
                frames.append(frame)

        return frames, sample_counts, samples_with_slot

    @staticmethod
    def is_time_synchronized(
        anchor_data: List[Tuple[str, float, float, float, float]]
    ) -> Tuple[bool, float]:
        if len(anchor_data) < 3:
            return False, float("inf")
        timestamps = [item[4] for item in anchor_data]
        span = max(timestamps) - min(timestamps)
        return span <= ANCHOR_SYNC_WINDOW_SEC, span

    def smooth_position(self, x: float, y: float) -> Tuple[float, float]:
        if not USE_POSITION_SMOOTHING:
            return x, y

        if self.last_position is None:
            self.last_position = (x, y)
            return x, y

        alpha = self.clamp(POSITION_SMOOTHING_ALPHA, 0.0, 1.0)
        sx = alpha * x + (1.0 - alpha) * self.last_position[0]
        sy = alpha * y + (1.0 - alpha) * self.last_position[1]
        self.last_position = (sx, sy)
        return sx, sy

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
    ) -> Tuple[Optional[Tuple[float, float]], float, str]:
        tri_position = self.trilaterate_nonlinear(anchor_distances)
        tri_residual = float("inf")
        if tri_position is not None:
            tri_residual = self.residual_rms(
                tri_position[0],
                tri_position[1],
                anchor_distances,
            )

        centroid_position = None
        centroid_residual = float("inf")
        if USE_WEIGHTED_CENTROID_FALLBACK:
            centroid_position = self.weighted_centroid(anchor_distances)
            if centroid_position is not None:
                centroid_residual = self.residual_rms(
                    centroid_position[0],
                    centroid_position[1],
                    anchor_distances,
                )

        position = tri_position
        residual_rms_m = tri_residual
        solver = "trilateration"

        if position is None and centroid_position is not None:
            position = centroid_position
            residual_rms_m = centroid_residual
            solver = "centroid_fallback"

        if (
            position is not None
            and tri_position is not None
            and centroid_position is not None
            and tri_residual > TRILATERATION_MAX_RMS_ERROR_M
        ):
            if centroid_residual + FALLBACK_IMPROVEMENT_MARGIN_M < tri_residual:
                position = centroid_position
                residual_rms_m = centroid_residual
                solver = "centroid_fallback"

        return position, residual_rms_m, solver

    def compute_confidence(self, residual_rms_m: float, sync_span_s: float, spread_m: float) -> float:
        err_scale = max(0.3, CONFIDENCE_ERROR_SCALE_M)
        residual_term = math.exp(-max(0.0, residual_rms_m) / err_scale)
        spread_term = math.exp(-max(0.0, spread_m) / err_scale)

        sync_den = max(0.2, ANCHOR_SYNC_WINDOW_SEC)
        sync_ratio = self.clamp(sync_span_s / sync_den, 0.0, 1.0)
        sync_term = 1.0 - sync_ratio

        confidence = (0.55 * residual_term) + (0.25 * spread_term) + (0.20 * sync_term)
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
            "ts": datetime.now().isoformat(timespec="seconds"),
        }
        self.client.publish(MQTT_POSITION_TOPIC, json.dumps(payload), qos=0)

        if VERBOSE_LOGGING:
            print(
                f"[LOC] x={payload['x']:.3f}, y={payload['y']:.3f} | "
                f"spread={payload['spread_m']:.3f}m | "
                f"sync_frames={payload['sync_frames']} | "
                f"residual={payload['residual_rms_m']:.3f}m | "
                f"conf={payload['confidence']:.2f} | solver={payload['solver']} | "
                f"anchors={payload['anchors_used']}"
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
            "[SYS] Snapshot mode enabled: "
            f"every {POSITION_UPDATE_INTERVAL_SEC:.1f}s, "
            f"window={SNAPSHOT_WINDOW_SEC:.1f}s"
        )
        if USE_PACKET_SLOT_SYNC:
            print(
                "[SYS] Strict packet-slot sync enabled: "
                f"slot={BEACON_ADV_INTERVAL_MS}ms, "
                f"min_frames={max(1, MIN_SYNC_FRAMES_PER_UPDATE)}"
            )
            print(
                "[SYS] Slot alignment tuning: "
                f"ref={self.sync_reference_anchor}, "
                f"tol=+/-{max(0, int(SLOT_OVERLAP_TOLERANCE_SLOTS))} slot, "
                f"max_step={max(1, int(SLOT_OFFSET_MAX_STEP_PER_UPDATE))}"
            )
        print("[SYS] Waiting for snapshot data from at least 3 anchors...")

        next_tick = time.time()

        try:
            while True:
                now = time.time()
                if now < next_tick:
                    time.sleep(min(0.2, next_tick - now))
                    continue

                position: Optional[Tuple[float, float]] = None
                residual_rms_m = float("inf")
                solver = "unknown"
                span = 0.0
                snapshot_spread = 0.0
                sync_frames = 0
                sample_counts: Dict[str, int] = {}
                anchor_distances: List[Tuple[str, float, float, float]] = []

                if USE_PACKET_SLOT_SYNC:
                    frames, sample_counts, samples_with_slot = self.get_packet_synced_anchor_frames()

                    if not frames:
                        if VERBOSE_LOGGING:
                            if samples_with_slot == 0:
                                print(
                                    "[WAIT] No packet_slot data in snapshot window. "
                                    "Flash updated ESP32 firmware and ensure NTP sync is ready."
                                )
                            else:
                                print(
                                    "[WAIT] packet_slot samples exist but no same-slot 3-anchor frame | "
                                    f"sample_counts={sample_counts}"
                                )
                        next_tick = time.time() + max(1.0, POSITION_UPDATE_INTERVAL_SEC)
                        continue

                    solved_positions: List[Tuple[float, float]] = []
                    solved_residuals: List[float] = []
                    solved_spans: List[float] = []
                    solver_votes: Dict[str, int] = {}

                    for frame in frames:
                        frame_timestamps = [item[4] for item in frame]
                        frame_span = (
                            max(frame_timestamps) - min(frame_timestamps)
                            if frame_timestamps
                            else 0.0
                        )
                        frame_anchor_distances = [item[:4] for item in frame]

                        frame_position, frame_residual, frame_solver = self.solve_anchor_distances(
                            frame_anchor_distances
                        )
                        if frame_position is None:
                            continue

                        bounded_frame = self.bound_position(frame_position[0], frame_position[1])
                        solved_positions.append(bounded_frame)
                        solved_residuals.append(frame_residual)
                        solved_spans.append(frame_span)
                        solver_votes[frame_solver] = solver_votes.get(frame_solver, 0) + 1
                        anchor_distances = frame_anchor_distances

                    sync_frames = len(solved_positions)
                    if sync_frames < max(1, MIN_SYNC_FRAMES_PER_UPDATE):
                        if VERBOSE_LOGGING:
                            print(
                                f"[WAIT] synchronized frames={sync_frames} "
                                f"(< {max(1, MIN_SYNC_FRAMES_PER_UPDATE)}) | "
                                f"sample_counts={sample_counts}"
                            )
                        next_tick = time.time() + max(1.0, POSITION_UPDATE_INTERVAL_SEC)
                        continue

                    xs = np.array([p[0] for p in solved_positions], dtype=float)
                    ys = np.array([p[1] for p in solved_positions], dtype=float)
                    position = (float(np.median(xs)), float(np.median(ys)))
                    snapshot_spread = float(np.sqrt(np.var(xs) + np.var(ys)))
                    residual_rms_m = float(np.median(np.array(solved_residuals, dtype=float)))
                    span = float(np.median(np.array(solved_spans, dtype=float))) if solved_spans else 0.0
                    if solver_votes:
                        solver = max(solver_votes, key=solver_votes.get)
                else:
                    anchor_data, sample_counts = self.get_snapshot_anchor_data()
                    if len(anchor_data) >= 3:
                        timestamps = [item[4] for item in anchor_data]
                        span = max(timestamps) - min(timestamps) if timestamps else 0.0
                        anchor_distances = [item[:4] for item in anchor_data]
                        position, residual_rms_m, solver = self.solve_anchor_distances(
                            anchor_distances
                        )
                        sync_frames = 1
                    elif VERBOSE_LOGGING:
                        online = [a[0] for a in anchor_data]
                        print(
                            f"[WAIT] Snapshot anchors={len(online)} -> {online} | "
                            f"sample_counts={sample_counts}"
                        )

                if position is not None and anchor_distances:
                    smoothed = self.smooth_position(position[0], position[1])
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

                    self.publish_position(
                        report_x,
                        report_y,
                        bounded[0],
                        bounded[1],
                        spread_m,
                        span,
                        sync_frames,
                        confidence,
                        solver,
                        residual_rms_m,
                        anchor_distances,
                    )
                elif VERBOSE_LOGGING:
                    print("[WARN] Trilateration failed due to unstable geometry")

                next_tick = time.time() + max(1.0, POSITION_UPDATE_INTERVAL_SEC)
        except KeyboardInterrupt:
            print("\n[SYS] Stopping server...")
        finally:
            self.client.loop_stop()
            self.client.disconnect()


if __name__ == "__main__":
    server = IndoorPositioningServer()
    server.run()
