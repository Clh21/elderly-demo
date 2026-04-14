import React, { useMemo } from 'react';
import { MapPin, Radio } from 'lucide-react';
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

const RoomLocationCard = ({ currentPosition, history, onTitleClick, positioningStatus }) => {
  const previewRecords = useMemo(() => (history || []).slice(0, 4), [history]);
  const pointX = currentPosition?.x ?? null;
  const pointY = currentPosition?.y != null ? meterToSvgY(currentPosition.y) : null;
  const hasLocationUpdate = !!currentPosition;
  const positioningUnavailable = positioningStatus?.available === false;
  const positioningUnavailableMessage = positioningStatus?.message;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MapPin className="h-6 w-6 text-cyan-600" />
          {onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              className="text-left text-lg font-semibold text-gray-900 hover:text-cyan-700 hover:underline"
            >
              Indoor Room Snapshot
            </button>
          ) : (
            <h3 className="text-lg font-semibold text-gray-900">Indoor Room Snapshot</h3>
          )}
        </div>
        <div className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${positioningUnavailable ? 'bg-amber-100 text-amber-700' : (hasLocationUpdate ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}`}>
          <Radio className="h-3.5 w-3.5" />
          {positioningUnavailable ? 'Unavailable' : (hasLocationUpdate ? 'Position updated' : 'Waiting update')}
        </div>
      </div>

      {positioningUnavailable ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {positioningUnavailableMessage || 'Indoor positioning is currently unavailable.'}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <svg viewBox={`0 0 ${ROOM_WIDTH_M} ${ROOM_HEIGHT_M}`} className="h-44 w-full rounded-md bg-white">
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

          <ElderAvatarMarker x={pointX} y={pointY} scale={0.9} />
        </svg>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        <div className="text-sm text-gray-500">Current room</div>
        <div className="text-2xl font-bold text-gray-900">{currentPosition?.roomLabel || 'Waiting for location'}</div>
        <div className="text-sm text-gray-500">
          {currentPosition
            ? `(${currentPosition.x.toFixed(2)}, ${currentPosition.y.toFixed(2)}) m • ${formatIndoorTimestamp(currentPosition.ts)}`
            : (positioningUnavailable ? 'Indoor positioning unavailable' : 'No synchronized indoor position yet')}
        </div>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Recent records</div>
        {previewRecords.length ? (
          <div className="space-y-2">
            {previewRecords.map((entry) => (
              <div key={entry.entryKey} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-medium text-slate-800">{entry.roomLabel}</div>
                <div>{formatIndoorTimestamp(entry.ts)}</div>
                <div>({entry.x.toFixed(2)}, {entry.y.toFixed(2)}) m</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            {positioningUnavailable
              ? (positioningUnavailableMessage || 'Indoor positioning is currently unavailable.')
              : 'Room records will appear after indoor updates.'}
          </div>
        )}
      </div>
    </div>
  );
};

export default RoomLocationCard;
