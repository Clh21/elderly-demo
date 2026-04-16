import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Activity, Thermometer, Watch } from 'lucide-react';
import WatchDataCard from '../components/WatchDataCard';
import ECGCard from '../components/ECGCard';
import ECGHistoryModal from '../components/ECGHistoryModal';
import MetricDetailModal from '../components/MetricDetailModal';
import EdaBaselineResultModal from '../components/EdaBaselineResultModal';
import DigitalTwin from '../components/DigitalTwin';
import RoomLocationCard from '../components/RoomLocationCard';
import RoomLocationModal from '../components/RoomLocationModal';
import ElderModelDashboardCard from '../components/ElderModelDashboardCard';
import OverviewStats from '../components/OverviewStats';
import AlertPopup from '../components/AlertPopup';
import { useAuth } from '../context/AuthContext';
import { buildEdaBaseline, fetchAlerts, fetchElderlyResidents, fetchLatestAlerts, fetchOverviewStats, fetchWatchData } from '../services/api';
import { fetchLatestIndoorPosition, openIndoorPositionStream } from '../services/positioningApi';
import { normalizeIndoorPositionPayload } from '../lib/indoorRooms';

const formatDateTime = (value) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const Index = () => {
  const { user, token } = useAuth();
  const [selectedWatch, setSelectedWatch] = useState(null);
  const [pendingAlerts, setPendingAlerts] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [showEcgHistory, setShowEcgHistory] = useState(false);
  const [activeMetricModal, setActiveMetricModal] = useState(null);
  const [edaBaselineFeedback, setEdaBaselineFeedback] = useState(null);
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [indoorPosition, setIndoorPosition] = useState(null);
  const [roomHistory, setRoomHistory] = useState([]);
  const lastSeenAlertId = useRef(0);
  const queryClient = useQueryClient();

  const handleIndoorUpdate = useCallback((payload) => {
    const normalized = normalizeIndoorPositionPayload(payload);
    if (!normalized) {
      return;
    }

    const entryKey = [
      normalized.ts,
      normalized.roomId,
      normalized.x.toFixed(2),
      normalized.y.toFixed(2),
    ].join('|');

    setIndoorPosition(normalized);
    setRoomHistory((prev) => {
      if (prev.some((entry) => entry.entryKey === entryKey)) {
        return prev;
      }

      return [
        {
          ...normalized,
          entryKey,
        },
        ...prev,
      ].slice(0, 32);
    });
  }, []);

  const { data: residents = [] } = useQuery({
    queryKey: ['residents'],
    queryFn: fetchElderlyResidents,
  });

  useEffect(() => {
    if (!residents.length) {
      return;
    }

    const availableWatchIds = residents.map((resident) => resident.watchId);
    if (!selectedWatch || !availableWatchIds.includes(selectedWatch)) {
      const defaultWatchId = availableWatchIds.includes(user?.watchId) ? user.watchId : availableWatchIds[0];
      setSelectedWatch(defaultWatchId);
    }
  }, [residents, selectedWatch, user]);

  useEffect(() => {
    setEdaBaselineFeedback(null);
  }, [selectedWatch]);

  const selectedResident = residents.find((resident) => resident.watchId === selectedWatch) || residents[0] || null;

  // Fetch real-time watch data with auto-refresh every 10 seconds
  const { data: watchData, isLoading: watchLoading } = useQuery({
    queryKey: ['watchData', selectedWatch],
    queryFn: () => fetchWatchData(selectedWatch),
    refetchInterval: 10000,
    enabled: !!selectedWatch,
  });

  const { data: latestIndoorPositionPayload } = useQuery({
    queryKey: ['latestIndoorPosition', 'dashboard'],
    queryFn: fetchLatestIndoorPosition,
    enabled: !!token,
    refetchInterval: 30000,
    retry: 1,
  });

  useEffect(() => {
    if (!latestIndoorPositionPayload) {
      return;
    }
    handleIndoorUpdate(latestIndoorPositionPayload);
  }, [latestIndoorPositionPayload, handleIndoorUpdate]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const closeStream = openIndoorPositionStream(token, {
      onUpdate: (payload) => {
        handleIndoorUpdate(payload);
      },
    });

    return () => {
      closeStream();
    };
  }, [token, handleIndoorUpdate]);

  const edaBaselineMutation = useMutation({
    mutationFn: (watchId) => buildEdaBaseline(watchId),
    onSuccess: (result, watchId) => {
      if (watchId !== selectedWatch) {
        return;
      }

      setEdaBaselineFeedback({
        ...result,
        type: result.built ? 'success' : 'warning',
      });
      queryClient.invalidateQueries({ queryKey: ['watchData', watchId] });
    },
    onError: (error, watchId) => {
      if (watchId !== selectedWatch) {
        return;
      }

      setEdaBaselineFeedback({
        watchId,
        stageLabel: 'Build failed',
        type: 'error',
        message: error.message || 'Failed to build EDA baseline',
        unmetRequirements: [],
        selectedWindowCount: null,
        selectedDayCount: null,
        selectedDaypartCount: null,
      });
    },
  });

  // Fetch overview statistics
  const { data: overviewStats, isLoading: overviewLoading } = useQuery({
    queryKey: ['overviewStats'],
    queryFn: fetchOverviewStats,
    refetchInterval: 10000,
    enabled: user?.role === 'ADMIN',
  });

  // Poll for new alerts every 15 seconds
  useEffect(() => {
    let intervalId;

    const checkAlerts = async () => {
      try {
        const newAlerts = await fetchLatestAlerts(lastSeenAlertId.current);
        if (newAlerts.length > 0) {
          lastSeenAlertId.current = newAlerts[newAlerts.length - 1].id;
          setPendingAlerts(prev => [...prev, ...newAlerts]);
          setShowPopup(true);
          // Invalidate stats so active alert count refreshes
          queryClient.invalidateQueries({ queryKey: ['overviewStats'] });
        }
      } catch (err) {
        console.error('Alert polling error:', err);
      }
    };

    // Initialize lastSeenAlertId with the current max id to avoid showing old alerts on load
    const init = async () => {
      try {
        const all = await fetchAlerts();
        if (all.length > 0) {
          lastSeenAlertId.current = Math.max(...all.map(a => a.id));
        }
      } catch (_) {}
    };

    init().then(() => {
      intervalId = setInterval(checkAlerts, 15000);
    });

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [queryClient]);

  const handleClosePopup = () => {
    setShowPopup(false);
    setPendingAlerts([]);
  };

  const handleCloseEdaBaselineModal = () => {
    setEdaBaselineFeedback(null);
  };

  const watchOptions = residents.map((resident) => ({
    id: resident.watchId,
    name: `${resident.name} (${resident.watchId})`,
    type: resident.status,
  }));

  const handleBuildEdaBaseline = async () => {
    if (!selectedWatch || edaBaselineMutation.isPending) {
      return;
    }

    await edaBaselineMutation.mutateAsync(selectedWatch);
  };

  const edaReadingDetail = watchData?.edaRaw != null
    ? `Raw: ${watchData.edaRaw} µS${watchData.edaLabel ? ` • Samsung label: ${watchData.edaLabel}` : ''}`
    : (watchData?.edaLabel ? `EDA pattern: ${watchData.edaLabel}` : 'Stress state derived from electrodermal activity');

  const edaBaselineSummary = watchData?.edaBaselineBuilt
    ? `${watchData.edaBaselineStageLabel} • ${watchData.edaBaselineWindowCount || 0} windows • ${watchData.edaBaselineDayCount || 0} days • ${watchData.edaBaselineDaypartCount || 0} dayparts`
    : 'Baseline not built yet. Current EDA interpretation is using the default thresholds.';

  const builtBaselineAt = formatDateTime(watchData?.edaBaselineBuiltAt);
  const edaBaselineStats = watchData?.edaBaselineBuilt
    ? [
        watchData.edaBaselineMedian != null ? `Median ${watchData.edaBaselineMedian} µS` : null,
        watchData.edaBaselineP25 != null && watchData.edaBaselineP75 != null
          ? `P25 ${watchData.edaBaselineP25} • P75 ${watchData.edaBaselineP75}`
          : null,
        builtBaselineAt ? `Built ${builtBaselineAt}` : null,
      ].filter(Boolean).join(' • ')
    : null;

  const edaDetailText = watchData ? (
    <div className="space-y-1">
      <div>{edaReadingDetail}</div>
      <div className="text-gray-500">Baseline: {edaBaselineSummary}</div>
      {edaBaselineStats ? <div className="text-gray-400">{edaBaselineStats}</div> : null}
    </div>
  ) : null;

  const edaFooter = watchData ? (
    <div>
      <button
        type="button"
        onClick={handleBuildEdaBaseline}
        disabled={!selectedWatch || edaBaselineMutation.isPending}
        className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {edaBaselineMutation.isPending
          ? 'Building EDA baseline...'
          : (watchData.edaBaselineBuilt ? 'Rebuild EDA Baseline' : 'Build EDA Baseline')}
      </button>
    </div>
  ) : null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Alert Popup */}
      {showPopup && <AlertPopup alerts={pendingAlerts} onClose={handleClosePopup} />}
      <EdaBaselineResultModal feedback={edaBaselineFeedback} onClose={handleCloseEdaBaselineModal} />
      <ECGHistoryModal isOpen={showEcgHistory} onClose={() => setShowEcgHistory(false)} watchId={selectedWatch} />
      <MetricDetailModal
        isOpen={!!activeMetricModal}
        onClose={() => setActiveMetricModal(null)}
        watchId={selectedWatch}
        metric={activeMetricModal}
      />
      <RoomLocationModal
        isOpen={showRoomModal}
        onClose={() => setShowRoomModal(false)}
        currentPosition={indoorPosition}
        history={roomHistory}
      />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Elderly Care Dashboard</h1>
          <p className="text-gray-600">
            Real-time health monitoring and emergency alerts for {selectedResident?.name || user?.residentName || 'your assigned resident'}
          </p>
        </div>

        {/* Watch Selection */}
        <div className="mb-6">
          <div className="flex items-center gap-4">
            <Watch className="h-5 w-5 text-blue-600" />
            <select
              value={selectedWatch || ''}
              onChange={(e) => setSelectedWatch(e.target.value)}
              disabled={watchOptions.length <= 1}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {!watchOptions.length ? <option value="">No assigned watch</option> : null}
              {watchOptions.map((watch) => (
                <option key={watch.id} value={watch.id}>
                  {watch.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Overview Stats */}
        {user?.role === 'ADMIN' && !overviewLoading && overviewStats && (
          <div className="mb-8">
            <OverviewStats stats={overviewStats} />
          </div>
        )}

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Watch Data Cards */}
          <div className="lg:col-span-3 space-y-6">
            {watchLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white rounded-lg p-6 shadow-sm animate-pulse">
                    <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                  </div>
                ))}
              </div>
            ) : watchData && watchData.dataAvailable === false ? (
              <div className="bg-white rounded-lg p-10 shadow-sm flex flex-col items-center justify-center text-center">
                <Watch className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-semibold text-gray-500 mb-2">No Data Available</h3>
                <p className="text-sm text-gray-400">This watch has not sent any data yet.<br />Please ensure the watch app is running and connected to this server.</p>
              </div>
            ) : watchData ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <WatchDataCard
                  title="Heart Rate"
                  value={watchData.heartRate}
                  unit="bpm"
                  icon={<Heart className="h-6 w-6 text-red-500" />}
                  status={watchData.heartRateStatus}
                  chartData={watchData.heartRateHistory}
                  readingTimestamp={watchData.heartRateTimestamp}
                  onTitleClick={() => setActiveMetricModal('heartRate')}
                />
                <WatchDataCard
                  title="Body Temperature"
                  value={watchData.temperature}
                  unit="°C"
                  icon={<Thermometer className="h-6 w-6 text-orange-500" />}
                  status={watchData.temperatureStatus}
                  chartData={watchData.temperatureHistory}
                  readingTimestamp={watchData.temperatureTimestamp}
                  onTitleClick={() => setActiveMetricModal('temperature')}
                  detailText={watchData.wristTemperature != null || watchData.ambientTemperature != null
                    ? `Wrist ${watchData.wristTemperature ?? '--'}°C • Ambient ${watchData.ambientTemperature ?? '--'}°C`
                    : null}
                />
                <WatchDataCard
                  title="EDA (Stress)"
                  value={watchData.edaState || '--'}
                  unit=""
                  icon={<Activity className="h-6 w-6 text-purple-500" />}
                  status={watchData.edaStatus}
                  chartData={watchData.edaHistory}
                  readingTimestamp={watchData.edaTimestamp}
                  onTitleClick={() => setActiveMetricModal('eda')}
                  chartTooltipFormatter={(chartValue, _dataKey, point) => {
                    const label = point?.stateLabel || watchData.edaState || chartValue;
                    const raw = point?.rawEda != null ? `${point.rawEda} µS` : '';
                    return [raw ? `${label} (${raw})` : label, 'EDA Stress'];
                  }}
                  detailText={edaDetailText}
                  footer={edaFooter}
                />
                <ECGCard
                  rhythm={watchData.ecgResult}
                  status={watchData.ecgStatus}
                  chartData={watchData.ecgHistory}
                  readingTimestamp={watchData.ecgTimestamp}
                  sampleCount={watchData.ecgSampleCount}
                  estimatedHeartRate={watchData.ecgHeartRate}
                  durationSeconds={watchData.ecgDurationSeconds}
                  displayRangeMv={watchData.ecgDisplayRangeMv}
                  interpretationBasis={watchData.ecgInterpretationBasis}
                  onOpenHistory={() => setShowEcgHistory(true)}
                />
                <WatchDataCard
                  title="Wear Status"
                  value={watchData.wearStatus}
                  unit=""
                  icon={<Watch className="h-6 w-6 text-green-500" />}
                  status={watchData.wearCardStatus}
                  chartData={[]}
                  readingTimestamp={watchData.wearStatusTimestamp}
                  onTitleClick={() => setActiveMetricModal('wearStatus')}
                  detailText={watchData.isCharging == null
                    ? null
                    : `${watchData.isCharging ? 'Charging' : 'On battery'}${watchData.chargeSource ? ` • ${watchData.chargeSource}` : ''}${watchData.batteryLevelPercent != null ? ` • ${watchData.batteryLevelPercent}%` : ''}`}
                />
              </div>
            ) : (
              <div className="bg-white rounded-lg p-8 shadow-sm text-center">
                <p className="text-gray-500">No watch data available</p>
              </div>
            )}
          </div>

          {/* Digital Twin Panel */}
          <div className="space-y-6 lg:col-span-1">
            <DigitalTwin watchId={selectedWatch} watchData={watchData} resident={selectedResident} />
            <RoomLocationCard
              currentPosition={indoorPosition}
              history={roomHistory}
              onTitleClick={() => setShowRoomModal(true)}
            />
            <ElderModelDashboardCard />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
