import { toRussianMessage } from './errors.js';

const ACCESS_TOKEN_KEY = 'filmprep_access_token';

/** Чтобы параллельные 401 не дергали /refresh много раз сразу. */
let refreshInFlight = null;

export function getAccessToken() {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token) {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
}

/**
 * Обновляет access JWT по httpOnly refresh cookie.
 * @returns {Promise<{ accessToken: string, user: object }>}
 */
export async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const response = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      clearAccessToken();
      const code = data?.error?.code || 'UNAUTHORIZED';
      const error = new Error(toRussianMessage(code, data?.error?.message));
      error.status = response.status;
      error.code = code;
      throw error;
    }

    setAccessToken(data.accessToken);
    return data;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

function shouldAttemptRefresh(path, options) {
  if (options._retry) return false;
  if (options.skipRefresh) return false;
  // Не рефрешим сами auth-эндпоинты входа/обновления
  if (
    path.startsWith('/auth/login') ||
    path.startsWith('/auth/register') ||
    path.startsWith('/auth/refresh') ||
    path.startsWith('/auth/logout')
  ) {
    return false;
  }
  return true;
}

/**
 * Общий fetch к API с credentials (refresh cookie) и Bearer access token.
 * При 401 один раз пробует refresh и повторяет запрос.
 */
export async function apiRequest(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`/api/v1${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && shouldAttemptRefresh(path, options)) {
    try {
      await refreshAccessToken();
      return apiRequest(path, { ...options, _retry: true });
    } catch (refreshError) {
      clearAccessToken();
      const error = new Error(refreshError.message || toRussianMessage('UNAUTHORIZED'));
      error.status = 401;
      error.code = refreshError.code || 'UNAUTHORIZED';
      throw error;
    }
  }

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const code = data?.error?.code;
    const error = new Error(toRussianMessage(code, data?.error?.message));
    error.status = response.status;
    error.code = code;
    throw error;
  }

  return data;
}
