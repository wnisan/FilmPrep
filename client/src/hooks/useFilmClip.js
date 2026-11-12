import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { fetchSubtitleCues } from '../api/media.js';
import { stopSpeaking } from '../utils/speech.js';
import { resolveVideoSource } from '../utils/video.js';

const LEAD_IN = 0.15;
const TAIL = 0.3;
const MAX_CLIP = 12;
const FALLBACK_CLIP = 3.5;

const normalize = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function whenReady(video, timeoutMs = 15000) {
  if (video.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      video.removeEventListener('loadedmetadata', done);
      reject(new Error('timeout'));
    }, timeoutMs);
    function done() {
      clearTimeout(timer);
      resolve();
    }
    video.addEventListener('loadedmetadata', done, { once: true });
  });
}

/** Subtitle line(s) around `time`; a sentence split over several cues is played whole. */
function clipRange(cues, time, text) {
  if (!cues?.length) return { start: Math.max(0, time - LEAD_IN), end: time + FALLBACK_CLIP };

  let index = -1;
  let best = Infinity;
  cues.forEach((cue, i) => {
    const distance = cue.start <= time && cue.end >= time ? 0 : Math.abs(cue.start - time);
    if (distance < best) {
      best = distance;
      index = i;
    }
  });
  if (index < 0 || best > 2) return { start: Math.max(0, time - LEAD_IN), end: time + FALLBACK_CLIP };

  const wanted = normalize(text);
  let first = index;
  let last = index;
  while (last + 1 < cues.length && wanted && wanted.includes(normalize(cues[last + 1].text))) last += 1;
  while (first > 0 && wanted && wanted.includes(normalize(cues[first - 1].text))) first -= 1;

  const start = Math.max(0, cues[first].start - LEAD_IN);
  const end = Math.min(cues[last].end + TAIL, start + MAX_CLIP);
  return { start, end };
}

