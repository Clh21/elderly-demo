import React from 'react';
import { User, Heart, Activity, Thermometer, Watch, MapPin } from 'lucide-react';

const DigitalTwin = ({ watchId, watchData }) => {
  const getWatchTypeColor = (watchId) => {
    return watchId.includes('demo') ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  };

  const getWatchTypeLabel = (watchId) => {
    return watchId.includes('demo') ? 'Demo Device' : 'Real Device';
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Digital Twin</h3>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getWatchTypeColor(watchId)}`}>
          {getWatchTypeLabel(watchId)}
        </span>
      </div>

      {/* Avatar/Profile Section */}
      <div className="text-center mb-6">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto mb-3 flex items-center justify-center">
          <User className="h-10 w-10 text-white" />
        </div>
        <h4 className="font-medium text-gray-900">
          {watchId.includes('demo') ? 'Demo Patient' : 
           watchId.includes('john') ? 'John Doe' : 'Jane Smith'}
        </h4>
        <p className="text-sm text-gray-500">Watch ID: {watchId}</p>
      </div>

      {/* Real-time Status */}
      <div className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium">Heart Rate</span>
          </div>
          <span className="text-sm font-bold text-gray-900">
            {watchData?.heartRate || '--'} bpm
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-medium">Temperature</span>
          </div>
          <span className="text-sm font-bold text-gray-900">
            {watchData?.temperature || '--'}°C
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-medium">Stress Level</span>
          </div>
          <span className="text-sm font-bold text-gray-900">
            {watchData?.eda || '--'} μS
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Watch className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium">Device Status</span>
          </div>
          <span className={`text-sm font-bold ${
            watchData?.wearStatus === 'worn' ? 'text-green-600' : 'text-red-600'
          }`}>
            {watchData?.wearStatus === 'worn' ? 'Active' : 'Inactive'}
          </span>
        </div>

        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium">Location</span>
          </div>
          <span className="text-sm font-bold text-gray-900">
            Room 101
          </span>
        </div>
      </div>

      {/* Connection Status */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Connection</span>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-sm font-medium text-green-600">Online</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DigitalTwin;
