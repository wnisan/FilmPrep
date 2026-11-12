import fsp from 'node:fs/promises';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { mediaRepository } from '../repositories/media.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { postersDir, uploadsRoot } from '../middleware/upload.js';
import { getStorage, putDirectory, contentTypeFor } from './storage.service.js';
import { extractPosterFrame, transcodeToHls } from './hls.service.js';
import { yadisk, yadiskConfigured } from './yadisk.service.js';

const tmpRoot = path.join(uploadsRoot, 'tmp');

// ffmpeg is CPU-heavy: one film at a time
let queue = Promise.resolve();
function enqueue(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last >= ms) {
      last = now;
      fn(...args);
    }
  };
}

const streamMetaCache = new Map();
const STREAM_META_TTL_MS = 30_000;

async function getStreamMeta(mediaId) {
  const cached = streamMetaCache.get(mediaId);
  if (cached && cached.expires > Date.now()) return cached.value;
  const media = await mediaRepository.findById(mediaId);
  const value =
    media && media.videoStatus === 'ready' && media.videoStorageKey
      ? { key: media.videoStorageKey, driver: media.videoStorageDriver || 'local' }
      : null;
  streamMetaCache.set(mediaId, { value, expires: Date.now() + STREAM_META_TTL_MS });
  return value;
}

// HLS keys contain an upload timestamp, so cached cloud files never go stale
const cacheRoot = path.join(uploadsRoot, 'cache');
const cacheJobs = new Map();
const PREFETCH_SEGMENTS = 4;

const cachePath = (key) => path.join(cacheRoot, ...key.split('/'));

async function downloadObject(storage, key) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const { body } = await storage.getObject(key);
      const chunks = [];
      for await (const chunk of body) chunks.push(chunk);
      return Buffer.concat(chunks);
    } catch (err) {
      if (err.status === 404) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

/** Path of a local copy of a cloud object; downloads it once, concurrent callers share the job. */
async function cachedFile(storage, key) {
  const file = cachePath(key);
  if (await fsp.access(file).then(() => true, () => false)) return file;
  if (!cacheJobs.has(key)) {
    const job = (async () => {
      const data = await downloadObject(storage, key);
      await fsp.mkdir(path.dirname(file), { recursive: true });
      const part = `${file}.${Date.now()}.part`;
      await fsp.writeFile(part, data);
      await fsp.rename(part, file);
      return file;
    })().finally(() => cacheJobs.delete(key));
    cacheJobs.set(key, job);
  }
  return cacheJobs.get(key);
}

function prefetchNext(storage, key) {
  const match = /^(.*?)(\d+)(\.\w+)$/.exec(key);
  if (!match) return;
  const [, head, num, ext] = match;
  (async () => {
    for (let i = 1; i <= PREFETCH_SEGMENTS; i += 1) {
      const next = `${head}${String(Number(num) + i).padStart(num.length, '0')}${ext}`;
      await cachedFile(storage, next);
    }
  })().catch(() => {});
}

// The bucket is far away (2–7 s per segment), so every cloud film is copied to the local
// cache in the background: the cloud stays the source of truth, playback reads local files.
const warmQueue = [];
let warming = false;
const WARM_PARALLEL = 3;

const playlistEntries = (text) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

async function readCachedText(storage, key) {
  return fsp.readFile(await cachedFile(storage, key), 'utf8');
}

/** Lowest quality first: the player starts on it and "Из фильма" clips use it. */
async function warmFilm(meta) {
  const storage = getStorage(meta.driver);
  if (storage.name === 'local') return 0;
  const dir = path.posix.dirname(meta.key);
  const variants = playlistEntries(await readCachedText(storage, meta.key)).sort(
    (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0),
  );
  let count = 0;
  for (const variant of variants) {
    const variantKey = `${dir}/${variant}`;
    const variantDir = path.posix.dirname(variantKey);
    const segments = playlistEntries(await readCachedText(storage, variantKey)).map((s) => `${variantDir}/${s}`);
    let next = 0;
    await Promise.all(
      Array.from({ length: WARM_PARALLEL }, async () => {
        while (next < segments.length) {
          const key = segments[next];
          next += 1;
          await cachedFile(storage, key).catch(() => {});
          count += 1;
        }
      }),
    );
  }
  return count;
}

async function drainWarmQueue() {
  warming = true;
  while (warmQueue.length) {
    const mediaId = warmQueue.shift();
    try {
      const meta = await getStreamMeta(mediaId);
      if (meta) {
        const files = await warmFilm(meta);
        if (files) console.log(`[cache] ${mediaId}: ${files} segments stored locally`);
      }
    } catch (err) {
      console.warn(`[cache] ${mediaId}: warm-up failed: ${err.message}`);
    }
  }
  warming = false;
}

/** urgent: the film is being watched right now — it goes before the others. */
function scheduleWarm(mediaId, { urgent = false } = {}) {
  if (!config.storage.warmCache) return;
  const at = warmQueue.indexOf(mediaId);
  if (at >= 0) {
    if (!urgent) return;
    warmQueue.splice(at, 1);
  }
  if (urgent) warmQueue.unshift(mediaId);
  else warmQueue.push(mediaId);
  if (!warming) drainWarmQueue();
}

function dropCache(storageKey) {
  return fsp
    .rm(cachePath(path.posix.dirname(storageKey)), { recursive: true, force: true })
    .catch(() => {});
}

function signStreamToken(mediaId) {
  return jwt.sign({ sub: mediaId, typ: 'stream' }, config.jwt.accessSecret, {
    expiresIn: config.video.streamTokenTtl,
  });
}

function verifyStreamToken(token, mediaId) {
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret);
    return payload.typ === 'stream' && payload.sub === mediaId;
  } catch {
    return false;
  }
}

