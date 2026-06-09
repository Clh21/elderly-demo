/**
 * Demo indoor layout used when the backend has not provided an active layout.
 */
export const DEFAULT_INDOOR_LAYOUT = {
  id: 'active-room',
  name: 'Demo Care Room',
  widthM: 11.0,
  heightM: 5.0,
  zones: [
    {
      id: 'bedroom',
      label: 'Bedroom',
      type: 'bedroom',
      x: 0.0,
      y: 0.0,
      width: 6.8,
      height: 3.4,
      color: '#6366F1',
      notes: 'Main sleeping and resting area',
    },
    {
      id: 'toilet',
      label: 'Toilet',
      type: 'toilet',
      x: 0.0,
      y: 3.4,
      width: 6.8,
      height: 1.6,
      color: '#0EA5E9',
      notes: 'Toilet and hygiene area',
    },
    {
      id: 'living_room',
      label: 'Living Room',
      type: 'living_room',
      x: 6.8,
      y: 0.0,
      width: 4.2,
      height: 5.0,
      color: '#F59E0B',
      notes: 'Living and activity area',
    },
  ],
  furniture: [
    {
      id: 'bed-01',
      label: 'Bed',
      type: 'bed',
      x: 0.6,
      y: 0.5,
      width: 2.2,
      height: 1.2,
      rotation: 0,
      occupancyTopic: 'indoor/furniture/bed-01/occupancy',
      occupancyState: 'unknown',
    },
    {
      id: 'sofa-01',
      label: 'Sofa',
      type: 'sofa',
      x: 7.5,
      y: 1.0,
      width: 2.0,
      height: 0.9,
      rotation: 0,
      occupancyTopic: 'indoor/furniture/sofa-01/occupancy',
      occupancyState: 'unknown',
    },
    {
      id: 'toilet-01',
      label: 'Toilet',
      type: 'toilet',
      x: 1.0,
      y: 3.75,
      width: 0.9,
      height: 0.8,
      rotation: 0,
      occupancyTopic: 'indoor/furniture/toilet-01/occupancy',
      occupancyState: 'unknown',
    },
  ],
  anchors: [
    {
      id: 'anchor_01',
      x: 0.0,
      y: 5.0,
      z: 1.0,
      txPower: -65.47,
      pathLossExponent: 2.0,
      rssiTopic: 'indoor/ble/anchor_01/rssi',
      enabled: true,
    },
    {
      id: 'anchor_02',
      x: 0.0,
      y: 0.0,
      z: 1.0,
      txPower: -66.95,
      pathLossExponent: 2.0,
      rssiTopic: 'indoor/ble/anchor_02/rssi',
      enabled: true,
    },
    {
      id: 'anchor_03',
      x: 11.0,
      y: 0.0,
      z: 1.0,
      txPower: -68.04,
      pathLossExponent: 2.0,
      rssiTopic: 'indoor/ble/anchor_03/rssi',
      enabled: true,
    },
  ],
  positioning: {
    targetTopic: 'indoor/location/target_01',
    strictInRoomOutput: true,
    smoothingAlpha: 0.18,
    maxReadingAgeSec: 5.0,
  },
};

export const ROOM_WIDTH_M = DEFAULT_INDOOR_LAYOUT.widthM;
export const ROOM_HEIGHT_M = DEFAULT_INDOOR_LAYOUT.heightM;
export const ROOM_ZONES = DEFAULT_INDOOR_LAYOUT.zones.map((zone) => ({
  id: zone.id,
  label: zone.label,
  color: zone.color,
  notes: zone.notes,
  bounds: {
    xMin: zone.x,
    xMax: zone.x + zone.width,
    yMin: zone.y,
    yMax: zone.y + zone.height,
  },
}));

/**
 * Restricts a numeric value to the provided inclusive range.
 *
 * @param {number} value value to clamp
 * @param {number} min lower bound
 * @param {number} max upper bound
 * @returns {number} clamped value
 */
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toNumberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const toNumberWithFallback = (value, fallback) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

/**
 * Normalizes backend or local indoor layout data into safe rendering bounds.
 *
 * @param {object} layout raw layout payload
 * @returns {object} normalized layout with zones, furniture, anchors, and positioning settings
 */
