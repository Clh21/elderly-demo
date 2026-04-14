import React, { useEffect, useMemo, useState } from 'react';
import { Cuboid, RotateCcw, Upload } from 'lucide-react';
import ElderModelViewer from '../components/ElderModelViewer';

const DEFAULT_MODEL_URL = '/models/elderly.glb';

const ElderModel3D = () => {
  const [modelUrl, setModelUrl] = useState(DEFAULT_MODEL_URL);
  const [autoRotate, setAutoRotate] = useState(true);
  const [resetCounter, setResetCounter] = useState(0);
  const [uploadedObjectUrl, setUploadedObjectUrl] = useState('');
  const [modelLabel, setModelLabel] = useState('Default: /models/elderly.glb');

  useEffect(() => () => {
    if (uploadedObjectUrl) {
      URL.revokeObjectURL(uploadedObjectUrl);
    }
  }, [uploadedObjectUrl]);

  const tips = useMemo(
    () => [
      'Left mouse drag: rotate the model',
      'Mouse wheel: zoom in or out',
      'Auto rotate can be toggled on/off',
      'Upload your own .glb/.gltf for a custom elder appearance',
    ],
    []
  );

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

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-sky-600">Digital Twin</p>
              <h2 className="mt-2 flex items-center gap-2 text-2xl font-semibold text-slate-900">
                <Cuboid className="h-6 w-6 text-sky-600" />
                3D Elder Model Viewer
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                Dedicated GLB/GLTF viewer for the resident digital twin. Rotate and zoom to inspect the model from any angle.
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <div className="font-medium text-slate-800">Current model</div>
              <div className="mt-1">{modelLabel}</div>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
            <ElderModelViewer
              modelUrl={modelUrl}
              autoRotate={autoRotate}
              resetCounter={resetCounter}
              canvasHeightClass="h-[560px]"
            />
          </section>

          <aside className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Model Controls</h3>

            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
              <div className="mb-2 font-medium text-slate-800">Interaction tips</div>
              <ul className="space-y-1">
                {tips.map((tip) => (
                  <li key={tip}>• {tip}</li>
                ))}
              </ul>
            </div>

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

            <div className="rounded-xl border border-dashed border-slate-300 p-3 text-xs text-slate-500">
              Default model path: /public/models/elderly.glb.
              If the file is missing, the viewer shows a fallback elder figure until you upload a GLB/GLTF model.
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
};

export default ElderModel3D;
