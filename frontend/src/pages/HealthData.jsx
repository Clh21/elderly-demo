import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, Download, Filter, TrendingUp } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { useAuth } from '../context/AuthContext';
import { fetchHealthData, fetchElderlyResidents } from '../services/api';

const HealthData = () => {
  const { user } = useAuth();
  const [selectedResident, setSelectedResident] = useState('');
  const [timeRange, setTimeRange] = useState('7');

  const { data: residents = [] } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchElderlyResidents,
  });

  useEffect(() => {
    if (!residents.length) {
      return;
    }

    const availableIds = residents.map((resident) => resident.id.toString());
    if (!selectedResident || !availableIds.includes(selectedResident)) {
      const defaultResidentId = user?.residentId != null && availableIds.includes(String(user.residentId))
        ? String(user.residentId)
        : availableIds[0];
      setSelectedResident(defaultResidentId);
    }
  }, [residents, selectedResident, user]);

  const { data: healthData, isLoading } = useQuery({
    queryKey: ['healthData', selectedResident, timeRange],
    queryFn: () => fetchHealthData(selectedResident, parseInt(timeRange)),
    enabled: !!selectedResident,
  });

  const selectedResidentName = residents?.find(r => r.id.toString() === selectedResident)?.name || 'Unknown';
  const hasHealthData = Array.isArray(healthData) && healthData.length > 0;

  const chartColors = {
    heartRate: '#EF4444',
    temperature: '#F97316',
    eda: '#8B5CF6',
    steps: '#10B981'
  };

  const exportData = () => {
    if (!healthData) return;
    
    const csvContent = [
      ['Date', 'Heart Rate', 'Temperature', 'EDA', 'Steps', 'Alerts'],
      ...healthData.map(row => [
        row.date,
        row.heartRate,
        row.temperature,
        row.eda,
        row.steps,
        row.alerts
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedResidentName}_health_data.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="bg-white rounded-lg p-6">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                  <div className="h-64 bg-gray-200 rounded"></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Health Data History</h1>
            <p className="text-gray-600">Review historical health metrics and trends</p>
          </div>
          <button
            onClick={exportData}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export Data
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={selectedResident}
                onChange={(e) => setSelectedResident(e.target.value)}
                disabled={residents.length <= 1}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {residents.map(resident => (
                  <option key={resident.id} value={resident.id}>
                    {resident.name} ({resident.watchId})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="7">Last 7 days</option>
                <option value="14">Last 14 days</option>
                <option value="30">Last 30 days</option>
              </select>
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        {hasHealthData ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Heart Rate Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-red-500" />
                <h3 className="text-lg font-semibold text-gray-900">Heart Rate Trend</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={healthData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="heartRate" 
                      stroke={chartColors.heartRate}
                      strokeWidth={2}
                      dot={{ fill: chartColors.heartRate }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Temperature Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-orange-500" />
                <h3 className="text-lg font-semibold text-gray-900">Temperature Trend</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={healthData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="temperature" 
                      stroke={chartColors.temperature}
                      strokeWidth={2}
                      dot={{ fill: chartColors.temperature }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* EDA Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-purple-500" />
                <h3 className="text-lg font-semibold text-gray-900">Stress Level (EDA)</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={healthData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="eda" 
                      stroke={chartColors.eda}
                      strokeWidth={2}
                      dot={{ fill: chartColors.eda }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Steps Chart */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-5 w-5 text-green-500" />
                <h3 className="text-lg font-semibold text-gray-900">Daily Steps</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={healthData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="steps" fill={chartColors.steps} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
            No historical health data is available for this resident in the selected period.
          </div>
        )}

        {/* Summary Stats */}
        {hasHealthData && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h4 className="text-sm font-medium text-gray-600 mb-2">Avg Heart Rate</h4>
              <div className="text-2xl font-bold text-gray-900">
                {Math.round(healthData.reduce((sum, item) => sum + item.heartRate, 0) / healthData.length)} bpm
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h4 className="text-sm font-medium text-gray-600 mb-2">Avg Temperature</h4>
              <div className="text-2xl font-bold text-gray-900">
                {(healthData.reduce((sum, item) => sum + item.temperature, 0) / healthData.length).toFixed(1)}°C
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h4 className="text-sm font-medium text-gray-600 mb-2">Total Steps</h4>
              <div className="text-2xl font-bold text-gray-900">
                {healthData.reduce((sum, item) => sum + item.steps, 0).toLocaleString()}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h4 className="text-sm font-medium text-gray-600 mb-2">Total Alerts</h4>
              <div className="text-2xl font-bold text-gray-900">
                {healthData.reduce((sum, item) => sum + item.alerts, 0)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HealthData;
