import React from 'react';
import { User, Heart, Activity, Thermometer, Watch, MapPin } from 'lucide-react';

const DigitalTwin = ({ watchId, watchData, resident }) => {
  const currentWatchId = watchId || '';

  const getWatchTypeColor = (watchId) => {
    if (!watchId) {
      return 'bg-slate-100 text-slate-600';
    }
    return watchId.includes('demo') ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  };

  const getWatchTypeLabel = (watchId) => {
    if (!watchId) {
      return 'Unavailable';
    }
    return watchId.includes('demo') ? 'Demo Device' : 'Real Device';
  };

  const residentName = resident?.name || (currentWatchId.includes('demo') ? 'Demo Patient' : 'Assigned Resident');
  const roomLabel = resident?.room ? `Room ${resident.room}` : 'Room unavailable';

  const toEpochMillis = (value) => {
    if (value == null) {
      return null;
    }
    if (typeof value === 'number') {
      if (value > 1_000_000_000_000) {
        return value; // milliseconds
      }
      if (value > 1_000_000_000) {
        return value * 1000; // seconds
      }
      return null;
    }
    if (typeof value === 'string') {
      const parsed = Date.parse(value);
      return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
  };

  const wearStateRaw = watchData?.wearStateRaw;
  const isCharging = Boolean(watchData?.isCharging);
  const wearStatusTimestampMs = toEpochMillis(watchData?.wearStatusTimestamp);
  const notWornLongEnough = wearStateRaw === 'not_worn'
    && !isCharging
    && wearStatusTimestampMs != null
    && (Date.now() - wearStatusTimestampMs) >= 60 * 60 * 1000;

  const deviceStatusLabel = watchData ? (notWornLongEnough ? 'Inactive' : 'Active') : '--';
  const deviceStatusClass = watchData ? (notWornLongEnough ? 'text-red-600' : 'text-green-600') : 'text-slate-500';

  const lastDataTimestampMs = toEpochMillis(watchData?.timestamp);
  const connectedRecently = lastDataTimestampMs != null && (Date.now() - lastDataTimestampMs) < 60 * 60 * 1000;
  const isConnected = Boolean(watchData?.dataAvailable) && connectedRecently;
  const connectionLabel = watchData ? (isConnected ? 'Online' : 'Offline') : '--';
  const connectionTextClass = watchData ? (isConnected ? 'text-green-600' : 'text-slate-600') : 'text-slate-500';
  const connectionDotClassName = `w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Digital Twin</h3>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getWatchTypeColor(currentWatchId)}`}>
          {getWatchTypeLabel(currentWatchId)}
        </span>
      </div>

      {/* Avatar/Profile Section */}
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto mb-3 flex items-center justify-center">
          <User className="h-10 w-10 text-white" />
        </div>
        <h4 className="font-medium text-gray-900">{residentName}</h4>
        <p className="text-sm text-gray-500">Watch ID: {currentWatchId || 'Unavailable'}</p>
      </div>

      {/* Real-time Status */}
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium">Heart Rate</span>
          </div>
          <span className="text-sm font-bold text-gray-900">
            {watchData?.heartRate ?? '--'} bpm
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-medium">Temperature</span>
          </div>
          <span className="text-sm font-bold text-gray-900">
            {watchData?.temperature ?? '--'}°C
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-medium">Stress Level</span>
          </div>
          <span className="text-sm font-bold text-gray-900">
            {watchData?.edaState || '--'}
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Watch className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">Device Status</span>
          </div>
          <span className={`text-sm font-bold ${deviceStatusClass}`}>
            {deviceStatusLabel}
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">Location</span>
          </div>
          <span className="text-sm font-bold text-gray-900">
            {roomLabel}
          </span>
        </div>
      </div>

      {/* Connection Status */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Connection</span>
          <div className="flex items-center gap-2">
            <div className={connectionDotClassName}></div>
            <span className={`text-sm font-medium ${connectionTextClass}`}>{connectionLabel}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DigitalTwin;
