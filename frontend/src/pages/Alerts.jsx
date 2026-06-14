import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Clock, CheckCircle, XCircle, Filter, Trash2, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { clearAlerts, fetchAlerts, resolveAlert } from '../services/api';

const splitAlertMessage = (message) => {
  const text = message || '';
  const marker = '[AI Analysis]:';
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) {
    return { baseMessage: text, aiMessage: null };
  }
  return {
    baseMessage: text.slice(0, markerIndex).trim(),
    aiMessage: text.slice(markerIndex + marker.length).trim(),
  };
};

const Alerts = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [filterSeverity, setFilterSeverity] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const canManageAlerts = user?.role === 'ADMIN';

  const { data: alerts, isLoading } = useQuery({
    queryKey: ['alerts'],
    queryFn: fetchAlerts,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const clearAlertsMutation = useMutation({
    mutationFn: clearAlerts,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['allAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['overviewStats'] });
    },
  });

  const resolveAlertMutation = useMutation({
    mutationFn: resolveAlert,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      queryClient.invalidateQueries({ queryKey: ['allAlerts'] });
      queryClient.invalidateQueries({ queryKey: ['overviewStats'] });
    },
  });

  const filteredAlerts = alerts?.filter(alert => {
    const matchesSeverity = filterSeverity === 'all' || alert.severity === filterSeverity;
    const matchesStatus = filterStatus === 'all' || alert.status === filterStatus;
    return matchesSeverity && matchesStatus;
  }) || [];

  const activeAlertCount = alerts?.filter(alert => alert.status === 'active').length || 0;

  const getSeverityIcon = (severity) => {
    switch (severity?.toLowerCase()) {
      case 'critical':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-gray-500" />;
    }
  };

  const getSeverityBadge = (severity) => {
    const styles = {
      critical: 'bg-red-100 text-red-800 border-red-200',
      warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      info: 'bg-blue-100 text-blue-800 border-blue-200'
    };
    
    const sevKey = severity?.toLowerCase() || 'info';
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${styles[sevKey] || styles.info}`}>
        {severity ? severity.charAt(0).toUpperCase() + severity.slice(1).toLowerCase() : 'Info'}
      </span>
    );
  };

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-red-100 text-red-800',
      resolved: 'bg-green-100 text-green-800',
    };
    
    const statKey = status?.toLowerCase() || 'active';
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[statKey] || styles.active}`}>
        {status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : 'Active'}
      </span>
    );
  };

  const getTimeAgo = (timestamp) => {
    if (!timestamp) return 'Unknown time';
    const now = new Date();
    const alertTime = new Date(timestamp);
    const diffInMinutes = Math.floor((now - alertTime) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="bg-white rounded-lg p-6">
                <div className="h-4 bg-gray-200 rounded w-1/4 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            ))}
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
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Alert Management</h1>
              <p className="text-gray-600">
                {canManageAlerts ? 'Monitor and manage health alerts and notifications' : 'Review alerts for your assigned resident'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => clearAlertsMutation.mutate()}
              disabled={!activeAlertCount || clearAlertsMutation.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {clearAlertsMutation.isPending ? 'Clearing...' : 'Clear active alerts'}
            </button>
          </div>
          {clearAlertsMutation.isError ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {clearAlertsMutation.error?.message || 'Failed to clear alerts'}
            </div>
          ) : null}
          {resolveAlertMutation.isError ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {resolveAlertMutation.error?.message || 'Failed to resolve alert'}
            </div>
          ) : null}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-400" />
              <select
                value={filterSeverity}
                onChange={(e) => setFilterSeverity(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Severities</option>
                <option value="critical">Critical</option>
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>
        </div>

        {/* Alert Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <XCircle className="h-6 w-6 text-red-500" />
              <h3 className="text-lg font-semibold text-red-900">Critical Alerts</h3>
            </div>
            <div className="text-2xl font-bold text-red-900">
              {alerts?.filter(a => a.severity?.toLowerCase() === 'critical' && a.status === 'active').length || 0}
            </div>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <AlertTriangle className="h-6 w-6 text-yellow-500" />
              <h3 className="text-lg font-semibold text-yellow-900">Warning Alerts</h3>
            </div>
            <div className="text-2xl font-bold text-yellow-900">
              {alerts?.filter(a => a.severity?.toLowerCase() === 'warning' && a.status === 'active').length || 0}
            </div>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center gap-3 mb-2">
              <CheckCircle className="h-6 w-6 text-green-500" />
              <h3 className="text-lg font-semibold text-green-900">Resolved Today</h3>
            </div>
            <div className="text-2xl font-bold text-green-900">
              {alerts?.filter(a => a.status === 'resolved').length || 0}
            </div>
          </div>
        </div>

        {/* Alerts List */}
        <div className="space-y-4">
          {filteredAlerts.map((alert) => {
            const { baseMessage: baseMsg, aiMessage: aiMsg } = splitAlertMessage(alert.message);
            const isAiVerified = Boolean(aiMsg);

            return (
              <div key={alert.id} className={`bg-white rounded-lg shadow-sm border ${alert.severity?.toLowerCase() === 'critical' ? 'border-red-200' : 'border-gray-200'} p-6 hover:shadow-md transition-shadow`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    {getSeverityIcon(alert.severity)}
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {alert.residentName || `Resident #${alert.residentId}`}
                        </h3>
                        {getSeverityBadge(alert.severity)}
                        {getStatusBadge(alert.status)}
                      </div>
                      
                      {/* 渲染基础警报描述 (保留换行符) */}
                      <p className="text-gray-700 mb-3 whitespace-pre-wrap">{baseMsg}</p>

                      {isAiVerified && (
                        <div className="mb-4 bg-indigo-50 border border-indigo-100 rounded-lg p-4 flex gap-3 shadow-inner">
                          <div className="mt-0.5 bg-white p-1 rounded-full shadow-sm h-fit">
                            <Sparkles className="h-5 w-5 text-indigo-500" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-indigo-900 mb-1 flex items-center gap-2">
                              Alert context analysis
                              <span className="bg-indigo-100 text-indigo-700 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider">
                                Reviewed
                              </span>
                            </h4>
                            <p className="text-sm text-indigo-800 leading-relaxed">
                              {aiMsg}
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {getTimeAgo(alert.timestamp || alert.createdAt)}
                        </div>
                        <div className="capitalize">
                          Type: {alert.type ? alert.type.replace(/_/g, ' ').toLowerCase() : 'Unknown'}
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {canManageAlerts && alert.status === 'active' && (
                    <div className="flex gap-2 ml-4">
                      <button
                        type="button"
                        onClick={() => resolveAlertMutation.mutate(alert.id)}
                        disabled={resolveAlertMutation.isPending}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition-colors shadow-sm"
                      >
                        {resolveAlertMutation.isPending ? 'Resolving...' : 'Resolve'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {filteredAlerts.length === 0 && (
          <div className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">No alerts found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Alerts;
