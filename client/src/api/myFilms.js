import { apiRequest } from './client.js';
import { uploadWithProgress } from './media.js';

export function fetchMyFilms() {
  return apiRequest('/me/films');
}

export function fetchMyFilm(id) {
  return apiRequest(`/me/films/${id}`);
}

export function createMyFilm(payload) {
  return apiRequest('/me/films', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateMyFilm(id, payload) {
  return apiRequest(`/me/films/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteMyFilm(id) {
  return apiRequest(`/me/films/${id}`, { method: 'DELETE' });
}

export function uploadMyFilmVideo(id, file, onProgress) {
  const form = new FormData();
  form.append('file', file);
  return uploadWithProgress(`/me/films/${id}/video`, form, onProgress);
}

export function setMyFilmVideoLink(id, url) {
  return apiRequest(`/me/films/${id}/video-link`, { method: 'PUT', body: JSON.stringify({ url }) });
}

export function removeMyFilmVideo(id) {
  return apiRequest(`/me/films/${id}/video`, { method: 'DELETE' });
}

export function uploadMyFilmSubtitle(id, file, language) {
  const form = new FormData();
  form.append('language', language);
  form.append('file', file);
  return apiRequest(`/me/films/${id}/subtitles`, { method: 'POST', body: form });
}

/** role: "original" | "ru" */
export function removeMyFilmSubtitles(id, role) {
  return apiRequest(`/me/films/${id}/subtitles/${role}`, { method: 'DELETE' });
}

export function translateMyFilmSubtitles(id) {
  return apiRequest(`/me/films/${id}/subtitles/translate`, { method: 'POST' });
}

export function uploadMyFilmPoster(id, file) {
  const form = new FormData();
  form.append('file', file);
  return apiRequest(`/me/films/${id}/poster`, { method: 'PUT', body: form });
}

export function removeMyFilmPoster(id) {
  return apiRequest(`/me/films/${id}/poster`, { method: 'DELETE' });
}

export function searchMyFilmPosters(id, q) {
  return apiRequest(`/me/films/${id}/poster-search${q ? `?q=${encodeURIComponent(q)}` : ''}`);
}

export function prepareMyFilm(id, { translate = true } = {}) {
  return apiRequest(`/me/films/${id}/prepare`, { method: 'POST', body: JSON.stringify({ translate }) });
}
