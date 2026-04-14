import React from 'react';
import { Activity, AlertTriangle, CheckCircle, History, XCircle } from 'lucide-react';
import ECGWaveform from './ECGWaveform';

const getStatusColor = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'normal':
      return 'text-green-700 bg-green-50 border-green-200';
    case 'warning':
      return 'text-amber-700 bg-amber-50 border-amber-200';
    case 'critical':
      return 'text-red-700 bg-red-50 border-red-200';
    default:
      return 'text-slate-600 bg-slate-50 border-slate-200';
  }
};

const getStatusIcon = (status) => {
  switch ((status || '').toLowerCase()) {
    case 'normal':
      return <CheckCircle className="h-4 w-4" />;
    case 'warning':
      return <AlertTriangle className="h-4 w-4" />;
    case 'critical':
      return <XCircle className="h-4 w-4" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
};

const ECGCard = ({
  rhythm,
  status,
  chartData,
  readingTimestamp,
  sampleCount,
  estimatedHeartRate,
  durationSeconds,
  displayRangeMv,
  interpretationBasis,
  onOpenHistory,
}) => {
  const formattedTimestamp = readingTimestamp
    ? new Date(readingTimestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow md:col-span-2 xl:col-span-3">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Activity className="h-6 w-6 text-sky-600" />
            <h3 className="text-lg font-semibold text-gray-900">Latest ECG Test</h3>
          </div>
          <div className="text-2xl font-semibold text-gray-900">
            {rhythm || 'No rhythm classification'}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            {formattedTimestamp ? `Latest test at ${formattedTimestamp}` : 'No ECG test received yet'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onOpenHistory && (
            <button
              type="button"
              onClick={onOpenHistory}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <History className="h-4 w-4" />
              <span>View history</span>
            </button>
          )}
          <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${getStatusColor(status)}`}>
            {getStatusIcon(status)}
            <span className="capitalize">{status || 'unknown'}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Rate</div>
          <div className="text-base font-semibold text-slate-900">{estimatedHeartRate != null ? `${estimatedHeartRate} bpm` : '--'}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Samples</div>
          <div className="text-base font-semibold text-slate-900">{sampleCount ?? '--'}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Duration</div>
          <div className="text-base font-semibold text-slate-900">{durationSeconds != null ? `${durationSeconds}s` : '--'}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Unit</div>
          <div className="text-base font-semibold text-slate-900">mV</div>
        </div>
      </div>

      <ECGWaveform
        chartData={chartData}
        durationSeconds={durationSeconds}
        displayRangeMv={displayRangeMv}
      />

      <div className="mt-4 text-sm text-slate-600">
        {interpretationBasis || 'Rhythm classification is based on R-peak detection and R-R interval regularity in the latest single-lead ECG waveform.'}
      </div>
    </div>
  );
};

export default ECGCard;
