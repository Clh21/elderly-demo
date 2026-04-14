export const API_BASE_URL = 'http://localhost:3100/api';
export const SESSION_STORAGE_KEY = 'elderlycare-session';
export const UNAUTHORIZED_EVENT = 'elderlycare:unauthorized';
export const REQUEST_ID_HEADER = 'X-Request-Id';

const HTTP_LOG_STORAGE_KEY = 'elderlycare-http-logs';
const HTTP_LOG_MAX_LENGTH = 4000;

export const readStoredSession = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const writeStoredSession = (session) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
};

export const clearStoredSession = () => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
};

const isHttpLoggingEnabled = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(HTTP_LOG_STORAGE_KEY) !== 'false';
};

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `req-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
};

const truncateForLogging = (value) => {
  if (value == null) {
    return null;
  }

  const stringValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (stringValue.length <= HTTP_LOG_MAX_LENGTH) {
    return stringValue;
  }

  return `${stringValue.slice(0, HTTP_LOG_MAX_LENGTH)}... [truncated]`;
};

const serializeHeaders = (headers) => {
  const result = {};
  for (const [key, value] of new Headers(headers).entries()) {
    result[key] = key.toLowerCase() === 'authorization' ? 'Bearer [redacted]' : value;
  }
  return result;
};

const serializeBody = (body) => {
  if (body == null) {
    return null;
  }

  if (typeof body === 'string') {
    return truncateForLogging(body);
  }

  if (body instanceof URLSearchParams) {
    return truncateForLogging(body.toString());
  }

  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    const entries = {};
    for (const [key, value] of body.entries()) {
      entries[key] = typeof File !== 'undefined' && value instanceof File ? `[File:${value.name}]` : value;
    }
    return truncateForLogging(entries);
  }

  return truncateForLogging(body);
};

const parseLoggedResponseBody = async (response) => {
  try {
    const text = await response.clone().text();
    if (!text) {
      return null;
    }

    try {
      return truncateForLogging(JSON.parse(text));
    } catch {
      return truncateForLogging(text);
    }
  } catch {
    return '[unavailable]';
  }
};

export const httpFetch = async (url, options = {}, { dispatchUnauthorized = true } = {}) => {
  const headers = new Headers(options.headers || {});

  if (!headers.has(REQUEST_ID_HEADER)) {
    headers.set(REQUEST_ID_HEADER, createRequestId());
  }

  const requestId = headers.get(REQUEST_ID_HEADER);
  const method = (options.method || 'GET').toUpperCase();
  const loggingEnabled = isHttpLoggingEnabled();

  if (loggingEnabled) {
    console.groupCollapsed(`[HTTP][${requestId}] ${method} ${url}`);
    console.log('Request headers:', serializeHeaders(headers));

    const requestBody = serializeBody(options.body);
    if (requestBody) {
      console.log('Request body:', requestBody);
    }
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (loggingEnabled) {
      console.log('Response status:', response.status, response.statusText);
      console.log('Response headers:', serializeHeaders(response.headers));

      const responseBody = await parseLoggedResponseBody(response);
      if (responseBody) {
        console.log('Response body:', responseBody);
      }

      console.groupEnd();
    }

    if (dispatchUnauthorized && response.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }

    return response;
  } catch (error) {
    if (loggingEnabled) {
      console.error('Request failed:', error);
      console.groupEnd();
    }
    throw error;
  }
};

export const apiFetch = async (path, options = {}) => {
  const session = readStoredSession();
  const headers = new Headers(options.headers || {});

  if (session?.token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  return httpFetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });
};

export const extractErrorMessage = async (response, fallbackMessage) => {
  try {
    const payload = await response.json();
    return payload?.error || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
};