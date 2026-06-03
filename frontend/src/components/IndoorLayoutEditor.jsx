import React, { useEffect, useMemo, useState } from 'react';
import {
  MapPin,
  MousePointer2,
  Plus,
  Radio,
  RotateCcw,
  Save,
  Settings2,
  Square,
  Trash2,
} from 'lucide-react';
import IndoorMapCanvas from './IndoorMapCanvas';
import { normalizeIndoorLayout } from '../lib/indoorRooms';

const zoneColors = ['#6366F1', '#0EA5E9', '#F59E0B', '#10B981', '#EC4899', '#64748B'];

const furnitureTemplates = {
  bed: { label: 'Bed', width: 2.2, height: 1.2 },
  sofa: { label: 'Sofa', width: 2.0, height: 0.9 },
  toilet: { label: 'Toilet', width: 0.9, height: 0.8 },
  chair: { label: 'Chair', width: 0.7, height: 0.7 },
  table: { label: 'Table', width: 1.2, height: 0.8 },
};

const occupancyOptions = ['unknown', 'free', 'occupied', 'stale'];

const makeId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 6)}`;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const listKeyForType = (type) => {
  if (type === 'zone') {
    return 'zones';
  }
  if (type === 'anchor') {
    return 'anchors';
  }
  return 'furniture';
};

const rectsOverlap = (a, b) => (
  a.x < b.x + b.width - 0.001
  && a.x + a.width > b.x + 0.001
  && a.y < b.y + b.height - 0.001
  && a.y + a.height > b.y + 0.001
);

const zoneCanBePlaced = (candidate, zones, id) => (
  !zones.some((zone) => zone.id !== id && rectsOverlap(candidate, zone))
);

const numberValue = (value, fallback = 0) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const fieldLabelClass = 'text-xs font-semibold uppercase tracking-[0.14em] text-slate-500';
const inputClass = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100';
const smallInputClass = 'w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100';

const IndoorLayoutEditor = ({
  layout,
  simulatorStatus,
  isSaving,
  isResetting,
  canEdit = false,
  livePosition = null,
  onSave,
  onReset,
}) => {
  const [draft, setDraft] = useState(() => normalizeIndoorLayout(layout));
  const [selectedItem, setSelectedItem] = useState(null);
  const [drawMode, setDrawMode] = useState(null);

  useEffect(() => {
    setDraft(normalizeIndoorLayout(layout));
  }, [layout]);

  const selectedRecord = useMemo(() => {
    if (!selectedItem) {
      return null;
    }
    return draft[listKeyForType(selectedItem.type)]?.find((item) => item.id === selectedItem.id) || null;
  }, [draft, selectedItem]);

  const updateDraft = (updater) => {
    setDraft((current) => normalizeIndoorLayout(typeof updater === 'function' ? updater(current) : updater));
  };

  const updateRoomField = (field, value) => {
    updateDraft((current) => ({
      ...current,
      [field]: field.endsWith('M') ? numberValue(value, current[field]) : value,
    }));
  };

  const updateItem = (type, id, patch) => {
    const listKey = listKeyForType(type);
    updateDraft((current) => ({
      ...current,
      [listKey]: current[listKey].map((item) => (
        item.id === id
          ? (() => {
              const candidate = { ...item, ...patch };
              if (type === 'zone' && !zoneCanBePlaced(candidate, current.zones, id)) {
                return item;
              }
              return candidate;
            })()
          : item
      )),
    }));
  };

  const deleteSelected = () => {
    if (!selectedItem) {
      return;
    }
    const listKey = listKeyForType(selectedItem.type);
    updateDraft((current) => ({
      ...current,
      [listKey]: current[listKey].filter((item) => item.id !== selectedItem.id),
    }));
    setSelectedItem(null);
  };

  const handleMoveItem = (type, id, patch) => {
    updateItem(type, id, patch);
  };

  const handleCreateZone = (rect) => {
    if (!zoneCanBePlaced(rect, draft.zones, null)) {
      return;
    }

    const id = makeId('zone');
    const zone = {
      id,
      label: 'New Zone',
      type: 'custom',
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      color: zoneColors[draft.zones.length % zoneColors.length],
      notes: '',
    };
    updateDraft((current) => ({
      ...current,
      zones: [...current.zones, zone],
    }));
    setSelectedItem({ type: 'zone', id });
  };

  const addFurniture = (type) => {
    const template = furnitureTemplates[type];
    const id = makeId(type);
    const width = Math.min(template.width, draft.widthM);
    const height = Math.min(template.height, draft.heightM);
    const item = {
      id,
      label: template.label,
      type,
      x: clamp(draft.widthM / 2 - width / 2, 0, draft.widthM - width),
      y: clamp(draft.heightM / 2 - height / 2, 0, draft.heightM - height),
      width,
      height,
      rotation: 0,
      occupancyTopic: `indoor/furniture/${id}/occupancy`,
      occupancyState: 'unknown',
    };
    updateDraft((current) => ({
      ...current,
      furniture: [...current.furniture, item],
    }));
    setSelectedItem({ type: 'furniture', id });
    setDrawMode(null);
  };

  const addAnchor = () => {
    const index = draft.anchors.length + 1;
    const id = `anchor_${String(index).padStart(2, '0')}`;
    const anchor = {
      id,
      x: draft.widthM,
      y: draft.heightM,
      z: 1,
      txPower: -65,
      pathLossExponent: 2,
      rssiTopic: `indoor/ble/${id}/rssi`,
      enabled: true,
    };
    updateDraft((current) => ({
      ...current,
      anchors: [...current.anchors, anchor],
    }));
    setSelectedItem({ type: 'anchor', id });
    setDrawMode(null);
  };

  const saveDraft = () => {
    onSave?.(normalizeIndoorLayout(draft));
  };

  const editable = canEdit;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">2D Layout Editor</h3>
          <p className="text-sm text-slate-500">Customize room size, zones, furniture, and receiver nodes.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={!canEdit || isResetting}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw className="h-4 w-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={saveDraft}
            disabled={!canEdit || isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            <Save className="h-4 w-4" />
            Save Layout
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-4">
            <label className="space-y-1">
              <span className={fieldLabelClass}>Room Name</span>
              <input
                value={draft.name || ''}
                onChange={(event) => updateRoomField('name', event.target.value)}
                disabled={!editable}
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className={fieldLabelClass}>Width (m)</span>
              <input
                type="number"
                min="1"
                max="100"
                step="0.1"
                value={draft.widthM}
                onChange={(event) => updateRoomField('widthM', event.target.value)}
                disabled={!editable}
                className={inputClass}
              />
            </label>
            <label className="space-y-1">
              <span className={fieldLabelClass}>Height (m)</span>
              <input
                type="number"
                min="1"
                max="100"
                step="0.1"
                value={draft.heightM}
                onChange={(event) => updateRoomField('heightM', event.target.value)}
                disabled={!editable}
                className={inputClass}
              />
            </label>
            <div className="space-y-1">
              <span className={fieldLabelClass}>Simulator</span>
              <div className={`flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium ${
                simulatorStatus?.enabled
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-500'
              }`}>
                <Radio className="h-4 w-4" />
                {simulatorStatus?.enabled ? 'Running' : 'Stopped'}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <IndoorMapCanvas
              layout={draft}
              position={livePosition}
              editable={editable}
              drawMode={drawMode}
              selectedItem={selectedItem}
              onSelectItem={(type, id) => {
                setSelectedItem({ type, id });
                setDrawMode(null);
              }}
              onMoveItem={handleMoveItem}
              onCreateZone={handleCreateZone}
              className="h-[520px] w-full"
            />
          </div>
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Settings2 className="h-4 w-4" />
              Tools
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDrawMode(drawMode === 'zone' ? null : 'zone')}
                disabled={!editable}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  drawMode === 'zone'
                    ? 'bg-sky-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Square className="h-4 w-4" />
                Draw Zone
              </button>
              <button
                type="button"
                onClick={() => {
                  setDrawMode(null);
                  setSelectedItem(null);
                }}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                <MousePointer2 className="h-4 w-4" />
                Select
              </button>
            </div>
            <div className="mt-3 text-xs text-slate-500">
              Draw Zone creates a rectangle. Select zones or furniture, then drag corners to resize. Zones stop before overlapping.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Plus className="h-4 w-4" />
              Add Furniture
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(furnitureTemplates).map(([type, template]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => addFurniture(type)}
                  disabled={!editable}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {template.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={addAnchor}
              disabled={!editable}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MapPin className="h-4 w-4" />
              Add Receiver Node
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-800">Selected Item</div>
              <button
                type="button"
                onClick={deleteSelected}
                disabled={!editable || !selectedItem}
                className="inline-flex items-center gap-1 rounded-lg border border-red-100 bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>

            {!selectedRecord ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
                Select a zone, furniture item, or receiver node to edit its properties.
              </div>
            ) : selectedItem.type === 'zone' ? (
              <ZoneForm
                item={selectedRecord}
                disabled={!editable}
                onChange={(patch) => updateItem('zone', selectedRecord.id, patch)}
              />
            ) : selectedItem.type === 'furniture' ? (
              <FurnitureForm
                item={selectedRecord}
                disabled={!editable}
                onChange={(patch) => updateItem('furniture', selectedRecord.id, patch)}
              />
            ) : (
              <AnchorForm
                item={selectedRecord}
                disabled={!editable}
                onChange={(patch) => updateItem('anchor', selectedRecord.id, patch)}
              />
            )}
          </div>
        </aside>
      </div>

      {!canEdit ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Layout editing is available for administrator accounts.
        </div>
      ) : null}
    </section>
  );
};

const PositionFields = ({ item, disabled, onChange, includeSize = true }) => (
  <div className="grid grid-cols-2 gap-2">
    <label className="space-y-1">
      <span className={fieldLabelClass}>X</span>
      <input type="number" step="0.05" value={item.x} disabled={disabled} onChange={(event) => onChange({ x: numberValue(event.target.value, item.x) })} className={smallInputClass} />
    </label>
    <label className="space-y-1">
      <span className={fieldLabelClass}>Y</span>
      <input type="number" step="0.05" value={item.y} disabled={disabled} onChange={(event) => onChange({ y: numberValue(event.target.value, item.y) })} className={smallInputClass} />
    </label>
    {includeSize ? (
      <>
        <label className="space-y-1">
          <span className={fieldLabelClass}>Width</span>
          <input type="number" step="0.05" value={item.width} disabled={disabled} onChange={(event) => onChange({ width: numberValue(event.target.value, item.width) })} className={smallInputClass} />
        </label>
        <label className="space-y-1">
          <span className={fieldLabelClass}>Height</span>
          <input type="number" step="0.05" value={item.height} disabled={disabled} onChange={(event) => onChange({ height: numberValue(event.target.value, item.height) })} className={smallInputClass} />
        </label>
      </>
    ) : null}
  </div>
);

const ZoneForm = ({ item, disabled, onChange }) => (
  <div className="space-y-3">
    <label className="space-y-1">
      <span className={fieldLabelClass}>Area Name</span>
      <input value={item.label} disabled={disabled} onChange={(event) => onChange({ label: event.target.value })} className={inputClass} />
    </label>
    <label className="space-y-1">
      <span className={fieldLabelClass}>Area Type</span>
      <input value={item.type} disabled={disabled} onChange={(event) => onChange({ type: event.target.value })} className={inputClass} />
    </label>
    <PositionFields item={item} disabled={disabled} onChange={onChange} />
    <label className="space-y-1">
      <span className={fieldLabelClass}>Color</span>
      <input type="color" value={item.color} disabled={disabled} onChange={(event) => onChange({ color: event.target.value })} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-2" />
    </label>
    <label className="space-y-1">
      <span className={fieldLabelClass}>Notes</span>
      <textarea value={item.notes || ''} disabled={disabled} onChange={(event) => onChange({ notes: event.target.value })} className={`${inputClass} min-h-20`} />
    </label>
  </div>
);

const FurnitureForm = ({ item, disabled, onChange }) => (
  <div className="space-y-3">
    <label className="space-y-1">
      <span className={fieldLabelClass}>Furniture Name</span>
      <input value={item.label} disabled={disabled} onChange={(event) => onChange({ label: event.target.value })} className={inputClass} />
    </label>
    <label className="space-y-1">
      <span className={fieldLabelClass}>Furniture Type</span>
      <select value={item.type} disabled={disabled} onChange={(event) => onChange({ type: event.target.value })} className={inputClass}>
        {Object.keys(furnitureTemplates).map((type) => (
          <option key={type} value={type}>{type}</option>
        ))}
        <option value="custom">custom</option>
      </select>
    </label>
    <PositionFields item={item} disabled={disabled} onChange={onChange} />
    <label className="space-y-1">
      <span className={fieldLabelClass}>Occupancy State</span>
      <select value={item.occupancyState} disabled={disabled} onChange={(event) => onChange({ occupancyState: event.target.value })} className={inputClass}>
        {occupancyOptions.map((state) => (
          <option key={state} value={state}>{state}</option>
        ))}
      </select>
    </label>
    <label className="space-y-1">
      <span className={fieldLabelClass}>Occupancy Topic</span>
      <input value={item.occupancyTopic} disabled={disabled} onChange={(event) => onChange({ occupancyTopic: event.target.value })} className={inputClass} />
    </label>
  </div>
);

const AnchorForm = ({ item, disabled, onChange }) => (
  <div className="space-y-3">
    <label className="space-y-1">
      <span className={fieldLabelClass}>Node ID</span>
      <input value={item.id} disabled className={inputClass} />
    </label>
    <PositionFields item={item} disabled={disabled} onChange={onChange} includeSize={false} />
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1">
        <span className={fieldLabelClass}>Z</span>
        <input type="number" step="0.05" value={item.z} disabled={disabled} onChange={(event) => onChange({ z: numberValue(event.target.value, item.z) })} className={smallInputClass} />
      </label>
      <label className="space-y-1">
        <span className={fieldLabelClass}>Enabled</span>
        <select value={item.enabled ? 'true' : 'false'} disabled={disabled} onChange={(event) => onChange({ enabled: event.target.value === 'true' })} className={smallInputClass}>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </label>
      <label className="space-y-1">
        <span className={fieldLabelClass}>TX Power</span>
        <input type="number" step="0.1" value={item.txPower} disabled={disabled} onChange={(event) => onChange({ txPower: numberValue(event.target.value, item.txPower) })} className={smallInputClass} />
      </label>
      <label className="space-y-1">
        <span className={fieldLabelClass}>Path Loss</span>
        <input type="number" step="0.1" value={item.pathLossExponent} disabled={disabled} onChange={(event) => onChange({ pathLossExponent: numberValue(event.target.value, item.pathLossExponent) })} className={smallInputClass} />
      </label>
    </div>
    <label className="space-y-1">
      <span className={fieldLabelClass}>RSSI Topic</span>
      <input value={item.rssiTopic} disabled={disabled} onChange={(event) => onChange({ rssiTopic: event.target.value })} className={inputClass} />
    </label>
  </div>
);

export default IndoorLayoutEditor;
