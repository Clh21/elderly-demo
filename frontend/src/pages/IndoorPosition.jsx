import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapPin, Radio } from 'lucide-react';
import ElderAvatarMarker from '../components/ElderAvatarMarker';
import { useAuth } from '../context/AuthContext';
import { fetchIndoorPositioningStatus, fetchLatestIndoorPosition, openIndoorPositionStream } from '../services/positioningApi';
import {
  ROOM_AXIS_TICKS_X,
  ROOM_AXIS_TICKS_Y,
  ROOM_HEIGHT_M,
  ROOM_WIDTH_M,
  ROOM_ZONES,
  formatAxisTick,
  formatIndoorTimestamp,
  normalizeIndoorPositionPayload,
} from '../lib/indoorRooms';

const STALE_TIMEOUT_MS = 90_000;

const parseTimestamp = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
};

const getStatusInfo = (position) => {
  if (!position) {
    return {
      label: 'WAITING UPDATE',
      hint: 'Waiting for indoor location update',
      colorClass: 'bg-amber-100 text-amber-700 border-amber-200',
      dotClass: 'bg-amber-500',
    };
  }

  const parsedTs = parseTimestamp(position.ts);
  if (!parsedTs || Date.now() - parsedTs.getTime() > STALE_TIMEOUT_MS) {
    return {
      label: 'WAITING UPDATE',
      hint: 'Last update is stale; waiting for next location update',
      colorClass: 'bg-orange-100 text-orange-700 border-orange-200',
      dotClass: 'bg-orange-500',
    };
  }

  return {
    label: 'POSITION UPDATED',
    hint: 'Indoor position has recent updates',
    colorClass: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    dotClass: 'bg-emerald-500',
  };
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const zoneRect = (zone) => ({
  x: zone.bounds.xMin,
  y: ROOM_HEIGHT_M - zone.bounds.yMax,
  width: zone.bounds.xMax - zone.bounds.xMin,
  height: zone.bounds.yMax - zone.bounds.yMin,
});

const isBorderTick = (tick, maxValue) => tick === 0 || Math.abs(tick - maxValue) < 0.001;
const meterToSvgY = (meterValue) => ROOM_HEIGHT_M - meterValue;

const IndoorPosition = () => {
  const { token } = useAuth();
  const [livePosition, setLivePosition] = useState(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [positioningStatus, setPositioningStatus] = useState(null);

  const statusQuery = useQuery({
    queryKey: ['indoorPositioningStatus'],
    queryFn: fetchIndoorPositioningStatus,
    enabled: !!token,
    refetchInterval: 30_000,
    retry: 1,
  });

  useEffect(() => {
    if (statusQuery.data) {
      setPositioningStatus(statusQuery.data);
    }
  }, [statusQuery.data]);

  const positioningUnavailable = positioningStatus?.available === false;
  const positioningUnavailableMessage = positioningStatus?.message;

  const latestQuery = useQuery({
    queryKey: ['latestIndoorPosition'],
    queryFn: fetchLatestIndoorPosition,
    enabled: !!token,
    refetchInterval: 30_000,
    retry: 1,
  });

  useEffect(() => {
    const normalized = normalizeIndoorPositionPayload(latestQuery.data);
    if (normalized) {
      setLivePosition(normalized);
    }
  }, [latestQuery.data]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    if (positioningUnavailable) {
      setStreamConnected(false);
      return undefined;
    }

    const closeStream = openIndoorPositionStream(token, {
      onUpdate: (payload) => {
        const normalized = normalizeIndoorPositionPayload(payload);
        if (!normalized) {
          return;
        }
        setLivePosition(normalized);
        setStreamConnected(true);
      },
      onStatus: (payload) => {
        setPositioningStatus(payload);
        if (payload?.available === false) {
          setStreamConnected(false);
        }
      },
      onError: () => {
        setStreamConnected(false);
      },
    });

    return () => {
      closeStream();
      setStreamConnected(false);
    };
  }, [token, positioningUnavailable]);

  const status = useMemo(() => getStatusInfo(livePosition), [livePosition]);
  const currentRoom = useMemo(
    () => ROOM_ZONES.find((zone) => zone.id === livePosition?.roomId) || null,
    [livePosition]
  );

  const positionX = livePosition ? clamp(livePosition.x, 0, ROOM_WIDTH_M) : null;
  const positionY = livePosition ? clamp(livePosition.y, 0, ROOM_HEIGHT_M) : null;
  const svgY = positionY == null ? null : meterToSvgY(positionY);

  const formatMetric = (value, suffix = '', digits = 2) => {
    if (value == null) {
      return '--';
    }
    return `${Number(value).toFixed(digits)}${suffix}`;
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Indoor Positioning</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Resident Indoor Location</h2>
              <p className="mt-2 text-sm text-slate-500">Integrated from BLE positioning server into this web dashboard.</p>

              {positioningUnavailable ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <div className="font-semibold">Indoor positioning unavailable</div>
                  <div className="mt-1 text-amber-700">{positioningUnavailableMessage || 'MQTT bridge is not connected.'}</div>
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
              <Radio className={`h-4 w-4 ${positioningUnavailable ? 'text-amber-500' : (streamConnected ? 'text-emerald-500' : 'text-slate-400')}`} />
              <span className="text-sm font-medium text-slate-700">
                {positioningUnavailable ? 'Stream unavailable' : (streamConnected ? 'Stream online' : 'Stream reconnecting')}
              </span>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Room Map</h3>

            <svg
              viewBox={`0 0 ${ROOM_WIDTH_M} ${ROOM_HEIGHT_M}`}
              className="h-[420px] w-full rounded-xl bg-slate-50"
            >
              <rect
                x="0"
                y="0"
                width={ROOM_WIDTH_M}
                height={ROOM_HEIGHT_M}
                fill="#ffffff"
                stroke="#334155"
                strokeWidth="0.05"
              />

              {ROOM_AXIS_TICKS_X.map((tick) => {
                if (isBorderTick(tick, ROOM_WIDTH_M)) {
                  return null;
                }

                return (
                  <line
                    key={`grid-x-${tick}`}
                    x1={tick}
                    y1="0"
                    x2={tick}
                    y2={ROOM_HEIGHT_M}
                    stroke="#e2e8f0"
                    strokeWidth="0.02"
                    strokeDasharray="0.08 0.08"
                  />
                );
              })}

              {ROOM_AXIS_TICKS_Y.map((tick) => {
                if (isBorderTick(tick, ROOM_HEIGHT_M)) {
                  return null;
                }

                const yValue = meterToSvgY(tick);
                return (
                  <line
                    key={`grid-y-${tick}`}
                    x1="0"
                    y1={yValue}
                    x2={ROOM_WIDTH_M}
                    y2={yValue}
                    stroke="#e2e8f0"
                    strokeWidth="0.02"
                    strokeDasharray="0.08 0.08"
                  />
                );
              })}

              {ROOM_ZONES.map((zone) => {
                const rect = zoneRect(zone);
                const active = livePosition?.roomId === zone.id;
                return (
                  <g key={zone.id}>
                    <rect
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      fill={active ? zone.color : `${zone.color}22`}
                      stroke={zone.color}
                      strokeWidth={active ? '0.07' : '0.04'}
                      rx="0.04"
                    />
                    <text
                      x={rect.x + rect.width / 2}
                      y={rect.y + rect.height / 2}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="0.18"
                      fill={active ? '#0f172a' : '#334155'}
                      fontWeight={active ? '700' : '500'}
                    >
                      {zone.label}
                    </text>
                  </g>
                );
              })}

              <g>
                <line x1="0" y1={ROOM_HEIGHT_M} x2={ROOM_WIDTH_M} y2={ROOM_HEIGHT_M} stroke="#1f2937" strokeWidth="0.03" />
                <line x1="0" y1="0" x2="0" y2={ROOM_HEIGHT_M} stroke="#1f2937" strokeWidth="0.03" />

                {ROOM_AXIS_TICKS_X.map((tick) => (
                  <g key={`axis-x-${tick}`}>
                    <line x1={tick} y1={ROOM_HEIGHT_M} x2={tick} y2={ROOM_HEIGHT_M - 0.08} stroke="#1f2937" strokeWidth="0.03" />
                    <text
                      x={tick}
                      y={ROOM_HEIGHT_M - 0.13}
                      textAnchor={tick === 0 ? 'start' : (isBorderTick(tick, ROOM_WIDTH_M) ? 'end' : 'middle')}
                      fontSize="0.12"
                      fill="#334155"
                    >
                      {formatAxisTick(tick)}
                    </text>
                  </g>
                ))}

                {ROOM_AXIS_TICKS_Y.map((tick) => {
                  const yValue = meterToSvgY(tick);
                  return (
                    <g key={`axis-y-${tick}`}>
                      <line x1="0" y1={yValue} x2="0.08" y2={yValue} stroke="#1f2937" strokeWidth="0.03" />
                      <text x="0.12" y={yValue + 0.04} textAnchor="start" fontSize="0.12" fill="#334155">
                        {formatAxisTick(tick)}
                      </text>
                    </g>
                  );
                })}

                <text x={ROOM_WIDTH_M - 0.08} y={ROOM_HEIGHT_M - 0.28} textAnchor="end" fontSize="0.12" fill="#0f172a" fontWeight="600">
                  X (m)
                </text>
                <text x="0.1" y="0.24" textAnchor="start" fontSize="0.12" fill="#0f172a" fontWeight="600">
                  Y (m)
                </text>
              </g>

              <ElderAvatarMarker x={positionX} y={svgY} scale={1.05} />
            </svg>
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Current Position</p>
              <div className="mt-3 flex items-center gap-2 text-slate-900">
                <MapPin className="h-5 w-5 text-rose-500" />
                <span className="text-xl font-semibold">
                  {positionX != null && positionY != null ? `(${positionX.toFixed(3)}, ${positionY.toFixed(3)}) m` : '--'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">Room: {currentRoom?.label || 'Waiting for update'}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Status</p>
              <div className={`mt-3 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-semibold ${status.colorClass}`}>
                <span className={`h-2.5 w-2.5 rounded-full ${status.dotClass}`} />
                {status.label}
              </div>
              <p className="mt-3 text-sm text-slate-500">{status.hint}</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Detail Metrics</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Timestamp</span>
                  <span className="font-medium">{formatIndoorTimestamp(livePosition?.ts)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Confidence</span>
                  <span className="font-medium">{formatMetric(livePosition?.confidence)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Spread</span>
                  <span className="font-medium">{formatMetric(livePosition?.spreadM, ' m', 3)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Residual RMS</span>
                  <span className="font-medium">{formatMetric(livePosition?.residualRmsM, ' m', 3)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Sync frames</span>
                  <span className="font-medium">{livePosition?.syncFrames != null ? `${Math.round(livePosition.syncFrames)}` : '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Sync span</span>
                  <span className="font-medium">{formatMetric(livePosition?.syncSpanS, ' s', 3)}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default IndoorPosition;