/** Personal films without a cover get a frame from ~15% into the film. */
async function posterFromVideo(mediaId, inputPath, durationSec) {
  const name = `${mediaId}-${Date.now()}.jpg`;
  const at = durationSec ? Math.min(durationSec * 0.15, 600) : 1;
  await extractPosterFrame(inputPath, path.join(postersDir, name), at);
  const current = await mediaRepository.findById(mediaId);
  if (!current || current.posterUrl) {
    await fsp.rm(path.join(postersDir, name), { force: true });
    return;
  }
  await mediaRepository.update(mediaId, { posterUrl: `/uploads/posters/${name}` });
}

async function processFile(mediaId, inputPath, { deleteInput }) {
  const stamp = Date.now();
  const outDir = path.join(tmpRoot, `hls-${mediaId}-${stamp}`);
  const storage = getStorage();
  const prefix = `hls/${mediaId}/${stamp}`;
  const before = await mediaRepository.findById(mediaId);

  const report = throttle((stage, progress) => {
    mediaRepository.updateVideoState(mediaId, { stage, progress }).catch(() => {});
  }, 2000);

  try {
    await mediaRepository.updateVideoState(mediaId, {
      status: 'processing',
      stage: 'transcoding',
      progress: 0,
      error: null,
    });
    console.log(`[video] ${mediaId}: transcoding ${path.basename(inputPath)}`);

    const result = await transcodeToHls(inputPath, outDir, {
      onProgress: (ratio) => report('transcoding', Math.floor(ratio * 90)),
    });

    await mediaRepository.updateVideoState(mediaId, { stage: 'uploading', progress: 90 });
    console.log(`[video] ${mediaId}: uploading to ${storage.name} (${result.variants.join(', ')})`);
    await putDirectory(storage, outDir, prefix, (ratio) =>
      report('uploading', 90 + Math.floor(ratio * 10)),
    );
    if (storage.name !== 'local' && config.storage.warmCache) {
      await fsp.mkdir(path.dirname(cachePath(prefix)), { recursive: true });
      await fsp.rename(outDir, cachePath(prefix)).catch(() => {});
    }

    await mediaRepository.updateVideoState(mediaId, {
      storageKey: `${prefix}/master.m3u8`,
      storageDriver: storage.name,
      status: 'ready',
      stage: null,
      progress: 100,
      error: null,
      durationSec: result.durationSec,
      videoUrl: null,
    });
    streamMetaCache.delete(mediaId);
    console.log(`[video] ${mediaId}: ready`);

    if (before?.ownerId && !before.posterUrl) {
      await posterFromVideo(mediaId, inputPath, result.durationSec).catch((err) =>
        console.warn(`[video] ${mediaId}: poster frame failed: ${err.message}`),
      );
    }

    if (before?.videoStorageKey) {
      await dropCache(before.videoStorageKey);
      await getStorage(before.videoStorageDriver || 'local')
        .removePrefix(path.posix.dirname(before.videoStorageKey))
        .catch((err) => console.warn(`[video] old files not removed: ${err.message}`));
    }
  } catch (err) {
    console.error(`[video] ${mediaId}: failed`, err);
    await mediaRepository.updateVideoState(mediaId, {
      status: 'failed',
      stage: null,
      error: String(err.message || err).slice(0, 500),
    });
    throw err;
  } finally {
    await fsp.rm(outDir, { recursive: true, force: true }).catch(() => {});
    if (deleteInput) {
      await fsp.rm(inputPath, { force: true }).catch(() => {});
    }
  }
}

