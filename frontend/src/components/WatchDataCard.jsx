import React from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

const WatchDataCard = ({ 
  title, 
  value, 
  unit, 
  icon, 
  status, 
  chartData, 
  isStatusCard = false 
}) => {
  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'normal':
      case 'worn':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'warning':
      case 'not_worn':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-500" />;
      default:
        return <CheckCircle className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'normal':
      case 'worn':
        return 'text-green-600 bg-green-50';
      case 'warning':
      case 'not_worn':
        return 'text-yellow-600 bg-yellow-50';
      case 'critical':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const formatValue = (val, unit) => {
    if (isStatusCard) {
      return val === 'worn' ? 'Worn' : 'Not Worn';
    }
    return `${val}${unit ? ` ${unit}` : ''}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        <div className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 ${getStatusColor(status)}`}>
          {getStatusIcon(status)}
          <span className="capitalize">{status || 'Unknown'}</span>
        </div>
      </div>

      {/* Value Display */}
      <div className="mb-4">
        <div className="text-3xl font-bold text-gray-900">
          {formatValue(value, unit)}
        </div>
        {!isStatusCard && (
          <div className="text-sm text-gray-500 mt-1">
            Current reading
          </div>
        )}
      </div>

      {/* Chart */}
      {chartData && chartData.length > 0 && !isStatusCard && (
        <div className="h-32">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis 
                dataKey="time" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12, fill: '#6B7280' }}
              />
              <YAxis hide />
              <Tooltip 
                contentStyle={{
                  backgroundColor: '#F9FAFB',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  fontSize: '12px'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#3B82F6' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Status Card Specific Content */}
      {isStatusCard && (
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>
      )}
    </div>
  );
};

export default WatchDataCard;
