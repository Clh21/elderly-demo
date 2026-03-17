import React from 'react';
import { Users, AlertTriangle, Activity, Watch } from 'lucide-react';

const OverviewStats = ({ stats }) => {
  const statCards = [
    {
      title: 'Total Residents',
      value: stats?.totalResidents || 0,
      icon: <Users className="h-6 w-6 text-blue-600" />,
      color: 'bg-blue-50 border-blue-200',
      change: '+2 this month'
    },
    {
      title: 'Active Alerts',
      value: stats?.activeAlerts || 0,
      icon: <AlertTriangle className="h-6 w-6 text-red-600" />,
      color: 'bg-red-50 border-red-200',
      change: stats?.activeAlerts > 0 ? 'Requires attention' : 'All clear'
    },
    {
      title: 'Connected Devices',
      value: stats?.connectedDevices || 0,
      icon: <Watch className="h-6 w-6 text-green-600" />,
      color: 'bg-green-50 border-green-200',
      change: `${stats?.connectedDevices || 0} online`
    },
    {
      title: 'Data Points Today',
      value: stats?.dataPointsToday || 0,
      icon: <Activity className="h-6 w-6 text-purple-600" />,
      color: 'bg-purple-50 border-purple-200',
      change: 'Real-time monitoring'
    }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {statCards.map((stat, index) => (
        <div
          key={index}
          className={`${stat.color} border rounded-lg p-6 hover:shadow-md transition-shadow`}
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {stat.icon}
              <h3 className="text-sm font-medium text-gray-700">{stat.title}</h3>
            </div>
          </div>
          
          <div className="mb-2">
            <div className="text-2xl font-bold text-gray-900">
              {stat.value.toLocaleString()}
            </div>
          </div>
          
          <div className="text-xs text-gray-600">
            {stat.change}
          </div>
        </div>
      ))}
    </div>
  );
};

export default OverviewStats;
