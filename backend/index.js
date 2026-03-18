import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

// ── DB connection pool ──────────────────────────────────────
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'D1aoX0137',
  database: 'elderly',
  waitForConnections: true,
  connectionLimit: 10,
});

// ── helpers ─────────────────────────────────────────────────
const getStatusFromValue = (metric, value) => {
  if (metric === 'heartRate')   return value > 100 || value < 50 ? 'warning' : 'normal';
  if (metric === 'temperature') return value > 37.5 ? 'warning' : 'normal';
  if (metric === 'eda')         return value > 3.5  ? 'warning' : 'normal';
  return 'normal';
};

const parseNumber = (value) => (value == null ? null : parseFloat(value));

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const estimateBodyTemperature = (wristTemperature, ambientTemperature) => {
  if (wristTemperature == null) {
    return null;
  }

  const wrist = Number(wristTemperature);
  const ambient = ambientTemperature == null ? null : Number(ambientTemperature);

  const baseOffset = (() => {
    if (wrist < 34) return 3.3;
    if (wrist < 35) return 2.4;
    if (wrist < 36) return 1.5;
    if (wrist < 37) return 0.8;
    return 0.2;
  })();

  const ambientAdjustment = ambient != null && ambient >= 10 && ambient <= 35
    ? clamp((25 - ambient) * 0.05, -0.5, 0.5)
    : 0;

  return Math.round(clamp(wrist + baseOffset + ambientAdjustment, 35.0, 39.5) * 10) / 10;
};

const parseRawPayload = (rawPayload) => {
  if (!rawPayload) return null;
  if (typeof rawPayload === 'object') return rawPayload;
  try {
    return JSON.parse(rawPayload);
  } catch {
    return null;
  }
};

const pickRecordedTimestamp = (row) => row?.source_timestamp || row?.minute_slot || null;

const median = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
};

const quantile = (values, ratio) => {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[index];
};

const medianAbsoluteDeviation = (values, center) => {
  if (!values.length || center == null) return null;
  const deviations = values.map((value) => Math.abs(value - center));
  return median(deviations);
};

const normalizeEcgSamples = (samples) => {
  if (!Array.isArray(samples)) return [];

  return samples
    .map((sample, index) => ({
      timestamp: Number(sample.timestamp),
      mv: Number(sample.mv),
      index,
    }))
    .filter((sample) => Number.isFinite(sample.mv) && Number.isFinite(sample.timestamp));
};

const inferEcgTiming = (normalizedSamples, declaredSampleCount) => {
  if (!normalizedSamples.length) {
    return {
      durationMs: 30_000,
      sampleRateHz: null,
    };
  }

  const startTimestamp = normalizedSamples[0].timestamp;
  const endTimestamp = normalizedSamples[normalizedSamples.length - 1].timestamp;
  const observedDurationMs = Math.max(endTimestamp - startTimestamp, 0);
  const fallbackDurationMs = declaredSampleCount
    ? Math.max(30_000, Number(declaredSampleCount) * 2)
    : 30_000;
  const durationMs = Math.max(observedDurationMs, fallbackDurationMs, 1);
  const sampleRateHz = normalizedSamples.length > 1
    ? ((normalizedSamples.length - 1) * 1000) / durationMs
    : null;

  return { durationMs, sampleRateHz };
};

const getEcgDisplayRange = (values) => {
  if (!values.length) {
    return [-1.5, 1.5];
  }

  const lower = quantile(values, 0.02) ?? Math.min(...values);
  const upper = quantile(values, 0.98) ?? Math.max(...values);
  const spread = Math.max(upper - lower, 0.3);
  const padding = Math.max(spread * 0.12, 0.08);

  return [
    Math.round((lower - padding) * 1000) / 1000,
    Math.round((upper + padding) * 1000) / 1000,
  ];
};

const downsampleEcgSamples = (normalizedSamples, signalValues, sampleRateHz, maxPoints = 240) => {
  if (!normalizedSamples.length) {
    return [];
  }

  const toPreviewPoint = (sample) => ({
    timestamp: sample.timestamp,
    seconds: sampleRateHz && sampleRateHz > 0
      ? Math.round(((sample.index / sampleRateHz) * 1000)) / 1000
      : Math.round((sample.index * 10)) / 1000,
    mv: Math.round((signalValues[sample.index] ?? sample.mv) * 1000) / 1000,
  });

  if (normalizedSamples.length <= maxPoints) {
    return normalizedSamples.map(toPreviewPoint);
  }

  const bucketSize = Math.ceil(normalizedSamples.length / Math.max(1, Math.floor(maxPoints / 2)));
  const preview = [];

  for (let index = 0; index < normalizedSamples.length; index += bucketSize) {
    const bucket = normalizedSamples.slice(index, index + bucketSize);
    if (!bucket.length) continue;

    const minSample = bucket.reduce((current, sample) => (sample.mv < current.mv ? sample : current), bucket[0]);
    const maxSample = bucket.reduce((current, sample) => (sample.mv > current.mv ? sample : current), bucket[0]);
    const ordered = [minSample, maxSample].sort((left, right) => left.index - right.index);

    ordered.forEach((sample) => {
      preview.push(toPreviewPoint(sample));
    });
  }

  return preview.slice(0, maxPoints);
};

