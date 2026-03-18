// API service - connects to Express + MySQL backend at localhost:3001

const BASE_URL = 'http://localhost:3100/api';

// Fetch real-time watch data
export const fetchWatchData = async (watchId) => {
  const res = await fetch(`${BASE_URL}/watch/${watchId}`);
  if (!res.ok) throw new Error('Failed to fetch watch data');
  return res.json();
};

export const fetchEcgHistory = async (watchId, page = 1, pageSize = 10) => {
  const res = await fetch(`${BASE_URL}/watch/${watchId}/ecg-history?page=${page}&pageSize=${pageSize}`);
  if (!res.ok) throw new Error('Failed to fetch ECG history');
  return res.json();
};

export const fetchEcgHistoryDetail = async (watchId, readingId) => {
  const res = await fetch(`${BASE_URL}/watch/${watchId}/ecg-history/${readingId}`);
  if (!res.ok) throw new Error('Failed to fetch ECG history detail');
  return res.json();
};

export const fetchMetricDetail = async (watchId, metric, date) => {
  const query = new URLSearchParams({ metric });
  if (date) {
    query.set('date', date);
  }
  const res = await fetch(`${BASE_URL}/watch/${watchId}/metric-detail?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch metric detail');
  return res.json();
};

// Fetch overview statistics
export const fetchOverviewStats = async () => {
  const res = await fetch(`${BASE_URL}/stats`);
  if (!res.ok) throw new Error('Failed to fetch stats');
  return res.json();
};

// Fetch elderly residents list
export const fetchElderlyResidents = async () => {
  const res = await fetch(`${BASE_URL}/residents`);
  if (!res.ok) throw new Error('Failed to fetch residents');
  return res.json();
};

// Fetch health data history for a resident
export const fetchHealthData = async (residentId, days = 7) => {
  const res = await fetch(`${BASE_URL}/health/${residentId}?days=${days}`);
  if (!res.ok) throw new Error('Failed to fetch health data');
  return res.json();
};

// Fetch alerts
export const fetchAlerts = async () => {
  const res = await fetch(`${BASE_URL}/alerts`);
  if (!res.ok) throw new Error('Failed to fetch alerts');
  return res.json();
};
