import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import ElderAvatarMarker from './ElderAvatarMarker';
import {
  ROOM_AXIS_TICKS_X,
  ROOM_AXIS_TICKS_Y,
  ROOM_HEIGHT_M,
  ROOM_WIDTH_M,
  ROOM_ZONES,
  formatAxisTick,
  formatIndoorTimestamp,
} from '../lib/indoorRooms';

const zoneRect = (zone) => ({
  x: zone.bounds.xMin,
  y: ROOM_HEIGHT_M - zone.bounds.yMax,
  width: zone.bounds.xMax - zone.bounds.xMin,
  height: zone.bounds.yMax - zone.bounds.yMin,
});

const isBorderTick = (tick, maxValue) => tick === 0 || Math.abs(tick - maxValue) < 0.001;
const meterToSvgY = (meterValue) => ROOM_HEIGHT_M - meterValue;

const RoomLocationModal = ({ isOpen, onClose, currentPosition, history, positioningStatus }) => {
  const records = history || [];
  const positioningUnavailable = positioningStatus?.available === false;
  const positioningUnavailableMessage = positioningStatus?.message;

  const roomStats = useMemo(() => {
    const base = ROOM_ZONES.reduce((acc, zone) => ({ ...acc, [zone.id]: 0 }), {});
    records.forEach((entry) => {
      if (entry?.roomId && base[entry.roomId] != null) {
        base[entry.roomId] += 1;
      }
    });
    return base;
  }, [records]);

  const total = records.length;
  const pointX = currentPosition?.x ?? null;
  const pointY = currentPosition?.y != null ? meterToSvgY(currentPosition.y) : null;

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Indoor Room Details</h2>
            <p className="text-sm text-slate-500">Room-level snapshot and recent movement records</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 px-5 py-4">
              <div className="text-sm text-slate-500">Current room</div>
              <div className="mt-2 text-3xl font-bold text-slate-900">{currentPosition?.roomLabel || '--'}</div>
            </div>
            <div className="rounded-xl bg-slate-50 px-5 py-4">
              <div className="text-sm text-slate-500">Latest update</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">{formatIndoorTimestamp(currentPosition?.ts)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="rounded-xl border border-slate-200 bg-white p-4 lg:col-span-2">
              <h3 className="mb-3 text-base font-semibold text-slate-900">Room thumbnail</h3>
              <svg viewBox={`0 0 ${ROOM_WIDTH_M} ${ROOM_HEIGHT_M}`} className="h-[320px] w-full rounded-lg bg-slate-50">
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
                  const active = currentPosition?.roomId === zone.id;
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

                <ElderAvatarMarker x={pointX} y={pointY} scale={1.02} />
              </svg>
            </section>

            <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">Room summary</h3>
              {ROOM_ZONES.map((zone) => {
                const count = roomStats[zone.id] || 0;
                const ratio = total > 0 ? ((count / total) * 100).toFixed(0) : '0';
                return (
                  <div key={zone.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{zone.label}</span>
                      <span className="text-slate-600">{count} records</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{ratio}% of recent records</div>
                    <div className="mt-2 h-2 rounded-full bg-slate-200">
                      <div
                        className="h-2 rounded-full"
                        style={{ width: `${ratio}%`, backgroundColor: zone.color }}
                      />
                    </div>
                  </div>
                );
              })}
            </aside>
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            <h3 className="mb-3 text-base font-semibold text-slate-900">Recent room records</h3>
            {records.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">Time</th>
                      <th className="px-3 py-2 font-medium">Room</th>
                      <th className="px-3 py-2 font-medium">Coordinate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {records.map((entry) => (
                      <tr key={entry.entryKey} className="border-t border-slate-100 text-slate-700">
                        <td className="px-3 py-2">{formatIndoorTimestamp(entry.ts)}</td>
                        <td className="px-3 py-2">
                          <span className="rounded-full px-2 py-1 text-xs font-medium" style={{ backgroundColor: `${entry.roomColor}22`, color: entry.roomColor }}>
                            {entry.roomLabel}
                          </span>
                        </td>
                        <td className="px-3 py-2">({entry.x.toFixed(2)}, {entry.y.toFixed(2)}) m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                {positioningUnavailable
                  ? (positioningUnavailableMessage || 'Indoor positioning unavailable. MQTT bridge is not connected.')
                  : 'No room records yet. Keep the positioning server running and wait for updates.'}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default RoomLocationModal;