const KEEP = /[\p{L}\p{N}']/u;

/**
 * Exactly the given text, no more and no less: it is searched in the cues around
 * `time` (it may be part of a long cue or span several). Subtitles have no
 * per-word timing, so times inside a cue are estimated from character positions.
 * Returns null when the text isn't found there.
 */
function textRange(cues, time, text) {
  const wanted = normalize(text);
  if (!cues?.length || !wanted) return null;

  let index = -1;
  let best = Infinity;
  cues.forEach((cue, i) => {
    const distance = cue.start <= time && cue.end >= time ? 0 : Math.abs(cue.start - time);
    if (distance < best) {
      best = distance;
      index = i;
    }
  });
  if (index < 0 || best > 3) return null;

  // Character stream of neighbouring cues; every kept char remembers its moment
  const chars = [];
  for (let i = Math.max(0, index - 3); i <= Math.min(cues.length - 1, index + 3); i += 1) {
    const cue = cues[i];
    const raw = String(cue.text || '').toLowerCase();
    const duration = Math.max(0.2, cue.end - cue.start);
    const perChar = duration / Math.max(raw.length, 1);
    for (let k = 0; k < raw.length; k += 1) {
      const ch = KEEP.test(raw[k]) ? raw[k] : ' ';
      if (ch === ' ' && (!chars.length || chars[chars.length - 1].ch === ' ')) continue;
      chars.push({ ch, t: cue.start + k * perChar, dt: perChar, cue });
    }
    if (chars.length && chars[chars.length - 1].ch !== ' ') chars.push({ ch: ' ', t: cue.end, dt: 0, cue });
  }
  const stream = chars.map((c) => c.ch).join('');

  let pos = -1;
  let bestDistance = Infinity;
  for (let at = stream.indexOf(wanted); at !== -1; at = stream.indexOf(wanted, at + 1)) {
    const okLeft = at === 0 || stream[at - 1] === ' ';
    const okRight = at + wanted.length >= stream.length || stream[at + wanted.length] === ' ';
    if (!okLeft || !okRight) continue;
    const distance = Math.abs(chars[at].t - time);
    if (distance < bestDistance) {
      bestDistance = distance;
      pos = at;
    }
  }
  if (pos < 0) return null;

  const first = chars[pos];
  const last = chars[pos + wanted.length - 1];
  const firstCueText = normalize(first.cue.text);
  const lastCueText = normalize(last.cue.text);
  // At a cue boundary the subtitle timing is exact; inside a cue keep a small margin
  const startsCue = wanted.startsWith(firstCueText.slice(0, Math.min(firstCueText.length, 12)));
  const endsCue = wanted.endsWith(lastCueText.slice(-Math.min(lastCueText.length, 12)));
  const start = startsCue ? first.cue.start - LEAD_IN : first.t - 0.2;
  const end = endsCue ? last.cue.end + TAIL : last.t + last.dt + 0.3;
  return { start: Math.max(0, start), end: Math.min(Math.max(end, start + 0.8), start + MAX_CLIP + 6) };
}

/**
 * Plays short fragments of the film (the exact line where a word/phrase is spoken)
 * through a hidden <video>, so the learner hears the original voice.
 */
export function useFilmClip({ src, mediaId, tracks }) {
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const cuesRef = useRef(null);
  const stopAtRef = useRef(0);
  const rafRef = useRef(0);
  const [playingKey, setPlayingKey] = useState(null);
  const [loadingKey, setLoadingKey] = useState(null);
  const [error, setError] = useState('');

  const kind = resolveVideoSource(src)?.kind;
  const available = kind === 'hls' || kind === 'file';

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    videoRef.current?.pause();
    setPlayingKey(null);
    setLoadingKey(null);
  }, []);

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      hlsRef.current?.destroy();
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.remove();
      }
      videoRef.current = null;
      hlsRef.current = null;
      cuesRef.current = null;
    },
    [src],
  );

  function ensureVideo() {
    if (videoRef.current) return videoRef.current;
    const video = document.createElement('video');
    video.preload = 'auto';
    video.playsInline = true;
    video.style.display = 'none';
    document.body.appendChild(video);
    videoRef.current = video;

    if (/\.m3u8(\?|$)/i.test(src) && Hls.isSupported()) {
      // Loading starts at the first clip's position, not at the beginning of the film
      const hls = new Hls({ maxBufferLength: 8, maxMaxBufferLength: 15, startLevel: 0, autoStartLoad: false });
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        hls.currentLevel = 0;
        hls.manifestReady = true;
        if (hls.clipStart != null) hls.startLoad(hls.clipStart);
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        setError(data.response?.code === 403 ? 'Ссылка на видео устарела — обновите страницу' : 'Не удалось загрузить звук из фильма');
        stop();
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else {
      video.src = src;
    }
    return video;
  }

  async function loadCues() {
    if (cuesRef.current) return cuesRef.current;
    const list = tracks || [];
    const track = list.find((t) => t.role === 'original') || list.find((t) => t.language !== 'ru') || list[0];
    // Tracks may still be loading: don't cache the empty result
    if (!track) return [];
    try {
      const data = await fetchSubtitleCues(mediaId, track.id);
      cuesRef.current = data.cues || [];
    } catch {
      cuesRef.current = [];
    }
    return cuesRef.current;
  }

  /** range: (cues) => { start, end } in seconds. */
  const playWith = useCallback(
    async (key, range) => {
      if (playingKey === key || loadingKey === key) {
        stop();
        return;
      }
      stop();
      stopSpeaking();
      setError('');
      setLoadingKey(key);

      const video = ensureVideo();
      const cues = await loadCues();
      const { start, end } = range(cues);
      stopAtRef.current = end;

      const tick = () => {
        if (!videoRef.current) return;
        if (videoRef.current.currentTime >= stopAtRef.current || videoRef.current.ended) {
          stop();
          return;
        }
        rafRef.current = requestAnimationFrame(tick);
      };

      try {
        const hls = hlsRef.current;
        if (hls && hls.clipStart == null) {
          hls.clipStart = start;
          if (hls.manifestReady) hls.startLoad(start);
        }
        await whenReady(video);
        video.currentTime = start;
        await video.play();
        setLoadingKey(null);
        setPlayingKey(key);
        rafRef.current = requestAnimationFrame(tick);
      } catch {
        setError('Браузер не дал воспроизвести звук — нажмите ещё раз');
        stop();
      }
    },
    // src/tracks: ensureVideo() and loadCues() read them from this closure
    [playingKey, loadingKey, stop, src, tracks], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const play = useCallback(
    (key, timestampMs, text) => {
      if (!available || timestampMs == null) return undefined;
      return playWith(
        key,
        (cues) => textRange(cues, timestampMs / 1000, text) || clipRange(cues, timestampMs / 1000, text),
      );
    },
    [available, playWith],
  );

  /** A whole scene: from the first line to the end of the last one (up to a minute). */
  const playRange = useCallback(
    (key, startMs, lastLineMs) => {
      if (!available || startMs == null) return undefined;
      return playWith(key, (cues) => {
        const start = Math.max(0, startMs / 1000 - LEAD_IN);
        const lastCue = cues.find((c) => Math.abs(c.start - lastLineMs / 1000) < 0.05);
        const end = (lastCue ? lastCue.end : lastLineMs / 1000 + FALLBACK_CLIP) + TAIL;
        return { start, end: Math.min(end, start + 60) };
      });
    },
    [available, playWith],
  );

  return { available, play, playRange, stop, playingKey, loadingKey, error };
}
