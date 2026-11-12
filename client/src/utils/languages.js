/**
 * Study languages: Russian name, flag (ISO country for flag-icons) and the voice
 * locale for text-to-speech. Keep codes in sync with server/src/utils/languages.js.
 */
export const LANGUAGES = [
  { code: 'en', name: 'Английский', native: 'English', flag: 'gb', tts: 'en-US' },
  { code: 'es', name: 'Испанский', native: 'Español', flag: 'es', tts: 'es-ES' },
  { code: 'fr', name: 'Французский', native: 'Français', flag: 'fr', tts: 'fr-FR' },
  { code: 'de', name: 'Немецкий', native: 'Deutsch', flag: 'de', tts: 'de-DE' },
  { code: 'it', name: 'Итальянский', native: 'Italiano', flag: 'it', tts: 'it-IT' },
  { code: 'pt', name: 'Португальский', native: 'Português', flag: 'pt', tts: 'pt-PT' },
  { code: 'nl', name: 'Нидерландский', native: 'Nederlands', flag: 'nl', tts: 'nl-NL' },
  { code: 'sv', name: 'Шведский', native: 'Svenska', flag: 'se', tts: 'sv-SE' },
  { code: 'no', name: 'Норвежский', native: 'Norsk', flag: 'no', tts: 'nb-NO' },
  { code: 'da', name: 'Датский', native: 'Dansk', flag: 'dk', tts: 'da-DK' },
  { code: 'fi', name: 'Финский', native: 'Suomi', flag: 'fi', tts: 'fi-FI' },
  { code: 'pl', name: 'Польский', native: 'Polski', flag: 'pl', tts: 'pl-PL' },
  { code: 'cs', name: 'Чешский', native: 'Čeština', flag: 'cz', tts: 'cs-CZ' },
  { code: 'uk', name: 'Украинский', native: 'Українська', flag: 'ua', tts: 'uk-UA' },
  { code: 'el', name: 'Греческий', native: 'Ελληνικά', flag: 'gr', tts: 'el-GR' },
  { code: 'tr', name: 'Турецкий', native: 'Türkçe', flag: 'tr', tts: 'tr-TR' },
  { code: 'ar', name: 'Арабский', native: 'العربية', flag: 'sa', tts: 'ar-SA' },
  { code: 'ja', name: 'Японский', native: '日本語', flag: 'jp', tts: 'ja-JP' },
  { code: 'ko', name: 'Корейский', native: '한국어', flag: 'kr', tts: 'ko-KR' },
  { code: 'zh', name: 'Китайский', native: '中文', flag: 'cn', tts: 'zh-CN' },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export function languageInfo(code) {
  return BY_CODE.get(code) || BY_CODE.get('en');
}

export const languageName = (code) => languageInfo(code).name;

/** "английском" — for phrases like «фильмы на испанском». */
export function languagePrep(code) {
  return languageName(code).toLowerCase().replace(/ий$/, 'ом');
}

/** "английского" — for «уровень испанского». */
export function languageGen(code) {
  return languageName(code).toLowerCase().replace(/ий$/, 'ого');
}

export const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** The learner's studied languages (old accounts: English with their level). */
export function userLanguages(user) {
  if (user?.learningLanguages?.length) return user.learningLanguages;
  return [{ code: 'en', level: user?.cefrLevel ?? null }];
}

export function activeLanguageOf(user) {
  const list = userLanguages(user);
  return list.some((l) => l.code === user?.activeLanguage) ? user.activeLanguage : list[0].code;
}

export function levelFor(user, code) {
  return userLanguages(user).find((l) => l.code === code)?.level ?? null;
}
