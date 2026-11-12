import { config } from '../config/index.js';
import { languageRu } from '../utils/languages.js';
import { chatJson, toRows } from './llm.service.js';

const MIN_QUESTIONS = 5;
const TARGET_QUESTIONS = 6;

const clean = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Evenly spread lines across the whole film, not just the first minutes. */
function sampleLines(cues, max = 90) {
  const lines = cues.map((c) => clean(c.text, 200)).filter((t) => t.length > 8);
  if (lines.length <= max) return lines;
  const step = lines.length / max;
  return Array.from({ length: max }, (_, i) => lines[Math.floor(i * step)]);
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value).trim().toLowerCase();
  if (['true', 'верно', 'да', 'yes'].includes(text)) return true;
  if (['false', 'неверно', 'нет', 'no'].includes(text)) return false;
  return null;
}

function normalizeQuestion(raw) {
  const type = raw?.questionType || raw?.type;
  const prompt = clean(raw?.prompt || raw?.question, 400);
  const explanation = clean(raw?.explanation, 400) || null;
  if (!prompt) return null;

  if (type === 'single_choice') {
    const options = [...new Set((raw.options || []).map((o) => clean(o, 160)).filter(Boolean))];
    const correct = clean(raw.correctAnswer, 160);
    if (options.length < 3 || options.length > 5 || !options.includes(correct)) return null;
    return { questionType: type, prompt, options, correctAnswer: correct, explanation };
  }
  if (type === 'true_false') {
    const correct = toBoolean(raw.correctAnswer);
    if (correct === null) return null;
    return { questionType: type, prompt, options: [true, false], correctAnswer: correct, explanation };
  }
  if (type === 'fill_blank') {
    const answer = clean(Array.isArray(raw.correctAnswer) ? raw.correctAnswer[0] : raw.correctAnswer, 60);
    if (!answer || answer.split(' ').length > 3 || !prompt.includes('___')) return null;
    const lower = answer.toLowerCase();
    return {
      questionType: type,
      prompt: prompt.replace(/_{3,}/, '____'),
      correctAnswer: lower === answer ? [answer] : [answer, lower],
      explanation,
    };
  }
  return null;
}

async function questionsFromLlm({ title, language, cues }) {
  const lines = sampleLines(cues);
  if (lines.length < 8) return [];
  const lang = languageRu(language, 'prep');

  const parsed = await chatJson(
    `Ты составляешь тесты на понимание фильмов для изучающих ${languageRu(language, 'gen')} язык. Отвечай ТОЛЬКО валидным JSON-массивом без markdown.`,
    `Фильм «${title}». Реплики из субтитров (по порядку):
${JSON.stringify(lines)}

Составь ${TARGET_QUESTIONS} вопросов на ${lang} языке строго по содержанию этих реплик:
- 3 вопроса "single_choice": 4 варианта, ровно один верный (correctAnswer — точная копия верного варианта);
- 2 вопроса "true_false": утверждение, correctAnswer — true или false;
- 1 вопрос "fill_blank": реплика из списка, где одно слово заменено на "____", correctAnswer — это слово.
explanation — короткое пояснение по-русски (можно с цитатой).
Формат: [{"questionType":"single_choice","prompt":"...","options":["...","...","...","..."],"correctAnswer":"...","explanation":"..."},{"questionType":"true_false","prompt":"...","correctAnswer":true,"explanation":"..."},{"questionType":"fill_blank","prompt":"... ____ ...","correctAnswer":"...","explanation":"..."}]`,
  );
  return toRows(parsed).map(normalizeQuestion).filter(Boolean);
}

