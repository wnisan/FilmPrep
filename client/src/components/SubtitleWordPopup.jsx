import { useEffect, useState } from 'react';
import { saveWord, translateWord } from '../api/learning.js';
import { useGoalStore } from '../store/goalStore.js';
import { canSpeak, speak } from '../utils/speech.js';
import { HighlightedExample } from './PronounceButtons.jsx';

const SOURCE_LABELS = {
  film: 'из словаря фильма',
  ai: 'автоперевод',
  mine: 'ваш перевод',
};

const segmenters = new Map();

/** [{ text, word }] pieces of a line; `word` pieces are clickable. Works for any script. */
export function splitWords(text, language = 'en') {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    if (!segmenters.has(language)) {
      segmenters.set(language, new Intl.Segmenter(language, { granularity: 'word' }));
    }
    return [...segmenters.get(language).segment(text)].map((s) => ({
      text: s.segment,
      word: Boolean(s.isWordLike) && /\p{L}/u.test(s.segment),
    }));
  }
  return text
    .split(/(\p{L}[\p{L}\p{M}\p{N}]*(?:['’]\p{L}+)?(?:-\p{L}+)*)/u)
    .map((part, i) => ({ text: part, word: i % 2 === 1 }));
}

/** Splits a subtitle line into clickable words and plain separators. */
export function ClickableLine({ text, language = 'en', onWord, activeWord }) {
  return splitWords(text, language).map((part, i) =>
    part.word ? (
      <button
        key={i}
        type="button"
        className={`fp-word${activeWord === part.text ? ' fp-word--active' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onWord(part.text);
        }}
      >
        {part.text}
      </button>
    ) : (
      part.text
    ),
  );
}

/** Translation card shown over the paused film. */
export function SubtitleWordPopup({ word, context, timeSec, mediaId, language = 'en', onClose, onResume }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [translation, setTranslation] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    setSaved(false);
    translateWord({ word, context: context || undefined, mediaId })
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setTranslation(result.translation || '');
        setSaved(Boolean(result.inDictionary));
      })
      .catch((err) => !cancelled && setError(err.message || 'Не удалось перевести'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [word, context, mediaId]);

  async function add() {
    setSaving(true);
    setError('');
    try {
      await saveWord({
        word: data?.lemma && data.source === 'film' ? data.lemma : word.toLocaleLowerCase(language),
        translation: translation.trim() || null,
        context: context || null,
        mediaId,
        lexiconEntryId: data?.lexiconEntryId || null,
        timestampMs: Math.max(0, Math.round(timeSec * 1000)),
        source: 'subtitle',
      });
      setSaved(true);
      useGoalStore.getState().refresh();
    } catch (err) {
      setError(err.message || 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }

  const lemma = data?.lemma && data.lemma.toLowerCase() !== word.toLowerCase() ? data.lemma : null;

  return (
    <div className="fp-word-popup" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Перевод слова ${word}`}>
      <div className="fp-word-popup__head">
        <strong className="fp-word-popup__word">{word}</strong>
        {canSpeak(language) ? (
          <button
            type="button"
            className="say-btn say-btn--icon"
            onClick={() => speak(lemma || word, { lang: language })}
            aria-label="Произнести"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="say-btn__icon">
              <path d="M4 9h4l5-4v14l-5-4H4zM16 8.5a4.5 4.5 0 010 7M18.5 6a8 8 0 010 12" />
            </svg>
          </button>
        ) : null}
        {data?.level ? <span className="tag tag--accent">{data.level}</span> : null}
        <button type="button" className="fp-word-popup__close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
      </div>
      {lemma ? <p className="fp-word-popup__lemma">начальная форма: {lemma}</p> : null}

      {loading ? (
        <p className="muted">Ищем перевод…</p>
      ) : data?.translation ? (
        <p className="fp-word-popup__translation">
          {data.translation}
          {SOURCE_LABELS[data.source] ? <span className="fp-word-popup__source">{SOURCE_LABELS[data.source]}</span> : null}
        </p>
      ) : (
        <input
          className="fp-word-popup__input"
          placeholder="Перевод не найден — впишите свой"
          value={translation}
          onChange={(e) => setTranslation(e.target.value)}
          onKeyDown={(e) => e.stopPropagation()}
          maxLength={300}
        />
      )}

      {context ? (
        <p className="fp-word-popup__context">
          “<HighlightedExample text={context} forms={[word]} language={language} />”
        </p>
      ) : null}
      {error ? <p className="auth-error">{error}</p> : null}

      <div className="fp-word-popup__actions">
        {saved ? (
          <span className="dict-badge dict-badge--in">✓ В словаре</span>
        ) : (
          <button type="button" className="btn btn--primary" onClick={add} disabled={loading || saving}>
            {saving ? 'Сохраняем…' : '+ Добавить в словарь'}
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onResume}>
          Продолжить ▶
        </button>
      </div>
    </div>
  );
}
