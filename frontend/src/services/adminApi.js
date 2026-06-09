import { apiFetch, extractErrorMessage } from './http';
import { fetchAlerts, fetchOverviewStats, fetchElderlyResidents } from './api';

const parseJson = async (response, fallbackMessage) => {
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
  return response.json();
};

/**
 * Fetches all resident cards for the admin dashboard.
 */
export const fetchAllResidentsData = fetchElderlyResidents;

/**
 * Fetches historical metric values for one resident.
 *
 * @param {number|string} residentId resident id
 * @param {string} metric metric key to extract from health history rows
 * @returns {Promise<Array<{timestamp: string, value: *}>>} chart-ready metric points
 */
export const fetchHistoricalData = async (residentId, metric) => {
  const response = await apiFetch(`/health/${residentId}?days=7`);
  const data = await parseJson(response, 'Failed to fetch historical data');
  return data.map(row => ({
    timestamp: row.date,
    value: row[metric],
  }));
};

/**
 * Fetches alerts visible to the admin dashboard.
 */
export const fetchAllAlerts = fetchAlerts;

/**
 * Fetches system overview statistics for admin widgets.
 */
export const fetchSystemStats = fetchOverviewStats;
