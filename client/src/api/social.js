import { apiRequest } from './client.js';

const json = (method, body) => ({ method, body: JSON.stringify(body ?? {}) });

// ---- profiles --------------------------------------------------------------

export function fetchProfile(username) {
  return apiRequest(`/users/${encodeURIComponent(username)}`);
}

export function fetchMyProfile() {
  return apiRequest('/me/profile');
}

export function updateProfile(payload) {
  return apiRequest('/me/profile', json('PATCH', payload));
}

/** payload: { languages?: [{ code, level }], active?: code } */
export function updateLanguages(payload) {
  return apiRequest('/me/languages', json('PUT', payload));
}

export function changePassword(payload) {
  return apiRequest('/me/password', json('PUT', payload));
}

export function deleteAccount(payload) {
  return apiRequest('/me/delete-account', json('POST', payload));
}

export function uploadAvatar(blob, filename = 'avatar.jpg') {
  const form = new FormData();
  form.append('file', blob, filename);
  return apiRequest('/me/avatar', { method: 'PUT', body: form });
}

export function removeAvatar() {
  return apiRequest('/me/avatar', { method: 'DELETE' });
}

export function fetchLeaderboard() {
  return apiRequest('/users/leaderboard');
}

// ---- film: rating, favorites, comments -------------------------------------

export function fetchMediaSocial(mediaId) {
  return apiRequest(`/media/${mediaId}/social`);
}

export function rateMedia(mediaId, stars) {
  return apiRequest(`/media/${mediaId}/rating`, json('PUT', { stars }));
}

export function unrateMedia(mediaId) {
  return apiRequest(`/media/${mediaId}/rating`, { method: 'DELETE' });
}

export function setFavorite(mediaId, on) {
  return apiRequest(`/media/${mediaId}/favorite`, { method: on ? 'PUT' : 'DELETE' });
}

export function fetchComments(mediaId) {
  return apiRequest(`/media/${mediaId}/comments`);
}

export function postComment(mediaId, body, parentId = null) {
  return apiRequest(`/media/${mediaId}/comments`, json('POST', { body, parentId }));
}

export function editComment(commentId, body) {
  return apiRequest(`/comments/${commentId}`, json('PATCH', { body }));
}

export function deleteComment(commentId) {
  return apiRequest(`/comments/${commentId}`, { method: 'DELETE' });
}
