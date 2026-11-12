import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';
import { mediaRepository } from '../repositories/media.repository.js';
import { subtitlesRepository } from '../repositories/subtitles.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { uploadsRoot } from '../middleware/upload.js';
import { parseSubtitleCues, cuesToSrt } from '../utils/subtitles.js';
import { chatJson, collect } from './llm.service.js';
import { readSubtitleText } from './processing.service.js';
import { languageRu, normalizeLanguage } from '../utils/languages.js';

const BATCH_SIZE = 40;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** In-memory status per film: { state, done, total, error } */
const statuses = new Map();

async function translateBatch(batch, language) {
  const payload = batch.map((cue, i) => ({ i, text: cue.text.replace(/\n/g, ' ') }));
  const parsed = await chatJson(
    `Ты переводчик субтитров фильмов с ${languageRu(language, 'gen')} на русский. Отвечай ТОЛЬКО валидным JSON-массивом без markdown.`,
    `Переведи каждую реплику на естественный разговорный русский, сохраняя смысл и тон.
Не объединяй и не пропускай реплики. Верни JSON-массив: [{"i":0,"ru":"..."}]
Реплики:
${JSON.stringify(payload)}`,
  );
  return collect(parsed, 'ru');
}

async function run(mediaId, subtitle) {
  const status = statuses.get(mediaId);
  try {
    const cues = parseSubtitleCues(await readSubtitleText(subtitle));
    status.total = cues.length;
    const translated = [];

    for (let offset = 0; offset < cues.length; offset += BATCH_SIZE) {
      const batch = cues.slice(offset, offset + BATCH_SIZE);
      const map = new Map();
      // Free models sometimes drop lines: the second attempt asks only for the missing ones
      for (let attempt = 0; attempt < 2 && map.size < batch.length; attempt += 1) {
        const missing = batch.map((cue, i) => ({ cue, i })).filter(({ i }) => !map.has(i));
        try {
          if (attempt) await sleep(config.llm.minIntervalMs);
          const got = await translateBatch(
            missing.map(({ cue }) => cue),
            subtitle.language,
          );
          for (const [k, text] of got) if (missing[k]) map.set(missing[k].i, text);
        } catch (err) {
          console.warn(`[subs-ru] batch ${offset} failed: ${err.message}`);
        }
      }
      batch.forEach((cue, i) => {
        translated.push({ ...cue, text: map.get(i) || cue.text });
      });
      status.done = Math.min(cues.length, offset + batch.length);
      if (offset + BATCH_SIZE < cues.length) await sleep(config.llm.minIntervalMs);
    }

    const filename = `${Date.now()}-ai-ru-${mediaId}.srt`;
    await fs.writeFile(path.join(uploadsRoot, filename), cuesToSrt(translated), 'utf8');
    await subtitlesRepository.create({
      mediaId,
      originalFilename: `${subtitle.originalFilename.replace(/\.(srt|vtt)$/i, '')}.ru (ИИ).srt`,
      storagePath: filename,
      format: 'srt',
      language: 'ru',
      source: 'ai',
    });
    status.state = 'done';
    console.log(`[subs-ru] ${mediaId}: ${translated.length} cues translated`);
  } catch (err) {
    status.state = 'failed';
    status.error = err.message;
    console.error(`[subs-ru] ${mediaId} failed`, err);
  }
}

export const subtitleTranslationService = {
  getStatus(mediaId) {
    return statuses.get(mediaId) || { state: 'idle', done: 0, total: 0, error: null };
  },

  async start(mediaId) {
    if (!config.llm.enabled || !config.llm.apiKey) {
      throw createHttpError(400, 'LLM_DISABLED', 'Нейросеть не настроена (LLM_ENABLED / LLM_API_KEY в .env)');
    }
    const media = await mediaRepository.findById(mediaId);
    if (!media) throw createHttpError(404, 'NOT_FOUND', 'Media not found');
    if (statuses.get(mediaId)?.state === 'running') {
      throw createHttpError(409, 'BUSY', 'Перевод уже идёт');
    }
    const language = normalizeLanguage(media.language);
    const subtitle = await subtitlesRepository.findLatestByMedia(mediaId, language);
    if (!subtitle) {
      throw createHttpError(400, 'NO_SUBTITLES', `Сначала загрузите субтитры на языке фильма (${languageRu(language)})`);
    }
    statuses.set(mediaId, { state: 'running', done: 0, total: 0, error: null });
    setImmediate(() => run(mediaId, subtitle));
    return this.getStatus(mediaId);
  },

  async waitFor(mediaId) {
    while (statuses.get(mediaId)?.state === 'running') {
      await sleep(1000);
    }
    return this.getStatus(mediaId);
  },

  /** For scripts: translate and wait. */
  async translateAndWait(mediaId) {
    await this.start(mediaId);
    return this.waitFor(mediaId);
  },

  forget(mediaId) {
    if (statuses.get(mediaId)?.state !== 'running') statuses.delete(mediaId);
  },
};
