import fsp from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { AVATAR_TYPES, postersDir, uploadsRoot } from '../middleware/upload.js';
import { CEFR_LEVELS } from '../constants.js';
import { config } from '../config/index.js';
import { mediaRepository } from '../repositories/media.repository.js';
import { subtitlesRepository } from '../repositories/subtitles.repository.js';
import { jobsRepository } from '../repositories/jobs.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { LANGUAGE_CODES, languageRu, normalizeLanguage } from '../utils/languages.js';
import { processingService } from './processing.service.js';
import { subtitleTranslationService } from './subtitleTranslation.service.js';
import { videoService } from './video.service.js';
import { filmPrepService } from './filmPrep.service.js';

const optionalUrl = z
  .union([z.string().trim().url('Некорректная ссылка'), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? v : null));

const filmSchema = z.object({
  title: z.string().trim().min(1, 'Укажите название').max(200),
  description: z.string().max(3000).optional().default(''),
  year: z.number().int().min(1888).max(2100).nullable().optional(),
  language: z.enum(LANGUAGE_CODES, { message: 'Неизвестный язык фильма' }).optional().default('en'),
  recommendedLevel: z.enum(CEFR_LEVELS).nullable().optional(),
  posterUrl: z
    .union([
      z.string().trim().url('Некорректная ссылка на обложку'),
      z.string().regex(/^\/uploads\/posters\/[\w.-]+$/),
      z.literal(''),
      z.null(),
    ])
    .optional()
    .transform((v) => (v ? v : v === undefined ? undefined : null)),
  externalWatchUrl: optionalUrl,
});

const LOCAL_POSTER = /^\/uploads\/posters\/([\w.-]+)$/;

async function removeLocalPoster(posterUrl) {
  const match = LOCAL_POSTER.exec(posterUrl || '');
  if (match) await fsp.rm(path.join(postersDir, match[1]), { force: true }).catch(() => {});
}

function youtubeId(url) {
  const match = /(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/|\/live\/)([\w-]{11})/.exec(url);
  return match?.[1] || null;
}

/** Cover from the video link itself: YouTube preview or Vimeo thumbnail. */
async function posterFromLink(url) {
  const yt = youtubeId(url);
  if (yt) return `https://img.youtube.com/vi/${yt}/hqdefault.jpg`;
  if (VIMEO.test(url)) {
    const res = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(url)}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return (await res.json())?.thumbnail_url || null;
  }
  return null;
}

