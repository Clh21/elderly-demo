import { API_BASE_URL, extractErrorMessage, httpFetch } from './http';

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