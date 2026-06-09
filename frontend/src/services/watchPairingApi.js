import { apiFetch, extractErrorMessage } from './http';

const parseJson = async (response, fallbackMessage) => {
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
  return response.json();
};

/**
 * Sends watch pairing configuration to the backend.
 *
 * @param {object} payload pairing configuration payload
 * @returns {Promise<object>} pairing configuration result
 */
export const configureWatchPairing = async (payload) => {
  const response = await apiFetch('/watch-pairing/configure', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseJson(response, 'Failed to configure watch');
};

/**
 * Fetches the server target that should be displayed to the watch app.
 *
 * @returns {Promise<object>} server target payload
 */
export const fetchWatchPairingServerTarget = async () => {
  const response = await apiFetch('/watch-pairing/server-target');
  return parseJson(response, 'Failed to fetch server pairing target');
};
