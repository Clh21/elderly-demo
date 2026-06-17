"""Configuration for MQTT-based indoor positioning."""

# MQTT connection
# If server and broker are on the same PC, prefer localhost for stability.
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_USERNAME = ""
MQTT_PASSWORD = ""
MQTT_RSSI_TOPIC = "indoor/ble/+/rssi"
MQTT_POSITION_TOPIC = "indoor/location/target_01"
MQTT_PRESSURE_TOPIC = "indoor/pressure/+/state"
POSITIONING_WATCH_ID = "real-watch-001"
PRELIMINARY_ALERT_TOPIC = "indoor/alert/preliminary"

# RSSI to distance conversion (log-distance path loss model)
# distance = 10 ^ ((tx_power - rssi) / (10 * n))
PATH_LOSS_EXPONENT = 2.0

# Coordinate system for current deployment:
# - Room size: 7.5 m (long) x 4.0 m (wide)
# - x axis: along the long side of the room (length = 7.5 m)
# - y axis: perpendicular to x axis toward anchor_01 direction (width = 4.0 m)
# - Origin is the room's front-left corner; anchor_02 is placed at x = 1.5 m, y = 1.0 m
# - All anchors are placed on chairs at 0.9 m height (2D model currently uses x/y only)
# - RSSI model values are calibrated for each anchor in its deployed position.
ANCHORS = {
    "anchor_01": {
        "x": 0.0,
        "y": 4.0,
        "tx_power": -59.79,
        "path_loss_n": 2.240,
    },
    "anchor_02": {
        "x": 1.5,
        "y": 1.0,
        "tx_power": -58.31,
        "path_loss_n": 1.841,
    },
    "anchor_03": {
        "x": 7.5,
        "y": 0.0,
        "tx_power": -58.60,
        "path_loss_n": 1.946,
    },
    "anchor_04": {
        "x": 7.5,
        "y": 4.0,
        "tx_power": -61.57,
        "path_loss_n": 1.624,
    },
}

# Furniture definitions for pressure-sensor fusion.
# Each entry maps a location id to its fixed coordinates and calibration metadata.
# x, y are in meters (same coordinate system as ANCHORS).
# room is the semantic room id for frontend mapping.
# label is human-readable and is sent as semanticLocation to the frontend.
# threshold_adc is the firmware threshold (documented here for reference only).
# calibration_weight_kg is the reference weight used for calibration.
#
# NOTE: These coordinates are furniture centers in the active frontend layout
# (backend-springboot/data/indoor-layout-active.json). The layout stores
# furniture as bottom-left x/y plus width/height, while pressure override needs
# the resident coordinate at the center of the occupied object.
FURNITURE = {
    "sofa": {
        "x": 5.3,
        "y": 3.4,
        "room": "living_room",
        "label": "Sofa",
        "threshold_adc": 3000,
        "calibration_weight_kg": 50.0,
    },
    "bed": {
        "x": 0.925,
        "y": 0.45,
        "room": "bedroom",
        "label": "Bed",
        "threshold_adc": 3000,
        "calibration_weight_kg": 50.0,
    },
    "toilet": {
        "x": 0.45,
        "y": 2.85,
        "room": "toilet",
        "label": "Toilet",
        "threshold_adc": 3000,
        "calibration_weight_kg": 50.0,
    },
}

# Accuracy profile: keep room clamp tight for less edge drift.
ROOM_BOUNDS_MARGIN_M = 0.0

# If True, final reported output is forcibly clipped to strict room bounds.
# Accuracy-first demo profile keeps points in-room for clearer presentation.
STRICT_INROOM_OUTPUT = True

# Visualization orientation (display only; solver coordinates are unchanged).
# Options: "none", "flip_x", "flip_y", "rotate_cw", "rotate_ccw"
VISUAL_VIEW_TRANSFORM = "none"

# Positioning loop behavior
# MQTT data drives calculation directly. The current accuracy-first profile
# requires all four anchors in the same relaxed packet-slot frame.
THREE_ANCHOR_FALLBACK_WAIT_SEC = 1.2
# After all four anchors arrive, briefly collect the remaining MQTT messages
# from the same ESP32 scan batch before solving.
FOUR_ANCHOR_SETTLE_SEC = 0.12
SNAPSHOT_WINDOW_SEC = 2.5
MIN_SNAPSHOT_SAMPLES_PER_ANCHOR = 2
MAX_READING_AGE_SEC = 4.0
# For live walking demos, use the raw RSSI from each packet. The ESP32 Kalman
# value is stable, but it lags enough to keep reporting a previous room.
USE_FILTERED_RSSI = False

# Teacher-required consistency mode:
# each trilateration frame groups RSSI samples around the same beacon
# advertising slot. ESP32 scan/report latency can shift packet_slot by a
# few intervals, so the actual frame matcher allows a small slot tolerance.
USE_PACKET_SLOT_SYNC = True
BEACON_ADV_INTERVAL_MS = 100
MIN_ANCHORS_PER_SYNC_FRAME = 4
MIN_SYNC_FRAMES_PER_UPDATE = 1
FRAME_MATCH_TOLERANCE_SLOTS = 4

# Publish the newest qualifying packet-synchronized frame first. If exact
# packet-slot matching misses a cycle, use a very short latest-four-anchor
# window so the UI stays live without accepting old coordinates.
USE_TIME_SYNC_FALLBACK_AFTER_RELAX = True
RELAXED_ANCHOR_SYNC_WINDOW_SEC = 1.2
USE_LATEST_SYNC_FRAME_ONLY = True
MAX_SYNC_FRAME_AGE_SEC = 2.5

