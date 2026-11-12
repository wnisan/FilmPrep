import { useEffect, useState } from 'react';
import { updateLanguages } from '../api/social.js';
import { useAuthStore } from '../store/authStore.js';
import { useGoalStore } from '../store/goalStore.js';
import { CEFR_LEVELS, LANGUAGES, activeLanguageOf, languageName, userLanguages } from '../utils/languages.js';
import { Flag } from './Flag.jsx';

const MAX_LANGUAGES = 8;

/** Settings card: which languages the learner studies, level per language, the main one. */
export function LanguagesEditor() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [list, setList] = useState([]);
  const [active, setActive] = useState('en');
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({});

  useEffect(() => {
    if (!user) return;
    setList(userLanguages(user).map((l) => ({ ...l })));
    setActive(activeLanguageOf(user));
  }, [user?.id, user?.activeLanguage, JSON.stringify(user?.learningLanguages)]);

  // Header menu «＋ Добавить язык» links here
  useEffect(() => {
    if (window.location.hash !== '#languages') return;
    setPicking(true);
    const timer = setTimeout(
      () => document.getElementById('languages')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      50,
    );
    return () => clearTimeout(timer);
  }, []);

  const chosen = new Set(list.map((l) => l.code));
  const dirty =
    active !== activeLanguageOf(user) || JSON.stringify(list) !== JSON.stringify(userLanguages(user));

  function add(code) {
    setList((prev) => [...prev, { code, level: null }]);
    if (!list.length) setActive(code);
    setPicking(false);
    setMsg({});
  }

  function remove(code) {
    const next = list.filter((l) => l.code !== code);
    setList(next);
    if (active === code && next.length) setActive(next[0].code);
    setMsg({});
  }

  function setLevel(code, level) {
    setList((prev) => prev.map((l) => (l.code === code ? { ...l, level: level || null } : l)));
    setMsg({});
  }

  async function save() {
    if (!list.length) {
      setMsg({ error: 'Выберите хотя бы один язык' });
      return;
    }
    setBusy(true);
    setMsg({});
    try {
      const data = await updateLanguages({ languages: list, active });
      setUser(data.user);
      useGoalStore.getState().refresh();
      setMsg({ ok: 'Языки сохранены' });
    } catch (err) {
      setMsg({ error: err.message || 'Не удалось сохранить языки' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings-card" id="languages">
      <h2 className="settings-card__title">Изучаемые языки</h2>
      <p className="muted">Флаги видны в вашем профиле.</p>

      <ul className="lang-editor">
        {list.map((l) => (
          <li key={l.code} className={`lang-editor__row${l.code === active ? ' is-active' : ''}`}>
            <Flag code={l.code} size="lg" />
            <span className="lang-editor__name">{languageName(l.code)}</span>
            <select
              className="settings-input lang-editor__level"
              value={l.level || ''}
              onChange={(e) => setLevel(l.code, e.target.value)}
              aria-label={`Уровень: ${languageName(l.code)}`}
            >
              <option value="">Уровень?</option>
              {CEFR_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
            {l.code === active ? (
              <span className="lang-editor__main">основной</span>
            ) : (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setActive(l.code)}>
                Сделать основным
              </button>
            )}
            <button
              type="button"
              className="lang-editor__remove"
              onClick={() => remove(l.code)}
              disabled={list.length === 1}
              aria-label={`Убрать ${languageName(l.code)}`}
              title={list.length === 1 ? 'Нужен хотя бы один язык' : 'Убрать'}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {picking ? (
        <div className="lang-picker">
          {LANGUAGES.filter((l) => !chosen.has(l.code)).map((l) => (
            <button key={l.code} type="button" className="lang-picker__item" onClick={() => add(l.code)}>
              <Flag code={l.code} />
              <span>{l.name}</span>
              <span className="lang-picker__native">{l.native}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="lang-editor__actions">
        {list.length < MAX_LANGUAGES ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPicking((v) => !v)}>
            {picking ? 'Скрыть список' : '＋ Добавить язык'}
          </button>
        ) : null}
        <button type="button" className="btn btn--primary" onClick={save} disabled={busy || !dirty}>
          {busy ? 'Сохранение…' : 'Сохранить языки'}
        </button>
      </div>
      {msg.error ? <p className="auth-error">{msg.error}</p> : null}
      {msg.ok ? <p className="landing__status--ok">{msg.ok}</p> : null}
    </section>
  );
}
