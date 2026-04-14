import { API_BASE_URL, apiFetch, extractErrorMessage } from './http';

const POSITION_UPDATE_EVENT = 'position-update';
const POSITION_STATUS_EVENT = 'position-status';

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

export const fetchIndoorPositioningStatus = async () => {
  const response = await apiFetch('/position/status');
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to fetch indoor positioning status'));
  }
  return response.json();
};

export const openIndoorPositionStream = (token, { onUpdate, onStatus, onError } = {}) => {
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

  const handleStatus = (event) => {
    const payload = parseEventPayload(event.data);
    if (!payload) {
      return;
    }

    onStatus?.(payload);

    if (payload.available === false) {
      stream.close();
    }
  };

  const handleError = () => {
    onError?.();
  };

  stream.addEventListener(POSITION_UPDATE_EVENT, handleUpdate);
  stream.addEventListener(POSITION_STATUS_EVENT, handleStatus);
  stream.onerror = handleError;

  return () => {
    stream.removeEventListener(POSITION_UPDATE_EVENT, handleUpdate);
    stream.removeEventListener(POSITION_STATUS_EVENT, handleStatus);
    stream.close();
  };
};
