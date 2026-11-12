import { config } from '../config/index.js';
import { languageRu } from '../utils/languages.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function extractJson(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    const objStart = trimmed.indexOf('{');
    const objEnd = trimmed.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
      try {
        return JSON.parse(trimmed.slice(objStart, objEnd + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Last resort for invalid JSON (usually unescaped quotes inside a translation):
 * read every flat {...} row field by field; a value ends only before the next key.
 */
function salvageRows(text) {
  const rows = [];
  for (const [, body] of String(text).matchAll(/\{([^{}]*)\}/g)) {
    const row = {};
    const fieldRe = /"(\w+)"\s*:\s*("([\s\S]*?)"|-?\d+(?:\.\d+)?)\s*(?=,\s*"\w+"\s*:|\s*$)/g;
    for (const [, key, raw, str] of body.matchAll(fieldRe)) {
      row[key] = str !== undefined ? str.replace(/\\"/g, '"').replace(/\\n/g, ' ') : Number(raw);
    }
    if (Object.keys(row).length) rows.push(row);
  }
  return rows;
}

/** Models sometimes wrap the array in an object or return `i` as a string. */
export function toRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed?.__raw) return salvageRows(parsed.__raw);
  if (parsed && typeof parsed === 'object') {
    const inner = Object.values(parsed).find(Array.isArray);
    if (inner) return inner;
  }
  return [];
}

export function collect(parsed, field) {
  const map = new Map();
  for (const row of toRows(parsed)) {
    const index = Number(row?.i);
    const value = row?.[field];
    if (Number.isInteger(index) && value) {
      map.set(index, String(value).trim());
    }
  }
  return map;
}

function formatLlmError(data, status) {
  if (!data) return `LLM HTTP ${status}`;
  if (typeof data.error === 'string') return data.error;
  return data?.error?.message || data?.message || `LLM HTTP ${status}`;
}

function isRateLimited(message) {
  return /rate limit|cooldown|too many|concurrent/i.test(String(message || ''));
}

// Free tier allows ~1 request per LLM_MIN_INTERVAL_MS: background jobs step aside
// while a learner is waiting for an answer (word translation, chat)
let lastInteractiveAt = 0;

export function markInteractiveLlm() {
  lastInteractiveAt = Date.now();
}

export async function waitForIdleLlm() {
  while (Date.now() - lastInteractiveAt < config.llm.minIntervalMs * 2) {
    await sleep(1000);
  }
}

// LiteRouter sometimes holds a request for 2+ minutes before answering 524
const REQUEST_TIMEOUT_MS = 75000;

// Free tier answers "Too many concurrent requests" to a second parallel call,
// so requests go one at a time; urgent ones (a learner is waiting) skip the queue
// A background request in flight is aborted for an urgent one and repeated later.
const llmQueue = { busy: false, urgent: [], normal: [], current: null };
const PREEMPTED = 'preempted';
// An aborted request may still count as running on the provider for a moment
const URGENT_RETRY_MS = 1500;

function acquireLlm(urgent) {
  if (!llmQueue.busy) {
    llmQueue.busy = true;
    return Promise.resolve();
  }
  if (urgent && llmQueue.current && !llmQueue.current.urgent) llmQueue.current.controller.abort(PREEMPTED);
  return new Promise((resolve) => (urgent ? llmQueue.urgent : llmQueue.normal).push(resolve));
}

function releaseLlm() {
  llmQueue.current = null;
  const next = llmQueue.urgent.shift() || llmQueue.normal.shift();
  if (next) next();
  else llmQueue.busy = false;
}

/** → { response, data }; the body is read inside the slot so the next call can't overlap. */
async function llmFetch(init, { urgent = false } = {}) {
  for (;;) {
    await acquireLlm(urgent);
    const controller = new AbortController();
    llmQueue.current = { controller, urgent };
    let preempted = false;
    try {
      const response = await fetch(`${config.llm.baseUrl}/chat/completions`, {
        ...init,
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)]),
      });
      const data = await response.json().catch((err) => {
        if (controller.signal.aborted) throw err;
        return null;
      });
      return { response, data };
    } catch (err) {
      if (controller.signal.aborted) {
        preempted = true;
      } else if (err.name === 'TimeoutError') {
        throw new Error(`Нейросеть не ответила за ${REQUEST_TIMEOUT_MS / 1000} с`);
      } else {
        throw err;
      }
    } finally {
      releaseLlm();
    }
    if (preempted) await waitForIdleLlm();
  }
}

