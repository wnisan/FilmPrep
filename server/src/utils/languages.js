/**
 * Languages a learner can study. `adj` is the Russian adjective ("английский"),
 * cases are derived from it for LLM prompts ("изучения английского", "на английском").
 */
export const LANGUAGES = {
  en: { adj: 'английский', english: 'English' },
  es: { adj: 'испанский', english: 'Spanish' },
  fr: { adj: 'французский', english: 'French' },
  de: { adj: 'немецкий', english: 'German' },
  it: { adj: 'итальянский', english: 'Italian' },
  pt: { adj: 'португальский', english: 'Portuguese' },
  nl: { adj: 'нидерландский', english: 'Dutch' },
  sv: { adj: 'шведский', english: 'Swedish' },
  no: { adj: 'норвежский', english: 'Norwegian' },
  da: { adj: 'датский', english: 'Danish' },
  fi: { adj: 'финский', english: 'Finnish' },
  pl: { adj: 'польский', english: 'Polish' },
  cs: { adj: 'чешский', english: 'Czech' },
  uk: { adj: 'украинский', english: 'Ukrainian' },
  el: { adj: 'греческий', english: 'Greek' },
  tr: { adj: 'турецкий', english: 'Turkish' },
  ar: { adj: 'арабский', english: 'Arabic' },
  ja: { adj: 'японский', english: 'Japanese' },
  ko: { adj: 'корейский', english: 'Korean' },
  zh: { adj: 'китайский', english: 'Chinese' },
};

export const LANGUAGE_CODES = Object.keys(LANGUAGES);
export const DEFAULT_LANGUAGE = 'en';
export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

export function isLanguage(code) {
  return Object.hasOwn(LANGUAGES, code);
}

export function normalizeLanguage(code, fallback = DEFAULT_LANGUAGE) {
  const value = String(code || '').toLowerCase();
  return isLanguage(value) ? value : fallback;
}

/** Russian name in a case: nom "английский", gen "английского", prep "английском". */
export function languageRu(code, grammaticalCase = 'nom') {
  const adj = LANGUAGES[code]?.adj || 'иностранный';
  if (grammaticalCase === 'gen') return adj.replace(/ий$/, 'ого');
  if (grammaticalCase === 'prep') return adj.replace(/ий$/, 'ом');
  return adj;
}

export function languageEnglish(code) {
  return LANGUAGES[code]?.english || 'foreign';
}

/** Languages without spaces between words. */
export function isUnspacedLanguage(code) {
  return code === 'ja' || code === 'zh';
}

/** [{ code, level }] with known codes only, no duplicates, max 8. */
export function sanitizeLearningLanguages(list) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const code = String(item?.code || '').toLowerCase();
    if (!isLanguage(code) || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, level: CEFR_LEVELS.includes(item?.level) ? item.level : null });
    if (out.length >= 8) break;
  }
  return out;
}
