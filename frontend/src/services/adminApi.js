// Admin API service - connects to Express + MySQL backend at localhost:3001
import { fetchAlerts, fetchOverviewStats, fetchElderlyResidents } from './api';

const BASE_URL = 'http://localhost:3100/api';

// Fetch all residents with latest health data
export const fetchAllResidentsData = async () => {
  const res = await fetch(`${BASE_URL}/residents`);
  if (!res.ok) throw new Error('Failed to fetch residents data');
  return res.json();
};

// Fetch historical data for a specific resident and metric
export const fetchHistoricalData = async (residentId, metric) => {
  const res = await fetch(`${BASE_URL}/health/${residentId}?days=7`);
  if (!res.ok) throw new Error('Failed to fetch historical data');
  const data = await res.json();
  return data.map(row => ({
    timestamp: row.date,
    value: row[metric],
  }));
};

// Fetch real-time alerts across all residents
export const fetchAllAlerts = fetchAlerts;

// Fetch system overview statistics
export const fetchSystemStats = fetchOverviewStats;