const shortDefinition = (text) => clean(String(text).split(/[;(]/)[0], 80);

/** Without LLM (or when it fails): questions from the film's own words and lines. */
function questionsFromMaterials(lexicon, count) {
  const withMeaning = lexicon.filter((w) => w.definitionRu);
  const meaning = shuffle(withMeaning)
    .slice(0, Math.ceil(count / 2))
    .map((word) => {
      const correct = shortDefinition(word.definitionRu);
      const distractors = shuffle(
        withMeaning.map((w) => shortDefinition(w.definitionRu)).filter((d) => d && d !== correct),
      );
      const options = shuffle([correct, ...new Set(distractors)].slice(0, 4));
      if (options.length < 3) return null;
      return {
        questionType: 'single_choice',
        prompt: `Что означает «${word.lemma}»?`,
        options,
        correctAnswer: correct,
        explanation: word.exampleSubtitle ? `В фильме: «${clean(word.exampleSubtitle, 200)}»` : null,
      };
    })
    .filter(Boolean);

  const used = new Set();
  const blanks = [];
  for (const word of shuffle(lexicon)) {
    if (blanks.length >= count - meaning.length) break;
    const line = clean(word.exampleSubtitle, 220);
    if (!line || used.has(line)) continue;
    const form = [word.lemma, ...(word.surfaceForms || [])]
      .sort((a, b) => b.length - a.length)
      .find((f) => f && new RegExp(`(^|[^\\p{L}])${escapeRegex(f)}(?=$|[^\\p{L}])`, 'iu').test(line));
    if (!form) continue;
    const re = new RegExp(`(^|[^\\p{L}])${escapeRegex(form)}(?=$|[^\\p{L}])`, 'iu');
    const actual = line.match(re)[0].slice(line.match(re)[1].length);
    used.add(line);
    blanks.push({
      questionType: 'fill_blank',
      prompt: `Вставьте пропущенное слово: «${line.replace(re, '$1____')}»${word.definitionRu ? ` (${shortDefinition(word.definitionRu)})` : ''}`,
      correctAnswer: actual.toLowerCase() === actual ? [actual] : [actual, actual.toLowerCase()],
      explanation: `«${line}»`,
    });
  }
  return [...meaning, ...blanks];
}

const wordsOf = (text) =>
  clean(text, 300)
    .replace(/[.,!?¿¡…:;"«»“”„()]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/** «Соберите фразу», «Сопоставьте пары», «Что прозвучало» — built from the film's own materials. */
export function formatQuestions({ lexicon = [], phrases = [] }) {
  const questions = [];

  const buildable = shuffle(phrases.filter((p) => {
    const n = wordsOf(p.text).length;
    return n >= 3 && n <= 11;
  }));
  const order = buildable[0];
  if (order) {
    const tokens = wordsOf(order.text);
    let options = shuffle(tokens);
    for (let i = 0; i < 5 && options.join(' ') === tokens.join(' '); i += 1) options = shuffle(tokens);
    questions.push({
      questionType: 'word_order',
      prompt: order.translationRu
        ? `Соберите фразу из фильма: «${clean(order.translationRu, 200)}»`
        : 'Соберите фразу из фильма в правильном порядке',
      options,
      correctAnswer: tokens.join(' '),
      explanation: `«${clean(order.text, 300)}»`,
    });
  }

  const seenDefs = new Set();
  const pairs = shuffle(lexicon.filter((w) => w.definitionRu))
    .map((w) => ({ word: w.lemma, def: shortDefinition(w.definitionRu) }))
    .filter((p) => p.def && !seenDefs.has(p.def) && seenDefs.add(p.def))
    .slice(0, 4);
  if (pairs.length === 4) {
    questions.push({
      questionType: 'matching',
      prompt: 'Сопоставьте слова из фильма с переводом',
      options: { left: pairs.map((p) => p.word), right: shuffle(pairs.map((p) => p.def)) },
      correctAnswer: Object.fromEntries(pairs.map((p) => [p.word, p.def])),
      explanation: pairs.map((p) => `${p.word} — ${p.def}`).join('; '),
    });
  }

  const audible = phrases.filter((p) => p.timestampMs != null && wordsOf(p.text).length >= 2);
  const heard = shuffle(audible).find((p) => p !== order) || audible[0];
  const others = shuffle(phrases.filter((p) => p !== heard && clean(p.text) !== clean(heard?.text)));
  if (heard && others.length >= 3) {
    const answer = clean(heard.text, 200);
    questions.push({
      questionType: 'listening',
      prompt: 'Послушайте реплику из фильма. Что прозвучало?',
      options: {
        choices: shuffle([answer, ...others.slice(0, 3).map((p) => clean(p.text, 200))]),
        timestampMs: heard.timestampMs,
        text: answer,
      },
      correctAnswer: answer,
      explanation: heard.translationRu ? `«${answer}» — ${clean(heard.translationRu, 200)}` : `«${answer}»`,
    });
  }
  return questions;
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds 5–6 quiz questions for a film. Tries the LLM first (questions about the plot
 * in the film's language), tops up with vocabulary questions from the lexicon.
 */
export async function generateQuizQuestions({ title, language, cues, lexicon, phrases = [] }) {
  let questions = [];
  let source = 'materials';
  if (config.llm.enabled && config.llm.apiKey) {
    try {
      questions = await questionsFromLlm({ title, language, cues });
      if (questions.length) source = 'llm';
    } catch (err) {
      console.warn(`[quiz] LLM quiz failed: ${err.message}`);
    }
  }
  if (questions.length < MIN_QUESTIONS) {
    const prompts = new Set(questions.map((q) => q.prompt));
    const extra = questionsFromMaterials(lexicon, TARGET_QUESTIONS - questions.length).filter(
      (q) => !prompts.has(q.prompt),
    );
    questions = [...questions, ...extra];
  }
  questions = [...questions.slice(0, TARGET_QUESTIONS), ...formatQuestions({ lexicon, phrases })];
  return { questions, source, enough: questions.length >= MIN_QUESTIONS };
}