async function wikiPosters(host, query) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '8',
    prop: 'pageimages',
    piprop: 'thumbnail',
    pithumbsize: '500',
    // Film posters are non-free images — without this only free photos (actors) come back
    pilicense: 'any',
  });
  const res = await fetch(`https://${host}/w/api.php?${params}`, {
    headers: { 'User-Agent': 'FilmPrep/1.0 (course project; poster search)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const pages = Object.values((await res.json())?.query?.pages || {});
  return pages
    .filter((p) => p.thumbnail?.source && !/\.svg/i.test(p.thumbnail.source))
    .sort((a, b) => a.index - b.index)
    .map((p) => ({ title: p.title, url: p.thumbnail.source, source: host }));
}

const YOUTUBE = /^https?:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i;
const VIMEO = /^https?:\/\/(www\.|player\.)?vimeo\.com\//i;
const DIRECT = /^https?:\/\/[^\s]+\.(mp4|webm|m3u8|mov|m4v)(\?[^\s]*)?$/i;
const YADISK = /^https?:\/\/(disk\.yandex\.[a-z]+|yadi\.sk)\//i;

const pipelineStatus = (mediaId) => filmPrepService.status(mediaId);

async function findOwned(userId, mediaId) {
  const media = await mediaRepository.findById(mediaId);
  if (!media || media.ownerId !== userId) {
    throw createHttpError(404, 'NOT_FOUND', 'Фильм не найден');
  }
  return media;
}

async function details(media) {
  const language = normalizeLanguage(media.language);
  const [subtitles, jobs] = await Promise.all([
    subtitlesRepository.latestPerLanguage(media.id),
    jobsRepository.list({ mediaId: media.id, limit: 1 }),
  ]);
  const track = (lang) => {
    const s = subtitles.find((row) => row.language === lang);
    return s ? { id: s.id, filename: s.originalFilename, source: s.source, createdAt: s.createdAt } : null;
  };
  const job = jobs[0] || null;
  const { videoStorageKey, videoStorageDriver, ...publicFields } = media;

  return {
    ...publicFields,
    hasStoredVideo: Boolean(videoStorageKey),
    languageName: languageRu(language),
    streamUrl: videoService.streamUrlFor(media),
    subtitles: { original: track(language), ru: track('ru') },
    analysis: job ? { status: job.status, error: job.errorMessage, finishedAt: job.finishedAt } : null,
    translation: subtitleTranslationService.getStatus(media.id),
    materials: {
      words: media.lexiconCount ?? 0,
      phrases: media.phrasesCount ?? 0,
      grammar: media.grammarCount ?? 0,
      quizQuestions: media.quizQuestionCount ?? 0,
    },
    pipeline: pipelineStatus(media.id),
    llmEnabled: Boolean(config.llm.enabled && config.llm.apiKey),
  };
}

export const myFilmsService = {
  limit: () => config.userFilms.limit,

  async list(userId) {
    const items = await mediaRepository.listOwned(userId);
    return items.map(({ videoStorageKey, videoStorageDriver, ...item }) => ({
      ...item,
      words: item.lexiconCount,
      pipeline: pipelineStatus(item.id),
    }));
  },

  async get(userId, mediaId) {
    return details(await findOwned(userId, mediaId));
  },

  async create(userId, input) {
    const parsed = filmSchema.safeParse(input);
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Проверьте поля');
    }
    const count = await mediaRepository.countOwned(userId);
    if (count >= config.userFilms.limit) {
      throw createHttpError(
        400,
        'LIMIT_REACHED',
        `Можно добавить не больше ${config.userFilms.limit} своих фильмов — удалите ненужные`,
      );
    }
    const media = await mediaRepository.create({ ...parsed.data, status: 'private', ownerId: userId });
    return details(media);
  },

  async update(userId, mediaId, input) {
    const media = await findOwned(userId, mediaId);
    const parsed = filmSchema.partial().safeParse(input);
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', parsed.error.issues[0]?.message || 'Проверьте поля');
    }
    const data = Object.fromEntries(Object.entries(parsed.data).filter(([, value]) => value !== undefined));
    if (data.language && data.language !== media.language) {
      const original = await subtitlesRepository.findLatestByMedia(media.id, normalizeLanguage(media.language));
      if (original) {
        throw createHttpError(
          400,
          'VALIDATION_ERROR',
          'Субтитры уже загружены на другом языке — создайте фильм заново, чтобы сменить язык',
        );
      }
    }
    await mediaRepository.update(media.id, { ...data, status: 'private' });
    if (data.posterUrl !== undefined && data.posterUrl !== media.posterUrl) {
      await removeLocalPoster(media.posterUrl);
    }
    return this.get(userId, mediaId);
  },

  async remove(userId, mediaId) {
    const media = await findOwned(userId, mediaId);
    if (filmPrepService.isRunning(media.id)) {
      throw createHttpError(409, 'BUSY', 'Дождитесь окончания подготовки материалов');
    }
    if (media.videoStatus === 'processing') {
      throw createHttpError(409, 'VIDEO_BUSY', 'Дождитесь окончания обработки видео');
    }
    if (media.videoStorageKey) await videoService.removeVideo(media.id);
    await mediaRepository.remove(media.id);
    await removeLocalPoster(media.posterUrl);
    filmPrepService.forget(media.id);
    return { ok: true };
  },

  async uploadVideo(userId, mediaId, file) {
    if (!file) throw createHttpError(400, 'VALIDATION_ERROR', 'Выберите видеофайл');
    await findOwned(userId, mediaId).catch(async (err) => {
      await fsp.rm(file.path, { force: true }).catch(() => {});
      throw err;
    });
    await videoService.startFromUpload(mediaId, file);
    return this.get(userId, mediaId);
  },

  /** One field for any link: YouTube/Vimeo, a direct mp4/m3u8 file or a public Yandex Disk file. */
  async setVideoLink(userId, mediaId, rawUrl) {
    const media = await findOwned(userId, mediaId);
    const url = String(rawUrl || '').trim();
    if (!url) throw createHttpError(400, 'VALIDATION_ERROR', 'Вставьте ссылку на видео');

    if (YADISK.test(url)) {
      await videoService.startFromYandexDisk(media.id, { publicUrl: url });
      return this.get(userId, mediaId);
    }
    if (!YOUTUBE.test(url) && !VIMEO.test(url) && !DIRECT.test(url)) {
      throw createHttpError(
        400,
        'VALIDATION_ERROR',
        'Поддерживаются ссылки YouTube, Vimeo, публичные ссылки Яндекс Диска и прямые ссылки на .mp4/.webm/.m3u8',
      );
    }
    if (media.videoStorageKey || media.videoStatus !== 'none') await videoService.removeVideo(media.id);
    const poster = media.posterUrl ? null : await posterFromLink(url).catch(() => null);
    await mediaRepository.update(media.id, {
      videoUrl: url,
      status: 'private',
      ...(poster ? { posterUrl: poster } : {}),
    });
    return this.get(userId, mediaId);
  },

  async uploadPoster(userId, mediaId, file) {
    const media = await findOwned(userId, mediaId);
    if (!file) throw createHttpError(400, 'VALIDATION_ERROR', 'Выберите картинку');
    const name = `${media.id}-${Date.now()}.${AVATAR_TYPES[file.mimetype]}`;
    await fsp.writeFile(path.join(postersDir, name), file.buffer);
    await mediaRepository.update(media.id, { posterUrl: `/uploads/posters/${name}`, status: 'private' });
    await removeLocalPoster(media.posterUrl);
    return this.get(userId, mediaId);
  },

  async removePoster(userId, mediaId) {
    const media = await findOwned(userId, mediaId);
    await mediaRepository.update(media.id, { posterUrl: null, status: 'private' });
    await removeLocalPoster(media.posterUrl);
    return this.get(userId, mediaId);
  },

  /** Cover candidates by title from Wikipedia (ru + en), the user picks one. */
  async searchPosters(userId, mediaId, rawQuery) {
    const media = await findOwned(userId, mediaId);
    const title = String(rawQuery || media.title).trim().slice(0, 120);
    if (!title) return { items: [] };
    const results = await Promise.allSettled([
      wikiPosters('ru.wikipedia.org', `${title} фильм`),
      wikiPosters('en.wikipedia.org', `${title} film`),
      media.language !== 'en' && media.language !== 'ru'
        ? wikiPosters(`${media.language}.wikipedia.org`, title)
        : Promise.resolve([]),
    ]);
    const words = title.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
    const relevance = (item) => {
      const name = item.title.toLowerCase();
      return words.filter((w) => name.includes(w)).length / (words.length || 1);
    };
    const seen = new Set();
    const items = results
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .filter((item) => (seen.has(item.url) ? false : seen.add(item.url)))
      .map((item, order) => ({ item, order, score: relevance(item) }))
      .sort((a, b) => b.score - a.score || a.order - b.order)
      .map(({ item }) => item)
      .slice(0, 12);
    return { items };
  },

  async removeVideo(userId, mediaId) {
    const media = await findOwned(userId, mediaId);
    await videoService.removeVideo(media.id);
    return this.get(userId, mediaId);
  },

  /** Subtitles in the film's language start the whole preparation right away. */
  async uploadSubtitle(userId, mediaId, file, language) {
    const media = await findOwned(userId, mediaId);
    const subtitle = await processingService.uploadSubtitle(mediaId, file, language);
    filmPrepService.afterSubtitleUpload(media, subtitle);
    return this.get(userId, mediaId);
  },

  /** role: "original" | "ru". Words, phrases and the quiz stay — they are rebuilt from new subtitles. */
  async removeSubtitles(userId, mediaId, role) {
    const media = await findOwned(userId, mediaId);
    if (role !== 'original' && role !== 'ru') {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Укажите, какие субтитры удалить');
    }
    if (filmPrepService.isRunning(media.id) || subtitleTranslationService.getStatus(media.id).state === 'running') {
      throw createHttpError(409, 'BUSY', 'Дождитесь окончания подготовки или перевода');
    }
    const language = role === 'ru' ? 'ru' : normalizeLanguage(media.language);
    const files = await subtitlesRepository.removeByLanguage(media.id, language);
    if (!files.length) throw createHttpError(404, 'NOT_FOUND', 'Этих субтитров уже нет');
    await Promise.all(files.map((file) => fsp.rm(path.join(uploadsRoot, file), { force: true }).catch(() => {})));
    if (role === 'ru') subtitleTranslationService.forget(media.id);
    return this.get(userId, mediaId);
  },

  /** Russian subtitles by the LLM from the original ones; then Russian for phrases is taken from them. */
  async translateSubtitles(userId, mediaId) {
    const media = await findOwned(userId, mediaId);
    if (filmPrepService.isRunning(media.id)) {
      throw createHttpError(409, 'BUSY', 'Дождитесь окончания подготовки материалов');
    }
    if (await subtitlesRepository.findLatestByMedia(media.id, 'ru')) {
      throw createHttpError(409, 'HAS_RU', 'Русские субтитры уже есть — удалите их, чтобы перевести заново');
    }
    await subtitleTranslationService.start(media.id);
    subtitleTranslationService
      .waitFor(media.id)
      .then((status) => status.state === 'done' && filmPrepService.fillTranslations(media))
      .catch((err) => console.warn(`[subs-ru] ${media.id}: phrases not filled: ${err.message}`));
    return this.get(userId, mediaId);
  },

  async prepare(userId, mediaId, { translate = true } = {}) {
    const media = await findOwned(userId, mediaId);
    const original = await subtitlesRepository.findLatestByMedia(media.id, normalizeLanguage(media.language));
    if (!original) {
      throw createHttpError(
        400,
        'NO_SUBTITLES',
        `Сначала загрузите субтитры на языке фильма (${languageRu(normalizeLanguage(media.language))})`,
      );
    }
    filmPrepService.start(media, { translate: translate !== false });
    return this.get(userId, mediaId);
  },

  /** For tests/scripts: wait until the pipeline finishes. */
  waitForPipeline(mediaId, timeoutMs = 120000) {
    return filmPrepService.wait(mediaId, timeoutMs);
  },
};
