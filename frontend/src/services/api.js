import { apiFetch, extractErrorMessage } from './http';

const parseJson = async (response, fallbackMessage) => {
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
  return response.json();
};

/**
 * Fetches the latest dashboard summary for a watch.
 *
 * @param {string} watchId watch id to query
 * @returns {Promise<object>} watch summary payload
 */
export const fetchWatchData = async (watchId) => {
  const response = await apiFetch(`/watch/${watchId}`);
  return parseJson(response, 'Failed to fetch watch data');
};

/**
 * Requests the backend to build or refresh the EDA baseline for a watch.
 *
 * @param {string} watchId watch id to process
 * @returns {Promise<object>} baseline build result
 */
export const buildEdaBaseline = async (watchId) => {
  const response = await apiFetch(`/watch/${watchId}/eda-baseline/build`, {
    method: 'POST',
  });
  return parseJson(response, 'Failed to build EDA baseline');
};

/**
 * Fetches paginated ECG history records for a watch.
 *
 * @param {string} watchId watch id to query
 * @param {number} page one-based page number
 * @param {number} pageSize number of records per page
 * @returns {Promise<object>} paginated ECG history payload
 */
export const fetchEcgHistory = async (watchId, page = 1, pageSize = 10) => {
  const response = await apiFetch(`/watch/${watchId}/ecg-history?page=${page}&pageSize=${pageSize}`);
  return parseJson(response, 'Failed to fetch ECG history');
};

/**
 * Fetches the daily health analysis for a watch.
 *
 * @param {string} watchId watch id to query
 * @param {string} date local date in yyyy-MM-dd format
 * @returns {Promise<object>} daily analysis result
 */
export const fetchAiAnalysis = async (watchId, date) => {
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  const response = await apiFetch(`/watch/${watchId}/health-analysis${query}`);
  return parseJson(response, 'Failed to fetch AI analysis');
};

/**
 * Fetches one ECG history record with waveform detail.
 *
 * @param {string} watchId watch id that owns the reading
 * @param {number|string} readingId ECG reading id
 * @returns {Promise<object>} ECG detail payload
 */
export const fetchEcgHistoryDetail = async (watchId, readingId) => {
  const response = await apiFetch(`/watch/${watchId}/ecg-history/${readingId}`);
  return parseJson(response, 'Failed to fetch ECG history detail');
};

/**
 * Deletes one ECG history record.
 *
 * @param {string} watchId watch id that owns the reading
 * @param {number|string} readingId ECG reading id
 * @returns {Promise<object>} delete result payload
 */
export const deleteEcgHistoryRecord = async (watchId, readingId) => {
  const response = await apiFetch(`/watch/${watchId}/ecg-history/${readingId}`, {
    method: 'DELETE',
  });
  return parseJson(response, 'Failed to delete ECG history record');
};

/**
 * Fetches detailed chart data for one metric and optional date.
 *
 * @param {string} watchId watch id to query
 * @param {string} metric frontend metric key
 * @param {string} [date] optional date in yyyy-MM-dd format
 * @returns {Promise<object>} metric detail payload
 */
export const fetchMetricDetail = async (watchId, metric, date) => {
  const query = new URLSearchParams({ metric });
  if (date) {
    query.set('date', date);
  }
  const response = await apiFetch(`/watch/${watchId}/metric-detail?${query.toString()}`);
  return parseJson(response, 'Failed to fetch metric detail');
};

/**
 * Fetches administrator dashboard statistics.
 *
 * @returns {Promise<object>} overview statistics payload
 */
export const fetchOverviewStats = async () => {
  const response = await apiFetch('/stats');
  return parseJson(response, 'Failed to fetch stats');
};

/**
 * Fetches residents visible to the current user.
 *
 * @returns {Promise<Array<object>>} resident list
 */
export const fetchElderlyResidents = async () => {
  const response = await apiFetch('/residents');
  return parseJson(response, 'Failed to fetch residents');
};

/**
 * Fetches daily health history for a resident.
 *
 * @param {number|string} residentId resident id
 * @param {number} days number of days to include
 * @returns {Promise<Array<object>>} daily health summaries
 */
export const fetchHealthData = async (residentId, days = 7) => {
  const response = await apiFetch(`/health/${residentId}?days=${days}`);
  return parseJson(response, 'Failed to fetch health data');
};

/**
 * Fetches recent alerts visible to the current user.
 *
 * @returns {Promise<Array<object>>} alert list
 */
export const fetchAlerts = async () => {
  const response = await apiFetch('/alerts');
  return parseJson(response, 'Failed to fetch alerts');
};

/**
 * Resolves all active alerts in the current access scope.
 *
 * @returns {Promise<object>} clear result payload
 */
export const clearAlerts = async () => {
  const response = await apiFetch('/alerts/clear', {
    method: 'POST',
  });
  return parseJson(response, 'Failed to clear alerts');
};

/**
 * Resolves one alert by id.
 *
 * @param {number|string} alertId alert id
 * @returns {Promise<object>} resolve result payload
 */
export const resolveAlert = async (alertId) => {
  const response = await apiFetch(`/alerts/${alertId}/resolve`, {
    method: 'POST',
  });
  return parseJson(response, 'Failed to resolve alert');
};

/**
 * Fetches active alerts created after a known alert id.
 *
 * @param {number} after last alert id already seen by the client
 * @returns {Promise<Array<object>>} newly-created active alerts
 */
export const fetchLatestAlerts = async (after = 0) => {
  const response = await apiFetch(`/alerts/latest?after=${after}`);
  return parseJson(response, 'Failed to fetch latest alerts');
};
