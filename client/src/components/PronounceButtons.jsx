import { useState } from 'react';
import { canSpeak, speak } from '../utils/speech.js';

function Icon({ name }) {
  const paths = {
    film: <path d="M4 5h16v14H4zM8 5v14M16 5v14M4 9h4M4 15h4M16 9h4M16 15h4" />,
    stop: <path d="M7 7h10v10H7z" />,
    speaker: <path d="M4 9h4l5-4v14l-5-4H4zM16 8.5a4.5 4.5 0 010 7M18.5 6a8 8 0 010 12" />,
  };
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="say-btn__icon">
      {paths[name]}
    </svg>
  );
}

/**
 * «Из фильма» plays the original line from the film; the speaker button
 * reads the word/phrase with a synthetic voice (works for films without video too).
 */
export function PronounceButtons({
  clip,
  clipKey,
  timestampMs,
  clipText,
  ttsText,
  ttsLabel = 'Произнести',
  language = 'en',
}) {
  const [speaking, setSpeaking] = useState(false);
  const hasClip = clip?.available && timestampMs != null;
  const isPlaying = clip?.playingKey === clipKey;
  const isLoading = clip?.loadingKey === clipKey;

  function onSpeak() {
    clip?.stop();
    setSpeaking(true);
    speak(ttsText, { lang: language, onEnd: () => setSpeaking(false) });
  }

  return (
    <span className="say">
      {hasClip ? (
        <button
          type="button"
          className={`say-btn say-btn--film${isPlaying ? ' say-btn--active' : ''}${isLoading ? ' say-btn--loading' : ''}`}
          onClick={() => clip.play(clipKey, timestampMs, clipText)}
          title="Послушать, как это звучит в фильме"
        >
          <Icon name={isPlaying ? 'stop' : 'film'} />
          <span>{isLoading ? 'Загрузка…' : isPlaying ? 'Стоп' : 'Из фильма'}</span>
          {isPlaying ? <span className="say-btn__wave" aria-hidden="true"><i /><i /><i /></span> : null}
        </button>
      ) : null}
      {canSpeak() && ttsText ? (
        <button
          type="button"
          className={`say-btn say-btn--icon${speaking ? ' say-btn--active' : ''}`}
          onClick={onSpeak}
          title={ttsLabel}
          aria-label={ttsLabel}
        >
          <Icon name="speaker" />
        </button>
      ) : null}
    </span>
  );
}

const UNSPACED = new Set(['ja', 'zh']);

/** Wraps occurrences of the word forms in the example sentence with <mark>. */
export function HighlightedExample({ text, forms, language = 'en' }) {
  const words = [...new Set((forms || []).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!words.length || !text) return text;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  // Word boundaries that work for any alphabet; Japanese/Chinese have no spaces at all
  const re = UNSPACED.has(language)
    ? new RegExp(`(${escaped.join('|')})`, 'giu')
    : new RegExp(`(?<![\\p{L}\\p{M}])(${escaped.join('|')})(?![\\p{L}\\p{M}])`, 'giu');
  const parts = text.split(re);
  return parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part));
}