export const videoService = {
  tmpRoot,

  /** Public URL for the player: signed HLS stream or an external link. */
  streamUrlFor(item) {
    if (item.videoStatus === 'ready' && item.videoStorageKey) {
      const token = signStreamToken(item.id);
      return `/api/v1/stream/${item.id}/${token}/${path.posix.basename(item.videoStorageKey)}`;
    }
    return item.videoUrl || null;
  },

  async startFromUpload(mediaId, file) {
    const media = await mediaRepository.findById(mediaId);
    if (!media) {
      await fsp.rm(file.path, { force: true }).catch(() => {});
      throw createHttpError(404, 'NOT_FOUND', 'Media not found');
    }
    if (media.videoStatus === 'processing') {
      await fsp.rm(file.path, { force: true }).catch(() => {});
      throw createHttpError(409, 'VIDEO_BUSY', 'Видео этого фильма уже обрабатывается');
    }
    await mediaRepository.updateVideoState(mediaId, {
      status: 'processing',
      stage: 'queued',
      progress: 0,
      error: null,
    });
    enqueue(() => processFile(mediaId, file.path, { deleteInput: true })).catch(() => {});
    return mediaRepository.findById(mediaId);
  },

  /**
   * Takes a film straight from Yandex Disk: own file by path (needs YADISK_TOKEN)
   * or any public link https://disk.yandex.ru/d/… (no token).
   */
  async startFromYandexDisk(mediaId, { path: diskPath, publicUrl }) {
    const media = await mediaRepository.findById(mediaId);
    if (!media) throw createHttpError(404, 'NOT_FOUND', 'Media not found');
    if (media.videoStatus === 'processing') {
      throw createHttpError(409, 'VIDEO_BUSY', 'Видео этого фильма уже обрабатывается');
    }

    let source;
    let name;
    if (publicUrl) {
      const publicKey = String(publicUrl).trim();
      if (!/^https?:\/\/(disk\.yandex\.[a-z]+|yadi\.sk)\//i.test(publicKey)) {
        throw createHttpError(400, 'VALIDATION_ERROR', 'Нужна публичная ссылка вида https://disk.yandex.ru/d/…');
      }
      const meta = await yadisk.publicMeta(publicKey);
      if (meta?.type === 'dir') {
        throw createHttpError(400, 'VALIDATION_ERROR', 'Это ссылка на папку — поделитесь самим видеофайлом');
      }
      source = { publicKey };
      name = meta?.name || 'video.mp4';
    } else if (diskPath) {
      source = { path: String(diskPath) };
      name = path.posix.basename(String(diskPath));
    } else {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Укажите файл на Диске или публичную ссылку');
    }

    await fsp.mkdir(tmpRoot, { recursive: true });
    const ext = path.extname(name).toLowerCase().replace(/[^.\w]/g, '') || '.mp4';
    const target = path.join(tmpRoot, `yadisk-${mediaId}-${Date.now()}${ext}`);

    await mediaRepository.updateVideoState(mediaId, {
      status: 'processing',
      stage: 'downloading',
      progress: 0,
      error: null,
    });

    const report = throttle((progress) => {
      mediaRepository.updateVideoState(mediaId, { stage: 'downloading', progress }).catch(() => {});
    }, 2000);

    (async () => {
      try {
        console.log(`[video] ${mediaId}: downloading ${name} from Yandex Disk`);
        await yadisk.downloadTo(source, target, (ratio) => report(Math.floor(ratio * 100)));
        await mediaRepository.updateVideoState(mediaId, { stage: 'queued', progress: 0 });
        await enqueue(() => processFile(mediaId, target, { deleteInput: true }));
      } catch (err) {
        console.error(`[video] ${mediaId}: Yandex Disk import failed`, err);
        await fsp.rm(target, { force: true }).catch(() => {});
        await mediaRepository
          .updateVideoState(mediaId, {
            status: 'failed',
            stage: null,
            error: String(err.message || err).slice(0, 500),
          })
          .catch(() => {});
      }
    })();

    return mediaRepository.findById(mediaId);
  },

  async listYandexDiskVideos() {
    if (!yadiskConfigured()) {
      return { connected: false, items: [] };
    }
    return { connected: true, items: await yadisk.listVideos() };
  },

  /** For scripts: transcode a local file and wait for the result. */
  importLocalFile(mediaId, filePath) {
    return enqueue(() => processFile(mediaId, filePath, { deleteInput: false }));
  },

  async removeVideo(mediaId) {
    const media = await mediaRepository.findById(mediaId);
    if (!media) throw createHttpError(404, 'NOT_FOUND', 'Media not found');
    if (media.videoStatus === 'processing') {
      throw createHttpError(409, 'VIDEO_BUSY', 'Дождитесь окончания обработки');
    }
    if (media.videoStorageKey) {
      await dropCache(media.videoStorageKey);
      await getStorage(media.videoStorageDriver || 'local').removePrefix(
        path.posix.dirname(media.videoStorageKey),
      );
    }
    await mediaRepository.updateVideoState(mediaId, {
      storageKey: null,
      storageDriver: null,
      status: 'none',
      stage: null,
      progress: 0,
      error: null,
      durationSec: null,
      videoUrl: null,
    });
    streamMetaCache.delete(mediaId);
    return mediaRepository.findById(mediaId);
  },

  async storageInfo() {
    const storage = getStorage();
    const check = await storage.check();
    return {
      driver: storage.name,
      label: storage.label,
      ok: check.ok,
      error: check.error || null,
      usedBytes: check.info?.usedBytes ?? null,
      totalBytes: check.info?.totalBytes ?? null,
      segments: config.storage.segments,
      variants: config.video.variants,
      yadiskConnected: yadiskConfigured(),
    };
  },

  async onStartup() {
    await fsp.mkdir(tmpRoot, { recursive: true });
    const failed = await mediaRepository.failInterruptedVideoJobs().catch(() => 0);
    if (failed) console.warn(`[video] ${failed} interrupted video job(s) marked as failed`);
    if (config.storage.warmCache) {
      const ids = await mediaRepository.listCloudVideoIds().catch(() => []);
      setTimeout(() => ids.forEach((id) => scheduleWarm(id)), 5000).unref();
    }
  },

  /**
   * GET /api/v1/stream/:mediaId/:token/<file>
   * Playlists are served by the API; segments are proxied or redirected to a presigned URL.
   */
  async serveStream(req, res) {
    const { mediaId, token } = req.params;
    const rel = String(req.params[0] || '');

    if (!verifyStreamToken(token, mediaId)) {
      throw createHttpError(403, 'STREAM_FORBIDDEN', 'Ссылка на видео устарела — обновите страницу');
    }
    if (!/^[\w\-./]+$/.test(rel) || rel.includes('..')) {
      throw createHttpError(400, 'INVALID_PATH', 'Invalid path');
    }

    const meta = await getStreamMeta(mediaId);
    if (!meta) throw createHttpError(404, 'NOT_FOUND', 'Video not found');

    const storage = getStorage(meta.driver);
    const key = `${path.posix.dirname(meta.key)}/${rel}`;

    const fromCloud = storage.name !== 'local';

    if (rel.endsWith('.m3u8')) {
      if (fromCloud && rel === path.posix.basename(meta.key)) scheduleWarm(mediaId, { urgent: true });
      const raw = fromCloud
        ? await fsp.readFile(await cachedFile(storage, key), 'utf8')
        : await storage.getText(key);
      let text = raw
        .split('\n')
        .map((line) => (line.startsWith('#') ? line : line.replace(/\\/g, '/')))
        .join('\n');
      if (config.storage.segments === 'signed' && storage.name === 's3') {
        const dir = path.posix.dirname(key);
        const lines = await Promise.all(
          text.split('\n').map(async (line) => {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed.endsWith('.m3u8')) return line;
            return storage.signedUrl(`${dir}/${trimmed}`);
          }),
        );
        text = lines.join('\n');
      }
      res.set('Content-Type', contentTypeFor(key));
      res.set('Cache-Control', 'private, no-cache');
      res.send(text);
      return;
    }

    if (fromCloud) {
      const file = await cachedFile(storage, key);
      prefetchNext(storage, key);
      res.set('Content-Type', contentTypeFor(key));
      res.set('Cache-Control', 'private, max-age=86400');
      res.sendFile(file, { cacheControl: false });
      return;
    }

    const object = await storage.getObject(key);
    res.set('Content-Type', contentTypeFor(key));
    if (object.length) res.set('Content-Length', String(object.length));
    res.set('Cache-Control', 'private, max-age=86400');
    object.body.on('error', () => res.destroy());
    object.body.pipe(res);
  },

  /** Moves HLS files of every film from the local folder to the configured cloud storage. */
  async migrateLocalToCloud({ log = console.log } = {}) {
    const target = getStorage();
    if (target.name === 'local') {
      throw new Error('Облачное хранилище не настроено (YADISK_TOKEN или S3_BUCKET в .env)');
    }
    const check = await target.check();
    if (!check.ok) throw new Error(`Хранилище недоступно: ${check.error}`);

    const local = getStorage('local');
    const { items } = await mediaRepository.listAll({ page: 1, limit: 500 });
    let moved = 0;
    for (const item of items) {
      if (item.videoStatus !== 'ready' || item.videoStorageDriver !== 'local') continue;
      const prefix = path.posix.dirname(item.videoStorageKey);
      const localDir = path.join(uploadsRoot, 'storage', ...prefix.split('/'));
      log(`→ ${item.title}: загрузка в облако…`);
      const count = await putDirectory(target, localDir, prefix, null);
      await mediaRepository.updateVideoState(item.id, { storageDriver: target.name });
      await local.removePrefix(prefix);
      streamMetaCache.delete(item.id);
      log(`  готово (${count} файлов)`);
      moved += 1;
    }
    return moved;
  },
};
