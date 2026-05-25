import { apiFetch, extractErrorMessage } from './http';

const parseJson = async (response, fallbackMessage) => {
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, fallbackMessage));
  }
  return response.json();
};

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

export const fetchWatchPairingServerTarget = async () => {
  const response = await apiFetch('/watch-pairing/server-target');
  return parseJson(response, 'Failed to fetch server pairing target');
};
