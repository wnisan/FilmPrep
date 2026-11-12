import { apiRequest, clearAccessToken, setAccessToken } from './client.js';

export async function registerUser(payload) {
  const data = await apiRequest('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setAccessToken(data.accessToken);
  return data.user;
}

export async function loginUser(payload) {
  const data = await apiRequest('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  setAccessToken(data.accessToken);
  return data.user;
}

export async function logoutUser() {
  try {
    await apiRequest('/auth/logout', { method: 'POST', body: '{}' });
  } finally {
    clearAccessToken();
  }
}

export async function fetchMe() {
  const data = await apiRequest('/auth/me');
  return data.user;
}
