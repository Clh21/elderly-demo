"""Configuration for MQTT-based indoor positioning."""

# MQTT connection
# If server and broker are on the same PC, prefer localhost for stability.
MQTT_BROKER = "localhost"
MQTT_PORT = 1883
MQTT_USERNAME = ""
MQTT_PASSWORD = ""
MQTT_RSSI_TOPIC = "indoor/ble/+/rssi"
MQTT_POSITION_TOPIC = "indoor/location/target_01"

# RSSI to distance conversion (log-distance path loss model)
# distance = 10 ^ ((tx_power - rssi) / (10 * n))
PATH_LOSS_EXPONENT = 2.0

# Coordinate system for current deployment:
# - x axis: along the long side from anchor_02 to anchor_03 (length = 11.0 m)
# - y axis: perpendicular to x axis toward anchor_01 direction (height = 5.0 m)
# - Origin is placed at anchor_02 for easier measurement
# - All anchors at 1.0 m height (2D model currently uses x/y only)
# - tx_power should be calibrated at 1m for each anchor (default is conservative)
ANCHORS = {
    "anchor_01": {"x": 0.0, "y": 5.0, "tx_power": -65.47},
    "anchor_02": {"x": 0.0, "y": 0.0, "tx_power": -66.95},
    "anchor_03": {"x": 11.0, "y": 0.0, "tx_power": -68.04},
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
# 30-second snapshot mode (aligned with interim report requirement).
POSITION_UPDATE_INTERVAL_SEC = 30.0
SNAPSHOT_WINDOW_SEC = 30.0
MIN_SNAPSHOT_SAMPLES_PER_ANCHOR = 8
MAX_READING_AGE_SEC = 35.0
USE_FILTERED_RSSI = True

# Teacher-required consistency mode:
# each trilateration frame must use RSSI samples from the same beacon advertising slot.
USE_PACKET_SLOT_SYNC = True
BEACON_ADV_INTERVAL_MS = 250
MIN_SYNC_FRAMES_PER_UPDATE = 2

# Packet-slot alignment robustness (server-side only, no firmware reflashing needed).
SLOT_SYNC_REFERENCE_ANCHOR = "anchor_01"
SLOT_OVERLAP_TOLERANCE_SLOTS = 1
SLOT_OFFSET_MAX_STEP_PER_UPDATE = 4
SLOT_OFFSET_SEARCH_RADIUS = 80

# Keep only near-synchronous anchor samples for trilateration.
ANCHOR_SYNC_WINDOW_SEC = 1.4

# Reject trilateration result if fitting error is too large.
TRILATERATION_MAX_RMS_ERROR_M = 2.0

# Only switch to centroid fallback when it improves residual by at least this margin.
FALLBACK_IMPROVEMENT_MARGIN_M = 0.22

# Use RSSI-weighted centroid fallback if trilateration is unstable.
USE_WEIGHTED_CENTROID_FALLBACK = True

# Confidence scaling for residual/spread scoring.
CONFIDENCE_ERROR_SCALE_M = 2.5

# Clamp RSSI-derived distance to a reasonable range (meters).
MIN_DISTANCE_M = 0.2
MAX_DISTANCE_M = 13.0

# Smooth final position output (exponential smoothing).
USE_POSITION_SMOOTHING = True
POSITION_SMOOTHING_ALPHA = 0.18

# Aggregate recent solved positions for a more stable reported coordinate.
USE_POSITION_AGGREGATION = True
POSITION_AGGREGATION_WINDOW = 3
POSITION_AGGREGATION_MODE = "median"  # "median" or "mean"

# Stationary hold: lock coordinates when movement is tiny to prevent drift.
USE_STATIONARY_HOLD = False
# Avoid locking when confidence is low, otherwise wrong points can be held.
HOLD_MIN_CONFIDENCE_FOR_LOCK = 0.62
STATIONARY_MOVE_THRESHOLD_M = 0.30
STATIONARY_CONFIRM_UPDATES = 3
STATIONARY_RELEASE_FACTOR = 1.8
STATIONARY_RELEASE_CONFIRM_UPDATES = 2

# Print debug output for each location update
VERBOSE_LOGGING = True
