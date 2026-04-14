import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Users, Activity, Heart, Thermometer, Zap, Eye, TrendingUp, Bell } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchAllResidentsData, fetchHistoricalData, fetchAllAlerts } from '../services/adminApi';

const AdminDashboard = () => {
  const [selectedResident, setSelectedResident] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const { data: allResidentsData, isLoading } = useQuery({
    queryKey: ['allResidentsData'],
    queryFn: fetchAllResidentsData,
    refetchInterval: 5000, // 5秒刷新一次
  });

  const { data: allAlerts } = useQuery({
    queryKey: ['allAlerts'],
    queryFn: fetchAllAlerts,
    refetchInterval: 5000, // 5秒刷新一次
  });

  const { data: historicalData } = useQuery({
    queryKey: ['historicalData', selectedResident?.id, selectedMetric],
    queryFn: () => fetchHistoricalData(selectedResident.id, selectedMetric),
    enabled: !!selectedResident && !!selectedMetric,
  });

  const handleMetricClick = (resident, metric) => {
    setSelectedResident(resident);
    setSelectedMetric(metric);
    setShowHistoryModal(true);
  };

  const getAlertLevel = (resident) => {
    const residentAlerts = allAlerts?.filter(alert => alert.residentId === resident.id) || [];
    const hasCritical = residentAlerts.some(alert => alert.severity === 'critical');
    const hasWarning = residentAlerts.some(alert => alert.severity === 'warning');
    
    if (hasCritical) return 'critical';
    if (hasWarning) return 'warning';
    return 'normal';
  };

  const getAlertBadge = (level) => {
    const styles = {
      critical: 'bg-red-100 text-red-800 border-red-200',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      normal: 'bg-green-100 text-green-800 border-green-200'
    };
    
    const labels = {
      critical: 'Critical',
      warning: 'Warning',
      normal: 'Normal'
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${styles[level]}`}>
        {labels[level]}
      </span>
    );
  };

  const getMetricStatus = (value, metric) => {
    // 定义各指标的正常范围
    const ranges = {
      heartRate: { min: 60, max: 100 },
      temperature: { min: 35.0, max: 37.8 },
      eda: { min: 1.0, max: 3.5 }
    };
    
    if (!ranges[metric]) return 'normal';
    
    if (value < ranges[metric].min || value > ranges[metric].max) {
      return 'warning';
    }
    return 'normal';
  };

  const getMetricColor = (value, metric) => {
    const status = getMetricStatus(value, metric);
    return status === 'warning' ? 'text-yellow-600' : 'text-green-600';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map(i => (
                <div key={i} className="bg-white rounded-lg p-6">
                  <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                  <div className="h-32 bg-gray-200 rounded"></div>
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
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Admin Dashboard</h1>
          <p className="text-gray-600">Monitor all residents' health status and alerts</p>
        </div>

        {/* Alert Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <h3 className="text-lg font-semibold text-red-900">Critical Alerts</h3>
            </div>
            <div className="text-2xl font-bold text-red-900">
              {allAlerts?.filter(a => a.severity === 'critical').length || 0}
            </div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              <h3 className="text-lg font-semibold text-yellow-900">Warning Alerts</h3>
            </div>
            <div className="text-2xl font-bold text-yellow-900">
              {allAlerts?.filter(a => a.severity === 'warning').length || 0}
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <Users className="h-6 w-6 text-green-500" />
              <h3 className="text-lg font-semibold text-green-900">Total Residents</h3>
            </div>
            <div className="text-2xl font-bold text-green-900">
              {allResidentsData?.length || 0}
            </div>
          </div>
        </div>

        {/* Active Alerts Section */}
        {allAlerts && allAlerts.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="h-5 w-5 text-red-500" />
              <h2 className="text-xl font-semibold text-gray-900">Active Alerts</h2>
            </div>
            <div className="space-y-3">
              {allAlerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className={`h-5 w-5 ${alert.severity === 'critical' ? 'text-red-500' : 'text-yellow-500'}`} />
                    <div>
                      <p className="font-medium">{alert.residentName}</p>
                      <p className="text-sm text-gray-600">{alert.message}</p>
                    </div>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(alert.timestamp).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Residents Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allResidentsData?.map((resident) => (
            <div key={resident.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              {/* Resident Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{resident.name}</h3>
                  <p className="text-sm text-gray-500">Room {resident.room}</p>
                </div>
                {getAlertBadge(getAlertLevel(resident))}
              </div>

              {/* Health Metrics */}
              <div className="space-y-3">
                {/* Heart Rate */}
                <div 
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleMetricClick(resident, 'heartRate')}
                >
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium">Heart Rate</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${getMetricColor(resident.heartRate, 'heartRate')}`}>
                      {resident.heartRate || '--'} bpm
                    </span>
                    <Eye className="h-4 w-4 text-gray-400" />
                  </div>
                </div>

                {/* Temperature */}
                <div 
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleMetricClick(resident, 'temperature')}
                >
                  <div className="flex items-center gap-2">
                    <Thermometer className="h-4 w-4 text-orange-500" />
                    <span className="text-sm font-medium">Temperature</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${getMetricColor(resident.temperature, 'temperature')}`}>
                      {resident.temperature || '--'}°C
                    </span>
                    <Eye className="h-4 w-4 text-gray-400" />
                  </div>
                </div>

                {/* EDA */}
                <div 
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                  onClick={() => handleMetricClick(resident, 'eda')}
                >
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-purple-500" />
                    <span className="text-sm font-medium">Stress (EDA)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${getMetricColor(resident.eda, 'eda')}`}>
                      {resident.eda || '--'} μS
                    </span>
                    <Eye className="h-4 w-4 text-gray-400" />
                  </div>
                </div>
              </div>

              {/* Recent Alerts */}
              {resident.alerts && resident.alerts.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Alerts</h4>
                  <div className="space-y-1">
                    {resident.alerts.slice(0, 2).map((alert, index) => (
                      <div key={index} className="text-xs text-gray-600">
                        {alert.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Historical Data Modal */}
        {showHistoryModal && selectedResident && selectedMetric && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {selectedResident.name} - {selectedMetric.charAt(0).toUpperCase() + selectedMetric.slice(1)} History
                  </h2>
                  <button
                    onClick={() => setShowHistoryModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ×
                  </button>
                </div>

                {historicalData && (
                  <div className="h-96">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={historicalData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="timestamp" />
                        <YAxis />
                        <Tooltip />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="#3B82F6" 
                          strokeWidth={2}
                          dot={{ fill: '#3B82F6' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="mt-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Recent Data Points</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Timestamp
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {historicalData?.slice(-10).reverse().map((data, index) => (
                          <tr key={index}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {new Date(data.timestamp).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {data.value} {selectedMetric === 'heartRate' ? 'bpm' : selectedMetric === 'temperature' ? '°C' : 'μS'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
