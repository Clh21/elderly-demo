import React, { useMemo } from 'react';
import { X } from 'lucide-react';
import IndoorMapCanvas from './IndoorMapCanvas';
import { formatIndoorTimestamp, normalizeIndoorLayout } from '../lib/indoorRooms';

const RoomLocationModal = ({ isOpen, onClose, currentPosition, history, layout }) => {
  const records = useMemo(() => (Array.isArray(history) ? history : []), [history]);
  const normalizedLayout = useMemo(() => normalizeIndoorLayout(layout), [layout]);

  const roomStats = useMemo(() => {
    const base = normalizedLayout.zones.reduce((acc, zone) => ({ ...acc, [zone.id]: 0 }), {});
    records.forEach((entry) => {
      if (entry?.roomId && base[entry.roomId] != null) {
        base[entry.roomId] += 1;
      }
    });
    return base;
  }, [records, normalizedLayout]);

  const total = records.length;

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
              <IndoorMapCanvas
                layout={normalizedLayout}
                position={currentPosition}
                editable={false}
                className="h-[320px] w-full"
              />
            </section>

            <aside className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold text-slate-900">Room summary</h3>
              {normalizedLayout.zones.map((zone) => {
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
                No room records yet. Keep the positioning simulator or MQTT positioning server running and wait for updates.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default RoomLocationModal;
