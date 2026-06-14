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
# - x axis: along the long side from anchor_02 to anchor_03 (length = 7.5 m)
# - y axis: perpendicular to x axis toward anchor_01 direction (width = 4.0 m)
# - Origin is placed at anchor_02 (front-left corner when looking into the room)
# - All anchors are placed on chairs at 0.9 m height (2D model currently uses x/y only)
# - tx_power values below are from a previous deployment; recalibrate each anchor
#   at 1 m line-of-sight for best accuracy in this new room.
ANCHORS = {
    "anchor_01": {"x": 0.0, "y": 4.0, "tx_power": -65.47},
    "anchor_02": {"x": 0.0, "y": 0.0, "tx_power": -66.95},
    "anchor_03": {"x": 7.5, "y": 0.0, "tx_power": -68.04},
    "anchor_04": {"x": 7.5, "y": 4.0, "tx_power": -67.00},
}

# Furniture definitions for pressure-sensor fusion.
# Each entry maps a location id to its fixed coordinates and calibration metadata.
# x, y are in meters (same coordinate system as ANCHORS).
# room is the semantic room id for frontend mapping.
# label is human-readable and is sent as semanticLocation to the frontend.
# threshold_adc is the firmware threshold (documented here for reference only).
# calibration_weight_kg is the reference weight used for calibration.
#
# NOTE: These coordinates match the default frontend layout in
# frontend/src/lib/indoorRooms.js. If your Spring Boot backend serves a
# different active layout (backend-springboot/data/indoor-layout-active.json),
# make sure the furniture centers are kept in sync.
FURNITURE = {
    # NOTE: these are placeholder positions for a 7.5 x 4 m room.
    # Adjust them to match the actual furniture layout before deploying.
    "sofa": {
        "x": 5.0,
        "y": 1.0,
        "room": "living_room",
        "label": "Sofa",
        "threshold_adc": 3000,
        "calibration_weight_kg": 50.0,
    },
    "bed": {
        "x": 1.0,
        "y": 1.0,
        "room": "bedroom",
        "label": "Bed",
        "threshold_adc": 3000,
        "calibration_weight_kg": 50.0,
    },
    "toilet": {
        "x": 1.0,
        "y": 3.0,
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
# MQTT data drives calculation directly. Four anchors use a short settle period;
# three anchors wait briefly for the fourth before falling back.
THREE_ANCHOR_FALLBACK_WAIT_SEC = 1.2
# After all four anchors arrive, briefly collect the remaining MQTT messages
# from the same ESP32 scan batch before solving.
FOUR_ANCHOR_SETTLE_SEC = 0.15
SNAPSHOT_WINDOW_SEC = 3.0
MIN_SNAPSHOT_SAMPLES_PER_ANCHOR = 2
MAX_READING_AGE_SEC = 4.0
USE_FILTERED_RSSI = True

# Teacher-required consistency mode:
# each trilateration frame must use RSSI samples from the same beacon advertising slot.
USE_PACKET_SLOT_SYNC = True
BEACON_ADV_INTERVAL_MS = 100
MIN_SYNC_FRAMES_PER_UPDATE = 1

# Keep strict packet-slot sync first, then use a short time-synchronized
# three-anchor fallback when the current event batch reaches its deadline.
USE_TIME_SYNC_FALLBACK_AFTER_RELAX = True
RELAXED_ANCHOR_SYNC_WINDOW_SEC = 1.5
USE_LATEST_SYNC_FRAME_ONLY = False
MAX_SYNC_FRAME_AGE_SEC = 3.5

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

# Reject implausible low-confidence jumps before they enter smoothing.
USE_LOW_CONFIDENCE_JUMP_GUARD = True
LOW_CONFIDENCE_JUMP_THRESHOLD = 0.82
LOW_CONFIDENCE_JUMP_BASE_M = 0.35
LOW_CONFIDENCE_MAX_SPEED_MPS = 1.5

# Clamp RSSI-derived distance to a reasonable range (meters).
MIN_DISTANCE_M = 0.2
MAX_DISTANCE_M = 13.0

# Smooth final position output (exponential smoothing).
USE_POSITION_SMOOTHING = True
POSITION_SMOOTHING_ALPHA = 0.45

# Aggregate recent solved positions for a more stable reported coordinate.
USE_POSITION_AGGREGATION = True
POSITION_AGGREGATION_WINDOW = 2
POSITION_AGGREGATION_MODE = "median"  # "median" or "mean"

# Stationary hold: lock coordinates when movement is tiny to prevent drift.
USE_STATIONARY_HOLD = True
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

# Soft pressure-BLE fusion: blend furniture center with BLE coordinate instead of
# jumping directly to the furniture center.
USE_SOFT_PRESSURE_FUSION = True
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
