import React from 'react';
import { AlertTriangle, CheckCircle, X, XCircle } from 'lucide-react';

const typeConfig = {
  success: {
    icon: CheckCircle,
    color: 'text-green-600',
    bg: 'bg-green-50',
    border: 'border-green-200',
    topBar: 'bg-green-600',
    badge: 'bg-green-100 text-green-800 border border-green-200',
    label: 'Build completed',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    topBar: 'bg-yellow-500',
    badge: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    label: 'Not enough data',
  },
  error: {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-200',
    topBar: 'bg-red-600',
    badge: 'bg-red-100 text-red-800 border border-red-200',
    label: 'Build failed',
  },
};

const EdaBaselineResultModal = ({ feedback, onClose }) => {
  if (!feedback) {
    return null;
  }

  const config = typeConfig[feedback.type] || typeConfig.warning;
  const Icon = config.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className={`relative w-full max-w-lg overflow-hidden rounded-xl border-2 bg-white shadow-2xl ${config.border}`}>
        <div className={`h-1.5 w-full ${config.topBar}`} />

        <div className={`flex items-center justify-between border-b px-6 py-4 ${config.bg} ${config.border}`}>
          <div className="flex items-center gap-3">
            <Icon className={`h-6 w-6 ${config.color}`} />
            <div>
              <div className="text-lg font-semibold text-gray-900">EDA Baseline Build</div>
              <div className="text-sm text-gray-500">{feedback.watchId ? `Watch ${feedback.watchId}` : 'Build result'}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-white/60 hover:text-gray-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5">
          <div className="mb-4 flex items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${config.badge}`}>
              {config.label}
            </span>
            {feedback.stageLabel ? (
              <span className="text-sm text-gray-500">{feedback.stageLabel}</span>
            ) : null}
          </div>

          <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-relaxed text-gray-800">
            {feedback.message}
          </div>

          {feedback.unmetRequirements?.length ? (
            <div className="mb-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">What is missing</div>
              <div className="space-y-2">
                {feedback.unmetRequirements.map((item) => (
                  <div key={item} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700">
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {(feedback.selectedWindowCount != null || feedback.selectedDayCount != null || feedback.selectedDaypartCount != null) ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-200 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Windows</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">{feedback.selectedWindowCount ?? 0}</div>
              </div>
              <div className="rounded-lg border border-gray-200 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Days</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">{feedback.selectedDayCount ?? 0}</div>
              </div>
              <div className="rounded-lg border border-gray-200 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Dayparts</div>
                <div className="mt-1 text-lg font-semibold text-gray-900">{feedback.selectedDaypartCount ?? 0}</div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="px-6 pb-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-gray-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default EdaBaselineResultModal;