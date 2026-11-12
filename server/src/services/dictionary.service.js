import { z } from 'zod';
import { config } from '../config/index.js';
import { dictionaryRepository } from '../repositories/dictionary.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { chatJson, markInteractiveLlm } from './llm.service.js';
import { mediaRepository } from '../repositories/media.repository.js';
import { usersRepository } from '../repositories/users.repository.js';
import { LANGUAGE_CODES, languageRu, normalizeLanguage } from '../utils/languages.js';

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const languageField = z.enum(LANGUAGE_CODES).optional();

/** Language of a word: its film, then the explicit value, then the learner's active language. */
async function resolveLanguage(userId, { mediaId, language } = {}) {
  if (mediaId) {
    const media = await mediaRepository.findById(mediaId);
    if (media) return normalizeLanguage(media.language);
  }
  if (language) return language;
  const user = await usersRepository.findById(userId);
  return normalizeLanguage(user?.active_language);
}

const wordField = z
  .string()
  .trim()
  .min(1, 'Слово пустое')
  .max(80, 'Слово — до 80 символов');

const saveSchema = z.object({
  word: wordField,
  translation: z.string().trim().max(300).nullable().optional(),
  context: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  mediaId: z.string().uuid().nullable().optional(),
  lexiconEntryId: z.string().uuid().nullable().optional(),
  timestampMs: z.number().int().min(0).nullable().optional(),
  source: z.enum(['subtitle', 'lexicon', 'manual']).optional().default('manual'),
  language: languageField,
});

const updateSchema = z.object({
  translation: z.string().trim().max(300).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});

const translateSchema = z.object({
  word: wordField,
  context: z.string().trim().max(500).optional(),
  mediaId: z.string().uuid().optional(),
  language: languageField,
});

const listSchema = z.object({
  language: languageField,
});

const browseSchema = z.object({
  q: z.string().trim().max(80).optional(),
  level: z.enum(CEFR).optional(),
  language: languageField,
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
});

function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw createHttpError(400, 'VALIDATION_ERROR', result.error.issues[0]?.message || 'Invalid input');
  }
  return result.data;
}