export async function chatJson(systemPrompt, userPrompt, { retries = 2, urgent = false } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { response, data } = await llmFetch(
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.llm.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.llm.model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        }),
      },
      { urgent },
    );

    if (!response.ok) {
      lastError = new Error(formatLlmError(data, response.status));
      if (isRateLimited(lastError.message) && attempt < retries) {
        await sleep(urgent ? URGENT_RETRY_MS : config.llm.minIntervalMs);
        continue;
      }
      throw lastError;
    }

    const content = data?.choices?.[0]?.message?.content || '';
    const parsed = extractJson(content);
    // A lone {"i":…} row means the model listed objects without an array around them
    const loneRow = parsed && !Array.isArray(parsed) && 'i' in parsed;
    if (parsed && !loneRow) return parsed;
    return content ? { __raw: content } : null;
  }

  throw lastError || new Error('LLM request failed');
}

/** Free-form answer for a chat (messages: [{ role, content }]). */
export async function chatText(systemPrompt, messages, { retries = 2, temperature = 0.5, urgent = false } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { response, data } = await llmFetch(
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.llm.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.llm.model,
          temperature,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
        }),
      },
      { urgent },
    );
    if (!response.ok) {
      lastError = new Error(formatLlmError(data, response.status));
      if (isRateLimited(lastError.message) && attempt < retries) {
        await sleep(urgent ? URGENT_RETRY_MS : config.llm.minIntervalMs);
        continue;
      }
      throw lastError;
    }
    // Reasoning models may prepend their hidden chain of thought
    const content = String(data?.choices?.[0]?.message?.content || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();
    if (content) return content;
    lastError = new Error('Пустой ответ нейросети');
  }
  throw lastError || new Error('LLM request failed');
}

/**
 * Free models sometimes answer with broken JSON or only part of the rows —
 * ask again for the missing items only (items carry their original `i`).
 */
async function chatCollect(systemPrompt, makePrompt, items, field, rounds = 3) {
  const map = new Map();
  let parsed = null;
  for (let round = 0; round < rounds; round += 1) {
    const missing = items.filter((item) => !map.has(item.i));
    if (!missing.length) break;
    if (round) await sleep(config.llm.minIntervalMs);
    parsed = await chatJson(systemPrompt, makePrompt(missing));
    for (const [index, value] of collect(parsed, field)) map.set(index, value);
  }
  if (map.size === 0) {
    console.warn(`[llm] no "${field}" in model answer: ${JSON.stringify(parsed)?.slice(0, 400)}`);
  }
  return map;
}

const TRANSLATE_CHUNK = 25;

/**
 * Russian translations for any number of items, chunk by chunk.
 * items: [{ i, ... }]; returns Map i → text. Stops at the first failed chunk
 * and returns what is ready (the rest is filled on the next run).
 */
async function translateInChunks(items, systemPrompt, makePrompt, field) {
  const result = new Map();
  for (let start = 0; start < items.length; start += TRANSLATE_CHUNK) {
    if (start) await sleep(config.llm.minIntervalMs);
    const chunk = items.slice(start, start + TRANSLATE_CHUNK);
    try {
      const map = await chatCollect(systemPrompt, makePrompt, chunk, field, 2);
      for (const [i, value] of map) result.set(i, value);
    } catch (err) {
      console.warn(`[llm] translation chunk failed: ${err.message}`);
      break;
    }
  }
  return result;
}

