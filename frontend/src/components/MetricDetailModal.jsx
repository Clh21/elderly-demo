import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ScatterChart, Scatter, ZAxis } from 'recharts';
import { X } from 'lucide-react';
import { fetchMetricDetail } from '../services/api';

const getMetricColor = (metric) => {
  switch (metric) {
    case 'heartRate':
      return '#e11d48';
    case 'temperature':
      return '#f97316';
    case 'eda':
      return '#7c3aed';
    default:
      return '#2563eb';
  }
};

const getEdaStateLabel = (value) => {
  switch (value) {
    case 1:
      return 'Relaxed';
    case 2:
      return 'Stable';
    case 3:
      return 'Elevated';
    case 4:
      return 'High';
    default:
      return '--';
  }
};

const MetricDetailModal = ({ isOpen, onClose, watchId, metric }) => {
  const [selectedDate, setSelectedDate] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['metricDetail', watchId, metric, selectedDate],
    queryFn: () => fetchMetricDetail(watchId, metric, selectedDate || undefined),
    enabled: isOpen && !!watchId && !!metric,
  });

  useEffect(() => {
    if (data?.selectedDate && !selectedDate) {
      setSelectedDate(data.selectedDate);
    }
  }, [data, selectedDate]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedDate('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const unit = data?.unit || '';
  const summary = data?.summary || {};
  const chartColor = getMetricColor(metric);
  const isEdaMetric = metric === 'eda';
  const isWearMetric = metric === 'wearStatus';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <select
              value={selectedDate || data?.selectedDate || ''}
              onChange={(event) => setSelectedDate(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-blue-500 focus:outline-none"
            >
              {(data?.availableDates || []).map((dateOption) => (
                <option key={dateOption.value} value={dateOption.value}>
                  {dateOption.label}
                </option>
              ))}
            </select>
            <div>
              <h2 className="text-xl font-semibold text-slate-900">{data?.label || 'Metric'} Details</h2>
              <p className="text-sm text-slate-500">Daily view from 00:00 to 24:00</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {isLoading ? (
            <div className="text-sm text-slate-500">Loading detailed records...</div>
          ) : !data?.points?.length ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
              No data available for this metric on the selected day.
            </div>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="rounded-xl bg-slate-50 px-5 py-4">
                  <div className="text-sm text-slate-500">{isEdaMetric ? 'Stress range' : (isWearMetric ? 'Current state' : 'Range')}</div>
                  <div className="mt-2 text-4xl font-bold text-slate-900">
                    {isWearMetric
                      ? (summary.latestLabel || '--')
                      : isEdaMetric
                      ? (summary.minLabel && summary.maxLabel
                          ? (summary.minLabel === summary.maxLabel ? summary.minLabel : `${summary.minLabel} - ${summary.maxLabel}`)
                          : '--')
                      : (summary.min != null && summary.max != null ? `${summary.min}-${summary.max}` : '--')}
                    {!isEdaMetric && !isWearMetric && <span className="ml-2 text-xl font-medium text-slate-500">{unit}</span>}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 px-5 py-4">
                  <div className="text-sm text-slate-500">{isWearMetric ? 'Latest change' : 'Latest'}</div>
                  <div className="mt-2 text-4xl font-bold text-slate-900">
                    {isWearMetric ? (summary.latestLabel || '--') : (isEdaMetric ? (summary.latestLabel || '--') : (summary.latest != null ? summary.latest : '--'))}
                    {!isEdaMetric && !isWearMetric && <span className="ml-2 text-xl font-medium text-slate-500">{unit}</span>}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {summary.latestTimestamp ? `Latest value ${new Date(summary.latestTimestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : 'No latest value'}
                  </div>
                </div>
                <div className="rounded-xl bg-slate-50 px-5 py-4">
                  <div className="text-sm text-slate-500">{metric === 'heartRate' ? 'Resting Heart Rate' : (isEdaMetric ? 'Dominant state' : (isWearMetric ? 'State changes' : 'Data points'))}</div>
                  <div className="mt-2 text-4xl font-bold text-slate-900">
                    {metric === 'heartRate'
                      ? (summary.resting != null ? summary.resting : '--')
                      : (isEdaMetric ? (summary.dominantLabel || '--') : data.points.length)}
                    <span className="ml-2 text-xl font-medium text-slate-500">{metric === 'heartRate' ? unit : (isEdaMetric || isWearMetric ? '' : 'records')}</span>
                  </div>
                </div>
              </div>

              <div className="h-[420px] rounded-xl border border-slate-200 bg-white p-4">
                <ResponsiveContainer width="100%" height="100%">
                  {isWearMetric ? (
                    <ScatterChart margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis
                        type="number"
                        dataKey="hourOfDay"
                        domain={[0, 24]}
                        ticks={[0, 6, 12, 18, 24]}
                        tickFormatter={(value) => `${String(Math.floor(value)).padStart(2, '0')}:00`}
                        tick={{ fontSize: 12, fill: '#64748B' }}
                      />
                      <YAxis
                        type="number"
                        dataKey="value"
                        domain={[0.5, 3.5]}
                        ticks={[1, 2, 3]}
                        tickFormatter={(value) => ({ 1: 'Not worn', 2: 'Worn', 3: 'Charging' }[value] || '')}
                        tick={{ fontSize: 12, fill: '#64748B' }}
                        width={80}
                      />
                      <ZAxis dataKey="size" range={[160, 160]} />
                      <Tooltip
                        formatter={(_, __, payload) => [payload?.payload?.stateLabel || '--', 'Status']}
                        labelFormatter={(_, payload) => {
                          const point = payload?.[0]?.payload;
                          return point?.timestamp ? new Date(point.timestamp).toLocaleString() : '';
                        }}
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: '10px',
                          fontSize: '12px',
                        }}
                      />
                      <Scatter
                        data={data.points.map((point) => ({ ...point, size: 140 }))}
                        shape={(props) => {
                          const { cx, cy, payload } = props;
                          return <rect x={cx - 4} y={cy - 24} width={8} height={48} rx={4} fill={payload.color} />;
                        }}
                      />
                    </ScatterChart>
                  ) : (
                    <LineChart data={data.points} margin={{ top: 12, right: 24, left: 8, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis
                        type="number"
                        dataKey="hourOfDay"
                        domain={[0, 24]}
                        ticks={[0, 6, 12, 18, 24]}
                        tickFormatter={(value) => `${String(Math.floor(value)).padStart(2, '0')}:00`}
                        tick={{ fontSize: 12, fill: '#64748B' }}
                      />
                      <YAxis
                        domain={isEdaMetric ? [1, 4] : ['auto', 'auto']}
                        ticks={isEdaMetric ? [1, 2, 3, 4] : undefined}
                        tickFormatter={isEdaMetric ? ((value) => getEdaStateLabel(value)) : undefined}
                        tick={{ fontSize: 12, fill: '#64748B' }}
                      />
                      <Tooltip
                        formatter={(value, _, payload) => {
                          if (isEdaMetric) {
                            return [payload?.payload?.stateLabel || getEdaStateLabel(value), 'Stress state'];
                          }
                          return [`${value} ${unit}`, data.label];
                        }}
                        labelFormatter={(_, payload) => {
                          const point = payload?.[0]?.payload;
                          return point?.timestamp ? new Date(point.timestamp).toLocaleString() : '';
                        }}
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #CBD5E1',
                          borderRadius: '10px',
                          fontSize: '12px',
                        }}
                      />
                      <Line
                        type={isEdaMetric ? 'stepAfter' : 'monotone'}
                        dataKey="value"
                        stroke={chartColor}
                        strokeWidth={2.5}
                        dot={false}
                        activeDot={{ r: 4, fill: chartColor }}
                      />
                    </LineChart>
                  )}
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default MetricDetailModal;