import { API_BASE_URL, apiFetch, extractErrorMessage } from './http';

const POSITION_UPDATE_EVENT = 'position-update';

const parseEventPayload = (rawData) => {
  if (!rawData) {
    return null;
  }

  try {
    return JSON.parse(rawData);
  } catch {
    return null;
  }
};

/**
 * Fetches the latest indoor position snapshot.
 *
 * @returns {Promise<object>} latest indoor position payload
 */
export const fetchLatestIndoorPosition = async () => {
  const response = await apiFetch('/position/latest');
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to fetch indoor position'));
  }
  return response.json();
};

/**
 * Opens an SSE stream for indoor position updates.
 *
 * @param {string} token session token used as access_token query parameter
 * @param {object} callbacks stream callbacks
 * @param {(payload: object) => void} callbacks.onUpdate called for each position update
 * @param {() => void} callbacks.onError called when the stream reports an error
 * @returns {() => void} cleanup function that closes the stream
 */
export const openIndoorPositionStream = (token, { onUpdate, onError } = {}) => {
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined' || !token) {
    return () => {};
  }

  const query = new URLSearchParams({ access_token: token });
  const stream = new window.EventSource(`${API_BASE_URL}/stream/position-updates?${query.toString()}`);

  const handleUpdate = (event) => {
    const payload = parseEventPayload(event.data);
    if (payload) {
      onUpdate?.(payload);
    }
  };

  const handleError = () => {
    onError?.();
  };

  stream.addEventListener(POSITION_UPDATE_EVENT, handleUpdate);
  stream.onerror = handleError;

  return () => {
    stream.removeEventListener(POSITION_UPDATE_EVENT, handleUpdate);
    stream.close();
  };
};
