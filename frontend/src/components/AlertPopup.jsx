import React from 'react';
import { X, AlertTriangle, XCircle, Heart, Thermometer, Activity, Watch } from 'lucide-react';

const typeConfig = {
  heart_rate: {
    icon: Heart,
    color: 'text-red-500',
    bg: 'bg-red-50',
    border: 'border-red-200',
    label: 'Heart Rate Alert',
  },
  temperature: {
    icon: Thermometer,
    color: 'text-orange-500',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    label: 'Temperature Alert',
  },
  eda: {
    icon: Activity,
    color: 'text-purple-500',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    label: 'Stress Level Alert',
  },
  data_gap: {
    icon: Watch,
    color: 'text-slate-500',
    bg: 'bg-slate-50',
    border: 'border-slate-200',
    label: 'Data Gap Alert',
  },
  fall_detection: {
    icon: XCircle,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-300',
    label: 'Fall Detected',
  },
  wear_status: {
    icon: Watch,
    color: 'text-gray-500',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    label: 'Wear Status Alert',
  },
};

const severityConfig = {
  critical: {
    badge: 'bg-red-100 text-red-800 border border-red-200',
    headerBg: 'bg-red-600',
    label: 'CRITICAL',
  },
  warning: {
    badge: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    headerBg: 'bg-yellow-500',
    label: 'WARNING',
  },
};

const AlertPopup = ({ alerts, onClose }) => {
  if (!alerts || alerts.length === 0) return null;

  // Show the most recent / most severe alert
  const alert = alerts[alerts.length - 1];
  const type = typeConfig[alert.type] || typeConfig.heart_rate;
  const severity = severityConfig[alert.severity] || severityConfig.warning;
  const Icon = type.icon;

  const formatTime = (ts) => {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative w-full max-w-md bg-white rounded-xl shadow-2xl border-2 ${type.border} overflow-hidden`}>
        {/* Colored top bar */}
        <div className={`${severity.headerBg} h-1.5 w-full`} />

        {/* Header */}
        <div className={`${type.bg} px-6 py-4 flex items-center justify-between border-b ${type.border}`}>
          <div className="flex items-center gap-3">
            <Icon className={`h-6 w-6 ${type.color}`} />
            <span className="font-semibold text-gray-900 text-lg">{type.label}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${severity.badge}`}>
              {severity.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/60 transition-colors text-gray-500 hover:text-gray-800"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          <div className="mb-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Resident</p>
            <p className="text-base font-semibold text-gray-900">{alert.residentName}</p>
          </div>
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Message</p>
            <p className="text-gray-800 text-sm leading-relaxed">{alert.message}</p>
          </div>
          <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-3">
            <span>Alert #{alert.id}</span>
            <span>{formatTime(alert.timestamp)}</span>
          </div>

          {/* Multiple alerts indicator */}
          {alerts.length > 1 && (
            <div className="mt-3 p-2 bg-gray-50 rounded-lg text-center text-xs text-gray-500">
              +{alerts.length - 1} more alert{alerts.length > 2 ? 's' : ''} pending
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full bg-gray-900 hover:bg-gray-700 text-white py-2.5 rounded-lg text-sm font-medium transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertPopup;
