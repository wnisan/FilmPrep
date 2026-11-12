import { apiRequest, getAccessToken, refreshAccessToken } from './client.js';
import { toRussianMessage } from './errors.js';

export function fetchMediaList(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return apiRequest(`/media${qs ? `?${qs}` : ''}`);
}

export function fetchMediaFilters() {
  return apiRequest('/media/filters');
}

export function fetchMediaById(id) {
  return apiRequest(`/media/${id}`);
}

export function fetchLexicon(mediaId, level) {
  const qs = level ? `?level=${encodeURIComponent(level)}` : '';
  return apiRequest(`/media/${mediaId}/lexicon${qs}`);
}

export function fetchPhrases(mediaId) {
  return apiRequest(`/media/${mediaId}/phrases`);
}

export function fetchGrammar(mediaId) {
  return apiRequest(`/media/${mediaId}/grammar`);
}

export function fetchAdminMediaList(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });
  const qs = query.toString();
  return apiRequest(`/admin/media${qs ? `?${qs}` : ''}`);
}

export function fetchAdminMedia(id) {
  return apiRequest(`/admin/media/${id}`);
}

export function createAdminMedia(payload) {
  return apiRequest('/admin/media', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAdminMedia(id, payload) {
  return apiRequest(`/admin/media/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function deleteAdminMedia(id) {
  return apiRequest(`/admin/media/${id}`, { method: 'DELETE' });
}

export async function uploadSubtitle(mediaId, file, language) {
  const form = new FormData();
  if (language) form.append('language', language);
  form.append('file', file);
  return apiRequest(`/admin/media/${mediaId}/subtitles`, {
    method: 'POST',
    body: form,
  });
}

function sendUpload(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/v1${path}`);
    xhr.withCredentials = true;
    const token = getAccessToken();
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        data = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }
      const error = new Error(toRussianMessage(data?.error?.code, data?.error?.message));
      error.status = xhr.status;
      reject(error);
    };
    xhr.onerror = () => reject(new Error('Соединение прервалось во время загрузки'));
    xhr.send(form);
  });
}

/** Large files: XHR for upload progress; refreshes the token once on 401. */
export async function uploadWithProgress(path, form, onProgress) {
  try {
    return await sendUpload(path, form, onProgress);
  } catch (err) {
    if (err.status !== 401) throw err;
    await refreshAccessToken();
    return sendUpload(path, form, onProgress);
  }
}

export function uploadVideo(mediaId, file, onProgress) {
  const form = new FormData();
  form.append('file', file);
  return uploadWithProgress(`/admin/media/${mediaId}/video`, form, onProgress);
}

export function uploadAdminPoster(mediaId, file) {
  const form = new FormData();
  form.append('file', file);
  return apiRequest(`/admin/media/${mediaId}/poster`, { method: 'PUT', body: form });
}

export function removeAdminPoster(mediaId) {
  return apiRequest(`/admin/media/${mediaId}/poster`, { method: 'DELETE' });
}

export function removeAdminVideo(mediaId) {
  return apiRequest(`/admin/media/${mediaId}/video`, { method: 'DELETE' });
}

export function fetchStorageInfo() {
  return apiRequest('/admin/storage');
}

export function fetchYandexDiskVideos() {
  return apiRequest('/admin/yadisk/videos');
}

export function importVideoFromYandexDisk(mediaId, { path, publicUrl }) {
  return apiRequest(`/admin/media/${mediaId}/video/yadisk`, {
    method: 'POST',
    body: JSON.stringify({ path, publicUrl }),
  });
}

export function startSubtitleTranslation(mediaId) {
  return apiRequest(`/admin/media/${mediaId}/subtitles/translate`, { method: 'POST', body: '{}' });
}

export function fetchSubtitleTranslation(mediaId) {
  return apiRequest(`/admin/media/${mediaId}/subtitles/translate`);
}

export function fetchSubtitleTracks(mediaId) {
  return apiRequest(`/media/${mediaId}/subtitle-tracks`);
}

export function fetchSubtitleCues(mediaId, subtitleId) {
  return apiRequest(`/media/${mediaId}/subtitle-tracks/${subtitleId}`);
}

export function processMedia(mediaId, { regenerateQuiz = false } = {}) {
  return apiRequest(`/admin/media/${mediaId}/process`, {
    method: 'POST',
    body: JSON.stringify({ regenerateQuiz }),
  });
}

export function fetchPrepStatus(mediaId) {
  return apiRequest(`/admin/media/${mediaId}/process`);
}

export function fetchAdminJobs(mediaId) {
  const qs = mediaId ? `?mediaId=${encodeURIComponent(mediaId)}` : '';
  return apiRequest(`/admin/jobs${qs}`);
}

export function fetchAdminSubtitles(mediaId) {
  return apiRequest(`/admin/media/${mediaId}/subtitles`);
}

export function fetchQuiz(mediaId) {
  return apiRequest(`/media/${mediaId}/quiz`);
}

export function submitQuizAttempt(mediaId, answers) {
  return apiRequest(`/media/${mediaId}/quiz/attempts`, {
    method: 'POST',
    body: JSON.stringify({ answers }),
  });
}

export function askFilmChat(mediaId, { messages, quote }) {
  return apiRequest(`/media/${mediaId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ messages, quote: quote || null }),
  });
}

export function fetchPracticeScene(mediaId, exclude) {
  const qs = exclude != null ? `?exclude=${exclude}` : '';
  return apiRequest(`/media/${mediaId}/practice/scene${qs}`);
}

export function checkRetell(mediaId, start, text) {
  return apiRequest(`/media/${mediaId}/practice/retell`, {
    method: 'POST',
    body: JSON.stringify({ start, text }),
  });
}

export function markMaterialsOpened(mediaId) {
  return apiRequest(`/media/${mediaId}/materials-opened`, {
    method: 'POST',
    body: '{}',
  });
}

export function fetchMyProgress() {
  return apiRequest('/me/progress');
}

export function updateMyProfile(payload) {
  return apiRequest('/me/profile', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function fetchLearnedEntries(mediaId) {
  return apiRequest(`/media/${mediaId}/lexicon-learned`);
}

export function fetchLearnedGrammar(mediaId) {
  return apiRequest(`/media/${mediaId}/grammar-learned`);
}

export function setGrammarLearned(mediaId, patternIds, learned) {
  return apiRequest(`/media/${mediaId}/grammar-learned`, {
    method: 'PUT',
    body: JSON.stringify({ patternIds, learned }),
  });
}

export function fetchMyGrammar() {
  return apiRequest('/me/grammar');
}

export function removeMyGrammar(patternIds) {
  return apiRequest('/me/grammar/remove', { method: 'POST', body: JSON.stringify({ patternIds }) });
}

export function fetchGrammarExercises(patternIds) {
  return apiRequest('/me/grammar/exercises', { method: 'POST', body: JSON.stringify({ patternIds }) });
}

export function setEntryLearned(mediaId, entryId, learned) {
  return apiRequest(`/media/${mediaId}/lexicon-learned/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify({ learned }),
  });
}

export function saveLexiconProgress(mediaId, learnedCount) {
  return apiRequest(`/media/${mediaId}/lexicon-progress`, {
    method: 'POST',
    body: JSON.stringify({ learnedCount }),
  });
}

export function fetchAdminQuiz(mediaId) {
  return apiRequest(`/admin/media/${mediaId}/quiz`);
}

export function saveAdminQuiz(mediaId, payload) {
  return apiRequest(`/admin/media/${mediaId}/quiz`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}