const toIsoTimestamp = (value) => {
  if (value == null) return null;
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const analyzeEcgMeasurement = (ecgData) => {
  const samples = Array.isArray(ecgData?.samples) ? ecgData.samples : [];
  const leadOff = ecgData?.leadOff === true;
  const normalizedSamples = normalizeEcgSamples(samples);
  const { durationMs, sampleRateHz } = inferEcgTiming(normalizedSamples, ecgData?.sampleCount);
  const values = normalizedSamples.map((sample) => sample.mv);
  const previewPointTarget = Math.max(1800, Math.min(3600, Math.round((durationMs / 1000) * 120)));
  const rawPreview = downsampleEcgSamples(normalizedSamples, values, sampleRateHz, previewPointTarget);
  const rawDisplayRangeMv = getEcgDisplayRange(values);

  if (!samples.length || leadOff) {
    return {
      sampleCount: samples.length,
      estimatedHeartRate: null,
      result: leadOff ? 'Poor contact' : 'Unavailable',
      rhythmStatus: leadOff ? 'warning' : 'unavailable',
      interpretationBasis: leadOff ? 'Lead-off detected during the latest single-lead ECG test.' : null,
      durationSeconds: Math.round((durationMs / 1000) * 10) / 10,
      displayRangeMv: rawDisplayRangeMv,
      preview: rawPreview,
    };
  }

  if (values.length < 100) {
    return {
      sampleCount: samples.length,
      estimatedHeartRate: null,
      result: 'Too short',
      rhythmStatus: 'warning',
      interpretationBasis: 'The latest ECG test is too short for rhythm classification.',
      durationSeconds: Math.round((durationMs / 1000) * 10) / 10,
      displayRangeMv: rawDisplayRangeMv,
      preview: rawPreview,
    };
  }

  const baselineWindow = Math.max(1, Math.round(sampleRateHz * 0.2));
  const highPassed = values.map((value, index) => {
    const start = Math.max(0, index - baselineWindow);
    const end = Math.min(values.length, index + baselineWindow + 1);
    let sum = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      sum += values[cursor];
    }
    return value - (sum / (end - start));
  });

  const smoothingWindow = Math.max(1, Math.round(sampleRateHz * 0.012));
  const displaySignal = highPassed.map((_, index) => {
    const start = Math.max(0, index - smoothingWindow);
    const end = Math.min(highPassed.length, index + smoothingWindow + 1);
    let sum = 0;
    for (let cursor = start; cursor < end; cursor += 1) {
      sum += highPassed[cursor];
    }
    return sum / (end - start);
  });

  const preview = downsampleEcgSamples(normalizedSamples, displaySignal, sampleRateHz, previewPointTarget);
  const displayRangeMv = getEcgDisplayRange(displaySignal);

  const squared = highPassed.map((value) => value * value);
  const integrationWindow = Math.max(1, Math.round(sampleRateHz * 0.08));
  const integrated = squared.map((_, index) => {
    const start = Math.max(0, index - integrationWindow);
    let sum = 0;
    for (let cursor = start; cursor <= index; cursor += 1) {
      sum += squared[cursor];
    }
    return sum / (index - start + 1);
  });

  const medianEnergy = quantile(integrated, 0.5) ?? 0;
  const upperEnergy = quantile(integrated, 0.95) ?? medianEnergy;
  const threshold = medianEnergy + (upperEnergy - medianEnergy) * 0.35;
  const refractorySamples = Math.max(1, Math.round(sampleRateHz * 0.3));
  const peaks = [];

  for (let index = 1; index < integrated.length - 1; index += 1) {
    if (integrated[index] < threshold) continue;
    if (integrated[index] < integrated[index - 1] || integrated[index] <= integrated[index + 1]) continue;
    if (peaks.length && index - peaks[peaks.length - 1] < refractorySamples) continue;
    peaks.push(index);
  }

  const rrIntervals = [];
  for (let index = 1; index < peaks.length; index += 1) {
    rrIntervals.push((peaks[index] - peaks[index - 1]) * (1000 / sampleRateHz));
  }

  const medianRr = median(rrIntervals);
  const rrMad = medianAbsoluteDeviation(rrIntervals, medianRr);
  const rrTolerance = Math.max((rrMad ?? 0) * 3, 120);
  const rrInliers = medianRr == null
    ? []
    : rrIntervals.filter((interval) => Math.abs(interval - medianRr) <= rrTolerance);
  const rhythmIntervals = rrInliers.length >= Math.max(6, Math.floor(rrIntervals.length * 0.65))
    ? rrInliers
    : rrIntervals;
  const rhythmMedianRr = median(rhythmIntervals);
  const rhythmRrMad = medianAbsoluteDeviation(rhythmIntervals, rhythmMedianRr);
  const rrCoefficientOfVariation = rhythmMedianRr && rhythmRrMad != null
    ? rhythmRrMad / rhythmMedianRr
    : null;
  const estimatedHeartRate = rhythmMedianRr ? Math.round((60_000 / rhythmMedianRr) * 10) / 10 : null;
  const signalAmplitude = (quantile(values, 0.98) ?? 0) - (quantile(values, 0.02) ?? 0);
  const inlierCoverage = rrIntervals.length ? (rhythmIntervals.length / rrIntervals.length) : 0;

  let result = 'Unreadable single-lead ECG';
  let rhythmStatus = 'warning';
  let interpretationBasis = 'The waveform did not provide stable R-R intervals for rhythm classification.';

  if (estimatedHeartRate != null && peaks.length >= 8 && signalAmplitude >= 0.08) {
    const irregularRhythm = rrCoefficientOfVariation != null
      && rrCoefficientOfVariation >= 0.12
      && inlierCoverage < 0.85;

    if (irregularRhythm) {
      result = 'Irregular rhythm suspected';
      rhythmStatus = 'warning';
      interpretationBasis = `R-peak detection found ${peaks.length} beats over ${Math.round((durationMs / 1000) * 10) / 10}s. Median R-R interval ${Math.round(rhythmMedianRr)} ms with variability ${Math.round(rhythmRrMad ?? 0)} ms suggests irregular timing.`;
    } else if (estimatedHeartRate < 60) {
      result = 'Regular bradycardic rhythm';
      rhythmStatus = 'warning';
      interpretationBasis = `R-peak detection found ${peaks.length} beats over ${Math.round((durationMs / 1000) * 10) / 10}s. Median R-R interval ${Math.round(rhythmMedianRr)} ms indicates a regular slow rhythm.`;
    } else if (estimatedHeartRate > 110) {
      result = 'Regular tachycardic rhythm';
      rhythmStatus = 'warning';
      interpretationBasis = `R-peak detection found ${peaks.length} beats over ${Math.round((durationMs / 1000) * 10) / 10}s. Median R-R interval ${Math.round(rhythmMedianRr)} ms indicates a regular fast rhythm.`;
    } else {
      result = 'Likely sinus rhythm';
      rhythmStatus = 'normal';
      interpretationBasis = `R-peak detection found ${peaks.length} beats over ${Math.round((durationMs / 1000) * 10) / 10}s. Median R-R interval ${Math.round(rhythmMedianRr)} ms with low variability ${Math.round(rhythmRrMad ?? 0)} ms is consistent with a regular rhythm.`;
    }
  }

  return {
    sampleCount: ecgData?.sampleCount != null ? Number(ecgData.sampleCount) : samples.length,
    estimatedHeartRate,
    result,
    rhythmStatus,
    interpretationBasis,
    durationSeconds: Math.round((durationMs / 1000) * 10) / 10,
    displayRangeMv,
    preview,
  };
};

