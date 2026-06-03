import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Pause, Play, Radio, Settings2, X } from 'lucide-react';
import IndoorLayoutEditor from '../components/IndoorLayoutEditor';
import IndoorMapCanvas from '../components/IndoorMapCanvas';
import { useAuth } from '../context/AuthContext';
import {
  fetchActiveIndoorLayout,
  fetchIndoorSimulatorStatus,
  resetActiveIndoorLayout,
  saveActiveIndoorLayout,
  updateIndoorSimulatorStatus,
} from '../services/indoorLayoutApi';
import { fetchLatestIndoorPosition, openIndoorPositionStream } from '../services/positioningApi';
import {
  formatIndoorTimestamp,
  normalizeIndoorLayout,
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

const formatMetric = (value, suffix = '', digits = 2) => {
  if (value == null) {
    return '--';
  }
  return `${Number(value).toFixed(digits)}${suffix}`;
};

const IndoorPosition = () => {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [livePosition, setLivePosition] = useState(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [showEditor, setShowEditor] = useState(false);

  const layoutQuery = useQuery({
    queryKey: ['activeIndoorLayout'],
    queryFn: fetchActiveIndoorLayout,
    enabled: !!token,
    retry: 1,
  });

  const simulatorQuery = useQuery({
    queryKey: ['indoorSimulatorStatus'],
    queryFn: fetchIndoorSimulatorStatus,
    enabled: !!token,
    refetchInterval: 10_000,
    retry: 1,
  });

  const layout = useMemo(() => normalizeIndoorLayout(layoutQuery.data), [layoutQuery.data]);

  const latestQuery = useQuery({
    queryKey: ['latestIndoorPosition'],
    queryFn: fetchLatestIndoorPosition,
    enabled: !!token,
    refetchInterval: 30_000,
    retry: 1,
  });

  useEffect(() => {
    const normalized = normalizeIndoorPositionPayload(latestQuery.data, layout);
    if (normalized) {
      setLivePosition(normalized);
    }
  }, [latestQuery.data, layout]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const closeStream = openIndoorPositionStream(token, {
      onUpdate: (payload) => {
        const normalized = normalizeIndoorPositionPayload(payload, layout);
        if (!normalized) {
          return;
        }
        setLivePosition(normalized);
        setStreamConnected(true);
      },
      onError: () => {
        setStreamConnected(false);
      },
    });

    return () => {
      closeStream();
      setStreamConnected(false);
    };
  }, [token, layout]);

  const saveMutation = useMutation({
    mutationFn: saveActiveIndoorLayout,
    onSuccess: (saved) => {
      queryClient.setQueryData(['activeIndoorLayout'], saved);
      queryClient.invalidateQueries({ queryKey: ['latestIndoorPosition'] });
      setShowEditor(false);
    },
  });

  const resetMutation = useMutation({
    mutationFn: resetActiveIndoorLayout,
    onSuccess: (saved) => {
      queryClient.setQueryData(['activeIndoorLayout'], saved);
      queryClient.invalidateQueries({ queryKey: ['latestIndoorPosition'] });
    },
  });

  const simulatorMutation = useMutation({
    mutationFn: updateIndoorSimulatorStatus,
    onSuccess: (status) => {
      queryClient.setQueryData(['indoorSimulatorStatus'], status);
    },
  });

  const status = useMemo(() => getStatusInfo(livePosition), [livePosition]);
  const canEdit = user?.role === 'ADMIN';
  const distanceEntries = Object.entries(livePosition?.distancesM || {});

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-600">Indoor Positioning</p>
              <h2 className="mt-2 text-2xl font-semibold text-slate-900">Configurable 2D Indoor Layout</h2>
              <p className="mt-2 text-sm text-slate-500">Preview resident movement, then open the layout editor when room setup needs changes.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
                <Radio className={`h-4 w-4 ${streamConnected ? 'text-emerald-500' : 'text-slate-400'}`} />
                <span className="text-sm font-medium text-slate-700">
                  {streamConnected ? 'Stream online' : 'Stream reconnecting'}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">Live Position Preview</h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => simulatorMutation.mutate(!simulatorQuery.data?.enabled)}
                  disabled={!canEdit || simulatorMutation.isPending}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    simulatorQuery.data?.enabled
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {simulatorQuery.data?.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  {simulatorQuery.data?.enabled ? 'Stop Simulator' : 'Start Simulator'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowEditor(true)}
                  disabled={!canEdit}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  <Settings2 className="h-4 w-4" />
                  Edit Layout
                </button>
              </div>
            </div>
            <IndoorMapCanvas
              layout={layout}
              position={livePosition}
              editable={false}
              className="h-[420px] w-full"
            />
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Current Position</p>
              <div className="mt-3 flex items-center gap-2 text-slate-900">
                <MapPin className="h-5 w-5 text-rose-500" />
                <span className="text-xl font-semibold">
                  {livePosition ? `(${livePosition.x.toFixed(3)}, ${livePosition.y.toFixed(3)}) m` : '--'}
                </span>
              </div>
              <p className="mt-2 text-sm text-slate-500">Room: {livePosition?.roomLabel || 'Waiting for update'}</p>
              <p className="mt-1 text-xs text-slate-400">Source: {livePosition?.source || '--'}</p>
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

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Receiver Distances</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                {distanceEntries.length ? distanceEntries.map(([anchorId, distance]) => (
                  <div key={anchorId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <span className="font-medium text-slate-800">{anchorId}</span>
                    <span className="text-slate-600">{formatMetric(distance, ' m', 3)}</span>
                  </div>
                )) : (
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Distances will appear when simulated or MQTT position data arrives.</div>
                )}
              </div>
            </div>
          </aside>
        </div>

        {showEditor ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="max-h-[92vh] w-full max-w-7xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Indoor Layout Editor</h2>
                  <p className="text-sm text-slate-500">Edit room areas, furniture, and receiver node placement.</p>
                </div>
                <button type="button" onClick={() => setShowEditor(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="h-6 w-6" />
                </button>
              </div>
              <div className="p-6">
                <IndoorLayoutEditor
                  layout={layout}
                  simulatorStatus={simulatorQuery.data}
                  isSaving={saveMutation.isPending}
                  isResetting={resetMutation.isPending}
                  canEdit={canEdit}
                  livePosition={livePosition}
                  onSave={(draft) => saveMutation.mutate(draft)}
                  onReset={() => resetMutation.mutate()}
                />
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
};

export default IndoorPosition;
