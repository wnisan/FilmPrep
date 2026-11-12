import { mediaService } from '../services/media.service.js';
import { videoService } from '../services/video.service.js';
import { createHttpError } from '../utils/httpError.js';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { AVATAR_TYPES, postersDir } from '../middleware/upload.js';

/** Only files we uploaded ourselves are deleted; bundled /posters/* stay. */
async function removeUploadedPoster(posterUrl) {
  const match = /^\/uploads\/posters\/([\w.-]+)$/.exec(posterUrl || '');
  if (match) await fsp.rm(path.join(postersDir, match[1]), { force: true }).catch(() => {});
}

function toLearnerMedia(item) {
  const {
    videoStorageKey,
    videoStorageDriver,
    videoError,
    videoStage,
    videoProgress,
    ...rest
  } = item;
  return { ...rest, streamUrl: videoService.streamUrlFor(item) };
}

function withStream(item) {
  return { ...item, streamUrl: videoService.streamUrlFor(item) };
}

export const mediaController = {
  async list(req, res, next) {
    try {
      const result = await mediaService.listForLearner(req.query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async filters(req, res, next) {
    try {
      res.json(await mediaService.filterOptions());
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const item = await mediaService.getViewableById(req.params.id, req.user);
      res.json({ item: { ...toLearnerMedia(item), isOwn: Boolean(item.ownerId) && item.ownerId === req.user.id } });
    } catch (err) {
      next(err);
    }
  },
};

export const adminMediaController = {
  async list(req, res, next) {
    try {
      const result = await mediaService.listForAdmin(req.query);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },

  async getById(req, res, next) {
    try {
      const item = await mediaService.getForAdmin(req.params.id);
      res.json({ item: withStream(item) });
    } catch (err) {
      next(err);
    }
  },

  async create(req, res, next) {
    try {
      const item = await mediaService.create(req.body);
      res.status(201).json({ item });
    } catch (err) {
      next(err);
    }
  },

  async update(req, res, next) {
    try {
      const item = await mediaService.update(req.params.id, req.body);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  },

  async remove(req, res, next) {
    try {
      await mediaService.remove(req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },

  async uploadVideo(req, res, next) {
    try {
      if (!req.file) {
        throw createHttpError(400, 'NO_FILE', 'Video file is required');
      }
      const item = await videoService.startFromUpload(req.params.id, req.file);
      res.status(202).json({ item });
    } catch (err) {
      next(err);
    }
  },

  async uploadPoster(req, res, next) {
    try {
      const media = await mediaService.getForAdmin(req.params.id);
      if (!req.file) throw createHttpError(400, 'NO_FILE', 'Выберите картинку');
      const name = `${media.id}-${Date.now()}.${AVATAR_TYPES[req.file.mimetype]}`;
      await fsp.writeFile(path.join(postersDir, name), req.file.buffer);
      const item = await mediaService.update(media.id, { posterUrl: `/uploads/posters/${name}` });
      await removeUploadedPoster(media.posterUrl);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  },

  async removePoster(req, res, next) {
    try {
      const media = await mediaService.getForAdmin(req.params.id);
      const item = await mediaService.update(media.id, { posterUrl: null });
      await removeUploadedPoster(media.posterUrl);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  },

  async removeVideo(req, res, next) {
    try {
      const item = await videoService.removeVideo(req.params.id);
      res.json({ item });
    } catch (err) {
      next(err);
    }
  },

  async storageInfo(_req, res, next) {
    try {
      res.json({ storage: await videoService.storageInfo() });
    } catch (err) {
      next(err);
    }
  },

  async yandexDiskVideos(_req, res, next) {
    try {
      res.json(await videoService.listYandexDiskVideos());
    } catch (err) {
      next(err);
    }
  },

  async importFromYandexDisk(req, res, next) {
    try {
      const { path, publicUrl } = req.body || {};
      const item = await videoService.startFromYandexDisk(req.params.id, { path, publicUrl });
      res.status(202).json({ item });
    } catch (err) {
      next(err);
    }
  },
};

export const streamController = {
  async serve(req, res, next) {
    try {
      await videoService.serveStream(req, res);
    } catch (err) {
      next(err);
    }
  },
};
