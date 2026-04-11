import { apiFetch, extractErrorMessage } from './http';
import { fetchAlerts, fetchOverviewStats, fetchElderlyResidents } from './api';

const parseJson = async (response, fallbackMessage) => {
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
  return response.json();
};

// Fetch all residents with latest health data
export const fetchAllResidentsData = fetchElderlyResidents;

// Fetch historical data for a specific resident and metric
export const fetchHistoricalData = async (residentId, metric) => {
  const response = await apiFetch(`/health/${residentId}?days=7`);
  const data = await parseJson(response, 'Failed to fetch historical data');
  return data.map(row => ({
    timestamp: row.date,
    value: row[metric],
  }));
};

// Fetch real-time alerts across all residents
export const fetchAllAlerts = fetchAlerts;

// Fetch system overview statistics
export const fetchSystemStats = fetchOverviewStats;
