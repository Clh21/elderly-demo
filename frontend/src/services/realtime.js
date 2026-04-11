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