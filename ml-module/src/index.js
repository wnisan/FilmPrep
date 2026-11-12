import { STOPWORDS } from './data/stopwords.js';
import { guessCefr } from './data/cefr.js';
import { GRAMMAR_RULES } from './data/grammar.js';
import { parseSubtitles } from './parseSubtitles.js';
import { extractGeneric, tokenizeLine } from './multilang.js';

export { tokenizeLine };

const TOKEN_RE = /[a-zA-Z']+/g;

function simpleLemma(word) {
  let w = word.toLowerCase();
  if (w.endsWith("'s")) w = w.slice(0, -2);
  if (w.endsWith('ies') && w.length > 4) return `${w.slice(0, -3)}y`;
  if (w.endsWith('ves') && w.length > 4) return `${w.slice(0, -3)}f`;
  if (w.endsWith('ing') && w.length > 5) return w.slice(0, -3);
  if (w.endsWith('ed') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('es') && w.length > 4) return w.slice(0, -2);
  if (w.endsWith('s') && w.length > 3 && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}

function tokenize(text) {
  return (text.match(TOKEN_RE) || []).map((t) => t.toLowerCase());
}

/**
 * Извлекает словарь, фразы и грамматику из субтитров.
 * Для английского — словари CEFR и правила грамматики, для остальных языков — общий разбор
 * (Intl.Segmenter + стоп-слова), уровни и грамматику уточняет LLM.
 * @param {string} content
 * @param {'srt'|'vtt'} format
 * @param {{ language?: string }} [options]
 */
export function extractLearningMaterials(content, format = 'srt', { language = 'en' } = {}) {
  const cues = parseSubtitles(content, format);
  if (language !== 'en') {
    return { cuesCount: cues.length, language, ...extractGeneric(cues, language) };
  }
  const freq = new Map(); // lemma -> { count, forms:Set, example, timestampMs }

  for (const cue of cues) {
    const tokens = tokenize(cue.text);
    for (const token of tokens) {
      if (token.length < 3) continue;
      if (STOPWORDS.has(token)) continue;
      const lemma = simpleLemma(token);
      if (lemma.length < 3 || STOPWORDS.has(lemma)) continue;

      const prev = freq.get(lemma) || {
        count: 0,
        forms: new Set(),
        example: cue.text,
        timestampMs: cue.startMs,
      };
      prev.count += 1;
      prev.forms.add(token);
      if (!prev.example) {
        prev.example = cue.text;
        prev.timestampMs = cue.startMs;
      }
      freq.set(lemma, prev);
    }
  }

  const lexicon = [...freq.entries()]
    .map(([lemma, info]) => ({
      lemma,
      surfaceForms: [...info.forms].slice(0, 5),
      frequency: info.count,
      cefrLevel: guessCefr(lemma),
      definitionRu: null,
      exampleSubtitle: info.example,
      timestampMs: info.timestampMs,
    }))
    .sort((a, b) => b.frequency - a.frequency || a.lemma.localeCompare(b.lemma))
    .slice(0, 80);

  // Фразы: реплики средней длины с «интересными» словами
  const interesting = new Set(lexicon.slice(0, 40).map((x) => x.lemma));
  const phrases = [];
  const seenPhrase = new Set();

  for (const cue of cues) {
    const words = tokenize(cue.text);
    if (words.length < 4 || words.length > 18) continue;
    const hasInteresting = words.some((w) => interesting.has(simpleLemma(w)));
    if (!hasInteresting) continue;
    const key = cue.text.toLowerCase();
    if (seenPhrase.has(key)) continue;
    seenPhrase.add(key);
    phrases.push({
      text: cue.text,
      translationRu: null,
      note: null,
      timestampMs: cue.startMs,
    });
    if (phrases.length >= 20) break;
  }

  const grammar = [];
  const foundTypes = new Set();
  for (const cue of cues) {
    for (const rule of GRAMMAR_RULES) {
      if (foundTypes.has(rule.patternType)) continue;
      if (!rule.test(cue.text)) continue;
      foundTypes.add(rule.patternType);
      grammar.push({
        title: rule.title,
        explanationRu: rule.explanationRu,
        example: cue.text,
        patternType: rule.patternType,
        cefrLevel: rule.cefrLevel ?? null,
      });
    }
    if (grammar.length >= GRAMMAR_RULES.length) break;
  }

  return {
    cuesCount: cues.length,
    language,
    lexicon,
    phrases,
    grammar,
  };
}
