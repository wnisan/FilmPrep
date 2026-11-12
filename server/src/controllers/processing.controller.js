import { processingService } from '../services/processing.service.js';
import { learningService } from '../services/learning.service.js';
import { subtitleTranslationService } from '../services/subtitleTranslation.service.js';
import { findViewableMedia as assertViewable } from '../utils/mediaAccess.js';
import { filmPrepService } from '../services/filmPrep.service.js';
import { mediaRepository } from '../repositories/media.repository.js';
import { subtitlesRepository } from '../repositories/subtitles.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { normalizeLanguage } from '../utils/languages.js';

export const processingController = {
  async upload(req, res, next) {
    try {
      const subtitle = await processingService.uploadSubtitle(
        req.params.id,
        req.file,
        req.body?.language || undefined,
      );
      const media = await mediaRepository.findById(req.params.id);
      // a quiz the admin already edited by hand is kept
      filmPrepService.afterSubtitleUpload(media, subtitle, { keepQuiz: true });
      res.status(201).json({ subtitle, prep: filmPrepService.status(media.id) });
    } catch (err) {
      next(err);
    }
  },

  async startTranslation(req, res, next) {
    try {
      const status = await subtitleTranslationService.start(req.params.id);
      res.status(202).json({ status });
    } catch (err) {
      next(err);
    }
  },

  translationStatus(req, res) {
    res.json({ status: subtitleTranslationService.getStatus(req.params.id) });
  },

  async listSubtitles(req, res, next) {
    try {
      const items = await processingService.listSubtitles(req.params.id);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  },

  /** Full preparation: analysis → Russian subtitles → Russian for words/phrases → quiz. */
  async process(req, res, next) {
    try {
      const media = await mediaRepository.findById(req.params.id);
      if (!media) throw createHttpError(404, 'NOT_FOUND', 'Media not found');
      const original = await subtitlesRepository.findLatestByMedia(media.id, normalizeLanguage(media.language));
      if (!original) {
        throw createHttpError(400, 'NO_SUBTITLES', 'Сначала загрузите субтитры на языке фильма');
      }
      const prep = filmPrepService.start(media, { keepQuiz: req.body?.regenerateQuiz !== true });
      res.status(202).json({ prep });
    } catch (err) {
      next(err);
    }
  },

  prepStatus(req, res) {
    res.json({ prep: filmPrepService.status(req.params.id) });
  },

  async listJobs(req, res, next) {
    try {
      const items = await processingService.listJobs({
        mediaId: req.query.mediaId,
        limit: req.query.limit ? Number(req.query.limit) : 20,
      });
      res.json({ items });
    } catch (err) {
      next(err);
    }
  },
};

export const learningController = {
  async subtitleTracks(req, res, next) {
    try {
      await assertViewable(req.params.id, req.user);
      const items = await processingService.getSubtitleTracks(req.params.id);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  },

  async subtitleCues(req, res, next) {
    try {
      await assertViewable(req.params.id, req.user);
      const cues = await processingService.getSubtitleCues(req.params.id, req.params.subtitleId);
      res.set('Cache-Control', 'private, max-age=300');
      res.json({ cues });
    } catch (err) {
      next(err);
    }
  },

  async lexicon(req, res, next) {
    try {
      const items = await learningService.getLexicon(req.params.id, req.query.level, req.user);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  },

  async phrases(req, res, next) {
    try {
      const items = await learningService.getPhrases(req.params.id, req.user);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  },

  async grammar(req, res, next) {
    try {
      const items = await learningService.getGrammar(req.params.id, req.user);
      res.json({ items });
    } catch (err) {
      next(err);
    }
  },
};
