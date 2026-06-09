import { API_BASE_URL } from './http';

const WATCH_UPDATE_EVENT = 'watch-update';

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
 * Opens an SSE stream for watch reading updates.
 *
 * @param {string} token session token used as access_token query parameter
 * @param {object} callbacks stream callbacks
 * @param {(payload: object) => void} callbacks.onUpdate called for each watch update
 * @param {() => void} callbacks.onError called when the stream reports an error
 * @returns {() => void} cleanup function that closes the stream
 */
export const openWatchUpdatesStream = (token, { onUpdate, onError } = {}) => {
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined' || !token) {
    return () => {};
  }

  const query = new URLSearchParams({ access_token: token });
  const stream = new window.EventSource(`${API_BASE_URL}/stream/watch-updates?${query.toString()}`);

  const handleUpdate = (event) => {
    const payload = parseEventPayload(event.data);
    if (payload) {
      onUpdate?.(payload);
    }
  };

  const handleError = () => {
    onError?.();
  };

  stream.addEventListener(WATCH_UPDATE_EVENT, handleUpdate);
  stream.onerror = handleError;

  return () => {
    stream.removeEventListener(WATCH_UPDATE_EVENT, handleUpdate);
    stream.close();
  };
};