export const normalizeIndoorLayout = (layout) => {
  const source = layout || DEFAULT_INDOOR_LAYOUT;
  const widthM = clamp(toNumberWithFallback(source.widthM, DEFAULT_INDOOR_LAYOUT.widthM), 1, 100);
  const heightM = clamp(toNumberWithFallback(source.heightM, DEFAULT_INDOOR_LAYOUT.heightM), 1, 100);

  return {
    ...DEFAULT_INDOOR_LAYOUT,
    ...source,
    widthM,
    heightM,
    zones: (source.zones || []).map((zone, index) => {
      const width = clamp(toNumberWithFallback(zone.width, 1), 0.1, widthM);
      const height = clamp(toNumberWithFallback(zone.height, 1), 0.1, heightM);
      return {
        id: zone.id || `zone-${index + 1}`,
        label: zone.label || 'Zone',
        type: zone.type || 'custom',
        x: clamp(toNumberWithFallback(zone.x, 0), 0, widthM - width),
        y: clamp(toNumberWithFallback(zone.y, 0), 0, heightM - height),
        width,
        height,
        color: zone.color || '#6366F1',
        notes: zone.notes || '',
      };
    }),
    furniture: (source.furniture || []).map((item, index) => {
      const width = clamp(toNumberWithFallback(item.width, 0.8), 0.1, widthM);
      const height = clamp(toNumberWithFallback(item.height, 0.8), 0.1, heightM);
      const id = item.id || `furniture-${index + 1}`;
      return {
        id,
        label: item.label || item.type || 'Furniture',
        type: item.type || 'custom',
        x: clamp(toNumberWithFallback(item.x, 0), 0, widthM - width),
        y: clamp(toNumberWithFallback(item.y, 0), 0, heightM - height),
        width,
        height,
        rotation: toNumberWithFallback(item.rotation, 0),
        occupancyTopic: item.occupancyTopic || `indoor/furniture/${id}/occupancy`,
        occupancyState: item.occupancyState || 'unknown',
      };
    }),
    anchors: (source.anchors || []).map((anchor, index) => {
      const id = anchor.id || `anchor_${index + 1}`;
      return {
        id,
        x: clamp(toNumberWithFallback(anchor.x, 0), 0, widthM),
        y: clamp(toNumberWithFallback(anchor.y, 0), 0, heightM),
        z: clamp(toNumberWithFallback(anchor.z, 1), 0, 5),
        txPower: clamp(toNumberWithFallback(anchor.txPower, -65), -120, -20),
        pathLossExponent: clamp(toNumberWithFallback(anchor.pathLossExponent, 2), 1, 6),
        rssiTopic: anchor.rssiTopic || `indoor/ble/${id}/rssi`,
        enabled: anchor.enabled !== false,
      };
    }),
    positioning: {
      ...DEFAULT_INDOOR_LAYOUT.positioning,
      ...(source.positioning || {}),
    },
  };
};

const buildAxisTicks = (maxValue) => {
  const ticks = [];
  const whole = Math.floor(maxValue);
  for (let i = 0; i <= whole; i += 1) {
    ticks.push(i);
  }

  if (Math.abs(ticks[ticks.length - 1] - maxValue) > 0.001) {
    ticks.push(maxValue);
  }

  return ticks;
};

export const ROOM_AXIS_TICKS_X = buildAxisTicks(ROOM_WIDTH_M);
export const ROOM_AXIS_TICKS_Y = buildAxisTicks(ROOM_HEIGHT_M);

/**
 * Builds x-axis tick marks for the provided layout width.
 *
 * @param {object} layout layout payload
 * @returns {number[]} x-axis tick values
 */
export const getRoomAxisTicksX = (layout) => buildAxisTicks(normalizeIndoorLayout(layout).widthM);

/**
 * Builds y-axis tick marks for the provided layout height.
 *
 * @param {object} layout layout payload
 * @returns {number[]} y-axis tick values
 */
export const getRoomAxisTicksY = (layout) => buildAxisTicks(normalizeIndoorLayout(layout).heightM);

