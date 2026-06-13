import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Bell, Eye, Heart, Thermometer, Users, Zap } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchAllAlerts, fetchAllResidentsData, fetchHistoricalData } from '../services/adminApi';

const METRIC_RANGES = {
  heartRate: { min: 60, max: 100 },
  temperature: { min: 35.0, max: 37.8 },
  eda: { min: 1.0, max: 3.5 },
};

const METRIC_CONFIG = {
  heartRate: {
    label: 'Heart Rate',
    unit: 'bpm',
    icon: Heart,
    iconClassName: 'text-red-500',
  },
  temperature: {
    label: 'Temperature',
    unit: 'C',
    icon: Thermometer,
    iconClassName: 'text-orange-500',
  },
  eda: {
    label: 'EDA Arousal',
    unit: 'uS',
    icon: Zap,
    iconClassName: 'text-purple-500',
  },
};

const ALERT_BADGES = {
  critical: {
    label: 'Critical',
    className: 'bg-red-100 text-red-800 border-red-200',
  },
  warning: {
    label: 'Warning',
    className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  },
  normal: {
    label: 'Normal',
    className: 'bg-green-100 text-green-800 border-green-200',
  },
};

const getAlertLevel = (resident, alerts) => {
  const residentAlerts = alerts.filter((alert) => alert.residentId === resident.id);
  if (residentAlerts.some((alert) => alert.severity === 'critical')) return 'critical';
  if (residentAlerts.some((alert) => alert.severity === 'warning')) return 'warning';
  return 'normal';
};

const getMetricStatus = (rawValue, metric) => {
  const value = Number(rawValue);
  const range = METRIC_RANGES[metric];

  // These ranges are dashboard hints only; clinical alerting still belongs on the backend.
  if (!range || !Number.isFinite(value)) return 'normal';
  return value < range.min || value > range.max ? 'warning' : 'normal';
};

const formatMetricValue = (rawValue, metric) => {
  if (rawValue == null || rawValue === '') return '--';
  return `${rawValue} ${METRIC_CONFIG[metric]?.unit || ''}`.trim();
};

const AlertBadge = ({ level }) => {
  const badge = ALERT_BADGES[level] || ALERT_BADGES.normal;

  return (
    <span className={`rounded-full border px-2 py-1 text-xs font-medium ${badge.className}`}>
      {badge.label}
    </span>
  );
};