# When anchors report time_source="local" (no internet NTP), relax the timestamp
# span check because their millis() clocks are not globally synchronized.
ALLOW_LOCAL_TIME_SYNC = True
LOCAL_TIME_SYNC_SPAN_LIMIT_SEC = 10.0

# Packet-slot alignment robustness (server-side only, no firmware reflashing needed).
SLOT_SYNC_REFERENCE_ANCHOR = "anchor_01"
SLOT_OVERLAP_TOLERANCE_SLOTS = 1
SLOT_OFFSET_MAX_STEP_PER_UPDATE = 4
SLOT_OFFSET_SEARCH_RADIUS = 80

# Keep only near-synchronous anchor samples for trilateration.
ANCHOR_SYNC_WINDOW_SEC = 0.4

# Reject trilateration result if fitting error is too large.
TRILATERATION_MAX_RMS_ERROR_M = 2.0

# Only switch to centroid fallback when it improves residual by at least this margin.
FALLBACK_IMPROVEMENT_MARGIN_M = 0.22

# Use RSSI-weighted centroid fallback if trilateration is unstable.
USE_WEIGHTED_CENTROID_FALLBACK = True

# Confidence scaling for residual/spread scoring.
CONFIDENCE_ERROR_SCALE_M = 1.8
# A three-anchor solution has no spare anchor for cross-checking.
THREE_ANCHOR_CONFIDENCE_FACTOR = 0.8
MIN_POSITION_CONFIDENCE_TO_PUBLISH = 0.55
THREE_ANCHOR_MAX_RESIDUAL_M = 1.45
THREE_ANCHOR_LARGE_JUMP_M = 0.85
THREE_ANCHOR_JUMP_CONFIRM_UPDATES = 2
THREE_ANCHOR_JUMP_CONFIRM_RADIUS_M = 0.75
THREE_ANCHOR_INITIAL_CONFIRM_UPDATES = 1

# Reject implausible low-confidence jumps before they enter smoothing.
# Disabled during live RSSI diagnosis so positioning output does not stall.
USE_LOW_CONFIDENCE_JUMP_GUARD = False
LOW_CONFIDENCE_JUMP_THRESHOLD = 0.82
LOW_CONFIDENCE_JUMP_BASE_M = 0.35
LOW_CONFIDENCE_MAX_SPEED_MPS = 1.5
LOW_CONFIDENCE_MAX_ALLOWED_JUMP_M = 1.4

# Clamp RSSI-derived distance to a reasonable range (meters). The room diagonal
# is about 8.5 m, so a much larger value lets weak RSSI pull solutions to walls.
MIN_DISTANCE_M = 0.2
MAX_DISTANCE_M = 8.5

# Use the latest quick-room calibration CSV as a lightweight RSSI fingerprint.
# This corrects strong multipath/metal-shadow cases where RSSI no longer follows
# a simple log-distance model.
USE_RSSI_FINGERPRINT_FUSION = True
RSSI_FINGERPRINT_CSV = "quick_room_calibration_anchor2_150_100.csv"
RSSI_FINGERPRINT_MAX_RMS_DB = 7.0
RSSI_FINGERPRINT_MIN_ANCHORS = 3
RSSI_FINGERPRINT_BLEND = 0.85
RSSI_FINGERPRINT_TOP_K = 3
RSSI_FINGERPRINT_WEIGHT_POWER = 2.0

# Smooth final position output (exponential smoothing).
USE_POSITION_SMOOTHING = True
POSITION_SMOOTHING_ALPHA = 0.70

# Aggregate recent solved positions for a more stable reported coordinate.
USE_POSITION_AGGREGATION = False
POSITION_AGGREGATION_WINDOW = 1
POSITION_AGGREGATION_MODE = "median"  # "median" or "mean"

# Stationary hold: lock coordinates when movement is tiny to prevent drift.
USE_STATIONARY_HOLD = False
# Avoid locking when confidence is low, otherwise wrong points can be held.
HOLD_MIN_CONFIDENCE_FOR_LOCK = 0.62
STATIONARY_MOVE_THRESHOLD_M = 0.12
STATIONARY_CONFIRM_UPDATES = 2
STATIONARY_RELEASE_FACTOR = 2.5
STATIONARY_RELEASE_CONFIRM_UPDATES = 2

# RSSI outlier rejection using interquartile range before computing median.
USE_RSSI_IQR_FILTER = True
RSSI_IQR_MULTIPLIER = 1.5

# Adaptive smoothing: confidence controls the smoothing alpha.
# High confidence -> lower alpha (more smoothing).
# Low confidence -> higher alpha (more responsive).
USE_ADAPTIVE_SMOOTHING = False
SMOOTHING_ALPHA_MIN = 0.08
SMOOTHING_ALPHA_MAX = 0.55
SMOOTHING_ALPHA_MAX_DELTA_PER_UPDATE = 0.1

# Pressure interaction override: when furniture is occupied, lock the resident
# location to the furniture center and pause BLE output until it is released.
USE_SOFT_PRESSURE_FUSION = False
PRESSURE_FUSION_RADIUS_M = 2.0
PRESSURE_FUSION_BLEND_WIDTH_M = 1.0

# Motion / activity state detection.
USE_MOTION_STATE = True
MOTION_STATE_THRESHOLD_M = 0.15
MOTION_STATE_CONFIRM_UPDATES = 2

# Prolonged-stillness warning. This is intentionally a warning rather than a
# fall diagnosis; the backend/AI layer adds context and requests manual review.
USE_PROLONGED_STILLNESS_ALERT = True
PROLONGED_STILLNESS_DURATION_SEC = 30 * 60
PROLONGED_STILLNESS_MIN_CONFIDENCE = 0.60
PROLONGED_STILLNESS_COOLDOWN_SEC = 30 * 60

# Print debug output for each location update
VERBOSE_LOGGING = True
