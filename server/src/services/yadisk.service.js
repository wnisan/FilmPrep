import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { config } from '../config/index.js';
import { createHttpError } from '../utils/httpError.js';

const API = 'https://cloud-api.yandex.net/v1/disk';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Download links stay valid for hours; re-requesting one per HLS segment would hit API limits
const LINK_TTL_MS = 20 * 60 * 1000;
const linkCache = new Map();

export function yadiskConfigured() {
  return Boolean(config.storage.yadisk.token);
}

function authHeaders() {
  if (!config.storage.yadisk.token) {
    throw createHttpError(400, 'YADISK_NOT_CONFIGURED', 'Яндекс Диск не подключён (YADISK_TOKEN в server/.env)');
  }
  return { Authorization: `OAuth ${config.storage.yadisk.token}` };
}

async function api(method, pathname, { query = {}, auth = true, okStatuses = [] } = {}) {
  const url = new URL(`${API}${pathname}`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(url, {
      method,
      headers: { Accept: 'application/json', ...(auth ? authHeaders() : {}) },
    });
    if (res.ok || okStatuses.includes(res.status)) {
      if (res.status === 204) return { status: res.status, data: null };
      return { status: res.status, data: await res.json().catch(() => null) };
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      await sleep(600 * 2 ** attempt);
      continue;
    }
    const data = await res.json().catch(() => null);
    if (res.status === 404) {
      throw createHttpError(404, 'NOT_FOUND', 'Файл на Яндекс Диске не найден');
    }
    if (res.status === 401) {
      throw createHttpError(502, 'YADISK_AUTH', 'Яндекс Диск отклонил токен — получите новый YADISK_TOKEN');
    }
    throw createHttpError(502, 'YADISK_ERROR', `Яндекс Диск: ${data?.message || data?.description || res.status}`);
  }
}

async function fetchStream(href) {
  for (let attempt = 0; ; attempt += 1) {
    const res = await fetch(href, { redirect: 'follow' });
    if (res.ok && res.body) return res;
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(500 * 2 ** attempt);
      continue;
    }
    throw createHttpError(502, 'YADISK_DOWNLOAD', `Яндекс Диск не отдал файл (${res.status})`);
  }
}

export function joinDiskPath(root, key) {
  return `${root.replace(/\/+$/, '')}/${String(key).replace(/^\/+/, '')}`;
}

export const yadisk = {
  async info() {
    const { data } = await api('GET', '/', { query: { fields: 'total_space,used_space,user.display_name' } });
    return {
      totalBytes: data?.total_space ?? null,
      usedBytes: data?.used_space ?? null,
      user: data?.user?.display_name || null,
    };
  },

  /** Creates every missing folder of `dirPath` (disk:/a/b/c). */
  async ensureDir(dirPath, known = new Set()) {
    const [scheme, rest] = dirPath.includes(':/') ? dirPath.split(':/') : ['disk', dirPath];
    const parts = rest.split('/').filter(Boolean);
    let current = `${scheme}:`;
    for (const part of parts) {
      current = `${current}/${part}`;
      if (known.has(current)) continue;
      await api('PUT', '/resources', { query: { path: current }, okStatuses: [409] });
      known.add(current);
    }
  },

  async upload(localPath, diskPath) {
    const { data } = await api('GET', '/resources/upload', { query: { path: diskPath, overwrite: true } });
    const stat = await fsp.stat(localPath);
    for (let attempt = 0; ; attempt += 1) {
      const res = await fetch(data.href, {
        method: data.method || 'PUT',
        body: await fsp.readFile(localPath),
        headers: { 'Content-Length': String(stat.size) },
      });
      if (res.ok) return;
      if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
        await sleep(700 * 2 ** attempt);
        continue;
      }
      throw createHttpError(502, 'YADISK_UPLOAD', `Не удалось загрузить на Яндекс Диск (${res.status})`);
    }
  },

  async downloadLink(diskPath) {
    const cached = linkCache.get(diskPath);
    if (cached && cached.expires > Date.now()) return cached.href;
    const { data } = await api('GET', '/resources/download', { query: { path: diskPath } });
    linkCache.set(diskPath, { href: data.href, expires: Date.now() + LINK_TTL_MS });
    return data.href;
  },

  async open(diskPath) {
    let res;
    try {
      res = await fetchStream(await this.downloadLink(diskPath));
    } catch (err) {
      // The cached link may have expired early
      linkCache.delete(diskPath);
      res = await fetchStream(await this.downloadLink(diskPath)).catch(() => {
        throw err;
      });
    }
    const length = Number(res.headers.get('content-length')) || null;
    return { body: Readable.fromWeb(res.body), length };
  },

  async remove(rawPath) {
    const diskPath = rawPath.replace(/\/+$/, '');
    await api('DELETE', '/resources', { query: { path: diskPath, permanently: true }, okStatuses: [404] });
    for (const key of linkCache.keys()) {
      if (key.startsWith(diskPath)) linkCache.delete(key);
    }
  },

  /** Every video file on the disk (flat list), newest first. */
  async listVideos({ limit = 200 } = {}) {
    const { data } = await api('GET', '/resources/files', {
      query: {
        media_type: 'video',
        limit,
        sort: '-modified',
        fields: 'items.name,items.path,items.size,items.modified,items.preview',
      },
    });
    return (data?.items || []).map((item) => ({
      name: item.name,
      path: item.path,
      size: item.size,
      modified: item.modified,
    }));
  },

  /** Metadata of a publicly shared file (https://disk.yandex.ru/d/…) — no token needed. */
  async publicMeta(publicKey) {
    const { data } = await api('GET', '/public/resources', {
      auth: false,
      query: { public_key: publicKey, fields: 'name,size,type,media_type' },
    });
    return data;
  },

  /**
   * Downloads a file to `target`, reporting progress 0..1.
   * source: { path } for own disk or { publicKey } for a shared link.
   */
  async downloadTo(source, target, onProgress) {
    let href;
    if (source.publicKey) {
      const { data } = await api('GET', '/public/resources/download', {
        auth: false,
        query: { public_key: source.publicKey },
      });
      href = data.href;
    } else {
      href = await this.downloadLink(source.path);
    }
    const res = await fetchStream(href);
    const total = Number(res.headers.get('content-length')) || 0;
    let done = 0;
    const body = Readable.fromWeb(res.body);
    body.on('data', (chunk) => {
      done += chunk.length;
      if (total) onProgress?.(done / total);
    });
    await pipeline(body, fs.createWriteStream(target));
    return { bytes: done };
  },
};
