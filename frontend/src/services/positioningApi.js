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

export const fetchLatestIndoorPosition = async () => {
  const response = await apiFetch('/position/latest');
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to fetch indoor position'));
  }
  return response.json();
};

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
