import { apiFetch, extractErrorMessage } from './http';

const parseJson = async (response, fallbackMessage) => {
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
  return response.json();
};

// Fetch real-time watch data
export const fetchWatchData = async (watchId) => {
  const response = await apiFetch(`/watch/${watchId}`);
  return parseJson(response, 'Failed to fetch watch data');
};

export const buildEdaBaseline = async (watchId) => {
  const response = await apiFetch(`/watch/${watchId}/eda-baseline/build`, {
    method: 'POST',
  });
  return parseJson(response, 'Failed to build EDA baseline');
};

export const fetchEcgHistory = async (watchId, page = 1, pageSize = 10) => {
  const response = await apiFetch(`/watch/${watchId}/ecg-history?page=${page}&pageSize=${pageSize}`);
  return parseJson(response, 'Failed to fetch ECG history');
};

export const fetchEcgHistoryDetail = async (watchId, readingId) => {
  const response = await apiFetch(`/watch/${watchId}/ecg-history/${readingId}`);
  return parseJson(response, 'Failed to fetch ECG history detail');
};

export const deleteEcgHistoryRecord = async (watchId, readingId) => {
  const response = await apiFetch(`/watch/${watchId}/ecg-history/${readingId}`, {
    method: 'DELETE',
  });
  return parseJson(response, 'Failed to delete ECG history record');
};

export const fetchMetricDetail = async (watchId, metric, date) => {
  const query = new URLSearchParams({ metric });
  if (date) {
    query.set('date', date);
  }
  const response = await apiFetch(`/watch/${watchId}/metric-detail?${query.toString()}`);
  return parseJson(response, 'Failed to fetch metric detail');
};

// Fetch overview statistics
export const fetchOverviewStats = async () => {
  const response = await apiFetch('/stats');
  return parseJson(response, 'Failed to fetch stats');
};

// Fetch elderly residents list
export const fetchElderlyResidents = async () => {
  const response = await apiFetch('/residents');
  return parseJson(response, 'Failed to fetch residents');
};

// Fetch health data history for a resident
export const fetchHealthData = async (residentId, days = 7) => {
  const response = await apiFetch(`/health/${residentId}?days=${days}`);
  return parseJson(response, 'Failed to fetch health data');
};

// Fetch alerts
export const fetchAlerts = async () => {
  const response = await apiFetch('/alerts');
  return parseJson(response, 'Failed to fetch alerts');
};

export const fetchLatestAlerts = async (after = 0) => {
  const response = await apiFetch(`/alerts/latest?after=${after}`);
  return parseJson(response, 'Failed to fetch latest alerts');
};
