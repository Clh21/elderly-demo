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
  isStatusCard = false,
  readingTimestamp = null,
  detailText = null,
  statusDetailText = null,
  onTitleClick = null,
}) => {
  const formattedTimestamp = readingTimestamp
    ? new Date(readingTimestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;
  const statusChartData = (chartData || []).map((point) => ({
    ...point,
    wornValue: point.value === 1 ? 1 : null,
    unwornValue: point.value === 0 ? 0 : null,
    chargeValue: point.isCharging ? 0.5 : null,
  }));

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
      if (val == null || val === 'unknown') {
        return 'Unknown';
      }
      return val === 'worn' ? 'Worn' : 'Not Worn';
    }
    if (val == null || Number.isNaN(val)) {
      return '--';
    }
    return `${val}${unit ? ` ${unit}` : ''}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {icon}
          {onTitleClick ? (
            <button
              type="button"
              onClick={onTitleClick}
              className="text-left text-lg font-semibold text-gray-900 hover:text-blue-700 hover:underline"
            >
              {title}
            </button>
          ) : (
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          )}
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
          <>
            <div className="text-sm text-gray-500 mt-1">
              {formattedTimestamp ? `Last read at ${formattedTimestamp}` : 'Current reading'}
            </div>
            {detailText && (
              <div className="text-xs text-gray-400 mt-1">
                {detailText}
              </div>
            )}
          </>
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
        <>
          {statusChartData.length > 0 && (
            <div className="h-24 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={statusChartData}>
                  <XAxis
                    dataKey="time"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                  />
                  <YAxis hide domain={[-0.2, 1.2]} />
                  <Tooltip
                    formatter={(chartValue, dataKey) => {
                      if (dataKey === 'chargeValue') {
                        return ['Charging', 'Power'];
                      }
                      return [chartValue === 1 ? 'Worn' : 'Unworn', 'Status'];
                    }}
                    contentStyle={{
                      backgroundColor: '#F9FAFB',
                      border: '1px solid #E5E7EB',
                      borderRadius: '8px',
                      fontSize: '12px'
                    }}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="wornValue"
                    stroke="#16A34A"
                    strokeWidth={3}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="unwornValue"
                    stroke="#DC2626"
                    strokeWidth={3}
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="stepAfter"
                    dataKey="chargeValue"
                    stroke="#2563EB"
                    strokeWidth={3}
                    dot={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="text-sm text-gray-600">
              {formattedTimestamp ? `Last changed at ${formattedTimestamp}` : 'No status history yet'}
            </div>
            {statusDetailText && (
              <div className="text-xs text-gray-500 mt-1">
                {statusDetailText}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default WatchDataCard;
