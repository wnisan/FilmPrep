import { useState } from 'react';

const LABELS = ['', 'Плохо', 'Так себе', 'Нормально', 'Хорошо', 'Отлично'];

/** Read-only stars; value may be fractional (average rating). */
export function Stars({ value = 0, size = 16 }) {
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={`${value} из 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)));
        return (
          <span key={n} className="stars__item">
            ★
            <span className="stars__fill" style={{ width: `${fill * 100}%` }}>
              ★
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Clickable 1–5 stars with hover preview; clicking the current value clears it. */
export function StarInput({ value, onChange, disabled = false, size = 28 }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;

  return (
    <div className="star-input">
      <div className="star-input__stars" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            className={`star-input__star${n <= shown ? ' star-input__star--on' : ''}`}
            style={{ fontSize: size }}
            disabled={disabled}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(n === value ? null : n)}
            aria-label={`${n} из 5 — ${LABELS[n]}`}
            title={n === value ? 'Убрать оценку' : LABELS[n]}
          >
            ★
          </button>
        ))}
      </div>
      <span className="star-input__label">{shown ? LABELS[shown] : 'Оцените фильм'}</span>
    </div>
  );
}