const buildEcgResponseFromRow = (row, { includeWaveform = true } = {}) => {
  if (!row) {
    return null;
  }

  const ecgPayload = parseRawPayload(row.raw_payload);
  const ecgData = ecgPayload?.ecg || null;
  const analysis = ecgData ? analyzeEcgMeasurement(ecgData) : null;
  const preview = includeWaveform ? (analysis?.preview || []) : [];
  const latestPoint = preview.length > 0 ? preview[preview.length - 1] : null;

  return {
    id: row.id ?? null,
    ecg: latestPoint?.mv == null ? null : Number(latestPoint.mv),
    ecgHeartRate: analysis?.estimatedHeartRate ?? (row.ecg_heart_rate == null ? null : Number(row.ecg_heart_rate)),
    ecgSampleCount: analysis?.sampleCount ?? (row.ecg_sample_count == null ? null : Number(row.ecg_sample_count)),
    ecgResult: analysis?.result || row.ecg_result || null,
    ecgInterpretationBasis: analysis?.interpretationBasis || null,
    ecgDurationSeconds: analysis?.durationSeconds ?? null,
    ecgDisplayRangeMv: analysis?.displayRangeMv || [-1.5, 1.5],
    ecgStatus: analysis?.rhythmStatus || 'unavailable',
    ecgTimestamp: row.source_timestamp || row.recorded_at || null,
    recordedAt: row.recorded_at || null,
    sourceTimestamp: row.source_timestamp || null,
    ecgHistory: preview.map((sample) => ({
      time: new Date(sample.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      seconds: Number(sample.seconds),
      value: Number(sample.mv),
    })),
  };
};

const buildHistory = (rows, valueKey) =>
  rows.map(r => ({
    time: new Date(r.recorded_at || r.minute_slot).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    value: r[valueKey] == null ? null : parseFloat(r[valueKey]),
  }));

const METRIC_CONFIG = {
  heartRate: {
    column: 'heart_rate',
    statusColumn: 'heart_rate_status',
    unit: 'bpm',
    label: 'Heart Rate',
    latestField: 'heartRate',
  },
  temperature: {
    column: 'body_temperature',
    statusColumn: 'temperature_status',
    unit: '°C',
    label: 'Body Temperature',
    latestField: 'temperature',
  },
  eda: {
    column: 'eda',
    statusColumn: 'eda_label',
    unit: '',
    label: 'Stress State',
    latestField: 'eda',
  },
};

const EDA_STATES = [
  { level: 1, label: 'Relaxed' },
  { level: 2, label: 'Stable' },
  { level: 3, label: 'Elevated stress' },
  { level: 4, label: 'High stress' },
];

const getEdaStateLabel = (level) => EDA_STATES.find((state) => state.level === level)?.label || 'Unknown';

const interpretEdaStressState = (edaValue, edaLabel) => {
  const normalizedLabel = typeof edaLabel === 'string' ? edaLabel.trim().toUpperCase() : '';

  if (normalizedLabel.includes('RELAX') || normalizedLabel.includes('CALM') || normalizedLabel === 'LOW') {
    return { stateLabel: 'Relaxed', stateLevel: 1, uiStatus: 'normal' };
  }

  if (normalizedLabel.includes('STABLE') || normalizedLabel.includes('NORMAL') || normalizedLabel.includes('BASELINE')) {
    return { stateLabel: 'Stable', stateLevel: 2, uiStatus: 'normal' };
  }

  if (normalizedLabel.includes('ELEVAT') || normalizedLabel.includes('RISING') || normalizedLabel.includes('MEDIUM') || normalizedLabel.includes('MODERATE')) {
    return { stateLabel: 'Elevated stress', stateLevel: 3, uiStatus: 'warning' };
  }

  if (normalizedLabel.includes('HIGH') || normalizedLabel.includes('STRESS') || normalizedLabel.includes('PEAK')) {
    return { stateLabel: 'High stress', stateLevel: 4, uiStatus: 'warning' };
  }

  if (edaValue == null || Number.isNaN(Number(edaValue))) {
    return { stateLabel: null, stateLevel: null, uiStatus: 'unavailable' };
  }

  const numericValue = Number(edaValue);
  if (numericValue < 1.5) {
    return { stateLabel: 'Relaxed', stateLevel: 1, uiStatus: 'normal' };
  }
  if (numericValue < 2.8) {
    return { stateLabel: 'Stable', stateLevel: 2, uiStatus: 'normal' };
  }
  if (numericValue < 4.5) {
    return { stateLabel: 'Elevated stress', stateLevel: 3, uiStatus: 'warning' };
  }
  return { stateLabel: 'High stress', stateLevel: 4, uiStatus: 'warning' };
};

const formatDayOption = (dateValue) => {
  if (!dateValue) return null;
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateValue;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
};

const buildDailyMetricResponse = (metricKey, selectedDate, rows) => {
  const metric = METRIC_CONFIG[metricKey];
  if (!metric) return null;

  if (metricKey === 'eda') {
    const points = rows
      .map((row) => {
        const dateTime = row.source_timestamp ? new Date(Number(row.source_timestamp)) : new Date(row.minute_slot);
        const interpretation = interpretEdaStressState(row.eda, row.eda_label);
        return {
          timestamp: row.source_timestamp || row.minute_slot,
          dateTime,
          value: interpretation.stateLevel,
          stateLabel: interpretation.stateLabel,
        };
      })
      .filter((row) => row.value != null && !Number.isNaN(row.dateTime.getTime()))
      .sort((left, right) => left.dateTime - right.dateTime);

    const latestPoint = points.length ? points[points.length - 1] : null;
    const dominantLevel = points.length
      ? Number(Object.entries(points.reduce((counts, point) => {
          counts[point.value] = (counts[point.value] || 0) + 1;
          return counts;
        }, {})).sort((left, right) => right[1] - left[1])[0][0])
      : null;
    const levels = points.map((point) => point.value);
    const lowestLevel = levels.length ? Math.min(...levels) : null;
    const highestLevel = levels.length ? Math.max(...levels) : null;

    return {
      metric: metricKey,
      label: metric.label,
      unit: '',
      selectedDate,
      summary: {
        min: lowestLevel,
        max: highestLevel,
        minLabel: lowestLevel == null ? null : getEdaStateLabel(lowestLevel),
        maxLabel: highestLevel == null ? null : getEdaStateLabel(highestLevel),
        latest: latestPoint?.value ?? null,
        latestLabel: latestPoint?.stateLabel ?? null,
        latestTimestamp: latestPoint?.timestamp ?? null,
        dominant: dominantLevel,
        dominantLabel: dominantLevel == null ? null : getEdaStateLabel(dominantLevel),
      },
      points: points.map((point) => ({
        timestamp: point.timestamp,
        time: point.dateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        hourOfDay: Math.round(((point.dateTime.getHours() + point.dateTime.getMinutes() / 60 + point.dateTime.getSeconds() / 3600) * 1000)) / 1000,
        value: point.value,
        stateLabel: point.stateLabel,
      })),
    };
  }

  const points = rows
    .map((row) => ({
      timestamp: row.source_timestamp || row.minute_slot,
      dateTime: row.source_timestamp ? new Date(Number(row.source_timestamp)) : new Date(row.minute_slot),
      value: row[metric.column] == null ? null : Number(row[metric.column]),
    }))
    .filter((row) => row.value != null && !Number.isNaN(row.value) && !Number.isNaN(row.dateTime.getTime()))
    .sort((left, right) => left.dateTime - right.dateTime);

  const values = points.map((point) => point.value);
  const latestPoint = points.length ? points[points.length - 1] : null;
  const minValue = values.length ? Math.min(...values) : null;
  const maxValue = values.length ? Math.max(...values) : null;
  const restingValue = metricKey === 'heartRate' && values.length
    ? Math.round(Math.min(...values) * 10) / 10
    : null;

  return {
    metric: metricKey,
    label: metric.label,
    unit: metric.unit,
    selectedDate,
    summary: {
      min: minValue == null ? null : Math.round(minValue * 10) / 10,
      max: maxValue == null ? null : Math.round(maxValue * 10) / 10,
      latest: latestPoint?.value == null ? null : Math.round(latestPoint.value * 10) / 10,
      latestTimestamp: latestPoint?.timestamp ?? null,
      resting: restingValue,
    },
    points: points.map((point) => ({
      timestamp: point.timestamp,
      time: point.dateTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      hourOfDay: Math.round(((point.dateTime.getHours() + point.dateTime.getMinutes() / 60 + point.dateTime.getSeconds() / 3600) * 1000)) / 1000,
      value: Math.round(point.value * 1000) / 1000,
    })),
  };
};

const generateSimulatedHistory = (baseValue, variance, points = 10) => {
  const data = [];
  const now = new Date();
  for (let i = points - 1; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 5 * 60 * 1000);
    const value = baseValue + (Math.random() - 0.5) * variance;
    data.push({
      time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      value: Math.round(value * 10) / 10,
    });
  }
  return data;
};

