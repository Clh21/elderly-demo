import React, { useMemo, useRef, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from 'recharts';

const buildRobustRange = (values) => {
  if (!values.length) {
    return [-1.5, 1.5];
  }

  const sorted = [...values].sort((left, right) => left - right);
  const pick = (ratio) => sorted[Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)))];
  const low = pick(0.02);
  const high = pick(0.98);
  const spread = Math.max(high - low, 0.3);
  const padding = Math.max(spread * 0.12, 0.08);
  return [Number((low - padding).toFixed(3)), Number((high + padding).toFixed(3))];
};

const ECGWaveform = ({ chartData, durationSeconds, displayRangeMv, height = 340 }) => {
  const scrollRef = useRef(null);
  const dragStateRef = useRef({ active: false, startX: 0, startScrollLeft: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const normalizedData = Array.isArray(chartData)
    ? chartData
        .map((point, index) => ({
          seconds: Number.isFinite(point?.seconds) ? Number(point.seconds) : index,
          mv: Number.isFinite(point?.value) ? Number(point.value) : null,
        }))
        .filter((point) => point.mv != null)
    : [];

  const waveformRange = Array.isArray(displayRangeMv)
    && displayRangeMv.length === 2
    && Number.isFinite(displayRangeMv[0])
    && Number.isFinite(displayRangeMv[1])
    && displayRangeMv[0] < displayRangeMv[1]
      ? displayRangeMv
      : buildRobustRange(normalizedData.map((point) => point.mv));

  const chartWidth = useMemo(() => {
    const duration = durationSeconds != null && durationSeconds > 0
      ? durationSeconds
      : (normalizedData.length > 0 ? normalizedData[normalizedData.length - 1].seconds : 0);

    return Math.max(1100, Math.round(duration * 140));
  }, [durationSeconds, normalizedData]);

  const handlePointerDown = (event) => {
    if (!scrollRef.current) return;
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startScrollLeft: scrollRef.current.scrollLeft,
    };
    setIsDragging(true);
  };

  const handlePointerMove = (event) => {
    if (!dragStateRef.current.active || !scrollRef.current) return;
    const deltaX = event.clientX - dragStateRef.current.startX;
    scrollRef.current.scrollLeft = dragStateRef.current.startScrollLeft - deltaX;
  };

  const endDrag = () => {
    dragStateRef.current.active = false;
    setIsDragging(false);
  };

  if (!normalizedData.length) {
    return (
      <div className="h-64 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-sm text-slate-500">
        No waveform available for this ECG test.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
        <span>Drag horizontally to inspect the full ECG strip.</span>
        <span>25 mm/s equivalent layout • mV scale</span>
      </div>
      <div
        ref={scrollRef}
        className={`overflow-x-auto overflow-y-hidden rounded-lg border border-rose-100 bg-white ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        <div
          className="min-w-full"
          style={{
            width: `${chartWidth}px`,
            height: `${height}px`,
            backgroundImage: [
              'linear-gradient(to right, rgba(244,63,94,0.18) 1px, transparent 1px)',
              'linear-gradient(to bottom, rgba(244,63,94,0.18) 1px, transparent 1px)',
              'linear-gradient(to right, rgba(244,63,94,0.08) 1px, transparent 1px)',
              'linear-gradient(to bottom, rgba(244,63,94,0.08) 1px, transparent 1px)',
            ].join(','),
            backgroundSize: '140px 100%, 100% 68px, 28px 100%, 100% 13.6px',
          }}
        >
          <LineChart width={chartWidth} height={height} data={normalizedData} margin={{ top: 18, right: 20, left: 10, bottom: 16 }}>
            <CartesianGrid stroke="#fecdd3" strokeOpacity={0.12} vertical={true} horizontal={true} />
            <XAxis
              type="number"
              dataKey="seconds"
              domain={['dataMin', 'dataMax']}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: '#64748B' }}
              tickFormatter={(value) => `${value.toFixed(0)}s`}
              interval={0}
              minTickGap={48}
            />
            <YAxis
              type="number"
              domain={waveformRange}
              allowDataOverflow={true}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: '#64748B' }}
              tickFormatter={(value) => `${value.toFixed(1)} mV`}
              width={64}
            />
            <Tooltip
              formatter={(value) => [`${Number(value).toFixed(3)} mV`, 'Amplitude']}
              labelFormatter={(label) => `${Number(label).toFixed(2)} s`}
              contentStyle={{
                backgroundColor: '#FFFFFF',
                border: '1px solid #CBD5E1',
                borderRadius: '10px',
                fontSize: '12px',
              }}
            />
            <ReferenceLine y={0} stroke="#CBD5E1" strokeDasharray="4 4" />
            <Line
              type="linear"
              dataKey="mv"
              stroke="#e11d48"
              strokeWidth={1.45}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </div>
      </div>
    </div>
  );
};

export default ECGWaveform;