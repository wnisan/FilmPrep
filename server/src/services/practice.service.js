import { z } from 'zod';
import { config } from '../config/index.js';
import { createHttpError } from '../utils/httpError.js';
import { findViewableMedia } from '../utils/mediaAccess.js';
import { languageRu, normalizeLanguage } from '../utils/languages.js';
import { chatJson } from './llm.service.js';
import { filmCues } from './filmChat.service.js';

const SCENE_SIZE = 8;

const retellSchema = z.object({
  start: z.number().int().min(0),
  text: z.string().trim().min(15, 'Напишите хотя бы пару предложений').max(2000),
});

function sceneAt(cues, start) {
  return cues.slice(start, start + SCENE_SIZE);
}

/** Scenes with real dialogue: enough words in the window, not just «Oh!» and «Yeah». */
function goodStarts(cues) {
  const starts = [];
  for (let i = 0; i + SCENE_SIZE <= cues.length; i += Math.ceil(SCENE_SIZE / 2)) {
    const words = sceneAt(cues, i).reduce((n, c) => n + c.text.split(/\s+/).length, 0);
    if (words >= 30) starts.push(i);
  }
  return starts;
}

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const str = (v, max = 400) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export const practiceService = {
  async scene(mediaId, user, { exclude } = {}) {
    const media = await findViewableMedia(mediaId, user);
    const cues = await filmCues(media);
    const starts = goodStarts(cues);
    if (!starts.length) {
      throw createHttpError(404, 'NO_SCENES', 'В субтитрах этого фильма мало диалогов для пересказа');
    }
    const pool = starts.length > 1 ? starts.filter((s) => s !== Number(exclude)) : starts;
    const start = pool[Math.floor(Math.random() * pool.length)];
    return {
      start,
      lines: sceneAt(cues, start).map((c) => ({ text: c.text, startMs: Math.round(c.start * 1000) })),
      llmEnabled: Boolean(config.llm.enabled && config.llm.apiKey),
    };
  },

  async checkRetell(mediaId, user, body) {
    if (!config.llm.enabled || !config.llm.apiKey) {
      throw createHttpError(400, 'LLM_DISABLED', 'Нейросеть не настроена — проверка пересказа недоступна');
    }
    const parsed = retellSchema.safeParse(body);
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Некорректный пересказ');
    }
    const media = await findViewableMedia(mediaId, user);
    const language = normalizeLanguage(media.language);
    const scene = sceneAt(await filmCues(media), parsed.data.start);
    if (!scene.length) throw createHttpError(400, 'VALIDATION_ERROR', 'Сцена не найдена');
    const lang = languageRu(language, 'prep');

    let result;
    try {
      result = await chatJson(
        'Ты строгий, но доброжелательный преподаватель. Отвечай ТОЛЬКО валидным JSON-объектом без markdown.',
        `Фильм «${media.title}». Сцена (реплики по порядку):
${scene.map((c) => c.text).join('\n')}

Ученик пересказал эту сцену своими словами на ${lang} языке:
"""${parsed.data.text}"""

Оцени пересказ:
- score — целое 0–10: насколько верно передан смысл сцены и насколько грамотен ${languageRu(language, 'nom')} язык;
- если пересказ написан не на ${lang}, а по-русски — оцени смысл, но score не выше 4 и в verdict попроси попробовать на ${lang};
- verdict — 1–2 предложения по-русски: общий вывод;
- good — 1–3 коротких пункта по-русски, что получилось;
- mistakes — до 5 ошибок: wrong (фрагмент ученика), right (как правильно на ${lang}), why (объяснение по-русски);
- improved — исправленная и чуть улучшенная версия пересказа на ${lang} (не длиннее оригинала более чем в 1.5 раза).
Формат: {"score":7,"verdict":"...","good":["..."],"mistakes":[{"wrong":"...","right":"...","why":"..."}],"improved":"..."}`,
      );
    } catch (err) {
      console.warn(`[practice] retell check failed: ${err.message}`);
      throw createHttpError(502, 'LLM_ERROR', 'Нейросеть сейчас не отвечает — попробуйте ещё раз через минуту');
    }
    if (!result || typeof result !== 'object' || Array.isArray(result) || result.__raw) {
      throw createHttpError(502, 'LLM_ERROR', 'Нейросеть ответила непонятно — попробуйте ещё раз');
    }
    return {
      score: clamp(Math.round(Number(result.score) || 0), 0, 10),
      verdict: str(result.verdict, 500),
      good: (Array.isArray(result.good) ? result.good : []).map((g) => str(g, 200)).filter(Boolean).slice(0, 3),
      mistakes: (Array.isArray(result.mistakes) ? result.mistakes : [])
        .map((m) => ({ wrong: str(m?.wrong, 200), right: str(m?.right, 200), why: str(m?.why, 300) }))
        .filter((m) => m.wrong || m.right)
        .slice(0, 5),
      improved: str(result.improved, 3000),
    };
  },
};
