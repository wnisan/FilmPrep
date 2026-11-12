import { config } from '../config/index.js';
import { jobsRepository } from '../repositories/jobs.repository.js';
import { learningRepository } from '../repositories/learning.repository.js';
import { quizRepository } from '../repositories/quiz.repository.js';
import { subtitlesRepository } from '../repositories/subtitles.repository.js';
import { normalizeLanguage } from '../utils/languages.js';
import { parseSubtitleCues } from '../utils/subtitles.js';
import { translateLinesRu, translateWordsRu } from './llm.service.js';
import { processingService, readSubtitleText } from './processing.service.js';
import { generateQuizQuestions } from './quizGenerator.service.js';
import { subtitleTranslationService } from './subtitleTranslation.service.js';
import { subtitleVocabService } from './subtitleVocab.service.js';

/**
 * Everything a film needs after its subtitles arrive, in one run:
 * analysis → Russian subtitles → Russian for every word and phrase → quiz.
 * State lives in memory: it only matters while someone watches the progress.
 */
const runs = new Map();

const llmReady = () => Boolean(config.llm.enabled && config.llm.apiKey);

async function ruCues(mediaId) {
  const ru = await subtitlesRepository.findLatestByMedia(mediaId, 'ru');
  return ru ? parseSubtitleCues(await readSubtitleText(ru)) : [];
}

/** Russian line shown on screen at the moment of the phrase (official or AI subtitles). */
function cueAt(cues, timestampMs) {
  if (timestampMs == null || !cues.length) return null;
  const t = timestampMs / 1000;
  let best = null;
  let bestGap = Infinity;
  for (const cue of cues) {
    const gap = t < cue.start ? cue.start - t : t > cue.end ? t - cue.end : 0;
    if (gap < bestGap) {
      best = cue;
      bestGap = gap;
    }
    if (cue.start > t + 2) break;
  }
  return best && bestGap <= 1 ? best.text.replace(/\s*\n\s*/g, ' ').trim() : null;
}

/** Fills Russian for words and phrases that don't have it yet; returns what is still missing. */
async function fillTranslations(media) {
  const language = normalizeLanguage(media.language);
  const [lexicon, phrases, cues] = await Promise.all([
    learningRepository.getLexicon(media.id),
    learningRepository.getPhrases(media.id),
    ruCues(media.id),
  ]);

  const phraseRows = [];
  let phrasesLeft = phrases.filter((p) => !p.translationRu);
  for (const phrase of phrasesLeft) {
    const text = cueAt(cues, phrase.timestampMs);
    if (text) phraseRows.push({ id: phrase.id, translationRu: text });
  }
  phrasesLeft = phrasesLeft.filter((p) => !phraseRows.some((r) => r.id === p.id));

  let wordsLeft = lexicon.filter((w) => !w.definitionRu);
  const wordRows = [];
  if (llmReady() && wordsLeft.length) {
    const map = await translateWordsRu(
      wordsLeft.map((w, i) => ({ i, word: w.lemma, example: w.exampleSubtitle || '' })),
      language,
    );
    wordsLeft.forEach((w, i) => {
      if (map.get(i)) wordRows.push({ id: w.id, definitionRu: map.get(i) });
    });
  }
  if (llmReady() && phrasesLeft.length) {
    const map = await translateLinesRu(
      phrasesLeft.map((p, i) => ({ i, text: p.text })),
      language,
    );
    phrasesLeft.forEach((p, i) => {
      if (map.get(i)) phraseRows.push({ id: p.id, translationRu: map.get(i) });
    });
  }

  await learningRepository.setWordTranslations(media.id, wordRows);
  await learningRepository.setPhraseTranslations(media.id, phraseRows);
  wordsLeft = wordsLeft.length - wordRows.length;
  phrasesLeft = phrases.filter((p) => !p.translationRu).length - phraseRows.length;
  return { words: lexicon.length, phrases: phrases.length, wordsLeft, phrasesLeft };
}

export async function buildQuiz(media, { keepExisting = false } = {}) {
  const language = normalizeLanguage(media.language);
  if (keepExisting) {
    const existing = await quizRepository.findByMediaId(media.id);
    const count = existing ? (await quizRepository.listQuestions(existing.id)).length : 0;
    if (count >= 5) return { questions: 0, kept: true };
  }
  const subtitle = await subtitlesRepository.findLatestByMedia(media.id, language);
  const cues = subtitle ? parseSubtitleCues(await readSubtitleText(subtitle)) : [];
  const [lexicon, phrases] = await Promise.all([
    learningRepository.getLexicon(media.id),
    learningRepository.getPhrases(media.id),
  ]);
  const { questions, source, enough } = await generateQuizQuestions({
    title: media.title,
    language,
    cues,
    lexicon,
    phrases,
  });
  if (!enough) return { questions: 0, source };
  const quiz = await quizRepository.upsertQuiz({
    mediaId: media.id,
    title: `Тест: ${media.title}`,
    isPublished: true,
  });
  await quizRepository.replaceQuestions(quiz.id, questions);
  return { questions: questions.length, source };
}

