import { apiFetch, extractErrorMessage } from './http';

const parseJson = async (response, fallbackMessage) => {
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
  return response.json();
};

export const fetchActiveIndoorLayout = async () => {
  const response = await apiFetch('/indoor-layout/active');
  return parseJson(response, 'Failed to fetch indoor layout');
};

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

export const resetActiveIndoorLayout = async () => {
  const response = await apiFetch('/indoor-layout/active/reset', {
    method: 'POST',
  });
  return parseJson(response, 'Failed to reset indoor layout');
};

export const fetchIndoorSimulatorStatus = async () => {
  const response = await apiFetch('/indoor-layout/simulator');
  return parseJson(response, 'Failed to fetch indoor simulator status');
};

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