/** words: [{ i, word, example }] → Map i → short Russian definition. */
export function translateWordsRu(words, language) {
  const langGen = languageRu(language, 'gen');
  return translateInChunks(
    words,
    `Ты помощник для изучения ${langGen} языка по фильмам. Отвечай ТОЛЬКО валидным JSON-массивом без markdown.`,
    (items) => `Для каждого слова дай короткий русский перевод/определение (1 фраза), подходящий к примеру.
Верни JSON-массив объектов: [{"i":0,"definitionRu":"..."}]
Слова:
${JSON.stringify(items, null, 2)}`,
    'definitionRu',
  );
}

/** words: [{ i, word }] → Map i → "1–3 short Russian translations" (dictionary popup style). */
export function translateWordListRu(words, language) {
  const langGen = languageRu(language, 'gen');
  return chatCollect(
    `Ты ${languageRu(language)}-русский словарь для изучающих язык. Отвечай ТОЛЬКО валидным JSON-массивом без markdown.`,
    (items) => `Для каждого ${langGen} слова (как оно встречается в субтитрах) дай 1–3 самых частых русских перевода через запятую.
Верни JSON-массив объектов: [{"i":0,"ru":"..."}]
Слова:
${JSON.stringify(items)}`,
    words,
    'ru',
    2,
  );
}

/** lines: [{ i, text }] → Map i → natural Russian translation. */
export function translateLinesRu(lines, language) {
  const langGen = languageRu(language, 'gen');
  return translateInChunks(
    lines,
    `Ты переводчик субтитров с ${langGen} на русский для изучающих язык. Отвечай ТОЛЬКО валидным JSON-массивом без markdown.`,
    (items) => `Переведи ВСЕ реплики (${items.length} шт.) на естественный русский.
Верни JSON-массив объектов: [{"i":0,"translationRu":"..."}]
Реплики:
${JSON.stringify(items, null, 2)}`,
    'translationRu',
  );
}

/** index → whole row object (for answers with several fields per item). */
function collectRows(parsed) {
  const map = new Map();
  for (const row of toRows(parsed)) {
    const index = Number(row?.i);
    if (Number.isInteger(index) && row && typeof row === 'object') map.set(index, row);
  }
  return map;
}

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

/** Words that turned into the same dictionary form after the LLM step become one entry. */
function mergeByLemma(lexicon) {
  const byKey = new Map();
  for (const item of lexicon) {
    const key = String(item.lemma).toLowerCase();
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...item });
      continue;
    }
    prev.frequency += item.frequency;
    prev.surfaceForms = [...new Set([...prev.surfaceForms, ...item.surfaceForms])].slice(0, 6);
    prev.definitionRu = prev.definitionRu || item.definitionRu;
  }
  return [...byKey.values()].sort((a, b) => b.frequency - a.frequency);
}

async function findGrammar(cues, language) {
  const lines = cues
    .map((c) => c.text.replace(/\s+/g, ' ').trim())
    .filter((t) => t.length > 12)
    .slice(0, 60);
  if (lines.length < 5) return [];
  const parsed = await chatJson(
    `Ты преподаватель ${languageRu(language, 'gen')} языка. Отвечай ТОЛЬКО валидным JSON-массивом без markdown.`,
    `Найди в репликах фильма 4–6 полезных грамматических конструкций ${languageRu(language, 'gen')} языка.
Для каждой: короткое название по-русски, объяснение по-русски (1–2 предложения), пример — ТОЧНАЯ реплика из списка, уровень CEFR.
Верни JSON-массив: [{"title":"...","explanationRu":"...","example":"...","cefrLevel":"B1"}]
Реплики:
${JSON.stringify(lines)}`,
  );
  return toRows(parsed)
    .filter((g) => g?.title && g?.explanationRu && g?.example)
    .slice(0, 6)
    .map((g, index) => ({
      title: String(g.title).slice(0, 120),
      explanationRu: String(g.explanationRu).slice(0, 600),
      example: String(g.example).slice(0, 300),
      patternType: `llm_${index}`,
      cefrLevel: CEFR.includes(g.cefrLevel) ? g.cefrLevel : null,
    }));
}

/**
 * Обогащает материалы русскими переводами через LiteRouter/OpenAI-compatible API.
 * Для неанглийских фильмов LLM ещё приводит слова к словарной форме, оценивает уровень
 * и находит грамматику. Если LLM выключен или упал — возвращает исходный результат.
 */
