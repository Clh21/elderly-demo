import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Bot,
  CalendarDays,
  CheckCircle2,
  Database,
  HeartPulse,
  Loader2,
  RefreshCw,
  Thermometer,
} from 'lucide-react';
import { fetchAiAnalysis } from '../../services/api';

const getLocalDate = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const statusStyles = {
  stable: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: CheckCircle2,
  },
  attention: {
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    icon: AlertTriangle,
  },
  critical: {
    badge: 'border-red-200 bg-red-50 text-red-700',
    icon: AlertTriangle,
  },
  insufficient: {
    badge: 'border-slate-200 bg-slate-50 text-slate-600',
    icon: Database,
  },
};

const formatMetric = (metric, unit, decimals = 1) => {
  if (!metric || metric.count === 0 || metric.average == null) {
    return 'No usable data';
  }
  return `${Number(metric.average).toFixed(decimals)} ${unit} avg`;
};

const AiAnalysisBar = ({ watchId }) => {
  const date = getLocalDate();
  const {
    data,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ['dailyHealthAnalysis', watchId, date],
    queryFn: () => fetchAiAnalysis(watchId, date),
    enabled: !!watchId,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  if (!watchId) return null;

  const style = statusStyles[data?.status] || statusStyles.insufficient;
  const StatusIcon = style.icon;
  const quality = data?.dataQuality;
  const metrics = data?.metrics || {};

  return (
    <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">Daily Health Analysis</h3>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{date}</span>
              {data?.analysisSource ? <span>· {data.analysisSource === 'zhipu-glm' ? 'AI enhanced' : 'rule analysis'}</span> : null}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {data ? (
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${style.badge}`}>
              <StatusIcon className="h-3.5 w-3.5" />
              {data.statusLabel}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Refresh daily analysis"
            title="Refresh daily analysis"
          >
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {isLoading ? (
        <div className="flex min-h-36 items-center justify-center gap-2 px-5 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing today's records...
        </div>
      ) : error ? (
        <div className="px-5 py-6 text-sm text-red-700">
          {error.message || 'Daily analysis is unavailable.'}
        </div>
      ) : (
        <div className="space-y-5 px-5 py-5">
          {!data?.dataAvailable ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {data?.analysis}
              {data?.lastAvailableDate ? (
                <div className="mt-1 text-xs text-slate-500">Last available data: {data.lastAvailableDate}</div>
              ) : null}
            </div>
          ) : (
            <>
              <p className="text-sm leading-6 text-slate-700">{data.analysis}</p>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border border-slate-200 px-3 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Database className="h-4 w-4 text-slate-500" />
                    Data quality
                  </div>
                  <div className="mt-2 text-sm font-semibold capitalize text-slate-900">{quality?.level || 'Unknown'}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {quality?.rawEventCount || 0} events · {quality?.sessionCoveragePercent || 0}% session coverage
                  </div>
                </div>

                <div className="rounded-lg border border-red-100 px-3 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <HeartPulse className="h-4 w-4 text-red-500" />
                    Heart rate
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {formatMetric(metrics.heartRate, 'bpm')}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {metrics.heartRate?.outOfRangeCount || 0} outside configured range
                  </div>
                </div>

                <div className="rounded-lg border border-orange-100 px-3 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Thermometer className="h-4 w-4 text-orange-500" />
                    Temperature
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {formatMetric(metrics.temperature, 'C')}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {metrics.temperature?.outOfRangeCount || 0} worn-state exceptions
                  </div>
                </div>

                <div className="rounded-lg border border-cyan-100 px-3 py-3">
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                    <Activity className="h-4 w-4 text-cyan-600" />
                    EDA response
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {metrics.eda?.sustainedHighEpisodeCount || 0} elevated sessions
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {metrics.eda?.count || 0} usable samples
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Key findings</h4>
                  <ul className="mt-2 space-y-2">
                    {(data.findings || []).slice(0, 4).map((finding) => (
                      <li key={finding} className="flex gap-2 text-sm leading-5 text-slate-700">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-600" />
                        <span>{finding}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="text-xs font-semibold uppercase text-slate-500">Recommended review</h4>
                  <ul className="mt-2 space-y-2">
                    {(data.recommendations || []).map((recommendation) => (
                      <li key={recommendation} className="flex gap-2 text-sm leading-5 text-slate-700">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                        <span>{recommendation}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
};

export default AiAnalysisBar;