async function run(media, state, { translate, keepQuiz }) {
  const step = (name, patch) => Object.assign(state.steps[name], patch);
  try {
    state.stage = 'analysis';
    step('analysis', { state: 'running' });
    const subtitle = await subtitlesRepository.findLatestByMedia(media.id, normalizeLanguage(media.language));
    const job = await jobsRepository.create({ mediaId: media.id, subtitleId: subtitle.id });
    await processingService.runJob(job.id);
    step('analysis', { state: 'done' });

    state.stage = 'translation';
    const hasRu = await subtitlesRepository.findLatestByMedia(media.id, 'ru');
    if (translate && !hasRu && state.llmEnabled) {
      step('translation', { state: 'running' });
      const result = await subtitleTranslationService.translateAndWait(media.id).catch((err) => ({
        state: 'failed',
        error: err.message,
      }));
      step('translation', {
        state: result.state === 'failed' ? 'failed' : 'done',
        error: result.error || null,
      });
    } else {
      step('translation', { state: 'skipped', note: hasRu ? 'русские субтитры уже есть' : null });
    }

    state.stage = 'words';
    step('words', { state: 'running' });
    const filled = await fillTranslations(media);
    const left = filled.wordsLeft + filled.phrasesLeft;
    step('words', {
      state: left ? 'failed' : 'done',
      note: `слов ${filled.words - filled.wordsLeft}/${filled.words}, фраз ${filled.phrases - filled.phrasesLeft}/${filled.phrases}`,
      error: left ? 'Часть перевода не готова — нейросеть не ответила, запустите подготовку ещё раз позже' : null,
    });

    state.stage = 'quiz';
    step('quiz', { state: 'running' });
    const quiz = await buildQuiz(media, { keepExisting: keepQuiz });
    if (quiz.kept) {
      step('quiz', { state: 'skipped', note: 'тест уже есть — оставлен без изменений' });
    } else {
      step('quiz', {
        state: quiz.questions ? 'done' : 'failed',
        note: quiz.questions ? `${quiz.questions} вопросов` : null,
        error: quiz.questions ? null : 'Мало материала для теста — нужны субтитры подлиннее',
      });
    }

    state.state = 'done';
    state.stage = null;
    subtitleVocabService.schedule(media);
  } catch (err) {
    console.error(`[prep] ${media.id}: failed`, err);
    const running = Object.values(state.steps).find((s) => s.state === 'running');
    if (running) Object.assign(running, { state: 'failed', error: err.message });
    state.state = 'failed';
    state.error = err.message || 'Не удалось подготовить материалы';
  } finally {
    state.finishedAt = new Date().toISOString();
  }
}

export const filmPrepService = {
  status(mediaId) {
    return runs.get(mediaId) || null;
  },

  isRunning(mediaId) {
    return runs.get(mediaId)?.state === 'running';
  },

  /**
   * Starts preparation in the background; a run already in progress is returned as is.
   * keepQuiz: leave a quiz that already has questions (admin may have edited it by hand).
   */
  start(media, { translate = true, keepQuiz = false } = {}) {
    if (this.isRunning(media.id)) return runs.get(media.id);
    const state = {
      state: 'running',
      stage: 'analysis',
      error: null,
      llmEnabled: llmReady(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      steps: {
        analysis: { state: 'pending' },
        translation: { state: 'pending' },
        words: { state: 'pending' },
        quiz: { state: 'pending' },
      },
    };
    runs.set(media.id, state);
    setImmediate(() => run(media, state, { translate, keepQuiz }));
    return state;
  },

  /**
   * Original subtitles → full preparation; Russian subtitles for an already prepared
   * film → only fill the missing Russian of words and phrases.
   */
  afterSubtitleUpload(media, subtitle, options = {}) {
    if (this.isRunning(media.id)) return;
    if (subtitle.language === normalizeLanguage(media.language)) {
      this.start(media, options);
      return;
    }
    fillTranslations(media).catch((err) => console.warn(`[prep] ${media.id}: translations not filled: ${err.message}`));
  },

  /** Missing Russian for an already prepared film, without re-analysis (keeps learners' progress). */
  fillTranslations(media) {
    return fillTranslations(media);
  },

  forget(mediaId) {
    runs.delete(mediaId);
  },

  async wait(mediaId, timeoutMs = 120000) {
    const started = Date.now();
    while (this.isRunning(mediaId) && Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return this.status(mediaId);
  },
};