/**
 * Formats axis tick labels without unnecessary decimal places.
 *
 * @param {number} value numeric tick value
 * @returns {string} display label
 */
export const formatAxisTick = (value) => (
  Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(2))}`
);

/**
 * Resolves rectangular bounds for a zone.
 *
 * @param {object} zone zone payload with bounds or x/y/width/height
 * @returns {{xMin: number, xMax: number, yMin: number, yMax: number}} zone bounds
 */
export const getZoneBounds = (zone) => {
  if (zone.bounds) {
    return zone.bounds;
  }

  return {
    xMin: zone.x,
    xMax: zone.x + zone.width,
    yMin: zone.y,
    yMax: zone.y + zone.height,
  };
};

const isInsideBounds = (bounds, x, y) => (
  x >= bounds.xMin
  && x <= bounds.xMax
  && y >= bounds.yMin
  && y <= bounds.yMax
);

const getZoneCenter = (zone) => {
  const bounds = getZoneBounds(zone);
  return {
    x: (bounds.xMin + bounds.xMax) / 2,
    y: (bounds.yMin + bounds.yMax) / 2,
  };
};

/**
 * Resolves the room or nearest room for a layout coordinate.
 *
 * @param {number} x x coordinate in meters
 * @param {number} y y coordinate in meters
 * @param {object} layout layout payload
 * @returns {object} matching or nearest zone
 */
export const resolveRoomFromCoordinate = (x, y, layout = DEFAULT_INDOOR_LAYOUT) => {
  const normalizedLayout = normalizeIndoorLayout(layout);
  const boundedX = clamp(x, 0, normalizedLayout.widthM);
  const boundedY = clamp(y, 0, normalizedLayout.heightM);
  const zones = normalizedLayout.zones || [];

  const exact = zones.find((zone) => isInsideBounds(getZoneBounds(zone), boundedX, boundedY));
  if (exact) {
    return exact;
  }

  if (!zones.length) {
    return {
      id: 'unassigned',
      label: 'Unassigned',
      color: '#64748B',
      notes: '',
    };
  }

  let nearestZone = zones[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  zones.forEach((zone) => {
    const center = getZoneCenter(zone);
    const distance = Math.hypot(boundedX - center.x, boundedY - center.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestZone = zone;
    }
  });

  return nearestZone;
};

/**
 * Converts backend positioning payloads into a UI-friendly room position object.
 *
 * @param {object} payload raw backend positioning payload
 * @param {object} layout layout payload used to resolve room labels
 * @returns {object|null} normalized position, or null when the payload is unavailable
 */
export const normalizeIndoorPositionPayload = (payload, layout = DEFAULT_INDOOR_LAYOUT) => {
  if (!payload || payload.available === false) {
    return null;
  }

  const normalizedLayout = normalizeIndoorLayout(layout);
  const x = toNumberOrNull(payload.x);
  const y = toNumberOrNull(payload.y);
  if (x == null || y == null) {
    return null;
  }

  const boundedX = clamp(x, 0, normalizedLayout.widthM);
  const boundedY = clamp(y, 0, normalizedLayout.heightM);
  const zone = resolveRoomFromCoordinate(boundedX, boundedY, normalizedLayout);

  return {
    x: boundedX,
    y: boundedY,
    confidence: toNumberOrNull(payload.confidence),
    spreadM: toNumberOrNull(payload.spread_m),
    residualRmsM: toNumberOrNull(payload.residual_rms_m),
    syncSpanS: toNumberOrNull(payload.sync_span_s),
    syncFrames: toNumberOrNull(payload.sync_frames),
    source: payload.source || payload.mqttTopic || 'unknown',
    distancesM: payload.distances_m || {},
    simulatedRssi: payload.simulated_rssi || {},
    ts: payload.ts || payload.receivedAt || new Date().toISOString(),
    roomId: zone.id,
    roomLabel: zone.label,
    roomColor: zone.color,
    roomNotes: zone.notes,
  };
};

/**
 * Formats indoor positioning timestamps for display.
 *
 * @param {string|number|Date} value timestamp value
 * @returns {string} formatted timestamp or Unknown
 */
export const formatIndoorTimestamp = (value) => {
  if (!value) {
    return 'Unknown';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};
