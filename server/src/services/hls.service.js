import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { config } from '../config/index.js';

const VARIANTS = {
  1080: { width: 1920, height: 1080, videoKbps: 5000, audioKbps: 160 },
  720: { width: 1280, height: 720, videoKbps: 2800, audioKbps: 128 },
  480: { width: 854, height: 480, videoKbps: 1400, audioKbps: 128 },
  360: { width: 640, height: 360, videoKbps: 800, audioKbps: 96 },
};

const SEGMENT_SECONDS = 6;

function parseClock(value) {
  const match = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(value || '');
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** Reads duration / audio / height from ffmpeg's stream dump (ffprobe isn't bundled). */
export function probeVideo(inputPath) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-hide_banner', '-i', inputPath]);
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', () => {
      const duration = parseClock(/Duration:\s*([\d:.]+)/.exec(stderr)?.[1]);
      const videoLine = stderr.split('\n').find((l) => /Stream #.*Video:/.test(l)) || '';
      const size = /\b(\d{2,5})x(\d{2,5})\b/.exec(videoLine);
      if (!videoLine) {
        reject(new Error('В файле не найден видеопоток'));
        return;
      }
      resolve({
        durationSec: duration,
        hasAudio: /Stream #.*Audio:/.test(stderr),
        width: size ? Number(size[1]) : null,
        height: size ? Number(size[2]) : null,
      });
    });
  });
}

/** One frame as a 2:3 poster (center crop), JPEG. */
export function extractPosterFrame(inputPath, outPath, atSec) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-ss',
      String(Math.max(0, atSec)),
      '-i',
      inputPath,
      '-frames:v',
      '1',
      '-vf',
      "crop='min(iw,ih*2/3)':'min(ih,iw*3/2)',scale=480:720",
      '-q:v',
      '3',
      outPath,
    ]);
    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(outPath);
      else reject(new Error(`ffmpeg frame: ${stderr.trim().slice(-300)}`));
    });
  });
}

function pickVariants(sourceWidth, sourceHeight) {
  const wanted = config.video.variants.length ? config.video.variants : [720, 360];
  const sorted = [...new Set(wanted)].sort((a, b) => b - a);
  // No upscaling; widescreen 1280x534 still counts as 720p, so compare by width or height
  const fitting = sorted.filter((h) => {
    if (!sourceWidth || !sourceHeight) return true;
    const v = VARIANTS[h];
    return sourceWidth >= v.width * 0.9 || sourceHeight >= v.height * 0.9;
  });
  return (fitting.length ? fitting : [sorted[sorted.length - 1]]).map((h) => ({
    name: `${h}p`,
    ...VARIANTS[h],
  }));
}

/**
 * Transcodes a video into multi-bitrate HLS:
 *   outDir/master.m3u8, outDir/<720p|360p>/index.m3u8 + seg_000.ts …
 */
export async function transcodeToHls(inputPath, outDir, { onProgress } = {}) {
  const info = await probeVideo(inputPath);
  const variants = pickVariants(info.width, info.height);
  await fsp.mkdir(outDir, { recursive: true });
  // On Windows ffmpeg copies backslashes into playlist URIs — give it forward slashes
  const outPath = (...parts) => path.join(outDir, ...parts).split(path.sep).join('/');

  const split = variants.map((_, i) => `[v${i}]`).join('');
  const scales = variants
    .map(
      (v, i) =>
        `[v${i}]scale=w=${v.width}:h=${v.height}:force_original_aspect_ratio=decrease,` +
        `scale=trunc(iw/2)*2:trunc(ih/2)*2[v${i}out]`,
    )
    .join(';');
  const filter = `[0:v]split=${variants.length}${split};${scales}`;

  const args = ['-hide_banner', '-y', '-i', inputPath, '-filter_complex', filter];

  variants.forEach((v, i) => {
    args.push(
      '-map', `[v${i}out]`,
      `-c:v:${i}`, 'libx264',
      `-b:v:${i}`, `${v.videoKbps}k`,
      `-maxrate:v:${i}`, `${Math.round(v.videoKbps * 1.07)}k`,
      `-bufsize:v:${i}`, `${Math.round(v.videoKbps * 1.5)}k`,
    );
  });
  if (info.hasAudio) {
    variants.forEach((v, i) => {
      args.push('-map', 'a:0', `-c:a:${i}`, 'aac', `-b:a:${i}`, `${v.audioKbps}k`, `-ac:a:${i}`, '2');
    });
  }

  const streamMap = variants
    .map((v, i) => (info.hasAudio ? `v:${i},a:${i},name:${v.name}` : `v:${i},name:${v.name}`))
    .join(' ');

  args.push(
    '-preset', config.video.preset,
    '-profile:v', 'main',
    '-pix_fmt', 'yuv420p',
    '-sc_threshold', '0',
    '-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_SECONDS})`,
    '-f', 'hls',
    '-hls_time', String(SEGMENT_SECONDS),
    '-hls_playlist_type', 'vod',
    '-hls_flags', 'independent_segments',
    '-hls_segment_filename', outPath('%v', 'seg_%04d.ts'),
    '-master_pl_name', 'master.m3u8',
    '-var_stream_map', streamMap,
    '-progress', 'pipe:1',
    '-nostats',
    outPath('%v', 'index.m3u8'),
  );

  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    let stderrTail = '';
    let lastReported = -1;

    proc.stdout.on('data', (chunk) => {
      const match = /out_time_us=(\d+)/.exec(chunk.toString());
      if (match && info.durationSec) {
        const ratio = Math.min(1, Number(match[1]) / 1e6 / info.durationSec);
        const percent = Math.floor(ratio * 100);
        if (percent !== lastReported) {
          lastReported = percent;
          onProgress?.(ratio);
        }
      }
    });
    proc.stderr.on('data', (chunk) => {
      stderrTail = (stderrTail + chunk.toString()).slice(-2000);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg завершился с кодом ${code}: ${stderrTail.split('\n').slice(-4).join(' ')}`));
    });
  });

  return {
    durationSec: info.durationSec ? Math.round(info.durationSec) : null,
    variants: variants.map((v) => v.name),
  };
}
