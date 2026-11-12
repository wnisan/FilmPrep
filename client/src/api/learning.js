import { apiRequest } from './client.js';

const json = (method, body) => ({ method, body: JSON.stringify(body ?? {}) });

// ---- daily goal ------------------------------------------------------------

export function fetchGoal() {
  return apiRequest('/me/goal');
}

export function updateGoal(payload) {
  return apiRequest('/me/goal', json('PATCH', payload));
}

// ---- personal dictionary ---------------------------------------------------

export function fetchDictionary({ language } = {}) {
  return apiRequest(`/me/dictionary${language ? `?language=${encodeURIComponent(language)}` : ''}`);
}

export function saveWord(payload) {
  return apiRequest('/me/dictionary', json('POST', payload));
}

export function updateWord(id, payload) {
  return apiRequest(`/me/dictionary/${id}`, json('PATCH', payload));
}

export function deleteWord(id, kind = 'saved') {
  return apiRequest(`/me/dictionary/${id}${kind === 'learned' ? '?kind=learned' : ''}`, { method: 'DELETE' });
}

export function browseWords(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  });
  const qs = query.toString();
  return apiRequest(`/me/dictionary/browse${qs ? `?${qs}` : ''}`);
}

export function translateWord(payload) {
  return apiRequest('/me/dictionary/translate', json('POST', payload));
}

// ---- recommendations -------------------------------------------------------

export function fetchRecommendations({ limit } = {}) {
  return apiRequest(`/me/recommendations${limit ? `?limit=${limit}` : ''}`);
}

export function fetchSimilar(mediaId) {
  return apiRequest(`/media/${mediaId}/similar`);
}