const MetricRow = ({ resident, metric, onClick }) => {
  const config = METRIC_CONFIG[metric];
  const Icon = config.icon;
  const metricStatus = getMetricStatus(resident[metric], metric);
  const valueClassName = metricStatus === 'warning' ? 'text-yellow-600' : 'text-green-600';

  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-lg bg-gray-50 p-3 text-left transition-colors hover:bg-gray-100"
      onClick={() => onClick(resident, metric)}
    >
      <span className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${config.iconClassName}`} />
        <span className="text-sm font-medium">{config.label}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className={`text-sm font-bold ${valueClassName}`}>
          {formatMetricValue(resident[metric], metric)}
        </span>
        <Eye className="h-4 w-4 text-gray-400" />
      </span>
    </button>
  );
};

const AdminDashboard = () => {
  const [selectedResident, setSelectedResident] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState(null);
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  const { data: allResidentsData, isLoading } = useQuery({
    queryKey: ['allResidentsData'],
    queryFn: fetchAllResidentsData,
    refetchInterval: 5000, // Refresh resident data every five seconds.
  });

  const { data: allAlerts } = useQuery({
    queryKey: ['allAlerts'],
    queryFn: fetchAllAlerts,
    refetchInterval: 5000, // Keep alert badges close to real time.
  });

  const { data: historicalData } = useQuery({
    queryKey: ['historicalData', selectedResident?.id, selectedMetric],
    queryFn: () => fetchHistoricalData(selectedResident.id, selectedMetric),
    enabled: !!selectedResident && !!selectedMetric,
  });

  const residents = useMemo(
    () => (Array.isArray(allResidentsData) ? allResidentsData : []),
    [allResidentsData]
  );
  const alerts = useMemo(() => (Array.isArray(allAlerts) ? allAlerts : []), [allAlerts]);
  const selectedMetricConfig = selectedMetric ? METRIC_CONFIG[selectedMetric] : null;

  const handleMetricClick = (resident, metric) => {
    setSelectedResident(resident);
    setSelectedMetric(metric);
    setShowHistoryModal(true);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="mx-auto max-w-7xl">
          <div className="animate-pulse space-y-6">
            <div className="h-8 w-1/3 rounded bg-gray-200" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((item) => (
                <div key={item} className="rounded-lg bg-white p-6">
                  <div className="mb-4 h-4 w-3/4 rounded bg-gray-200" />
                  <div className="h-32 rounded bg-gray-200" />
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
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <h1 className="mb-2 text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600">Monitor health status and alerts for all residents</p>
        </div>

        <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6">
            <div className="mb-2 flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-red-500" />
              <h3 className="text-lg font-semibold text-red-900">Critical Alerts</h3>
            </div>
            <div className="text-2xl font-bold text-red-900">
              {alerts.filter((alert) => alert.severity === 'critical').length}
            </div>
          </div>
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
            <div className="mb-2 flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              <h3 className="text-lg font-semibold text-yellow-900">Warning Alerts</h3>
            </div>
            <div className="text-2xl font-bold text-yellow-900">
              {alerts.filter((alert) => alert.severity === 'warning').length}
            </div>
          </div>
          <div className="rounded-lg border border-green-200 bg-green-50 p-6">
            <div className="mb-2 flex items-center gap-3">
              <Users className="h-6 w-6 text-green-500" />
              <h3 className="text-lg font-semibold text-green-900">Total Residents</h3>
            </div>
            <div className="text-2xl font-bold text-green-900">{residents.length}</div>
          </div>
        </div>

        {alerts.length > 0 ? (
          <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <Bell className="h-5 w-5 text-red-500" />
              <h2 className="text-xl font-semibold text-gray-900">Active Alerts</h2>
            </div>
            <div className="space-y-3">
              {alerts.slice(0, 5).map((alert) => (
                <div key={alert.id} className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
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
        ) : null}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {residents.map((resident) => (
            <div key={resident.id} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{resident.name}</h3>
                  <p className="text-sm text-gray-500">Room {resident.room || '--'}</p>
                </div>
                <AlertBadge level={getAlertLevel(resident, alerts)} />
              </div>

              <div className="space-y-3">
                {Object.keys(METRIC_CONFIG).map((metric) => (
                  <MetricRow
                    key={metric}
                    resident={resident}
                    metric={metric}
                    onClick={handleMetricClick}
                  />
                ))}
              </div>

              {Array.isArray(resident.alerts) && resident.alerts.length > 0 ? (
                <div className="mt-4 border-t border-gray-200 pt-4">
                  <h4 className="mb-2 text-sm font-medium text-gray-700">Recent Alerts</h4>
                  <div className="space-y-1">
                    {resident.alerts.slice(0, 2).map((alert) => (
                      <div key={alert.id || alert.message} className="text-xs text-gray-600">
                        {alert.message}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {showHistoryModal && selectedResident && selectedMetricConfig ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
            <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl">
              <div className="p-6">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-gray-900">
                    {selectedResident.name} - {selectedMetricConfig.label} History
                  </h2>
                  <button
                    type="button"
                    onClick={() => setShowHistoryModal(false)}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Close history modal"
                  >
                    X
                  </button>
                </div>

                {historicalData ? (
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
                ) : null}

                <div className="mt-6">
                  <h3 className="mb-4 text-lg font-medium text-gray-900">Recent Data Points</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Timestamp
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                            Value
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {historicalData?.slice(-10).reverse().map((data, index) => (
                          <tr key={`${data.timestamp}-${index}`}>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                              {new Date(data.timestamp).toLocaleString()}
                            </td>
                            <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                              {formatMetricValue(data.value, selectedMetric)}
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
        ) : null}
      </div>
    </div>
  );
};

export default AdminDashboard;
