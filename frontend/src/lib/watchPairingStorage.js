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

/**
 * Reads the latest stored pairing result for a watch id.
 *
 * @param {string} watchId watch id used as the storage key
 * @returns {object|null} stored pairing record, or null when none exists
 */
export const readPairingResult = (watchId) => {
  if (!watchId) {
    return null;
  }
  return readAllPairingResults()[watchId] || null;
};

/**
 * Persists the latest pairing result for a watch id.
 *
 * @param {string} watchId watch id used as the storage key
 * @param {object} result backend pairing response
 * @param {object} requestPayload pairing request payload sent by the dashboard
 * @returns {object|null} saved storage record, or null when watchId is missing
 */
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
