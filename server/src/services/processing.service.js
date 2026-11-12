import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { mediaRepository } from '../repositories/media.repository.js';
import { subtitlesRepository } from '../repositories/subtitles.repository.js';
import { jobsRepository } from '../repositories/jobs.repository.js';
import { learningRepository } from '../repositories/learning.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { uploadsRoot } from '../middleware/upload.js';
import { enrichLearningMaterials } from './llm.service.js';
import { config } from '../config/index.js';
import { decodeSubtitleBuffer, parseSubtitleCues } from '../utils/subtitles.js';
import { languageRu, normalizeLanguage } from '../utils/languages.js';

function trackLabel(language) {
  if (language === 'ru') return 'Русский';
  const name = languageRu(language);
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function mediaLanguage(media) {
  return normalizeLanguage(media?.language);
}

export async function readSubtitleText(subtitle) {
  const buffer = await fs.readFile(path.join(uploadsRoot, subtitle.storagePath));
  return decodeSubtitleBuffer(buffer);
}

async function loadExtractor() {
  // ml-module рядом с server/ (монорепо filmprep)
  const modulePath = path.resolve(uploadsRoot, '../../ml-module/src/index.js');
  const mod = await import(pathToFileURL(modulePath).href);
  return mod.extractLearningMaterials;
}

function detectFormat(filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.vtt')) return 'vtt';
  if (lower.endsWith('.srt')) return 'srt';
  return null;
}

export const processingService = {
  async uploadSubtitle(mediaId, file, requestedLanguage) {
    const media = await mediaRepository.findById(mediaId);
    if (!media) {
      throw createHttpError(404, 'NOT_FOUND', 'Media not found');
    }
    if (!file) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Subtitle file is required');
    }

    const format = detectFormat(file.originalname);
    if (!format) {
      throw createHttpError(400, 'INVALID_FILE', 'Only .srt or .vtt allowed');
    }
    const original = mediaLanguage(media);
    const language = requestedLanguage === 'ru' ? 'ru' : original;
    if (requestedLanguage && requestedLanguage !== 'ru' && requestedLanguage !== original) {
      throw createHttpError(
        400,
        'VALIDATION_ERROR',
        `Субтитры могут быть на языке фильма (${languageRu(original)}) или русские`,
      );
    }

    return subtitlesRepository.create({
      mediaId,
      originalFilename: file.originalname,
      storagePath: file.filename,
      format,
      language,
    });
  },

  /** Tracks for the player: newest file per language. */
  async getSubtitleTracks(mediaId) {
    const [media, rows] = await Promise.all([
      mediaRepository.findById(mediaId),
      subtitlesRepository.latestPerLanguage(mediaId),
    ]);
    const original = mediaLanguage(media);
    return rows
      .filter((s) => s.language === 'ru' || s.language === original)
      .map((s) => ({
        id: s.id,
        language: s.language,
        label: trackLabel(s.language),
        role: s.language === 'ru' ? 'translation' : 'original',
        source: s.source,
      }))
      .sort((a, b) => (a.role === b.role ? 0 : a.role === 'original' ? -1 : 1));
  },

  async getSubtitleCues(mediaId, subtitleId) {
    const subtitle = await subtitlesRepository.findById(subtitleId);
    if (!subtitle || subtitle.mediaId !== mediaId) {
      throw createHttpError(404, 'NOT_FOUND', 'Subtitle not found for this media');
    }
    return parseSubtitleCues(await readSubtitleText(subtitle));
  },

  async listSubtitles(mediaId) {
    const media = await mediaRepository.findById(mediaId);
    if (!media) {
      throw createHttpError(404, 'NOT_FOUND', 'Media not found');
    }
    return subtitlesRepository.listByMedia(mediaId);
  },

  async startProcessing(mediaId, subtitleId) {
    const media = await mediaRepository.findById(mediaId);
    if (!media) {
      throw createHttpError(404, 'NOT_FOUND', 'Media not found');
    }

    const original = mediaLanguage(media);
    const needOriginal = `Для анализа нужны субтитры на языке фильма (${languageRu(original)})`;
    let subtitle;
    if (subtitleId) {
      subtitle = await subtitlesRepository.findById(subtitleId);
      if (!subtitle || subtitle.mediaId !== mediaId) {
        throw createHttpError(404, 'NOT_FOUND', 'Subtitle not found for this media');
      }
      if (subtitle.language !== original) {
        throw createHttpError(400, 'VALIDATION_ERROR', needOriginal);
      }
    } else {
      subtitle = await subtitlesRepository.findLatestByMedia(mediaId, original);
      if (!subtitle) {
        throw createHttpError(400, 'NO_SUBTITLES', `Сначала загрузите субтитры на языке фильма (${languageRu(original)})`);
      }
    }

    const job = await jobsRepository.create({
      mediaId,
      subtitleId: subtitle.id,
    });

    // Асинхронный запуск NLP (не блокируем HTTP-ответ)
    setImmediate(() => {
      this.runJob(job.id).catch((err) => {
        console.error(`[nlp] job ${job.id} failed`, err);
      });
    });

    return job;
  },

  async runJob(jobId) {
    const job = await jobsRepository.findById(jobId);
    if (!job) return;

    await jobsRepository.markProcessing(jobId);

    try {
      const subtitle = await subtitlesRepository.findById(job.subtitleId);
      if (!subtitle) {
        throw new Error('Subtitle record missing');
      }

      const content = await readSubtitleText(subtitle);
      const extractLearningMaterials = await loadExtractor();
      const language = normalizeLanguage(subtitle.language);
      let result = extractLearningMaterials(content, subtitle.format, { language });

      if (config.llm.enabled) {
        const enriched = await enrichLearningMaterials(result, {
          language,
          cues: language === 'en' ? [] : parseSubtitleCues(content),
        });
        result = enriched.materials;
        console.log(
          `[nlp] llm enrichment: ${enriched.enriched ? 'ok' : 'skipped'} (${enriched.reason}) model=${config.llm.model}`,
        );
      }

      await learningRepository.replaceMaterials(job.mediaId, {
        lexicon: result.lexicon,
        phrases: result.phrases,
        grammar: result.grammar,
      });

      await jobsRepository.markDone(jobId);
      console.log(
        `[nlp] job ${jobId} done (${language}): lexicon=${result.lexicon.length}, phrases=${result.phrases.length}, grammar=${result.grammar.length}`,
      );
    } catch (err) {
      await jobsRepository.markFailed(jobId, err.message || 'Processing failed');
      throw err;
    }
  },

  async listJobs(query = {}) {
    return jobsRepository.list(query);
  },
};
