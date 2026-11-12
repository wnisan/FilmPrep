import { STOPWORDS_BY_LANGUAGE } from './data/stopwords-multi.js';

const UNSPACED = new Set(['ja', 'zh']);
const LETTER_RE = /\p{L}/u;

// French/Italian elisions: l'homme → homme, dell'amore → amore
const ELISION_RE = {
  fr: /^(?:l|d|j|m|n|s|t|c|qu|jusqu|lorsqu|puisqu)['’]/u,
  it: /^(?:l|d|un|dell|all|dall|nell|sull|c|m|t|s|v)['’]/u,
};

const stopwordSets = new Map();
function stopwordsFor(language) {
  if (!stopwordSets.has(language)) {
    const raw = STOPWORDS_BY_LANGUAGE[language] || '';
    stopwordSets.set(language, new Set(raw ? raw.split(' ') : []));
  }
  return stopwordSets.get(language);
}

const segmenters = new Map();
function segmenterFor(language) {
  if (!segmenters.has(language)) {
    segmenters.set(
      language,
      typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(language, { granularity: 'word' }) : null,
    );
  }
  return segmenters.get(language);
}

/** Word tokens of a line: [{ key, surface }] (key is lower-cased, elisions stripped). */
export function tokenizeLine(text, language) {
  const segmenter = segmenterFor(language);
  const raw = segmenter
    ? [...segmenter.segment(text)].filter((s) => s.isWordLike).map((s) => s.segment)
    : text.split(/[^\p{L}\p{M}'’-]+/u);
  const out = [];
  for (let surface of raw) {
    surface = surface.replace(/^['’-]+|['’-]+$/g, '');
    if (!surface || /\d/.test(surface) || !LETTER_RE.test(surface)) continue;
    let key = surface.toLocaleLowerCase(language);
    const elision = ELISION_RE[language];
    if (elision) {
      key = key.replace(elision, '');
      surface = surface.replace(new RegExp(elision.source, 'iu'), '');
    }
    if (key) out.push({ key, surface });
  }
  return out;
}

function minLength(language) {
  return UNSPACED.has(language) || language === 'ko' ? 2 : 3;
}

/**
 * Rough CEFR estimate from how common the word is inside the film and how long it is.
 * The LLM step replaces it with a proper estimate when enabled.
 */
function estimateLevel(rankRatio, key, language) {
  const levels = ['A2', 'B1', 'B2', 'C1'];
  let index = rankRatio < 0.15 ? 0 : rankRatio < 0.4 ? 1 : rankRatio < 0.75 ? 2 : 3;
  const longWord = UNSPACED.has(language) ? key.length >= 4 : key.length >= 11;
  if (longWord && index < 3) index += 1;
  return levels[index];
}

/** Vocabulary + phrases for any language (grammar comes from the LLM step). */
export function extractGeneric(cues, language) {
  const stop = stopwordsFor(language);
  const min = minLength(language);
  const freq = new Map();

  for (const cue of cues) {
    for (const { key, surface } of tokenizeLine(cue.text, language)) {
      if ([...key].length < min || stop.has(key)) continue;
      // Short kana-only chunks are particles or verb endings split off by the segmenter
      if (language === 'ja' && /^[\p{Script=Hiragana}ー]{1,2}$/u.test(key)) continue;
      const entry = freq.get(key) || { count: 0, forms: new Map(), example: cue.text, timestampMs: cue.startMs };
      entry.count += 1;
      entry.forms.set(surface, (entry.forms.get(surface) || 0) + 1);
      freq.set(key, entry);
    }
  }

  const ranked = [...freq.entries()]
    .filter(([, info]) => info.count >= 1)
    .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0], language))
    .slice(0, 80);

  const lexicon = ranked.map(([key, info], index) => {
    const forms = [...info.forms.entries()].sort((a, b) => b[1] - a[1]).map(([form]) => form);
    // German nouns keep their capital letter
    const lemma = language === 'de' ? forms[0] : key;
    return {
      lemma,
      surfaceForms: [...new Set([key, ...forms])].slice(0, 5),
      frequency: info.count,
      cefrLevel: estimateLevel(index / Math.max(ranked.length, 1), key, language),
      definitionRu: null,
      exampleSubtitle: info.example,
      timestampMs: info.timestampMs,
    };
  });

  const interesting = new Set(lexicon.slice(0, 40).map((x) => x.surfaceForms[0]));
  const phrases = [];
  const seen = new Set();
  const [minWords, maxWords] = UNSPACED.has(language) ? [3, 30] : [4, 18];
  for (const cue of cues) {
    const tokens = tokenizeLine(cue.text, language);
    if (tokens.length < minWords || tokens.length > maxWords) continue;
    if (!tokens.some((t) => interesting.has(t.key))) continue;
    const key = cue.text.toLocaleLowerCase(language);
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push({ text: cue.text, translationRu: null, note: null, timestampMs: cue.startMs });
    if (phrases.length >= 20) break;
  }

  return { lexicon, phrases, grammar: [] };
}
