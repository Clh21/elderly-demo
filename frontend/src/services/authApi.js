import { API_BASE_URL, extractErrorMessage, httpFetch } from './http';

/**
 * Logs in with username and password.
 *
 * @param {string} username account username
 * @param {string} password account password
 * @returns {Promise<object>} login response containing token and user profile
 */
export const loginWithCredentials = async (username, password) => {
  const response = await httpFetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password }),
  }, { dispatchUnauthorized: false });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Login failed'));
  }

  return response.json();
};

/**
 * Restores the authenticated user from an existing token.
 *
 * @param {string} token session token
 * @returns {Promise<object>} current user profile
 */
export const fetchCurrentUser = async (token) => {
  const response = await httpFetch(`${API_BASE_URL}/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Failed to restore session'));
  }

  return response.json();
};

/**
 * Logs out the backend session represented by a token.
 *
 * @param {string} token session token
 * @returns {Promise<object>} logout result
 */
export const logoutSession = async (token) => {
  const response = await httpFetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response, 'Logout failed'));
  }

  return response.json();
};
