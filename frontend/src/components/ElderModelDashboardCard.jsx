import React, { useState } from 'react';
import { Cuboid, Move3D } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ElderModelViewer from './ElderModelViewer';

const ElderModelDashboardCard = () => {
  const navigate = useNavigate();
  const [autoRotate, setAutoRotate] = useState(true);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-900">
          <Cuboid className="h-5 w-5 text-sky-600" />
          <h3 className="text-lg font-semibold">3D Elder Model</h3>
        </div>
        <button
          type="button"
          onClick={() => setAutoRotate((value) => !value)}
          className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
        >
          {autoRotate ? 'Auto rotate on' : 'Auto rotate off'}
        </button>
      </div>

      <ElderModelViewer modelUrl="/models/elderly.glb" autoRotate={autoRotate} canvasHeightClass="h-[250px]" />

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Move3D className="h-3.5 w-3.5" />
          Drag to rotate, wheel to zoom
        </span>
        <button
          type="button"
          onClick={() => navigate('/elder-model-3d')}
          className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Open full viewer
        </button>
      </div>
    </div>
  );
};

export default ElderModelDashboardCard;
