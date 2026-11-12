import { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import { fetchSubtitleCues } from '../api/media.js';
import { resolveVideoSource } from '../utils/video.js';
import { ClickableLine, SubtitleWordPopup } from './SubtitleWordPopup.jsx';

const SPEEDS = [0.75, 1, 1.25, 1.5];
// "orig" — subtitles in the film's language, "ru" — the Russian translation
const SUB_MODES = [
  { id: 'off' },
  { id: 'orig', needs: ['orig'] },
  { id: 'ru', needs: ['ru'] },
  { id: 'both', needs: ['orig', 'ru'] },
];
const SUB_MODE_KEY = 'filmprep:subtitle-mode';

const trackKey = (track) => (track.language === 'ru' ? 'ru' : 'orig');

function savedSubMode() {
  const saved = localStorage.getItem(SUB_MODE_KEY) || 'orig';
  return saved === 'en' ? 'orig' : saved;
}
const HIDE_CONTROLS_MS = 2600;

function formatTime(total) {
  if (!Number.isFinite(total) || total < 0) return '0:00';
  const s = Math.floor(total % 60);
  const m = Math.floor((total / 60) % 60);
  const h = Math.floor(total / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

const fullscreenElement = () => document.fullscreenElement || document.webkitFullscreenElement || null;

function requestFullscreen(element) {
  if (!element) return Promise.resolve();
  const request = element.requestFullscreen || element.webkitRequestFullscreen;
  return request ? Promise.resolve(request.call(element)) : Promise.resolve();
}

function exitFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen;
  return exit ? Promise.resolve(exit.call(document)) : Promise.resolve();
}

function findCue(cues, time) {
  if (!cues?.length) return null;
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid].start <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const cue = found >= 0 ? cues[found] : null;
  return cue && cue.end >= time ? cue : null;
}

const Icon = {
  play: <path d="M8 5.5v13l11-6.5z" />,
  pause: <path d="M7 5h4v14H7zM13 5h4v14h-4z" />,
  volume: <path d="M4 9h4l5-4v14l-5-4H4zM16 8.5a4.5 4.5 0 010 7M18.5 6a8 8 0 010 12" />,
  muted: <path d="M4 9h4l5-4v14l-5-4H4zM16.5 9.5l5 5M21.5 9.5l-5 5" />,
  back: <path d="M11 7L6 12l5 5M6 12h9a4 4 0 010 8h-2" />,
  subs: <path d="M3 6h18v12H3zM7 11h4M13 11h4M7 14h6M15 14h2" />,
  gear: (
    <path d="M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 13a7.5 7.5 0 000-2l2-1.5-2-3.4-2.3.9a7.6 7.6 0 00-1.8-1L15 3.5h-4l-.3 2.5a7.6 7.6 0 00-1.8 1l-2.3-.9-2 3.4 2 1.5a7.5 7.5 0 000 2l-2 1.5 2 3.4 2.3-.9a7.6 7.6 0 001.8 1l.3 2.5h4l.3-2.5a7.6 7.6 0 001.8-1l2.3.9 2-3.4z" />
  ),
  expand: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  shrink: <path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5" />,
};

function SvgIcon({ name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      className={`fp-icon${name === 'play' || name === 'pause' ? ' fp-icon--fill' : ''}`}
    >
      {Icon[name]}
    </svg>
  );
}

function PlayerMessage({ children }) {
  return (
    <div className="player player--empty">
      <p className="muted">{children}</p>
    </div>
  );
}

/**
 * In-site film player: HLS (hls.js) with quality switch, EN/RU subtitles,
 * resume position, speed and fullscreen.
 */
export function FilmPlayer({ mediaId, src, title, poster, tracks = [], resumeKey }) {
  const source = resolveVideoSource(src);
  if (!src || !source) {
    return <PlayerMessage>Видео для этого фильма пока не загружено</PlayerMessage>;
  }
  if (source.kind === 'youtube' || source.kind === 'vimeo') {
    return (
      <div className="player">
        <iframe
          className="player__frame"
          src={source.embedUrl}
          title={title || 'Видео'}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }
  return (
    <HtmlPlayer
      mediaId={mediaId}
      src={src}
      poster={poster}
      tracks={tracks}
      resumeKey={resumeKey || mediaId}
    />
  );
}

function HtmlPlayer({ mediaId, src, poster, tracks, resumeKey }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const hlsRef = useRef(null);
  const hideTimerRef = useRef(null);
  const lastSavedRef = useRef(0);
  const nativeTrackRef = useRef(null);

  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [menu, setMenu] = useState(null);
  const [levels, setLevels] = useState([]);
  const [selectedLevel, setSelectedLevel] = useState(-1);
  const [activeLevel, setActiveLevel] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState('');
  const [resumeFrom, setResumeFrom] = useState(0);
  const [cues, setCues] = useState({});
  const [subMode, setSubMode] = useState(savedSubMode);
  const [wordPopup, setWordPopup] = useState(null);

  const storageKey = `filmprep:resume:${resumeKey}`;
  const available = new Set(tracks.map(trackKey));
  const originalTrack = tracks.find((t) => trackKey(t) === 'orig') || null;
  const filmLanguage = originalTrack?.language || 'en';
  const originalLabel = originalTrack?.label || 'Оригинал';
  const modeLabel = (id) =>
    ({
      off: 'Выключены',
      orig: originalLabel,
      ru: 'Русский',
      both: `${originalLabel} + русский`,
    })[id];
  const modeAvailable = (mode) => (mode.needs || []).every((key) => available.has(key));
  const effectiveMode = SUB_MODES.find((m) => m.id === subMode && modeAvailable(m))
    ? subMode
    : available.has('orig')
      ? 'orig'
      : available.has('ru')
        ? 'ru'
        : 'off';

  // Source: hls.js for HLS, native for files / Safari
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return undefined;
    setError('');
    setLevels([]);
    setSelectedLevel(-1);

    const isHls = /\.m3u8(\?|$)/i.test(src);
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ capLevelToPlayerSize: true, maxBufferLength: 40 });
      hlsRef.current = hls;
      let networkRetries = 0;
      hls.on(Hls.Events.MANIFEST_PARSED, (_e, data) => {
        setLevels(
          data.levels
            .map((level, index) => ({ index, height: level.height, label: `${level.height}p` }))
            .sort((a, b) => b.height - a.height),
        );
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, (_e, data) => setActiveLevel(data.level));
      hls.on(Hls.Events.FRAG_LOADED, () => {
        networkRetries = 0;
      });
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.response?.code === 403) {
          setError('Ссылка на видео устарела — обновите страницу');
          hls.destroy();
        } else if (data.type === Hls.ErrorTypes.NETWORK_ERROR && networkRetries < 3) {
          networkRetries += 1;
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          setError('Не удалось загрузить видео');
          hls.destroy();
        }
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }

    video.src = src;
    return () => {
      video.removeAttribute('src');
      video.load();
    };
  }, [src]);

  // Subtitle cues for the chosen mode (loaded once per language)
  useEffect(() => {
    const needed = SUB_MODES.find((m) => m.id === effectiveMode)?.needs || [];
    needed.forEach((key) => {
      if (key in cues) return;
      const track = tracks.find((t) => trackKey(t) === key);
      if (!track) return;
      setCues((prev) => ({ ...prev, [key]: [] }));
      fetchSubtitleCues(mediaId, track.id)
        .then((data) => setCues((prev) => ({ ...prev, [key]: data.cues || [] })))
        .catch(() => {});
    });
  }, [effectiveMode, tracks, mediaId, cues]);

  useEffect(() => {
    const onChange = () => {
      const element = fullscreenElement();
      // Browser/extension buttons may put the bare <video> fullscreen — there are no
      // subtitles or controls there, so move fullscreen to the whole player instead.
      if (nativeTrackRef.current) {
        nativeTrackRef.current.mode = element && element === videoRef.current ? 'showing' : 'hidden';
      }
      if (element && element === videoRef.current) {
        exitFullscreen()
          .then(() => requestFullscreen(wrapRef.current))
          .catch(() => {});
        return;
      }
      setFullscreen(element === wrapRef.current);
      revealControls();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, []);

  // Native subtitle track: shown only if the browser plays the bare <video> fullscreen (e.g. iOS)
  useEffect(() => {
    const video = videoRef.current;
    const list = effectiveMode === 'ru' ? cues.ru : cues.orig;
    if (!video || effectiveMode === 'off' || !list?.length || typeof VTTCue === 'undefined') return undefined;
    const track = video.addTextTrack('subtitles', 'FilmPrep', effectiveMode === 'ru' ? 'ru' : filmLanguage);
    track.mode = 'hidden';
    list.forEach((cue) => {
      try {
        track.addCue(new VTTCue(cue.start, cue.end, cue.text));
      } catch {
        /* skip malformed cue */
      }
    });
    nativeTrackRef.current = track;
    const show = () => {
      track.mode = 'showing';
    };
    const hide = () => {
      track.mode = 'hidden';
    };
    video.addEventListener('webkitbeginfullscreen', show);
    video.addEventListener('webkitendfullscreen', hide);
    return () => {
      track.mode = 'disabled';
      nativeTrackRef.current = null;
      video.removeEventListener('webkitbeginfullscreen', show);
      video.removeEventListener('webkitendfullscreen', hide);
    };
  }, [cues, effectiveMode, filmLanguage]);

  useEffect(() => () => clearTimeout(hideTimerRef.current), []);

  const revealControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) {
        setControlsVisible(false);
        setMenu(null);
      }
    }, HIDE_CONTROLS_MS);
  }, []);

  function saveResume(current, total) {
    if (!total) return;
    if (current > 15 && current < total - 20) {
      localStorage.setItem(storageKey, String(Math.floor(current)));
    } else if (current >= total - 20) {
      localStorage.removeItem(storageKey);
    }
  }

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  }

  function seekTo(value) {
    const video = videoRef.current;
    if (!video || !duration) return;
    video.currentTime = Math.max(0, Math.min(duration - 0.5, value));
    setTime(video.currentTime);
  }

  function changeVolume(value) {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    video.muted = value === 0;
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 0.6;
  }

  function toggleFullscreen() {
    if (fullscreenElement()) exitFullscreen().catch(() => {});
    else requestFullscreen(wrapRef.current).catch(() => {});
  }

  function chooseLevel(index) {
    setSelectedLevel(index);
    if (hlsRef.current) hlsRef.current.currentLevel = index;
    setMenu(null);
  }

  function chooseSpeed(value) {
    setSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
    setMenu(null);
  }

  function chooseSubMode(mode) {
    setSubMode(mode);
    localStorage.setItem(SUB_MODE_KEY, mode);
    setMenu(null);
  }

  function replayLine() {
    const list = cues.orig?.length ? cues.orig : cues.ru;
    const current = list?.length ? findCue(list, time) : null;
    if (current) {
      seekTo(current.start - 0.2);
    } else if (list?.length) {
      const previous = [...list].reverse().find((c) => c.end < time);
      seekTo(previous ? previous.start - 0.2 : time - 5);
    } else {
      seekTo(time - 5);
    }
    videoRef.current?.play().catch(() => {});
  }

  function openWord(word) {
    const cue = findCue(cues.orig, videoRef.current?.currentTime ?? time);
    videoRef.current?.pause();
    setMenu(null);
    setWordPopup({ word, context: cue?.text || '', timeSec: cue?.start ?? time });
  }

  function onKeyDown(event) {
    if (event.target.tagName === 'INPUT' && event.target.type !== 'range') return;
    const key = event.key.toLowerCase();
    if (wordPopup && key === 'escape') {
      event.preventDefault();
      setWordPopup(null);
      return;
    }
    const handled = {
      ' ': togglePlay,
      k: togglePlay,
      f: toggleFullscreen,
      m: toggleMute,
      r: replayLine,
      arrowleft: () => seekTo(time - 5),
      arrowright: () => seekTo(time + 5),
      arrowup: () => changeVolume(Math.min(1, volume + 0.1)),
      arrowdown: () => changeVolume(Math.max(0, volume - 0.1)),
      c: () => {
        const order = SUB_MODES.filter(modeAvailable).map((m) => m.id);
        const next = order[(order.indexOf(effectiveMode) + 1) % order.length];
        if (next) chooseSubMode(next);
      },
    }[key];
    if (handled) {
      event.preventDefault();
      handled();
      revealControls();
    }
  }

  const activeCueEn = effectiveMode === 'orig' || effectiveMode === 'both' ? findCue(cues.orig, time) : null;
  const activeCueRu = effectiveMode === 'ru' || effectiveMode === 'both' ? findCue(cues.ru, time) : null;
  const progressPct = duration ? (time / duration) * 100 : 0;
  const bufferedPct = duration ? (buffered / duration) * 100 : 0;
  const autoLabel = levels.find((l) => l.index === activeLevel)?.label;
  const qualityLabel =
    selectedLevel === -1 ? `Авто${autoLabel ? ` (${autoLabel})` : ''}` : levels.find((l) => l.index === selectedLevel)?.label;
  const hideUi = started && playing && !controlsVisible;

  return (
    <div
      ref={wrapRef}
      className={`player fp${hideUi ? ' fp--idle' : ''}${fullscreen ? ' fp--fullscreen' : ''}`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerMove={revealControls}
      onMouseLeave={() => playing && setControlsVisible(false)}
    >
      <video
        ref={videoRef}
        className="player__video"
        poster={poster || undefined}
        playsInline
        preload="metadata"
        controlsList="nofullscreen noremoteplayback"
        disablePictureInPicture
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
        onPlay={() => {
          setPlaying(true);
          setStarted(true);
          setWordPopup(null);
          revealControls();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
          saveResume(videoRef.current.currentTime, videoRef.current.duration);
        }}
        onEnded={() => localStorage.removeItem(storageKey)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onLoadedMetadata={(e) => {
          const video = e.currentTarget;
          setDuration(video.duration);
          video.playbackRate = speed;
          const saved = Number(localStorage.getItem(storageKey));
          if (saved > 15 && saved < video.duration - 20) {
            video.currentTime = saved;
            setTime(saved);
            setResumeFrom(saved);
          }
        }}
        onDurationChange={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          const video = e.currentTarget;
          setTime(video.currentTime);
          if (video.buffered.length) {
            setBuffered(video.buffered.end(video.buffered.length - 1));
          }
          if (Math.abs(video.currentTime - lastSavedRef.current) >= 5) {
            lastSavedRef.current = video.currentTime;
            saveResume(video.currentTime, video.duration);
          }
        }}
        onError={() => {
          if (!hlsRef.current) setError('Не удалось загрузить видео');
        }}
      />

      {!started && !error ? (
        <button type="button" className="fp-bigplay" onClick={togglePlay} aria-label="Смотреть">
          <SvgIcon name="play" />
          <span>{resumeFrom ? `Продолжить с ${formatTime(resumeFrom)}` : 'Смотреть'}</span>
        </button>
      ) : null}

      {resumeFrom && !started ? (
        <button
          type="button"
          className="fp-restart"
          onClick={() => {
            seekTo(0);
            setResumeFrom(0);
            localStorage.removeItem(storageKey);
          }}
        >
          Начать сначала
        </button>
      ) : null}

      {waiting && started && !error ? <div className="fp-spinner" aria-label="Загрузка" /> : null}
      {error ? <div className="fp-error">{error}</div> : null}

      {activeCueEn || activeCueRu ? (
        <div className={`fp-subs${hideUi ? ' fp-subs--low' : ''}`}>
          {activeCueEn ? (
            <p className="fp-subs__en" lang={filmLanguage}>
              <ClickableLine
                text={activeCueEn.text}
                language={filmLanguage}
                onWord={openWord}
                activeWord={wordPopup?.word}
              />
            </p>
          ) : null}
          {activeCueRu ? <p className="fp-subs__ru">{activeCueRu.text}</p> : null}
        </div>
      ) : null}

      {wordPopup ? (
        <SubtitleWordPopup
          word={wordPopup.word}
          context={wordPopup.context}
          timeSec={wordPopup.timeSec}
          mediaId={mediaId}
          language={filmLanguage}
          onClose={() => setWordPopup(null)}
          onResume={() => {
            setWordPopup(null);
            videoRef.current?.play().catch(() => {});
          }}
        />
      ) : null}

      <div className="fp-controls" onClick={(e) => e.stopPropagation()}>
        <div className="fp-seek">
          <div className="fp-seek__buffered" style={{ width: `${bufferedPct}%` }} />
          <div className="fp-seek__played" style={{ width: `${progressPct}%` }} />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step="0.1"
            value={Math.min(time, duration || 0)}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label="Перемотка"
          />
        </div>

        <div className="fp-bar">
          <button type="button" className="fp-btn" onClick={togglePlay} aria-label={playing ? 'Пауза' : 'Смотреть'}>
            <SvgIcon name={playing ? 'pause' : 'play'} />
          </button>
          <button
            type="button"
            className="fp-btn"
            onClick={replayLine}
            title="Повторить реплику (R)"
            aria-label="Повторить реплику"
          >
            <SvgIcon name="back" />
          </button>
          <div className="fp-volume">
            <button type="button" className="fp-btn" onClick={toggleMute} aria-label="Звук">
              <SvgIcon name={muted || volume === 0 ? 'muted' : 'volume'} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step="0.05"
              value={muted ? 0 : volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              aria-label="Громкость"
            />
          </div>
          <span className="fp-time">
            {formatTime(time)} / {formatTime(duration)}
          </span>

          <div className="fp-bar__right">
            {tracks.length ? (
              <div className="fp-menu-wrap">
                <button
                  type="button"
                  className={`fp-btn${effectiveMode !== 'off' ? ' fp-btn--on' : ''}`}
                  onClick={() => setMenu(menu === 'subs' ? null : 'subs')}
                  title="Субтитры (C)"
                  aria-label="Субтитры"
                >
                  <SvgIcon name="subs" />
                </button>
                {menu === 'subs' ? (
                  <div className="fp-menu">
                    <p className="fp-menu__title">Субтитры</p>
                    {SUB_MODES.filter(modeAvailable).map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        className={`fp-menu__item${effectiveMode === mode.id ? ' fp-menu__item--active' : ''}`}
                        onClick={() => chooseSubMode(mode.id)}
                      >
                        {modeLabel(mode.id)}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className="fp-menu-wrap">
              <button
                type="button"
                className="fp-btn"
                onClick={() => setMenu(menu === 'settings' ? null : 'settings')}
                aria-label="Настройки"
              >
                <SvgIcon name="gear" />
              </button>
              {menu === 'settings' ? (
                <div className="fp-menu">
                  {levels.length > 1 ? (
                    <>
                      <p className="fp-menu__title">Качество</p>
                      <button
                        type="button"
                        className={`fp-menu__item${selectedLevel === -1 ? ' fp-menu__item--active' : ''}`}
                        onClick={() => chooseLevel(-1)}
                      >
                        {selectedLevel === -1 ? qualityLabel : 'Авто'}
                      </button>
                      {levels.map((level) => (
                        <button
                          key={level.index}
                          type="button"
                          className={`fp-menu__item${selectedLevel === level.index ? ' fp-menu__item--active' : ''}`}
                          onClick={() => chooseLevel(level.index)}
                        >
                          {level.label}
                        </button>
                      ))}
                    </>
                  ) : null}
                  <p className="fp-menu__title">Скорость</p>
                  <div className="fp-menu__row">
                    {SPEEDS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`fp-chip${speed === value ? ' fp-chip--active' : ''}`}
                        onClick={() => chooseSpeed(value)}
                      >
                        {value === 1 ? '1×' : `${value}×`}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              className="fp-btn"
              onClick={toggleFullscreen}
              title="Полный экран (F)"
              aria-label="Полный экран"
            >
              <SvgIcon name={fullscreen ? 'shrink' : 'expand'} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
