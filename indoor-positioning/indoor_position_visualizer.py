"""Real-time indoor position visualizer.

Subscribes to the positioning topic and renders:
- anchor positions
- latest person position
- state dashboard (no trajectory)
"""

from __future__ import annotations

import json
import threading
from datetime import datetime
from typing import List, Optional, Tuple

import math
import time

import matplotlib.pyplot as plt
from matplotlib.animation import FuncAnimation
from matplotlib.patches import Circle, Rectangle
import paho.mqtt.client as mqtt

from positioning_config import (
    ANCHORS,
    MQTT_BROKER,
    MQTT_PASSWORD,
    MQTT_PORT,
    MQTT_POSITION_TOPIC,
    MQTT_USERNAME,
    VISUAL_VIEW_TRANSFORM,
)


class PositionVisualizer:
    VALID_VIEW_TRANSFORMS = {
        "none",
        "flip_x",
        "flip_y",
        "rotate_cw",
        "rotate_ccw",
    }

    def __init__(self) -> None:
        self.latest_position: Optional[dict] = None
        self.last_message_at: Optional[float] = None
        self.lock = threading.Lock()
        self.stale_timeout_sec = 3.5

        self.model_w, self.model_h = self.get_model_size()
        self.view_transform = str(VISUAL_VIEW_TRANSFORM).strip().lower() or "none"
        if self.view_transform not in self.VALID_VIEW_TRANSFORMS:
            print(
                f"[VIS] Unknown VISUAL_VIEW_TRANSFORM='{VISUAL_VIEW_TRANSFORM}', "
                "fallback to 'none'"
            )
            self.view_transform = "none"
        self.display_w, self.display_h = self.get_display_size(self.view_transform)

        self.client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id="indoor_position_visualizer",
        )
        if MQTT_USERNAME:
            self.client.username_pw_set(MQTT_USERNAME, MQTT_PASSWORD)

        self.client.on_connect = self.on_connect
        self.client.on_message = self.on_message
        self.client.on_disconnect = self.on_disconnect

        self.fig = None
        self.ax = None
        self.person_scatter = None
        self.uncertainty_circle = None
        self.info_text = None
        self.status_text = None
        self.animation = None

    def on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code == 0:
            print(f"[MQTT] Connected to {MQTT_BROKER}:{MQTT_PORT}")
            client.subscribe(MQTT_POSITION_TOPIC)
            print(f"[MQTT] Subscribed: {MQTT_POSITION_TOPIC}")
        else:
            print(f"[MQTT] Connection failed: rc={reason_code}")

    def on_disconnect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code != 0:
            print(f"[MQTT] Disconnected unexpectedly: rc={reason_code}")

    def on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
            x = float(payload["x"])
            y = float(payload["y"])
            ts = str(payload.get("ts", datetime.now().isoformat(timespec="seconds")))
            anchors_used = payload.get("anchors_used", [])
            if not isinstance(anchors_used, list):
                anchors_used = []
            raw_x = float(payload.get("raw_x", x))
            raw_y = float(payload.get("raw_y", y))
            spread_m = float(payload.get("spread_m", 0.0))
            confidence = float(payload.get("confidence", 0.0))
            solver = str(payload.get("solver", "unknown"))
            residual_rms_m = float(payload.get("residual_rms_m", 0.0))
        except (ValueError, KeyError, json.JSONDecodeError):
            return

        with self.lock:
            self.latest_position = {
                "x": x,
                "y": y,
                "ts": ts,
                "anchors": anchors_used,
                "raw_x": raw_x,
                "raw_y": raw_y,
                "spread_m": spread_m,
                "confidence": confidence,
                "solver": solver,
                "residual_rms_m": residual_rms_m,
            }
            self.last_message_at = time.time()

    def connect(self) -> None:
        self.client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        self.client.loop_start()

    def disconnect(self) -> None:
        self.client.loop_stop()
        self.client.disconnect()

    @staticmethod
    def get_model_size() -> Tuple[float, float]:
        xs = [float(cfg["x"]) for cfg in ANCHORS.values()]
        ys = [float(cfg["y"]) for cfg in ANCHORS.values()]
        return max(0.1, max(xs)), max(0.1, max(ys))

    def get_display_size(self, transform: str) -> Tuple[float, float]:
        if transform in {"rotate_cw", "rotate_ccw"}:
            return self.model_h, self.model_w
        return self.model_w, self.model_h

    def transform_point(self, x: float, y: float) -> Tuple[float, float]:
        t = self.view_transform

        if t == "flip_x":
            return self.model_w - x, y
        if t == "flip_y":
            return x, self.model_h - y
        if t == "rotate_cw":
            return y, self.model_w - x
        if t == "rotate_ccw":
            return self.model_h - y, x

        return x, y

    def get_axis_limits(self) -> Tuple[float, float, float, float]:
        x_min = -0.4
        x_max = self.display_w + 0.4
        y_min = -0.4
        y_max = self.display_h + 0.4

        return x_min, x_max, y_min, y_max

    def setup_plot(self) -> None:
        self.fig, self.ax = plt.subplots(figsize=(10, 6))
        self.fig.patch.set_facecolor("#f4f6fb")
        self.ax.set_facecolor("#ffffff")

        x_min, x_max, y_min, y_max = self.get_axis_limits()
        self.ax.set_xlim(x_min, x_max)
        self.ax.set_ylim(y_min, y_max)
        self.ax.set_aspect("equal", adjustable="box")
        self.ax.grid(True, linestyle="--", alpha=0.25)

        self.ax.set_title(
            f"Indoor Position Dashboard ({self.view_transform})",
            fontsize=15,
            pad=12,
        )
        self.ax.set_xlabel("view x (m)")
        self.ax.set_ylabel("view y (m)")

        room = Rectangle(
            (0.0, 0.0),
            self.display_w,
            self.display_h,
            fill=True,
            facecolor="#fbfcff",
            linewidth=2.0,
            linestyle="-",
            edgecolor="#4e5969",
        )
        self.ax.add_patch(room)
        self.ax.text(0.08, self.display_h + 0.08, "Room", fontsize=10, color="#4e5969")

        for anchor_id, cfg in ANCHORS.items():
            ax_model = float(cfg["x"])
            ay_model = float(cfg["y"])
            ax, ay = self.transform_point(ax_model, ay_model)
            self.ax.scatter([ax], [ay], marker="^", s=180, c="#2563eb", edgecolors="white")
            self.ax.text(ax + 0.05, ay + 0.06, anchor_id, fontsize=10, color="#1e293b")

        self.person_scatter = self.ax.scatter([], [], s=260, c="#ef4444", edgecolors="white", zorder=5)
        self.uncertainty_circle = Circle(
            (0.0, 0.0),
            radius=0.2,
            fill=False,
            linewidth=1.6,
            linestyle="--",
            edgecolor="#f59e0b",
            alpha=0.8,
            visible=False,
            zorder=4,
        )
        self.ax.add_patch(self.uncertainty_circle)

        self.info_text = self.ax.text(
            0.02,
            0.98,
            "Waiting for position data...",
            transform=self.ax.transAxes,
            va="top",
            fontsize=10.5,
            bbox={"facecolor": "white", "alpha": 0.9, "edgecolor": "#d0d7e2"},
        )

        self.status_text = self.ax.text(
            0.02,
            0.74,
            "Status: WAITING",
            transform=self.ax.transAxes,
            va="top",
            fontsize=11,
            color="#92400e",
            bbox={"facecolor": "#fff7ed", "alpha": 0.95, "edgecolor": "#fed7aa"},
        )

        self.ax.legend(["Person", "Anchor"], loc="lower right")

    def update_plot(self, _frame):
        with self.lock:
            latest = self.latest_position
            last_message_at = self.last_message_at

        now = time.time()
        is_fresh = last_message_at is not None and (now - last_message_at) <= self.stale_timeout_sec

        if latest is not None:
            x_model = float(latest["x"])
            y_model = float(latest["y"])
            ts = str(latest["ts"])
            spread_m = float(latest["spread_m"])
            confidence = float(latest["confidence"])

            x, y = self.transform_point(x_model, y_model)

            self.person_scatter.set_offsets([[x, y]])
            pulse = 240 + 60 * (0.5 + 0.5 * math.sin(now * 3.0))
            self.person_scatter.set_sizes([pulse])

            radius = max(0.08, min(1.2, spread_m * 2.2))
            self.uncertainty_circle.center = (x, y)
            self.uncertainty_circle.set_radius(radius)
            self.uncertainty_circle.set_visible(True)

            self.info_text.set_text(
                "Latest update\n"
                f"position=({x_model:.3f}, {y_model:.3f}) m\n"
                f"ts={ts}"
            )

            if is_fresh:
                if confidence < 0.45:
                    self.status_text.set_text("Status: LOW CONFIDENCE")
                    self.status_text.set_color("#92400e")
                    self.status_text.set_bbox(
                        {"facecolor": "#fff7ed", "alpha": 0.95, "edgecolor": "#fed7aa"}
                    )
                else:
                    self.status_text.set_text("Status: OK")
                    self.status_text.set_color("#14532d")
                    self.status_text.set_bbox(
                        {"facecolor": "#ecfdf3", "alpha": 0.95, "edgecolor": "#bbf7d0"}
                    )
            else:
                self.status_text.set_text("Status: SIGNAL STALE")
                self.status_text.set_color("#92400e")
                self.status_text.set_bbox(
                    {"facecolor": "#fff7ed", "alpha": 0.95, "edgecolor": "#fed7aa"}
                )
        else:
            self.uncertainty_circle.set_visible(False)
            self.status_text.set_text("Status: WAITING")
            self.status_text.set_color("#92400e")
            self.status_text.set_bbox(
                {"facecolor": "#fff7ed", "alpha": 0.95, "edgecolor": "#fed7aa"}
            )

        return (
            self.person_scatter,
            self.uncertainty_circle,
            self.info_text,
            self.status_text,
        )

    def run(self) -> None:
        self.connect()
        self.setup_plot()
        self.animation = FuncAnimation(
            self.fig,
            self.update_plot,
            interval=400,
            blit=False,
            cache_frame_data=False,
        )
        print("[VIS] Visualizer started. Close the window to stop.")
        try:
            plt.show()
        finally:
            self.disconnect()


if __name__ == "__main__":
    PositionVisualizer().run()
