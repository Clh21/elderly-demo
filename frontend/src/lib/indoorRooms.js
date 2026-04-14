export const ROOM_WIDTH_M = 11.0;
export const ROOM_HEIGHT_M = 5.0;

export const ROOM_ZONES = [
  {
    id: 'bedroom',
    label: 'Bedroom',
    color: '#6366F1',
    bounds: { xMin: 0.0, xMax: 6.8, yMin: 0.0, yMax: 3.4 },
    notes: 'Main sleeping and resting area',
  },
  {
    id: 'toilet',
    label: 'Toilet',
    color: '#0EA5E9',
    bounds: { xMin: 0.0, xMax: 6.8, yMin: 3.4, yMax: ROOM_HEIGHT_M },
    notes: 'Toilet and hygiene area',
  },
  {
    id: 'living_room',
    label: 'Living Room',
    color: '#F59E0B',
    bounds: { xMin: 6.8, xMax: ROOM_WIDTH_M, yMin: 0.0, yMax: ROOM_HEIGHT_M },
    notes: 'Living and activity area',
  },
];

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

export const formatAxisTick = (value) => (
  Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(2))}`
);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const toNumberOrNull = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};

const isInsideBounds = (bounds, x, y) => (
  x >= bounds.xMin
  && x <= bounds.xMax
  && y >= bounds.yMin
  && y <= bounds.yMax
);

const getZoneCenter = (zone) => ({
  x: (zone.bounds.xMin + zone.bounds.xMax) / 2,
  y: (zone.bounds.yMin + zone.bounds.yMax) / 2,
});

export const resolveRoomFromCoordinate = (x, y) => {
  const boundedX = clamp(x, 0, ROOM_WIDTH_M);
  const boundedY = clamp(y, 0, ROOM_HEIGHT_M);

  const exact = ROOM_ZONES.find((zone) => isInsideBounds(zone.bounds, boundedX, boundedY));
  if (exact) {
    return exact;
  }

  let nearestZone = ROOM_ZONES[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  ROOM_ZONES.forEach((zone) => {
    const center = getZoneCenter(zone);
    const distance = Math.hypot(boundedX - center.x, boundedY - center.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestZone = zone;
    }
  });

  return nearestZone;
};

export const normalizeIndoorPositionPayload = (payload) => {
  if (!payload || payload.available === false) {
    return null;
  }

  const x = toNumberOrNull(payload.x);
  const y = toNumberOrNull(payload.y);
  if (x == null || y == null) {
    return null;
  }

  const boundedX = clamp(x, 0, ROOM_WIDTH_M);
  const boundedY = clamp(y, 0, ROOM_HEIGHT_M);
  const zone = resolveRoomFromCoordinate(boundedX, boundedY);

  return {
    x: boundedX,
    y: boundedY,
    confidence: toNumberOrNull(payload.confidence),
    spreadM: toNumberOrNull(payload.spread_m),
    residualRmsM: toNumberOrNull(payload.residual_rms_m),
    syncSpanS: toNumberOrNull(payload.sync_span_s),
    syncFrames: toNumberOrNull(payload.sync_frames),
    ts: payload.ts || payload.receivedAt || new Date().toISOString(),
    roomId: zone.id,
    roomLabel: zone.label,
    roomColor: zone.color,
    roomNotes: zone.notes,
  };
};

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