export async function enrichLearningMaterials(materials, { language = 'en', cues = [] } = {}) {
  if (!config.llm.enabled || !config.llm.apiKey) {
    return { materials, enriched: false, reason: 'disabled' };
  }

  const english = language === 'en';
  const langGen = languageRu(language, 'gen');
  const lexiconSlice = materials.lexicon.slice(0, config.llm.lexiconLimit);
  const phraseSlice = materials.phrases.slice(0, config.llm.phraseLimit);

  let lexiconRows = new Map();
  let phraseMap = new Map();
  let grammar = materials.grammar;

  try {
    if (lexiconSlice.length) {
      const lemmas = lexiconSlice.map((item, index) => ({
        i: index,
        word: item.lemma,
        example: item.exampleSubtitle || '',
      }));

      const format = english
        ? '[{"i":0,"definitionRu":"..."}]'
        : '[{"i":0,"lemma":"словарная форма на языке оригинала","definitionRu":"...","level":"B1"}]';
      const extra = english
        ? ''
        : '\nlemma — начальная (словарная) форма слова; level — примерный уровень CEFR (A1–C2).';

      lexiconRows = collectRows(
        await chatJson(
          `Ты помощник для изучения ${langGen} языка по фильмам. Отвечай ТОЛЬКО валидным JSON-массивом без markdown.`,
          `Для каждого слова дай короткий русский перевод/определение (1 фраза), подходящий к примеру.${extra}
Верни JSON-массив объектов: ${format}
Слова:
${JSON.stringify(lemmas, null, 2)}`,
        ),
      );
    }

    if (phraseSlice.length) {
      // Free tier LiteRouter: ~7s between messages
      await sleep(config.llm.minIntervalMs);

      const phrases = phraseSlice.map((item, index) => ({
        i: index,
        text: item.text,
      }));

      phraseMap = await chatCollect(
        `Ты переводчик субтитров с ${langGen} на русский для изучающих язык. Отвечай ТОЛЬКО валидным JSON-массивом без markdown.`,
        (items) => `Переведи ВСЕ реплики (${items.length} шт.) на естественный русский.
Верни JSON-массив объектов: [{"i":0,"translationRu":"..."}]
Реплики:
${JSON.stringify(items, null, 2)}`,
        phrases,
        'translationRu',
      );
      if (phraseMap.size === 0) {
        console.warn('[llm] phrase translations could not be parsed from model response');
      }
    }

    if (!english && !grammar.length && cues.length) {
      await sleep(config.llm.minIntervalMs);
      grammar = await findGrammar(cues, language).catch((err) => {
        console.warn(`[llm] grammar step failed: ${err.message}`);
        return [];
      });
    }
  } catch (err) {
    console.warn(`[llm] enrichment failed (${config.llm.provider}/${config.llm.model}): ${err.message}`);
    return { materials, enriched: false, reason: err.message };
  }

  let lexicon = materials.lexicon.map((item, index) => {
    const row = lexiconRows.get(index);
    if (!row) return item;
    const lemma = !english && row.lemma ? String(row.lemma).trim().slice(0, 80) : item.lemma;
    return {
      ...item,
      lemma,
      surfaceForms: [...new Set([...item.surfaceForms, item.lemma])].slice(0, 6),
      definitionRu: row.definitionRu ? String(row.definitionRu).trim() : item.definitionRu,
      cefrLevel: !english && CEFR.includes(row.level) ? row.level : item.cefrLevel,
    };
  });
  if (!english) lexicon = mergeByLemma(lexicon);

  const phrases = materials.phrases.map((item, index) => ({
    ...item,
    translationRu: phraseMap.get(index) || item.translationRu,
  }));

  return {
    materials: {
      ...materials,
      lexicon,
      phrases,
      grammar,
    },
    enriched: lexiconRows.size > 0 || phraseMap.size > 0,
    reason: `words ${lexiconRows.size}/${lexiconSlice.length}, phrases ${phraseMap.size}/${phraseSlice.length}, grammar ${grammar.length}`,
  };
}
