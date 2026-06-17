import React from 'react';
import { Activity, Heart, Thermometer, Watch } from 'lucide-react';
import ECGCard from '../ECGCard';
import WatchDataCard from '../WatchDataCard';

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

const LoadingCards = () => (
  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
    {[1, 2, 3, 4].map((item) => (
      <div key={item} className="animate-pulse rounded-lg bg-white p-6 shadow-sm">
        <div className="mb-4 h-4 w-3/4 rounded bg-gray-200" />
        <div className="h-8 w-1/2 rounded bg-gray-200" />
      </div>
    ))}
  </div>
);

const NoDataState = () => (
  <div className="flex flex-col items-center justify-center rounded-lg bg-white p-10 text-center shadow-sm">
    <Watch className="mb-4 h-12 w-12 text-gray-300" />
    <h3 className="mb-2 text-lg font-semibold text-gray-500">No Data Available</h3>
    <p className="text-sm text-gray-400">
      This watch has not sent any data yet.
      <br />
      Please ensure the watch app is running and connected to this server.
    </p>
  </div>
);

const EmptyWatchState = () => (
  <div className="rounded-lg bg-white p-8 text-center shadow-sm">
    <p className="text-gray-500">No watch data available</p>
  </div>
);

const WatchMetricsGrid = ({
  watchData,
  watchLoading,
  selectedWatch,
  isBuildingEdaBaseline,
  onBuildEdaBaseline,
  onOpenEcgHistory,
  onOpenMetric,
}) => {
  if (watchLoading) {
    return <LoadingCards />;
  }

  if (watchData?.dataAvailable === false) {
    return <NoDataState />;
  }

  if (!watchData) {
    return <EmptyWatchState />;
  }

  const edaReadingDetail = watchData.edaRaw != null
    ? `Raw: ${watchData.edaRaw} uS${watchData.edaLabel ? ` - Samsung label: ${watchData.edaLabel}` : ''}`
    : (watchData.edaLabel ? `EDA pattern: ${watchData.edaLabel}` : 'Stress state derived from electrodermal activity');

  const edaBaselineSummary = watchData.edaBaselineBuilt
    ? `${watchData.edaBaselineStageLabel} - ${watchData.edaBaselineWindowCount || 0} windows - ${watchData.edaBaselineDayCount || 0} days - ${watchData.edaBaselineDaypartCount || 0} dayparts`
    : 'Baseline not built yet. Current EDA interpretation is using the default thresholds.';

  const builtBaselineAt = formatDateTime(watchData.edaBaselineBuiltAt);
  const edaBaselineStats = watchData.edaBaselineBuilt
    ? [
        watchData.edaBaselineMedian != null ? `Median ${watchData.edaBaselineMedian} uS` : null,
        watchData.edaBaselineP25 != null && watchData.edaBaselineP75 != null
          ? `P25 ${watchData.edaBaselineP25} - P75 ${watchData.edaBaselineP75}`
          : null,
        builtBaselineAt ? `Built ${builtBaselineAt}` : null,
      ].filter(Boolean).join(' - ')
    : null;

  const edaDetailText = (
    <div className="space-y-1">
      <div>{edaReadingDetail}</div>
      <div className="text-gray-500">Baseline: {edaBaselineSummary}</div>
      {edaBaselineStats ? <div className="text-gray-400">{edaBaselineStats}</div> : null}
    </div>
  );

  const edaFooter = (
    <div>
      <button
        type="button"
        onClick={onBuildEdaBaseline}
        disabled={!selectedWatch || isBuildingEdaBaseline}
        className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isBuildingEdaBaseline
          ? 'Building EDA baseline...'
          : (watchData.edaBaselineBuilt ? 'Rebuild EDA Baseline' : 'Build EDA Baseline')}
      </button>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      <WatchDataCard
        title="Heart Rate"
        value={watchData.heartRate}
        unit="bpm"
        icon={<Heart className="h-6 w-6 text-red-500" />}
        status={watchData.heartRateStatus}
        chartData={watchData.heartRateHistory}
        readingTimestamp={watchData.heartRateTimestamp}
        onTitleClick={() => onOpenMetric('heartRate')}
        detailText={watchData.heartRateSimulated ? 'High-heart-rate simulation is active' : null}
      />
      <WatchDataCard
        title="Body Temperature"
        value={watchData.temperature}
        unit="C"
        icon={<Thermometer className="h-6 w-6 text-orange-500" />}
        status={watchData.temperatureStatus}
        chartData={watchData.temperatureHistory}
        readingTimestamp={watchData.temperatureTimestamp}
        onTitleClick={() => onOpenMetric('temperature')}
        detailText={watchData.wristTemperature != null || watchData.ambientTemperature != null
          ? `Wrist ${watchData.wristTemperature ?? '--'} C - Ambient ${watchData.ambientTemperature ?? '--'} C`
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
        onTitleClick={() => onOpenMetric('eda')}
        chartTooltipFormatter={(chartValue, _dataKey, point) => {
          const label = point?.stateLabel || watchData.edaState || chartValue;
          const raw = point?.rawEda != null ? `${point.rawEda} uS` : '';
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
        onOpenHistory={onOpenEcgHistory}
      />
      <WatchDataCard
        title="Wear Status"
        value={watchData.wearStatus}
        unit=""
        icon={<Watch className="h-6 w-6 text-green-500" />}
        status={watchData.wearCardStatus}
        chartData={[]}
        readingTimestamp={watchData.wearStatusTimestamp}
        onTitleClick={() => onOpenMetric('wearStatus')}
        detailText={watchData.isCharging == null
          ? null
          : `${watchData.isCharging ? 'Charging' : 'On battery'}${watchData.chargeSource ? ` - ${watchData.chargeSource}` : ''}${watchData.batteryLevelPercent != null ? ` - ${watchData.batteryLevelPercent}%` : ''}`}
      />
    </div>
  );
};

export default WatchMetricsGrid;
