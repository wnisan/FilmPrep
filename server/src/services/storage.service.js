import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from '@smithy/node-http-handler';
import { config } from '../config/index.js';
import { uploadsRoot } from '../middleware/upload.js';
import { createHttpError } from '../utils/httpError.js';
import { yadisk, joinDiskPath } from './yadisk.service.js';

const CONTENT_TYPES = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.m4s': 'video/iso.segment',
  '.mp4': 'video/mp4',
  '.vtt': 'text/vtt; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

export function contentTypeFor(key) {
  return CONTENT_TYPES[path.extname(key).toLowerCase()] || 'application/octet-stream';
}

async function listFilesRecursive(dir) {
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFilesRecursive(full) : [full];
    }),
  );
  return files.flat();
}

async function runPool(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(runners);
}

function createLocalDriver() {
  const root = path.join(uploadsRoot, 'storage');
  fs.mkdirSync(root, { recursive: true });

  const resolveKey = (key) => {
    const full = path.resolve(root, key);
    if (!full.startsWith(root)) {
      throw createHttpError(400, 'INVALID_KEY', 'Invalid storage key');
    }
    return full;
  };

  return {
    name: 'local',
    label: 'Локальная папка сервера',

    async putFile(localPath, key) {
      const target = resolveKey(key);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      await fsp.copyFile(localPath, target);
    },

    async getObject(key) {
      const full = resolveKey(key);
      const stat = await fsp.stat(full).catch(() => null);
      if (!stat?.isFile()) {
        throw createHttpError(404, 'NOT_FOUND', 'File not found');
      }
      return { body: fs.createReadStream(full), length: stat.size };
    },

    async getText(key) {
      const full = resolveKey(key);
      return fsp.readFile(full, 'utf8').catch(() => {
        throw createHttpError(404, 'NOT_FOUND', 'File not found');
      });
    },

    async removePrefix(prefix) {
      await fsp.rm(resolveKey(prefix), { recursive: true, force: true });
    },

    async signedUrl() {
      return null;
    },

    async check() {
      return { ok: true };
    },
  };
}

function createS3Driver() {
  const s3cfg = config.storage.s3;
  const client = new S3Client({
    region: s3cfg.region,
    endpoint: s3cfg.endpoint || undefined,
    forcePathStyle: s3cfg.forcePathStyle,
    credentials: {
      accessKeyId: s3cfg.accessKeyId,
      secretAccessKey: s3cfg.secretAccessKey,
    },
    // Backblaze B2 / R2 / MinIO don't accept the newer default checksum headers
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 6,
    // A stalled TLS handshake should fail fast and be retried instead of hanging the player
    requestHandler: new NodeHttpHandler({ connectionTimeout: 8000, requestTimeout: 60000 }),
  });
  const Bucket = s3cfg.bucket;

  const toNotFound = (err) => {
    if (err?.name === 'NoSuchKey' || err?.$metadata?.httpStatusCode === 404) {
      return createHttpError(404, 'NOT_FOUND', 'File not found');
    }
    return err;
  };

  return {
    name: 's3',
    label: s3cfg.label || `S3 · ${Bucket}`,

    async putFile(localPath, key) {
      const stat = await fsp.stat(localPath);
      // A Buffer body lets the SDK retry transient 5xx (B2 returns them often); streams can't be replayed
      const body = stat.size <= 64 * 1024 * 1024 ? await fsp.readFile(localPath) : fs.createReadStream(localPath);
      await client.send(
        new PutObjectCommand({
          Bucket,
          Key: key,
          Body: body,
          ContentLength: stat.size,
          ContentType: contentTypeFor(key),
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    },

    async getObject(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return { body: out.Body, length: out.ContentLength };
      } catch (err) {
        throw toNotFound(err);
      }
    },

    async getText(key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket, Key: key }));
        return out.Body.transformToString('utf-8');
      } catch (err) {
        throw toNotFound(err);
      }
    },

    async removePrefix(prefix) {
      let token;
      do {
        const listed = await client.send(
          new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken: token }),
        );
        const objects = (listed.Contents || []).map((o) => ({ Key: o.Key }));
        if (objects.length) {
          await client.send(new DeleteObjectsCommand({ Bucket, Delete: { Objects: objects } }));
        }
        token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (token);
    },

    async signedUrl(key, expiresIn = 6 * 3600) {
      return getSignedUrl(client, new GetObjectCommand({ Bucket, Key: key }), { expiresIn });
    },

    async check() {
      try {
        await client.send(new HeadBucketCommand({ Bucket }));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err?.name || err?.message || 'S3 error' };
      }
    },
  };
}

function createYadiskDriver() {
  const root = config.storage.yadisk.root;
  const knownDirs = new Set();
  const full = (key) => joinDiskPath(root, key);

  return {
    name: 'yadisk',
    label: 'Яндекс Диск',

    async putFile(localPath, key) {
      const target = full(key);
      await yadisk.ensureDir(path.posix.dirname(target), knownDirs);
      await yadisk.upload(localPath, target);
    },

    async getObject(key) {
      return yadisk.open(full(key));
    },

    async getText(key) {
      const { body } = await yadisk.open(full(key));
      const chunks = [];
      for await (const chunk of body) chunks.push(chunk);
      return Buffer.concat(chunks).toString('utf8');
    },

    async removePrefix(prefix) {
      await yadisk.remove(full(prefix));
    },

    async signedUrl() {
      return null;
    },

    async check() {
      try {
        const info = await yadisk.info();
        return { ok: true, info };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };
}

const drivers = {};
const FACTORIES = { s3: createS3Driver, yadisk: createYadiskDriver, local: createLocalDriver };

export function getStorage(name = config.storage.driver) {
  if (!drivers[name]) {
    drivers[name] = (FACTORIES[name] || createLocalDriver)();
  }
  return drivers[name];
}

/**
 * Uploads every file of a local folder under `prefix`, reporting progress 0..1.
 */
export async function putDirectory(storage, localDir, prefix, onProgress) {
  const files = await listFilesRecursive(localDir);
  let done = 0;
  await runPool(files, 6, async (file) => {
    const rel = path.relative(localDir, file).split(path.sep).join('/');
    await storage.putFile(file, `${prefix}/${rel}`);
    done += 1;
    onProgress?.(done / files.length);
  });
  return files.length;
}
