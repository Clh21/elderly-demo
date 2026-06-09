import { apiFetch, extractErrorMessage } from './http';

const parseJson = async (response, fallbackMessage) => {
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
  return response.json();
};

/**
 * Fetches the active indoor layout used by 2D and 3D positioning views.
 *
 * @returns {Promise<object>} active indoor layout
 */
export const fetchActiveIndoorLayout = async () => {
  const response = await apiFetch('/indoor-layout/active');
  return parseJson(response, 'Failed to fetch indoor layout');
};

/**
 * Saves the active indoor layout.
 *
 * @param {object} layout layout payload from the editor
 * @returns {Promise<object>} saved layout
 */
export const saveActiveIndoorLayout = async (layout) => {
  const response = await apiFetch('/indoor-layout/active', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(layout),
  });
  return parseJson(response, 'Failed to save indoor layout');
};

/**
 * Resets the active indoor layout to the backend demo default.
 *
 * @returns {Promise<object>} reset layout
 */
export const resetActiveIndoorLayout = async () => {
  const response = await apiFetch('/indoor-layout/active/reset', {
    method: 'POST',
  });
  return parseJson(response, 'Failed to reset indoor layout');
};

/**
 * Fetches the backend indoor positioning simulator status.
 *
 * @returns {Promise<object>} simulator status
 */
export const fetchIndoorSimulatorStatus = async () => {
  const response = await apiFetch('/indoor-layout/simulator');
  return parseJson(response, 'Failed to fetch indoor simulator status');
};

/**
 * Enables or disables the backend indoor positioning simulator.
 *
 * @param {boolean} enabled whether simulated positioning should be enabled
 * @returns {Promise<object>} updated simulator status
 */
export const updateIndoorSimulatorStatus = async (enabled) => {
  const response = await apiFetch('/indoor-layout/simulator', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ enabled }),
  });
  return parseJson(response, 'Failed to update indoor simulator status');
};
