import { config } from '../config/index.js';
import { dictionaryRepository } from '../repositories/dictionary.repository.js';
import { learningRepository } from '../repositories/learning.repository.js';
import { mediaRepository } from '../repositories/media.repository.js';
import { subtitlesRepository } from '../repositories/subtitles.repository.js';
import { normalizeLanguage } from '../utils/languages.js';
import { parseSubtitleCues } from '../utils/subtitles.js';
import { wordKey } from './dictionary.service.js';
import { translateWordListRu, waitForIdleLlm } from './llm.service.js';
import { readSubtitleText } from './processing.service.js';

/**
 * Russian for every word of a film's subtitles, translated in big batches ahead of time
 * into the shared word cache: a click on any subtitle word then answers instantly
 * instead of waiting for the rate-limited free LLM (3–15 s per word).
 */
// Bigger lists take over a minute and LiteRouter cuts them off (HTTP 524)
const CHUNK = 40;
const PAUSE_AFTER_FAILURE_MS = 10 * 60 * 1000;

const queue = [];
let busy = false;
let pausedUntil = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const llmReady = () => Boolean(config.llm.enabled && config.llm.apiKey);

function subtitleWords(cues, language) {
  const segmenter = new Intl.Segmenter(language, { granularity: 'word' });
  const counts = new Map();
  for (const cue of cues) {
    for (const part of segmenter.segment(cue.text)) {
      if (!part.isWordLike) continue;
      const key = wordKey(part.segment, language);
      if (!key || key.length > 40 || /^\p{N}+$/u.test(key)) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  return counts;
}

/** Words of the film that are neither in its vocabulary nor in the shared cache, most frequent first. */
async function missingWords(media) {
  const language = normalizeLanguage(media.language);
  const subtitle = await subtitlesRepository.findLatestByMedia(media.id, language);
  if (!subtitle) return { language, keys: [] };
  const counts = subtitleWords(parseSubtitleCues(await readSubtitleText(subtitle)), language);

  const known = new Set();
  for (const entry of await learningRepository.getLexicon(media.id)) {
    if (!entry.definitionRu) continue;
    known.add(String(entry.lemma).toLocaleLowerCase(language));
    for (const form of entry.surfaceForms || []) known.add(String(form).toLocaleLowerCase(language));
  }
  const candidates = [...counts.keys()].filter((key) => !known.has(key));
  const cached = await dictionaryRepository.cachedKeys(candidates, language);
  const keys = candidates.filter((key) => !cached.has(key)).sort((a, b) => counts.get(b) - counts.get(a));
  return { language, keys };
}

async function translateFilm(media) {
  const { language, keys } = await missingWords(media);
  let done = 0;
  for (let start = 0; start < keys.length; start += CHUNK) {
    await waitForIdleLlm();
    const chunk = keys.slice(start, start + CHUNK);
    const map = await translateWordListRu(
      chunk.map((word, i) => ({ i, word })),
      language,
    );
    for (const [i, translation] of map) {
      await dictionaryRepository.cacheTranslation(chunk[i], translation.slice(0, 300), 'ai', language);
    }
    done += map.size;
    await sleep(config.llm.minIntervalMs);
  }
  return { done, total: keys.length };
}

async function drain() {
  busy = true;
  while (queue.length) {
    if (Date.now() < pausedUntil) await sleep(pausedUntil - Date.now());
    const media = queue.shift();
    try {
      const { done, total } = await translateFilm(media);
      if (total) console.log(`[vocab] ${media.id}: ${done}/${total} subtitle words translated`);
    } catch (err) {
      const tries = (media.vocabTries || 0) + 1;
      console.warn(`[vocab] ${media.id}: ${err.message}${tries < 3 ? ' — retry in 10 min' : ''}`);
      pausedUntil = Date.now() + PAUSE_AFTER_FAILURE_MS;
      if (tries < 3) queue.push({ ...media, vocabTries: tries });
    }
  }
  busy = false;
}

export const subtitleVocabService = {
  schedule(media) {
    if (!llmReady() || queue.some((m) => m.id === media.id)) return;
    queue.push(media);
    if (!busy) drain();
  },

  /** Films whose words are all cached cost one DB query each, so this is cheap on every start. */
  async scheduleAll() {
    if (!llmReady()) return;
    const films = await mediaRepository.listWithOriginalSubtitles();
    films.forEach((media) => this.schedule(media));
  },

  /** For scripts: translate now and report. */
  translateFilm,
  missingWords,
};
