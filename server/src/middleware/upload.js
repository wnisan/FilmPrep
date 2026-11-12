import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import multer from 'multer';
import { config } from '../config/index.js';
import { createHttpError } from '../utils/httpError.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadsRoot = path.resolve(__dirname, '../../', config.uploadDir);
// Raw uploads wait here until ffmpeg turns them into HLS, then are deleted
export const videoTmpDir = path.join(uploadsRoot, 'tmp');
export const avatarsDir = path.join(uploadsRoot, 'avatars');
export const postersDir = path.join(uploadsRoot, 'posters');

fs.mkdirSync(uploadsRoot, { recursive: true });
fs.mkdirSync(videoTmpDir, { recursive: true });
fs.mkdirSync(avatarsDir, { recursive: true });
fs.mkdirSync(postersDir, { recursive: true });

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, uploadsRoot);
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

const videoStorage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, videoTmpDir);
  },
  filename(_req, file, cb) {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  },
});

function subtitleFilter(_req, file, cb) {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.srt') || name.endsWith('.vtt')) {
    cb(null, true);
    return;
  }
  cb(createHttpError(400, 'INVALID_FILE', 'Only .srt or .vtt subtitle files are allowed'));
}

function videoFilter(_req, file, cb) {
  const name = file.originalname.toLowerCase();
  const ok =
    /\.(mp4|mkv|mov|avi|webm|m4v|ogg)$/.test(name) || file.mimetype?.startsWith('video/');
  if (ok) {
    cb(null, true);
    return;
  }
  cb(createHttpError(400, 'INVALID_FILE', 'Нужен видеофайл: .mp4, .mkv, .mov, .avi или .webm'));
}

export const subtitleUpload = multer({
  storage,
  fileFilter: subtitleFilter,
  limits: { fileSize: 2 * 1024 * 1024 },
});

export const AVATAR_TYPES = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
});

function avatarFilter(_req, file, cb) {
  if (AVATAR_TYPES[file.mimetype]) {
    cb(null, true);
    return;
  }
  cb(createHttpError(400, 'INVALID_FILE', 'Аватар должен быть картинкой: JPG, PNG, WEBP или GIF'));
}

export const avatarUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: avatarFilter,
  limits: { fileSize: 3 * 1024 * 1024 },
});

export const posterUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter(_req, file, cb) {
    if (AVATAR_TYPES[file.mimetype]) {
      cb(null, true);
      return;
    }
    cb(createHttpError(400, 'INVALID_FILE', 'Обложка должна быть картинкой: JPG, PNG, WEBP или GIF'));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

export const videoUpload = multer({
  storage: videoStorage,
  fileFilter: videoFilter,
  limits: { fileSize: config.video.maxUploadMb * 1024 * 1024 },
});
