// API service - connects to Express + MySQL backend at localhost:3001

const BASE_URL = 'http://localhost:3001/api';

// Fetch real-time watch data
export const fetchWatchData = async (watchId) => {
  const res = await fetch(`${BASE_URL}/watch/${watchId}`);
  if (!res.ok) throw new Error('Failed to fetch watch data');
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