// ── Minute-slot helper ──────────────────────────────────────
// Returns 'YYYY-MM-DD HH:MM:00' — current time truncated to the minute
const currentMinuteSlot = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ` +
         `${pad(now.getHours())}:${pad(now.getMinutes())}:00`;
};

// ── Demo simulator ──────────────────────────────────────────
// Runs ONCE on startup to seed an initial reading for demo-watch-001.
// All subsequent data must come from simulator.py (Python loopback).
const seedDemoReading = async () => {
  try {
    const [residents] = await pool.query(
      `SELECT id FROM residents WHERE watch_id = 'demo-watch-001' LIMIT 1`
    );
    if (residents.length === 0) return;
    const residentId = residents[0].id;

    const hr   = Math.round(72 + (Math.random() - 0.5) * 16);
    const temp = Math.round((36.5 + (Math.random() - 0.5) * 1.0) * 10) / 10;
    const eda  = Math.round((2.5  + (Math.random() - 0.5) * 1.5) * 10) / 10;
    const slot = currentMinuteSlot();

    await pool.query(
      `INSERT INTO minute_readings
         (resident_id, watch_id, minute_slot, heart_rate, temperature, body_temperature, eda, wear_status)
       VALUES (?, 'demo-watch-001', ?, ?, ?, ?, ?, 'worn')
       ON DUPLICATE KEY UPDATE
         heart_rate  = VALUES(heart_rate),
         temperature = VALUES(temperature),
         body_temperature = VALUES(body_temperature),
         eda         = VALUES(eda),
         updated_at  = NOW()`,
      [residentId, slot, hr, temp, temp, eda]
    );

    console.log(`[Startup] Seeded initial demo reading — HR:${hr} Temp:${temp} EDA:${eda}`);
    console.log('[Startup] Demo simulator stopped. Send data via simulator.py.');
  } catch (err) {
    console.error('[Startup] Seed error:', err.message);
  }
};

// Run once on startup only
seedDemoReading();

// ── GET /api/watch/:watchId ──────────────────────────────────
app.get('/api/watch/:watchId', async (req, res) => {
  try {
    const { watchId } = req.params;
    const [residentRows] = await pool.query(
      `SELECT id, name, status FROM residents WHERE watch_id = ? LIMIT 1`,
      [watchId]
    );
    const resident = residentRows[0] || null;
    const isDemoWatch = resident?.status === 'demo';

    const [
      latest,
      history,
      latestHeartRateRows,
      latestTemperatureRows,
      latestEdaRows,
      latestWearRows,
      latestEcgRows,
    ] = await Promise.all([
      pool.query(
        `SELECT * FROM minute_readings WHERE watch_id = ? ORDER BY minute_slot DESC LIMIT 1`,
        [watchId]
      ).then(([rows]) => rows),
      pool.query(
        `SELECT heart_rate, temperature, body_temperature, wrist_temperature, ambient_temperature, eda, eda_label, wear_status, is_charging, minute_slot AS recorded_at
         FROM minute_readings
         WHERE watch_id = ? AND minute_slot >= NOW() - INTERVAL 1 HOUR
         ORDER BY minute_slot ASC`,
        [watchId]
      ).then(([rows]) => rows),
      pool.query(
        `SELECT heart_rate, minute_slot, source_timestamp
         FROM minute_readings
         WHERE watch_id = ? AND heart_rate IS NOT NULL
         ORDER BY minute_slot DESC LIMIT 1`,
        [watchId]
      ).then(([rows]) => rows),
      pool.query(
        `SELECT temperature, body_temperature, wrist_temperature, ambient_temperature, minute_slot, source_timestamp
         FROM minute_readings
         WHERE watch_id = ? AND temperature IS NOT NULL
         ORDER BY minute_slot DESC LIMIT 1`,
        [watchId]
      ).then(([rows]) => rows),
      pool.query(
        `SELECT eda, eda_label, minute_slot, source_timestamp
         FROM minute_readings
         WHERE watch_id = ? AND eda IS NOT NULL
         ORDER BY minute_slot DESC LIMIT 1`,
        [watchId]
      ).then(([rows]) => rows),
      pool.query(
        `SELECT wear_status, is_charging, charge_source, battery_level_percent, minute_slot, source_timestamp
         FROM minute_readings
         WHERE watch_id = ? AND wear_status IS NOT NULL
         ORDER BY minute_slot DESC LIMIT 1`,
        [watchId]
      ).then(([rows]) => rows),
      pool.query(
        `SELECT raw_payload, ecg_heart_rate, ecg_sample_count, ecg_result, recorded_at, source_timestamp
         FROM watch_readings
         WHERE watch_id = ? AND sensor_type = 'ecg'
         ORDER BY recorded_at DESC LIMIT 1`,
        [watchId]
      ).then(([rows]) => rows),
    ]);
    const historyAsc = [...history];

    if (latest.length === 0) {
      return res.json({
        dataAvailable: false,
        dataSource: isDemoWatch ? 'demo' : 'real',
        heartRate: null, heartRateStatus: 'unavailable',
        heartRateTimestamp: null,
        temperature: null, temperatureStatus: 'unavailable',
        bodyTemperature: null,
        temperatureTimestamp: null,
        wristTemperature: null,
        ambientTemperature: null,
        eda: null, edaLabel: null, edaStatus: 'unavailable', edaTimestamp: null,
        edaState: null,
        edaStateLevel: null,
        wearStatus: 'unknown',
        wearStatusTimestamp: null,
        isCharging: null,
        chargeSource: null,
        batteryLevelPercent: null,
        ecg: null,
        ecgHeartRate: null,
        ecgSampleCount: null,
        ecgResult: null,
        ecgInterpretationBasis: null,
        ecgDurationSeconds: null,
        ecgDisplayRangeMv: [-1.5, 1.5],
        ecgStatus: 'unavailable',
        ecgTimestamp: null,
        timestamp: null,
        heartRateHistory: [], temperatureHistory: [], edaHistory: [], wearHistory: [], ecgHistory: [],
      });
    }

    const row = latest[0];
    const latestHeartRate = latestHeartRateRows[0] || null;
    const latestTemperature = latestTemperatureRows[0] || null;
    const latestEda = latestEdaRows[0] || null;
    const latestWear = latestWearRows[0] || null;
    const latestEcg = latestEcgRows[0] || null;

    const heartRate = parseNumber(latestHeartRate?.heart_rate);
    const temperature = parseNumber(latestTemperature?.temperature);
    const bodyTemperature = parseNumber(latestTemperature?.body_temperature) ?? temperature;
    const wristTemperature = parseNumber(latestTemperature?.wrist_temperature);
    const ambientTemperature = parseNumber(latestTemperature?.ambient_temperature);
    const eda = parseNumber(latestEda?.eda);
    const edaInterpretation = interpretEdaStressState(eda, latestEda?.eda_label || null);
    const wearStatus = latestWear?.wear_status || row.wear_status || 'unknown';
    const isCharging = latestWear?.is_charging == null ? (row.is_charging == null ? null : Boolean(row.is_charging)) : Boolean(latestWear.is_charging);
    const chargeSource = latestWear?.charge_source || row.charge_source || null;
    const batteryLevelPercent = latestWear?.battery_level_percent == null
      ? (row.battery_level_percent == null ? null : Number(row.battery_level_percent))
      : Number(latestWear.battery_level_percent);

    const ecgSummary = buildEcgResponseFromRow(latestEcg, { includeWaveform: true });
    const historyHeartRate = historyAsc.filter(r => r.heart_rate != null);
    const historyTemperature = historyAsc.filter(r => r.temperature != null);
    const historyEda = historyAsc.filter(r => r.eda != null);
    const historyWear = historyAsc.filter(r => r.wear_status != null);

    res.json({
      dataAvailable: true,
      dataSource: isDemoWatch ? 'demo' : 'real',
      heartRate,
      heartRateStatus:   heartRate == null ? 'unavailable' : getStatusFromValue('heartRate', heartRate),
      heartRateTimestamp: pickRecordedTimestamp(latestHeartRate),
      temperature: bodyTemperature,
      bodyTemperature,
      wristTemperature,
      ambientTemperature,
      temperatureStatus: bodyTemperature == null ? 'unavailable' : getStatusFromValue('temperature', bodyTemperature),
      temperatureTimestamp: pickRecordedTimestamp(latestTemperature),
      eda,
      edaRaw:            eda,
      edaLabel:          latestEda?.eda_label || null,
      edaState:          edaInterpretation.stateLabel,
      edaStateLevel:     edaInterpretation.stateLevel,
      edaStatus:         edaInterpretation.uiStatus,
      edaTimestamp:      pickRecordedTimestamp(latestEda),
      wearStatus,
      wearStatusTimestamp: pickRecordedTimestamp(latestWear) || row.minute_slot,
      isCharging,
      chargeSource,
      batteryLevelPercent,
      ecg:               ecgSummary?.ecg ?? null,
      ecgHeartRate:      ecgSummary?.ecgHeartRate ?? null,
      ecgSampleCount:    ecgSummary?.ecgSampleCount ?? null,
      ecgResult:         ecgSummary?.ecgResult ?? null,
      ecgInterpretationBasis: ecgSummary?.ecgInterpretationBasis ?? null,
      ecgDurationSeconds: ecgSummary?.ecgDurationSeconds ?? null,
      ecgDisplayRangeMv: ecgSummary?.ecgDisplayRangeMv ?? [-1.5, 1.5],
      ecgStatus:         ecgSummary?.ecgStatus ?? 'unavailable',
      ecgTimestamp:      ecgSummary?.ecgTimestamp ?? pickRecordedTimestamp(latestEcg),
      timestamp:         row.minute_slot,
      heartRateHistory:   historyHeartRate.length >= 2
        ? buildHistory(historyHeartRate, 'heart_rate')
        : (isDemoWatch && heartRate != null ? generateSimulatedHistory(heartRate, 8) : []),
      temperatureHistory: historyTemperature.length >= 2
        ? buildHistory(historyTemperature, 'temperature')
        : (isDemoWatch && temperature != null ? generateSimulatedHistory(temperature, 0.8) : []),
      edaHistory:         historyEda.length >= 2
        ? historyEda.map((row) => {
            const interpretation = interpretEdaStressState(row.eda, row.eda_label || null);
            return {
              time: new Date(row.recorded_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              value: interpretation.stateLevel,
              stateLabel: interpretation.stateLabel,
            };
          })
        : (isDemoWatch && eda != null ? generateSimulatedHistory(eda, 1.2) : []),
      wearHistory:        historyWear.length >= 2
        ? historyWear.map(r => ({
            time: new Date(r.recorded_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            value: r.wear_status === 'worn' ? 1 : 0,
            isCharging: r.is_charging === true || r.is_charging === 1,
          }))
        : (isDemoWatch ? generateSimulatedHistory(1, 0) : []),
      ecgHistory:         ecgSummary?.ecgHistory ?? [],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/watch/:watchId/ecg-history', async (req, res) => {
  try {
    const { watchId } = req.params;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(10, Math.max(1, parseInt(req.query.pageSize, 10) || 10));
    const offset = (page - 1) * pageSize;

    const [[countRows], [rows]] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total
         FROM watch_readings
         WHERE watch_id = ? AND sensor_type = 'ecg'`,
        [watchId]
      ),
      pool.query(
        `SELECT id, recorded_at, source_timestamp, raw_payload, ecg_heart_rate, ecg_sample_count, ecg_result
         FROM watch_readings
         WHERE watch_id = ? AND sensor_type = 'ecg'
         ORDER BY recorded_at DESC
         LIMIT ? OFFSET ?`,
        [watchId, pageSize, offset]
      ),
    ]);
    const total = Number(countRows[0]?.total || 0);

    res.json({
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      items: rows.map((row) => {
        const summary = buildEcgResponseFromRow(row, { includeWaveform: false });
        return {
          id: summary?.id,
          recordedAt: row.recorded_at,
          sourceTimestamp: row.source_timestamp,
          timestampLabel: toIsoTimestamp(row.source_timestamp) || row.recorded_at,
          ecgHeartRate: summary?.ecgHeartRate ?? null,
          ecgSampleCount: summary?.ecgSampleCount ?? null,
          ecgResult: summary?.ecgResult ?? null,
          ecgStatus: summary?.ecgStatus ?? 'unavailable',
          ecgDurationSeconds: summary?.ecgDurationSeconds ?? null,
        };
      }),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/watch/:watchId/ecg-history/:readingId', async (req, res) => {
  try {
    const { watchId, readingId } = req.params;
    const [rows] = await pool.query(
      `SELECT id, recorded_at, source_timestamp, raw_payload, ecg_heart_rate, ecg_sample_count, ecg_result
       FROM watch_readings
       WHERE watch_id = ? AND sensor_type = 'ecg' AND id = ?
       LIMIT 1`,
      [watchId, readingId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: 'ECG record not found' });
    }

    const summary = buildEcgResponseFromRow(rows[0], { includeWaveform: true });
    res.json(summary);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/watch/:watchId/metric-detail', async (req, res) => {
  try {
    const { watchId } = req.params;
    const metricKey = req.query.metric;
    const metric = METRIC_CONFIG[metricKey];

    if (!metric) {
      return res.status(400).json({ error: 'Unsupported metric' });
    }

    const [dateRows] = await pool.query(
      `SELECT DISTINCT DATE_FORMAT(minute_slot, '%Y-%m-%d') AS day
       FROM minute_readings
       WHERE watch_id = ? AND ${metric.column} IS NOT NULL
       ORDER BY day DESC`,
      [watchId]
    );

    const availableDates = dateRows
      .map((row) => row.day == null ? null : String(row.day))
      .filter(Boolean);

    if (!availableDates.length) {
      return res.json({
        metric: metricKey,
        label: metric.label,
        unit: metric.unit,
        availableDates: [],
        selectedDate: null,
        summary: {
          min: null,
          max: null,
          latest: null,
          latestTimestamp: null,
          resting: null,
        },
        points: [],
      });
    }

    const requestedDate = typeof req.query.date === 'string' ? req.query.date : null;
    const selectedDate = availableDates.includes(requestedDate) ? requestedDate : availableDates[0];

    const [rows] = await pool.query(
      `SELECT minute_slot, source_timestamp, ${metric.column}
       FROM minute_readings
       WHERE watch_id = ?
         AND ${metric.column} IS NOT NULL
         AND DATE(minute_slot) = ?
       ORDER BY minute_slot ASC`,
      [watchId, selectedDate]
    );

    const response = buildDailyMetricResponse(metricKey, selectedDate, rows);
    res.json({
      ...response,
      availableDates: availableDates.map((dateValue) => ({
        value: dateValue,
        label: formatDayOption(dateValue),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/stats ───────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [[{ totalResidents }]] = await pool.query(
      `SELECT COUNT(*) AS totalResidents FROM residents WHERE status != 'inactive'`
    );
    const [[{ activeAlerts }]] = await pool.query(
      `SELECT COUNT(*) AS activeAlerts FROM alerts WHERE status = 'active'`
    );
    const [[{ criticalAlerts }]] = await pool.query(
      `SELECT COUNT(*) AS criticalAlerts FROM alerts WHERE status = 'active' AND severity = 'critical'`
    );
    const [[{ warningAlerts }]] = await pool.query(
      `SELECT COUNT(*) AS warningAlerts FROM alerts WHERE status = 'active' AND severity = 'warning'`
    );
    const [[{ connectedDevices }]] = await pool.query(
      `SELECT COUNT(DISTINCT watch_id) AS connectedDevices
       FROM watch_readings WHERE recorded_at >= NOW() - INTERVAL 10 MINUTE`
    );
    const [[{ dataPointsToday }]] = await pool.query(
      `SELECT COUNT(*) AS dataPointsToday FROM watch_readings WHERE DATE(recorded_at) = CURDATE()`
    );
    res.json({
      totalResidents, activeAlerts, criticalAlerts, warningAlerts,
      connectedDevices, dataPointsToday,
      lastUpdate: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/residents ───────────────────────────────────────
app.get('/api/residents', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, age, room, watch_id AS watchId,
              emergency_contact AS emergencyContact, status
       FROM residents
       WHERE status != 'inactive'
       ORDER BY room`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/health/:residentId?days=7 ──────────────────────
app.get('/api/health/:residentId', async (req, res) => {
  try {
    const { residentId } = req.params;
    const days = parseInt(req.query.days) || 7;
    const [rows] = await pool.query(
      `SELECT summary_date AS date,
              avg_heart_rate  AS heartRate,
              avg_temperature AS temperature,
              avg_eda         AS eda,
              total_steps     AS steps,
              alert_count     AS alerts
       FROM daily_summaries
       WHERE resident_id = ?
         AND summary_date >= CURDATE() - INTERVAL ? DAY
       ORDER BY summary_date`,
      [residentId, days]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/alerts ──────────────────────────────────────────
app.get('/api/alerts', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT a.id, a.resident_id AS residentId, r.name AS residentName,
              a.type, a.severity, a.message, a.status,
              a.created_at AS timestamp
       FROM alerts a
       JOIN residents r ON r.id = a.resident_id
       ORDER BY a.created_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/alerts/latest?after=<id> ───────────────────────
// Returns alerts newer than a given ID (for popup polling)
app.get('/api/alerts/latest', async (req, res) => {
  try {
    const afterId = parseInt(req.query.after) || 0;
    const [rows] = await pool.query(
      `SELECT a.id, a.resident_id AS residentId, r.name AS residentName,
              a.type, a.severity, a.message, a.status,
              a.created_at AS timestamp
       FROM alerts a
       JOIN residents r ON r.id = a.resident_id
       WHERE a.id > ? AND a.status = 'active'
       ORDER BY a.created_at ASC`,
      [afterId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/alerts/create ────────────────────────────────
app.post('/api/alerts/create', async (req, res) => {
  try {
    const { residentId, type, severity, message } = req.body;
    if (!residentId || !type || !severity || !message) {
      return res.status(400).json({ error: 'Missing required fields: residentId, type, severity, message' });
    }
    await pool.query(
      `INSERT INTO alerts (resident_id, type, severity, message, status) VALUES (?, ?, ?, ?, 'active')`,
      [residentId, type, severity, message]
    );
    console.log(`[Alert] Created: [${severity.toUpperCase()}] ${type} — ${message}`);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/alerts/:id/resolve ───────────────────────────
app.post('/api/alerts/:id/resolve', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE alerts SET status = 'resolved', resolved_at = NOW() WHERE id = ?`,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/samsung-watch  (Samsung Galaxy Watch 8 data ingestion) ──
// Accepts all payload formats from the watch:
//   1. { sensorType: "eda",         eda: { skinConductance, label, ... } }
//   2. { sensorType: "heart_rate",   heartRate: { bpm, status, ... } }
//   3. { sensorType: "temperature",  temperature: { wristSkinTemperature, ambientTemperature, ... } }
//   4. { event: "wear_state",        isWorn, state }
//   5. Legacy combined: { eda: {...}, heartRate: {...}, temperature: {...} }
//
// The watch is matched to a resident by watchId query param or client IP.
// Data is stored via UPSERT into minute_readings (one row per minute).
app.post('/api/samsung-watch', async (req, res) => {
  try {
    const payload = req.body;
    const watchId = req.query.watchId || req.headers['x-watch-id'] || payload.watchId || null;
    if (!watchId) {
      return res.status(400).json({ error: 'watchId is required' });
    }

    const [residentRows] = await pool.query(
      `SELECT id, watch_id, status FROM residents WHERE watch_id = ? LIMIT 1`,
      [watchId]
    );
    if (residentRows.length === 0) {
      return res.status(404).json({ error: `Unknown watchId: ${watchId}` });
    }

    const residentId = residentRows[0].id;
    const effectiveWatchId = residentRows[0].watch_id;
    const slot = currentMinuteSlot();

    // ── Parse payload fields ────────────────────────────────
    let hr = null, temp = null, bodyTemp = null, wristTemp = null, ambientTemp = null;
    let eda = null, edaLabel = null, wearStatus = null;
    let heartRateStatus = null, temperatureStatus = null, edaValidSampleCount = null;
    let sourceTimestamp = payload.timestamp != null ? Number(payload.timestamp) : null;
    let isCharging = null, chargeSource = null, batteryLevelPercent = null;
    let ecgHeartRate = null, ecgResult = null, ecgSampleCount = null;
    let minutePayload = payload;

    const sensorType = payload.sensorType || null;
    const event      = payload.event || null;

    // EDA
    if (sensorType === 'eda' || payload.eda) {
      const edaData = payload.eda || {};
      eda      = edaData.skinConductance != null ? parseFloat(edaData.skinConductance) : null;
      edaLabel = edaData.label || null;
      edaValidSampleCount = edaData.validSampleCount != null ? Number(edaData.validSampleCount) : null;
      if (edaData.sampleTimestamp != null) {
        sourceTimestamp = Number(edaData.sampleTimestamp);
      }
    }

    // Heart Rate
    if (sensorType === 'heart_rate' || payload.heartRate) {
      const hrData = payload.heartRate || {};
      hr = hrData.bpm != null ? parseFloat(hrData.bpm) : null;
      heartRateStatus = hrData.status != null ? Number(hrData.status) : null;
      if (hrData.sampleTimestamp != null) {
        sourceTimestamp = Number(hrData.sampleTimestamp);
      }
    }

    // Temperature
    if (sensorType === 'temperature' || payload.temperature) {
      const tempData = payload.temperature || {};
      wristTemp   = tempData.wristSkinTemperature   != null ? parseFloat(tempData.wristSkinTemperature)   : null;
      ambientTemp = tempData.ambientTemperature      != null ? parseFloat(tempData.ambientTemperature)      : null;
      temperatureStatus = tempData.status || null;
      bodyTemp = estimateBodyTemperature(wristTemp, ambientTemp);
      temp = bodyTemp;
    }

    // Wear state event
    if (event === 'wear_state') {
      wearStatus = payload.isWorn ? 'worn' : 'not_worn';
      isCharging = payload.isCharging == null ? null : Boolean(payload.isCharging);
      chargeSource = payload.chargeSource || null;
      batteryLevelPercent = payload.batteryLevelPercent == null ? null : Number(payload.batteryLevelPercent);
    }

    if (event === 'power_state') {
      isCharging = payload.isCharging == null ? null : Boolean(payload.isCharging);
      chargeSource = payload.chargeSource || null;
      batteryLevelPercent = payload.batteryLevelPercent == null ? null : Number(payload.batteryLevelPercent);
      if (payload.isWorn != null) {
        wearStatus = payload.isWorn ? 'worn' : 'not_worn';
      }
    }

    if (sensorType === 'ecg' || payload.ecg) {
      const ecgData = payload.ecg || {};
      const ecgAnalysis = analyzeEcgMeasurement(ecgData);
      ecgHeartRate = ecgAnalysis.estimatedHeartRate;
      ecgResult = ecgAnalysis.result;
      ecgSampleCount = ecgAnalysis.sampleCount;
      minutePayload = {
        timestamp: payload.timestamp,
        sensorType: 'ecg',
        ecg: {
          sampleCount: ecgAnalysis.sampleCount,
          leadOff: ecgData.leadOff === true,
          estimatedHeartRate: ecgAnalysis.estimatedHeartRate,
          result: ecgAnalysis.result,
          rhythmStatus: ecgAnalysis.rhythmStatus,
          interpretationBasis: ecgAnalysis.interpretationBasis,
          durationSeconds: ecgAnalysis.durationSeconds,
          displayRangeMv: ecgAnalysis.displayRangeMv,
          preview: ecgAnalysis.preview,
        },
      };
      console.log(`[Samsung Watch] ECG received: ${ecgSampleCount} samples, estimatedHR:${ecgHeartRate}, result:${ecgResult}`);
    }

    // ── Insert raw reading into watch_readings ──────────────
    await pool.query(
      `INSERT INTO watch_readings
         (resident_id, watch_id, sensor_type, event_type, source_timestamp, heart_rate, heart_rate_status, temperature, body_temperature, wrist_temperature, ambient_temperature, temperature_status, eda, eda_label, eda_valid_sample_count, wear_status, is_charging, charge_source, battery_level_percent, ecg_heart_rate, ecg_sample_count, ecg_result, raw_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        residentId, effectiveWatchId,
        sensorType, event, sourceTimestamp,
        hr, heartRateStatus, temp, bodyTemp, wristTemp, ambientTemp, temperatureStatus,
        eda, edaLabel, edaValidSampleCount,
        wearStatus || 'worn', isCharging, chargeSource, batteryLevelPercent,
        ecgHeartRate, ecgSampleCount, ecgResult,
        JSON.stringify(payload)
      ]
    );

    // ── UPSERT into minute_readings (latest value wins per minute) ──
    // Only update fields that were present in this payload
    const updates = [];
    const updateVals = [];
    if (sensorType  != null) { updates.push('sensor_type = VALUES(sensor_type)'); }
    if (event       != null) { updates.push('event_type = VALUES(event_type)'); }
    if (sourceTimestamp != null) { updates.push('source_timestamp = VALUES(source_timestamp)'); }
    if (hr          != null) { updates.push('heart_rate = VALUES(heart_rate)'); }
    if (heartRateStatus != null) { updates.push('heart_rate_status = VALUES(heart_rate_status)'); }
    if (temp        != null) { updates.push('temperature = VALUES(temperature)'); }
    if (bodyTemp    != null) { updates.push('body_temperature = VALUES(body_temperature)'); }
    if (wristTemp   != null) { updates.push('wrist_temperature = VALUES(wrist_temperature)'); }
    if (ambientTemp != null) { updates.push('ambient_temperature = VALUES(ambient_temperature)'); }
    if (temperatureStatus != null) { updates.push('temperature_status = VALUES(temperature_status)'); }
    if (eda         != null) { updates.push('eda = VALUES(eda)'); }
    if (edaLabel    != null) { updates.push('eda_label = VALUES(eda_label)'); }
    if (edaValidSampleCount != null) { updates.push('eda_valid_sample_count = VALUES(eda_valid_sample_count)'); }
    if (wearStatus  != null) { updates.push('wear_status = VALUES(wear_status)'); }
    if (isCharging  != null) { updates.push('is_charging = VALUES(is_charging)'); }
    if (chargeSource != null) { updates.push('charge_source = VALUES(charge_source)'); }
    if (batteryLevelPercent != null) { updates.push('battery_level_percent = VALUES(battery_level_percent)'); }
    if (ecgHeartRate != null) { updates.push('ecg_heart_rate = VALUES(ecg_heart_rate)'); }
    if (ecgSampleCount != null) { updates.push('ecg_sample_count = VALUES(ecg_sample_count)'); }
    if (ecgResult != null) { updates.push('ecg_result = VALUES(ecg_result)'); }
    updates.push('raw_payload = VALUES(raw_payload)');
    updates.push('updated_at = NOW()');

    await pool.query(
      `INSERT INTO minute_readings
         (resident_id, watch_id, minute_slot, sensor_type, event_type, source_timestamp, heart_rate, heart_rate_status, temperature, body_temperature, wrist_temperature, ambient_temperature, temperature_status, eda, eda_label, eda_valid_sample_count, wear_status, is_charging, charge_source, battery_level_percent, ecg_heart_rate, ecg_sample_count, ecg_result, raw_payload)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE ${updates.join(', ')}`,
      [
        residentId, effectiveWatchId, slot,
        sensorType, event, sourceTimestamp,
        hr, heartRateStatus, temp, bodyTemp, wristTemp, ambientTemp, temperatureStatus,
        eda, edaLabel, edaValidSampleCount,
        wearStatus || 'worn', isCharging, chargeSource, batteryLevelPercent,
        ecgHeartRate, ecgSampleCount, ecgResult,
        JSON.stringify(minutePayload)
      ]
    );

    console.log(`[Samsung Watch] ${effectiveWatchId} | sensorType:${sensorType || event || 'combined'} | HR:${hr} Temp:${bodyTemp} Wrist:${wristTemp} Ambient:${ambientTemp} EDA:${eda} Label:${edaLabel} Worn:${wearStatus} Charging:${isCharging} Source:${chargeSource} ECG:${ecgHeartRate}`);
    res.json({ success: true, slot, watchId: effectiveWatchId });
  } catch (err) {
    console.error('[Samsung Watch] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/watch-reading  (for device data ingestion) ─────
app.post('/api/watch-reading', async (req, res) => {
  try {
    const { watchId, heartRate, temperature, eda, wearStatus } = req.body;
    const [resident] = await pool.query(
      `SELECT id FROM residents WHERE watch_id = ?`, [watchId]
    );
    if (resident.length === 0) return res.status(404).json({ error: 'Watch not found' });
    await pool.query(
      `INSERT INTO watch_readings (resident_id, watch_id, heart_rate, temperature, eda, wear_status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [resident[0].id, watchId, heartRate, temperature, eda, wearStatus || 'worn']
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ── Start ────────────────────────────────────────────────────
const PORT = 3100;
app.listen(PORT, () => {
  console.log(`Elderly Care API server running at http://localhost:${PORT}`);
});
