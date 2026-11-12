import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useGoalStore } from '../store/goalStore.js';
import { activeLanguageOf, languageName, userLanguages } from '../utils/languages.js';
import { Flag } from './Flag.jsx';

/** Header flag: which language the learner studies right now; switches recommendations and levels. */
export function LanguageSwitcher() {
  const user = useAuthStore((s) => s.user);
  const setActiveLanguage = useAuthStore((s) => s.setActiveLanguage);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;
  const languages = userLanguages(user);
  const active = activeLanguageOf(user);
  const activeLevel = languages.find((l) => l.code === active)?.level;

  async function choose(code) {
    if (code === active) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await setActiveLanguage(code);
      useGoalStore.getState().refresh();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lang-switch" ref={ref}>
      <button
        type="button"
        className={`lang-switch__btn${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Изучаю: ${languageName(active)}${activeLevel ? ` (${activeLevel})` : ''}`}
      >
        <Flag code={active} />
        {activeLevel ? <span className="lang-switch__level">{activeLevel}</span> : null}
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true" className="lang-switch__chev">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="lang-switch__menu" role="menu">
          <p className="lang-switch__title">Изучаю</p>
          {languages.map((l) => (
            <button
              key={l.code}
              type="button"
              role="menuitemradio"
              aria-checked={l.code === active}
              className={`lang-switch__item${l.code === active ? ' is-active' : ''}`}
              disabled={busy}
              onClick={() => choose(l.code)}
            >
              <Flag code={l.code} />
              <span className="lang-switch__name">{languageName(l.code)}</span>
              <span className="lang-switch__lvl">{l.level || '—'}</span>
            </button>
          ))}
          <Link className="lang-switch__add" to="/profile/edit#languages" onClick={() => setOpen(false)}>
            ＋ Добавить язык
          </Link>
        </div>
      ) : null}
    </div>
  );
}
