import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Activity, Thermometer, Watch } from 'lucide-react';
import WatchDataCard from '../components/WatchDataCard';
import ECGCard from '../components/ECGCard';
import ECGHistoryModal from '../components/ECGHistoryModal';
import MetricDetailModal from '../components/MetricDetailModal';
import DigitalTwin from '../components/DigitalTwin';
import OverviewStats from '../components/OverviewStats';
import AlertPopup from '../components/AlertPopup';
import { fetchWatchData, fetchOverviewStats } from '../services/api';

const BASE_URL = 'http://localhost:3100/api';

const Index = () => {
  const [selectedWatch, setSelectedWatch] = useState('demo-watch-001');
  const [pendingAlerts, setPendingAlerts] = useState([]);
  const [showPopup, setShowPopup] = useState(false);
  const [showEcgHistory, setShowEcgHistory] = useState(false);
  const [activeMetricModal, setActiveMetricModal] = useState(null);
  const lastSeenAlertId = useRef(0);
  const queryClient = useQueryClient();

  // Fetch real-time watch data with auto-refresh every 10 seconds
  const { data: watchData, isLoading: watchLoading } = useQuery({
    queryKey: ['watchData', selectedWatch],
    queryFn: () => fetchWatchData(selectedWatch),
    refetchInterval: 10000,
    enabled: !!selectedWatch,
  });

  // Fetch overview statistics
  const { data: overviewStats, isLoading: overviewLoading } = useQuery({
    queryKey: ['overviewStats'],
    queryFn: fetchOverviewStats,
    refetchInterval: 10000,
  });

  // Poll for new alerts every 15 seconds
  useEffect(() => {
    const checkAlerts = async () => {
      try {
        const res = await fetch(`${BASE_URL}/alerts/latest?after=${lastSeenAlertId.current}`);
        const newAlerts = await res.json();
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
        const res = await fetch(`${BASE_URL}/alerts`);
        const all = await res.json();
        if (all.length > 0) {
          lastSeenAlertId.current = Math.max(...all.map(a => a.id));
        }
      } catch (_) {}
    };

    init().then(() => {
      const interval = setInterval(checkAlerts, 15000);
      return () => clearInterval(interval);
    });
  }, [queryClient]);

  const handleClosePopup = () => {
    setShowPopup(false);
    setPendingAlerts([]);
  };

  const watchOptions = [
    { id: 'demo-watch-001', name: 'Demo Watch (Simulated)', type: 'demo' },
    { id: 'real-watch-001', name: 'Real Watch - John Doe', type: 'real' },
    { id: 'real-watch-002', name: 'Real Watch - Jane Smith', type: 'real' },
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Alert Popup */}
      {showPopup && <AlertPopup alerts={pendingAlerts} onClose={handleClosePopup} />}
      <ECGHistoryModal isOpen={showEcgHistory} onClose={() => setShowEcgHistory(false)} watchId={selectedWatch} />
      <MetricDetailModal
        isOpen={!!activeMetricModal}
        onClose={() => setActiveMetricModal(null)}
        watchId={selectedWatch}
        metric={activeMetricModal}
      />

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Elderly Care Dashboard</h1>
          <p className="text-gray-600">Real-time health monitoring and emergency alerts</p>
        </div>

        {/* Watch Selection */}
        <div className="mb-6">
          <div className="flex items-center gap-4">
            <Watch className="h-5 w-5 text-blue-600" />
            <select
              value={selectedWatch}
              onChange={(e) => setSelectedWatch(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {watchOptions.map((watch) => (
                <option key={watch.id} value={watch.id}>
                  {watch.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Overview Stats */}
        {!overviewLoading && overviewStats && (
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
                  detailText={watchData.edaLabel ? `EDA pattern: ${watchData.edaLabel}` : 'Stress state derived from electrodermal activity'}
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
                  status={watchData.wearStatus}
                  chartData={watchData.wearHistory}
                  isStatusCard={true}
                  readingTimestamp={watchData.wearStatusTimestamp}
                  statusDetailText={watchData.isCharging == null
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
          <div className="lg:col-span-1">
            <DigitalTwin watchId={selectedWatch} watchData={watchData} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