/** "Don't," → "don't", "¡Hola!" → "hola"; keeps inner apostrophes and hyphens. */
export function wordKey(word, language = 'en') {
  return String(word)
    .toLocaleLowerCase(language)
    .replace(/[’`]/g, "'")
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();
}

const ELISIONS = {
  fr: /^(?:l|d|j|m|n|s|t|c|qu|jusqu|lorsqu|puisqu)'/u,
  it: /^(?:l|d|un|dell|all|dall|nell|sull|c|m|t|s|v)'/u,
};

/**
 * Possible dictionary forms of an inflected word: a cheap lemmatizer for English,
 * elision stripping for French/Italian, the word itself for other languages.
 */
export function candidateForms(key, language = 'en') {
  if (language !== 'en') {
    const forms = [key];
    const stripped = ELISIONS[language] ? key.replace(ELISIONS[language], '') : key;
    if (stripped && stripped !== key) forms.push(stripped);
    return forms;
  }
  const forms = [key];
  const push = (f) => f.length > 1 && !forms.includes(f) && forms.push(f);
  push(key.replace(/'s$/, ''));
  if (key.endsWith('ies')) push(`${key.slice(0, -3)}y`);
  if (key.endsWith('es')) push(key.slice(0, -2));
  if (key.endsWith('s')) push(key.slice(0, -1));
  if (key.endsWith('ied')) push(`${key.slice(0, -3)}y`);
  if (key.endsWith('ed')) {
    push(key.slice(0, -2));
    push(key.slice(0, -1));
    if (/(.)\1ed$/.test(key)) push(key.slice(0, -3));
  }
  if (key.endsWith('ing')) {
    push(key.slice(0, -3));
    push(`${key.slice(0, -3)}e`);
    if (/(.)\1ing$/.test(key)) push(key.slice(0, -4));
  }
  if (key.endsWith('er')) push(key.slice(0, -2));
  if (key.endsWith('est')) push(key.slice(0, -3));
  if (key.endsWith('ly')) push(key.slice(0, -2));
  return forms;
}

async function translateWithLlm(word, context, language) {
  if (!config.llm.enabled || !config.llm.apiKey) return null;
  markInteractiveLlm();
  let timer;
  const parsed = await Promise.race([
    chatJson(
      `Ты ${languageRu(language)}-русский словарь для изучающих язык. Отвечай ТОЛЬКО валидным JSON-объектом без markdown.`,
      `Слово (${languageRu(language)} язык): "${word}"${context ? `\nКонтекст из фильма: "${context}"` : ''}
Верни {"lemma":"начальная форма на ${languageRu(language, 'prep')}","translation":"1–3 коротких русских перевода через запятую, подходящих к контексту"}`,
      { retries: 3, urgent: true },
    ),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), 20000);
    }),
  ]).finally(() => clearTimeout(timer));
  const translation = parsed?.translation ? String(parsed.translation).trim().slice(0, 300) : '';
  return translation ? { translation, lemma: parsed.lemma ? String(parsed.lemma).trim() : null } : null;
}

export const dictionaryService = {
  async list(userId, query = {}) {
    const { language } = parse(listSchema, query);
    const all = await dictionaryRepository.listForUser(userId);
    const languages = {};
    for (const item of all) languages[item.language] = (languages[item.language] || 0) + 1;
    const items = language ? all.filter((item) => item.language === language) : all;
    return { items, total: items.length, languages };
  },

  async save(userId, input) {
    const data = parse(saveSchema, input);
    const language = await resolveLanguage(userId, data);
    const key = wordKey(data.word, language);
    if (!key) throw createHttpError(400, 'VALIDATION_ERROR', 'Слово пустое');
    const row = await dictionaryRepository.save(userId, {
      ...data,
      language,
      word: data.word.trim(),
      wordKey: key,
    });
    return { id: row.id, created: row.inserted, language };
  },

  async update(userId, id, input) {
    const data = parse(updateSchema, input);
    const row = await dictionaryRepository.update(userId, id, data);
    if (!row) throw createHttpError(404, 'NOT_FOUND', 'Слово не найдено');
    return { ok: true };
  },

  async remove(userId, id, kind) {
    const removed =
      kind === 'learned'
        ? await dictionaryRepository.removeLearned(userId, id)
        : await dictionaryRepository.remove(userId, id);
    if (!removed) throw createHttpError(404, 'NOT_FOUND', 'Слово не найдено');
    return { ok: true };
  },

  async browse(userId, query) {
    const data = parse(browseSchema, query);
    const result = await dictionaryRepository.browse({ userId, ...data });
    return { ...result, page: data.page, limit: data.limit };
  },

  /**
   * Translation for a word clicked in subtitles:
   * film vocabularies → shared cache → LLM (if configured).
   */
  async translate(userId, input) {
    const data = parse(translateSchema, input);
    const { word, context, mediaId } = data;
    const language = await resolveLanguage(userId, data);
    const key = wordKey(word, language);
    if (!key) throw createHttpError(400, 'VALIDATION_ERROR', 'Слово пустое');
    const forms = candidateForms(key, language);
    const base = { word: key, language };
    const own = await dictionaryRepository.findSavedByKeys(userId, forms, language);
    const saved = Boolean(own);
    if (own?.translation) {
      return { ...base, lemma: own.word, translation: own.translation, level: null, source: 'mine', inDictionary: true };
    }

    const entry = await dictionaryRepository.lookupLexicon(forms, mediaId, language);
    if (entry) {
      return {
        ...base,
        lemma: entry.lemma,
        translation: entry.definition_ru,
        level: entry.cefr_level,
        lexiconEntryId: entry.id,
        source: 'film',
        inDictionary: saved,
      };
    }

    const cached = await dictionaryRepository.cachedTranslation(key, language);
    if (cached) {
      return { ...base, lemma: null, translation: cached.translation, level: null, source: cached.source, inDictionary: saved };
    }

    try {
      const llm = await translateWithLlm(word, context, language);
      if (llm) {
        await dictionaryRepository.cacheTranslation(key, llm.translation, 'ai', language);
        return { ...base, lemma: llm.lemma, translation: llm.translation, level: null, source: 'ai', inDictionary: saved };
      }
    } catch (err) {
      console.warn(`[translate] "${key}": ${err.message}`);
    }
    return { ...base, lemma: null, translation: null, level: null, source: null, inDictionary: saved };
  },
};
