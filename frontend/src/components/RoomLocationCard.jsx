import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, MapPin, Radio } from 'lucide-react';
import IndoorMapCanvas from './IndoorMapCanvas';
import { formatIndoorTimestamp } from '../lib/indoorRooms';

const RoomLocationCard = ({ currentPosition, history, layout, onTitleClick }) => {
  const [page, setPage] = useState(0);
  const records = useMemo(() => (Array.isArray(history) ? history : []), [history]);
  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const previewRecords = useMemo(
    () => records.slice(page * pageSize, page * pageSize + pageSize),
    [records, page]
  );
  const hasLocationUpdate = !!currentPosition;

  useEffect(() => {
    if (page > totalPages - 1) {
      setPage(totalPages - 1);
    }
  }, [page, totalPages]);

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
        <div className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${hasLocationUpdate ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
          <Radio className="h-3.5 w-3.5" />
          {hasLocationUpdate ? 'Position updated' : 'Waiting update'}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <IndoorMapCanvas
          layout={layout}
          position={currentPosition}
          editable={false}
          className="h-44 w-full"
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2">
        <div className="text-sm text-gray-500">Current location</div>
        <div className="text-2xl font-bold text-gray-900">
          {currentPosition?.semanticLocation || currentPosition?.roomLabel || 'Waiting for location'}
        </div>
        <div className="text-sm text-gray-500">
          {currentPosition
            ? `(${currentPosition.x.toFixed(2)}, ${currentPosition.y.toFixed(2)}) m${
                currentPosition.semanticLocation ? ' - pressure fused' : ''
              } - ${formatIndoorTimestamp(currentPosition.ts)}`
            : 'No synchronized indoor position yet'}
        </div>
        {currentPosition && (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {currentPosition.stationaryHold ? (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                Stationary (Locked)
              </span>
            ) : currentPosition.activityState === 'moving' ? (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                Moving
              </span>
            ) : currentPosition.activityState === 'stationary' ? (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                Stationary
              </span>
            ) : null}
            {currentPosition.source === 'fusion' && (
              <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                BLE + Pressure
              </span>
            )}
            {currentPosition.source === 'pressure' && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                Pressure
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 border-t border-gray-100 pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Recent records</div>
          {records.length > pageSize ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={page === 0}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Previous room records page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-10 text-center text-xs font-medium text-slate-500">
                {page + 1}/{totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages - 1, current + 1))}
                disabled={page >= totalPages - 1}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Next room records page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
        {previewRecords.length ? (
          <div className="space-y-2">
            {previewRecords.map((entry) => (
              <div key={entry.entryKey} className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-medium text-slate-800">
                  {entry.semanticLocation || entry.roomLabel}
                </div>
                <div>{formatIndoorTimestamp(entry.ts)}</div>
                <div>({entry.x.toFixed(2)}, {entry.y.toFixed(2)}) m</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Room records will appear after indoor updates.</div>
        )}
      </div>
    </div>
  );
};

export default RoomLocationCard;
