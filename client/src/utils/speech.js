import { languageInfo } from './languages.js';

/** Text-to-speech via the browser (Web Speech API) in the voice of the word's language. */

const voiceCache = new Map();

function pickVoice(language) {
  if (voiceCache.has(language)) return voiceCache.get(language);
  const voices = window.speechSynthesis?.getVoices() || [];
  const locale = languageInfo(language).tts;
  const prefix = locale.split('-')[0];
  const own = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(prefix));
  const exact = own.filter((v) => v.lang.replace('_', '-').toLowerCase() === locale.toLowerCase());
  const voice =
    exact.find((v) => /natural|online|google/i.test(v.name)) ||
    own.find((v) => /natural|online|google/i.test(v.name)) ||
    exact[0] ||
    own[0] ||
    null;
  if (voices.length) voiceCache.set(language, voice);
  return voice;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = () => voiceCache.clear();
}

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function speak(text, { rate = 0.9, onEnd, lang = 'en' } = {}) {
  if (!canSpeak() || !text) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = pickVoice(lang);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || languageInfo(lang).tts;
  utterance.rate = rate;
  if (onEnd) {
    utterance.onend = onEnd;
    utterance.onerror = onEnd;
  }
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}
