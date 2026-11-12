import { z } from 'zod';
import { config } from '../config/index.js';
import { subtitlesRepository } from '../repositories/subtitles.repository.js';
import { usersRepository } from '../repositories/users.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { findViewableMedia } from '../utils/mediaAccess.js';
import { languageRu, normalizeLanguage } from '../utils/languages.js';
import { parseSubtitleCues } from '../utils/subtitles.js';
import { readSubtitleText } from './processing.service.js';
import { chatText, markInteractiveLlm } from './llm.service.js';

const chatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(2000),
      }),
    )
    .min(1)
    .max(30),
  quote: z.string().trim().max(500).nullable().optional(),
});

const MAX_HISTORY = 12;
const CUES_TTL_MS = 10 * 60 * 1000;
const cuesCache = new Map();
const lastRequest = new Map();

/** Original-language cues of a film: [{ text, start }] (start in seconds), cached for a while. */
export async function filmCues(media) {
  const cached = cuesCache.get(media.id);
  if (cached && cached.expires > Date.now()) return cached.cues;
  const subtitle = await subtitlesRepository.findLatestByMedia(media.id, normalizeLanguage(media.language));
  const cues = subtitle
    ? parseSubtitleCues(await readSubtitleText(subtitle))
        .map((c) => ({ text: c.text.replace(/\s+/g, ' ').trim(), start: c.start }))
        .filter((c) => c.text)
    : [];
  cuesCache.set(media.id, { cues, expires: Date.now() + CUES_TTL_MS });
  return cues;
}

async function filmLines(media) {
  return (await filmCues(media)).map((c) => c.text);
}

function spread(lines, max) {
  if (lines.length <= max) return lines;
  const step = lines.length / max;
  return Array.from({ length: max }, (_, i) => lines[Math.floor(i * step)]);
}

/** Lines around the quoted phrase, so the model sees the scene it comes from. */
function sceneAround(lines, quote) {
  if (!quote) return [];
  const needle = quote.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').trim().slice(0, 60);
  if (!needle) return [];
  const index = lines.findIndex((l) => l.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').includes(needle));
  if (index < 0) return [];
  return lines.slice(Math.max(0, index - 8), index + 9);
}

function learnerLevel(user, language) {
  const entry = (user?.learning_languages || []).find((l) => l.code === language);
  return entry?.level || user?.cefr_level || null;
}

export const filmChatService = {
  async ask(mediaId, userId, body) {
    if (!config.llm.enabled || !config.llm.apiKey) {
      throw createHttpError(400, 'LLM_DISABLED', 'Нейросеть не настроена (LLM_ENABLED / LLM_API_KEY в .env)');
    }
    const parsed = chatSchema.safeParse(body);
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Некорректное сообщение');
    }
    const { messages, quote } = parsed.data;
    if (messages[messages.length - 1].role !== 'user') {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Последнее сообщение должно быть вопросом');
    }

    const now = Date.now();
    if (now - (lastRequest.get(userId) || 0) < 3000) {
      throw createHttpError(429, 'TOO_MANY_REQUESTS', 'Слишком часто — подождите пару секунд');
    }
    lastRequest.set(userId, now);

    const media = await findViewableMedia(mediaId, userId);
    const language = normalizeLanguage(media.language);
    const [lines, user] = await Promise.all([filmLines(media), usersRepository.findById(userId)]);
    const level = learnerLevel(user, language);
    const scene = sceneAround(lines, quote);

    const system = [
      `Ты — дружелюбный преподаватель ${languageRu(language, 'gen')} языка на сайте FilmPrep.`,
      `Ученик смотрит фильм «${media.title}»${level ? `, его уровень ${level}` : ''}.`,
      'Отвечай по-русски, коротко и по делу (обычно до 150 слов), примеры давай на языке фильма с переводом.',
      'Помогай с значением фраз, грамматикой, произношением, сленгом, шутками и культурным контекстом.',
      'О событиях фильма говори только то, что следует из реплик ниже; если не знаешь — честно скажи.',
      'Если вопрос не про фильм и не про язык — мягко верни разговор к учёбе.',
      'Оформление: простой текст, можно **жирный** и списки через «- ». Без таблиц и заголовков.',
      media.description ? `Описание фильма: ${media.description.slice(0, 600)}` : '',
      lines.length ? `Реплики из фильма (выборка по всему фильму):\n${spread(lines, 70).join('\n')}` : 'Субтитров у фильма нет.',
      scene.length ? `Сцена, о которой спрашивают:\n${scene.join('\n')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    // The free model barely reads the system role: context and rules go into the user turns
    const history = messages.slice(-MAX_HISTORY).map((m) => ({ ...m }));
    history[0].content = `${system}\n\n---\nВопрос ученика:\n${history[0].content}`;
    const last = history[history.length - 1];
    last.content = [
      quote ? `Фраза из фильма: «${quote}»` : '',
      last.content,
      '[Правила ответа: только на русском языке (примеры — на языке фильма с переводом), как преподаватель, кратко, без художественного текста и курсива-ремарок.]',
    ]
      .filter(Boolean)
      .join('\n\n');

    try {
      markInteractiveLlm();
      const reply = await chatText('Ты преподаватель иностранного языка. Всегда отвечай на русском языке.', history, {
        temperature: 0.3,
        urgent: true,
      });
      return { reply: reply.slice(0, 6000) };
    } catch (err) {
      console.warn(`[chat] ${media.id}: ${err.message}`);
      throw createHttpError(502, 'LLM_ERROR', 'Нейросеть сейчас не отвечает — попробуйте ещё раз через минуту');
    }
  },
};
