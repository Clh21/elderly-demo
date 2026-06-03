import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cuboid, Pause, Play, Radio, RotateCcw, Upload } from 'lucide-react';
import IndoorLayout3DViewer, { resolveResidentPose } from '../components/IndoorLayout3DViewer';
import { useAuth } from '../context/AuthContext';
import {
  fetchActiveIndoorLayout,
  fetchIndoorSimulatorStatus,
  updateIndoorSimulatorStatus,
} from '../services/indoorLayoutApi';
import { fetchLatestIndoorPosition, openIndoorPositionStream } from '../services/positioningApi';
import {
  formatIndoorTimestamp,
  normalizeIndoorLayout,
  normalizeIndoorPositionPayload,
} from '../lib/indoorRooms';

const DEFAULT_MODEL_URL = '/models/elderly.glb';

const formatMetric = (value, suffix = '', digits = 2) => {
  if (value == null) {
    return '--';
  }
  return `${Number(value).toFixed(digits)}${suffix}`;
};

const ElderModel3D = () => {
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const [modelUrl, setModelUrl] = useState(DEFAULT_MODEL_URL);
  const [autoRotate, setAutoRotate] = useState(false);
  const [resetCounter, setResetCounter] = useState(0);
  const [uploadedObjectUrl, setUploadedObjectUrl] = useState('');
  const [modelLabel, setModelLabel] = useState('Default: /models/elderly.glb');
  const [furnitureModelUrls, setFurnitureModelUrls] = useState({});
  const [furnitureModelLabels, setFurnitureModelLabels] = useState({});
  const [uploadedFurnitureObjectUrls, setUploadedFurnitureObjectUrls] = useState({});
  const uploadedFurnitureObjectUrlsRef = useRef({});
  const [livePosition, setLivePosition] = useState(null);
  const [streamConnected, setStreamConnected] = useState(false);

  const layoutQuery = useQuery({
    queryKey: ['activeIndoorLayout'],
    queryFn: fetchActiveIndoorLayout,
    enabled: !!token,
    refetchInterval: 10_000,
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
    queryKey: ['latestIndoorPosition', '3d'],
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

  useEffect(() => () => {
    if (uploadedObjectUrl) {
      URL.revokeObjectURL(uploadedObjectUrl);
    }
  }, [uploadedObjectUrl]);

  useEffect(() => {
    uploadedFurnitureObjectUrlsRef.current = uploadedFurnitureObjectUrls;
  }, [uploadedFurnitureObjectUrls]);

  useEffect(() => () => {
    Object.values(uploadedFurnitureObjectUrlsRef.current).forEach((objectUrl) => {
      URL.revokeObjectURL(objectUrl);
    });
  }, []);

  const simulatorMutation = useMutation({
    mutationFn: updateIndoorSimulatorStatus,
    onSuccess: (status) => {
      queryClient.setQueryData(['indoorSimulatorStatus'], status);
    },
  });

  const poseInfo = useMemo(() => resolveResidentPose(layout, livePosition), [layout, livePosition]);
  const canEdit = user?.role === 'ADMIN';

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.glb') && !lowerName.endsWith('.gltf')) {
      event.target.value = '';
      return;
    }

    if (uploadedObjectUrl) {
      URL.revokeObjectURL(uploadedObjectUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setUploadedObjectUrl(objectUrl);
    setModelUrl(objectUrl);
    setModelLabel(`Uploaded: ${file.name}`);
    setResetCounter((value) => value + 1);
    event.target.value = '';
  };

  const resetToDefault = () => {
    if (uploadedObjectUrl) {
      URL.revokeObjectURL(uploadedObjectUrl);
      setUploadedObjectUrl('');
    }

    setModelUrl(DEFAULT_MODEL_URL);
    setModelLabel('Default: /models/elderly.glb');
    setResetCounter((value) => value + 1);
  };

  const handleFurnitureUpload = (item, event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.glb') && !lowerName.endsWith('.gltf')) {
      event.target.value = '';
      return;
    }

    const existingObjectUrl = uploadedFurnitureObjectUrls[item.id];
    if (existingObjectUrl) {
      URL.revokeObjectURL(existingObjectUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setUploadedFurnitureObjectUrls((current) => ({
      ...current,
      [item.id]: objectUrl,
    }));
    setFurnitureModelUrls((current) => ({
      ...current,
      [item.id]: objectUrl,
    }));
    setFurnitureModelLabels((current) => ({
      ...current,
      [item.id]: file.name,
    }));
    setResetCounter((value) => value + 1);
    event.target.value = '';
  };

  const resetFurnitureModel = (itemId) => {
    const existingObjectUrl = uploadedFurnitureObjectUrls[itemId];
    if (existingObjectUrl) {
      URL.revokeObjectURL(existingObjectUrl);
    }

    setUploadedFurnitureObjectUrls((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setFurnitureModelUrls((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setFurnitureModelLabels((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setResetCounter((value) => value + 1);
  };

  const resetAllFurnitureModels = () => {
    Object.values(uploadedFurnitureObjectUrls).forEach((objectUrl) => {
      URL.revokeObjectURL(objectUrl);
    });
    setUploadedFurnitureObjectUrls({});
    setFurnitureModelUrls({});
    setFurnitureModelLabels({});
    setResetCounter((value) => value + 1);
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">Digital Twin</p>
              <h2 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-slate-900">
                <Cuboid className="h-6 w-6 text-sky-600" />
                3D Indoor Digital Twin
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                The 3D room is generated from the same 2D layout: zones, furniture, receiver nodes, and live resident coordinates stay aligned.
              </p>
            </div>
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
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2">
                <Radio className={`h-4 w-4 ${streamConnected ? 'text-emerald-500' : 'text-slate-400'}`} />
                <span className="text-sm font-medium text-slate-700">
                  {streamConnected ? 'Stream online' : 'Stream reconnecting'}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="min-h-[620px]">
            <IndoorLayout3DViewer
              layout={layout}
              position={livePosition}
              modelUrl={modelUrl}
              furnitureModelUrls={furnitureModelUrls}
              autoRotate={autoRotate}
              resetCounter={resetCounter}
              canvasHeightClass="h-[620px]"
            />
          </section>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Resident State</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Room</span>
                  <span className="font-medium text-slate-900">{livePosition?.roomLabel || '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Coordinate</span>
                  <span className="font-medium text-slate-900">
                    {livePosition ? `(${livePosition.x.toFixed(2)}, ${livePosition.y.toFixed(2)}) m` : '--'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Pose</span>
                  <span className="font-medium text-slate-900">{poseInfo.label}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Furniture</span>
                  <span className="font-medium text-slate-900">{poseInfo.furniture?.label || '--'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Updated</span>
                  <span className="font-medium text-slate-900">{formatIndoorTimestamp(livePosition?.ts)}</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Layout Summary</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-slate-500">Room size</div>
                  <div className="mt-1 font-semibold text-slate-900">{layout.widthM} x {layout.heightM} m</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-slate-500">Zones</div>
                  <div className="mt-1 font-semibold text-slate-900">{layout.zones.length}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-slate-500">Furniture</div>
                  <div className="mt-1 font-semibold text-slate-900">{layout.furniture.length}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-slate-500">Receivers</div>
                  <div className="mt-1 font-semibold text-slate-900">{layout.anchors.filter((anchor) => anchor.enabled).length}/{layout.anchors.length}</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">3D Controls</h3>
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div className="font-medium text-slate-800">Current model</div>
                <div className="mt-1">{modelLabel}</div>
              </div>

              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setAutoRotate((value) => !value)}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  {autoRotate ? 'Disable auto rotate' : 'Enable auto rotate'}
                </button>

                <button
                  type="button"
                  onClick={() => setResetCounter((value) => value + 1)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset camera
                </button>

                <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-100">
                  <Upload className="h-4 w-4" />
                  Upload GLB/GLTF
                  <input type="file" accept=".glb,.gltf" className="hidden" onChange={handleUpload} />
                </label>

                <button
                  type="button"
                  onClick={resetToDefault}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Use default model
                </button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Object Models</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">Furniture GLB Overrides</h3>
                </div>
                {Object.keys(furnitureModelUrls).length > 0 ? (
                  <button
                    type="button"
                    onClick={resetAllFurnitureModels}
                    className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Reset all
                  </button>
                ) : null}
              </div>

              {layout.furniture.length === 0 ? (
                <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
                  No furniture has been configured in the 2D layout.
                </div>
              ) : (
                <div className="mt-3 max-h-80 space-y-2 overflow-y-auto pr-1">
                  {layout.furniture.map((item) => {
                    const hasOverride = Boolean(furnitureModelUrls[item.id]);
                    const itemWidth = Number(item.width || 0).toFixed(2);
                    const itemHeight = Number(item.height || 0).toFixed(2);

                    return (
                      <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{item.label}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {item.type} - {itemWidth} x {itemHeight} m
                            </div>
                            <div className="mt-1 truncate text-xs text-slate-500">
                              {hasOverride ? `Model: ${furnitureModelLabels[item.id] || 'Uploaded model'}` : 'Default generated model'}
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                            hasOverride ? 'bg-sky-100 text-sky-700' : 'bg-slate-200 text-slate-600'
                          }`}
                          >
                            {hasOverride ? 'GLB' : 'Default'}
                          </span>
                        </div>

                        <div className="mt-3 flex gap-2">
                          <label className="inline-flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-700 hover:bg-sky-100">
                            <Upload className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{hasOverride ? 'Replace' : 'Upload'}</span>
                            <input
                              type="file"
                              accept=".glb,.gltf"
                              className="hidden"
                              onChange={(event) => handleFurnitureUpload(item, event)}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => resetFurnitureModel(item.id)}
                            disabled={!hasOverride}
                            className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            Default
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Position Quality</p>
              <div className="mt-3 space-y-2 text-sm text-slate-700">
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
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default ElderModel3D;
