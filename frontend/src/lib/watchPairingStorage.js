const STORAGE_KEY = 'elderlycare-watch-pairing-results-v1';

const readAllPairingResults = () => {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const writeAllPairingResults = (results) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(results));
};

export const readPairingResult = (watchId) => {
  if (!watchId) {
    return null;
  }
  return readAllPairingResults()[watchId] || null;
};

export const savePairingResult = (watchId, result, requestPayload) => {
  if (!watchId) {
    return null;
  }

  const record = {
    watchId,
    result,
    requestPayload,
    savedAt: new Date().toISOString(),
  };
  writeAllPairingResults({
    ...readAllPairingResults(),
    [watchId]: record,
  });
  return record;
};
