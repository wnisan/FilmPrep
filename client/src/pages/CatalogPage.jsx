import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fetchMediaFilters, fetchMediaList } from '../api/media.js';
import { useAuthStore } from '../store/authStore.js';
import { AppShell } from '../components/AppShell.jsx';
import { RecommendedStrip } from '../components/FilmStrip.jsx';
import { Flag } from '../components/Flag.jsx';
import { Dropdown } from '../components/Dropdown.jsx';
import { genreLabel, runtimeLabel, themeLabel } from '../utils/labels.js';
import { plural } from '../utils/format.js';
import { activeLanguageOf, languageName, languagePrep, levelFor } from '../utils/languages.js';
import '../styles/app.css';

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const PAGE_SIZE = 24;

const SORTS = [
  { id: 'title', label: 'По названию' },
  { id: 'rating', label: 'По рейтингу' },
  { id: 'popular', label: 'Популярные' },
  { id: 'year_desc', label: 'Сначала новые' },
  { id: 'year_asc', label: 'Сначала старые' },
  { id: 'runtime', label: 'Короткие сначала' },
  { id: 'new', label: 'Недавно добавленные' },
];

// URL keys that are real filters (sort and search are shown separately)
const FILTER_KEYS = ['language', 'level', 'genre', 'country', 'theme', 'yearFrom', 'yearTo', 'minRating'];

const YEAR_MIN = 1888;
const YEAR_MAX = 2100;

/** Typed or stepped year; committed to the URL only when it is a full valid year. */
function YearInput({ value, placeholder, min, max, onCommit, label }) {
  const [text, setText] = useState(value || '');
  const lo = min || YEAR_MIN;
  const hi = max || YEAR_MAX;

  useEffect(() => {
    setText(value || '');
  }, [value]);

  function commit(raw) {
    const trimmed = String(raw).trim();
    if (!trimmed) {
      onCommit('');
      return;
    }
    const n = Number(trimmed);
    if (!Number.isInteger(n) || trimmed.length !== 4) {
      setText(value || '');
      return;
    }
    const clamped = Math.min(hi, Math.max(lo, n));
    setText(String(clamped));
    if (String(clamped) !== String(value || '')) onCommit(String(clamped));
  }

  function step(delta) {
    const base = Number(text) || (delta > 0 ? lo - 1 : hi + 1);
    commit(String(Math.min(hi, Math.max(lo, base + delta))));
  }

  return (
    <div className="year-input">
      <button type="button" className="year-input__step" onClick={() => step(-1)} aria-label={`${label}: меньше`}>
        −
      </button>
      <input
        inputMode="numeric"
        maxLength={4}
        aria-label={label}
        placeholder={placeholder}
        value={text}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
          setText(digits);
          if (digits.length === 4) commit(digits);
          if (!digits) onCommit('');
        }}
        onBlur={() => commit(text)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit(text);
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            step(1);
          }
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            step(-1);
          }
        }}
      />
      <button type="button" className="year-input__step" onClick={() => step(1)} aria-label={`${label}: больше`}>
        +
      </button>
    </div>
  );
}

/** Clicking the N-th star keeps films rated N and higher; clicking it again clears. */
function StarFilter({ value, onChange }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="star-filter" onMouseLeave={() => setHover(0)}>
      <div className="star-filter__stars" role="radiogroup" aria-label="Минимальный рейтинг">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} и выше`}
            className={`star-filter__star${n <= shown ? ' is-on' : ''}`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(value === n ? 0 : n)}
          >
            ★
          </button>
        ))}
      </div>
      <span className="star-filter__hint">{shown ? `${shown} и выше` : 'любой'}</span>
    </div>
  );
}

function chipLabel(key, value) {
  switch (key) {
    case 'language':
      return `На ${languagePrep(value)}`;
    case 'level':
      return `Уровень ${value}`;
    case 'genre':
      return genreLabel(value);
    case 'theme':
      return `Тема: ${themeLabel(value)}`;
    case 'yearFrom':
      return `с ${value} г.`;
    case 'yearTo':
      return `по ${value} г.`;
    case 'minRating':
      return `★ ${value} и выше`;
    case 'country':
      return `Страна: ${value}`;
    default:
      return value;
  }
}

export function CatalogPage() {
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const [options, setOptions] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [panelOpen, setPanelOpen] = useState(() => FILTER_KEYS.some((k) => params.get(k)));
  const [search, setSearch] = useState(params.get('q') || '');

  const query = useMemo(() => Object.fromEntries(params.entries()), [params]);
  const activeFilters = FILTER_KEYS.filter((k) => query[k]);
  const myLanguage = activeLanguageOf(user);
  const myLevel = levelFor(user, myLanguage);
  const filmLanguages = options?.languages || [];

  useEffect(() => {
    fetchMediaFilters()
      .then(setOptions)
      .catch(() => setOptions({ genres: [], themes: [], countries: [], yearMin: null, yearMax: null }));
  }, []);

  // Search box writes to the URL with a small delay
  useEffect(() => {
    const handle = setTimeout(() => {
      if ((params.get('q') || '') !== search.trim()) update({ q: search.trim() });
    }, 400);
    return () => clearTimeout(handle);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPage(1);
  }, [params]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchMediaList({ ...query, page, limit: PAGE_SIZE })
      .then((result) => {
        if (cancelled) return;
        setItems((prev) => (page === 1 ? result.items : [...prev, ...result.items]));
        setTotal(result.total);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Не удалось загрузить каталог');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, page]);

  function update(changes) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([key, value]) => {
      if (value === '' || value == null || value === false) next.delete(key);
      else next.set(key, String(value));
    });
    setParams(next, { replace: true });
  }

  function resetAll() {
    setSearch('');
    setParams(new URLSearchParams(), { replace: true });
  }

  const select = (key, label, values, render = (v) => v, icon = null) => (
    <div className="catalog-filter">
      <span>{label}</span>
      <Dropdown
        label={label}
        value={query[key] || ''}
        onChange={(v) => update({ [key]: v })}
        options={[
          { value: '', label: 'Любой' },
          ...values.map((v) => ({ value: v, label: render(v), icon: icon?.(v) })),
        ]}
      />
    </div>
  );

  // Clicks on card tags must not open the film (the card itself is a link)
  const filterFromCard = (changes) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    update(changes);
    setPanelOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AppShell>
      <RecommendedStrip />

      <div className="catalog-bar">
        <input
          className="catalog-bar__search"
          placeholder="Название или режиссёр"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Dropdown
          className="catalog-bar__sort"
          label="Сортировка"
          value={query.sort || 'title'}
          onChange={(v) => update({ sort: v === 'title' ? '' : v })}
          options={SORTS.map((s) => ({ value: s.id, label: s.label }))}
        />
        <button
          type="button"
          className={`btn btn--ghost catalog-bar__toggle${panelOpen ? ' btn--nav-active' : ''}`}
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
        >
          Фильтры{activeFilters.length ? ` · ${activeFilters.length}` : ''}
        </button>
      </div>

      {filmLanguages.length > 1 ? (
        <div className="catalog-langs" role="group" aria-label="Язык фильма">
          <button
            type="button"
            className={`catalog-lang${!query.language ? ' is-active' : ''}`}
            onClick={() => update({ language: '' })}
          >
            Все языки
          </button>
          {filmLanguages.map((code) => (
            <button
              key={code}
              type="button"
              className={`catalog-lang${query.language === code ? ' is-active' : ''}`}
              onClick={() => update({ language: query.language === code ? '' : code })}
            >
              <Flag code={code} size="sm" />
              {languageName(code)}
            </button>
          ))}
        </div>
      ) : null}

      {panelOpen ? (
        <div className="catalog-panel">
          {select(
            'language',
            'Язык фильма',
            filmLanguages,
            languageName,
            (code) => <Flag code={code} size="sm" />,
          )}
          {select('level', 'Уровень', CEFR)}
          {select('genre', 'Жанр', options?.genres || [], genreLabel)}
          {select('country', 'Страна', options?.countries || [])}
          {select('theme', 'Тема', options?.themes || [], themeLabel)}
          <div className="catalog-filter catalog-filter--wide">
            <span>Год выхода</span>
            <div className="year-range">
              <YearInput
                value={query.yearFrom}
                placeholder={options?.yearMin ? String(options.yearMin) : 'от'}
                min={options?.yearMin}
                max={Number(query.yearTo) || options?.yearMax}
                onCommit={(v) => update({ yearFrom: v })}
                label="Год от"
              />
              <span className="year-range__dash">—</span>
              <YearInput
                value={query.yearTo}
                placeholder={options?.yearMax ? String(options.yearMax) : 'до'}
                min={Number(query.yearFrom) || options?.yearMin}
                max={options?.yearMax}
                onCommit={(v) => update({ yearTo: v })}
                label="Год до"
              />
            </div>
          </div>
          <div className="catalog-filter">
            <span>Рейтинг зрителей</span>
            <StarFilter value={Number(query.minRating) || 0} onChange={(v) => update({ minRating: v || '' })} />
          </div>
        </div>
      ) : null}

      <div className="catalog-summary">
        <span className="muted">
          {loading && page === 1
            ? 'Загрузка…'
            : `Найдено ${total} ${plural(total, ['фильм', 'фильма', 'фильмов'])}`}
        </span>
        {activeFilters.map((key) => (
          <button key={key} type="button" className="catalog-chip" onClick={() => update({ [key]: '' })}>
            {chipLabel(key, query[key])} <span aria-hidden="true">×</span>
          </button>
        ))}
        {activeFilters.length || query.q ? (
          <button type="button" className="catalog-reset" onClick={resetAll}>
            Сбросить всё
          </button>
        ) : null}
        {myLevel && (query.level !== myLevel || query.language !== myLanguage) ? (
          <button
            type="button"
            className="catalog-hint"
            onClick={() => update({ level: myLevel, language: myLanguage })}
          >
            <Flag code={myLanguage} size="sm" /> Фильмы для моего уровня {myLevel}
          </button>
        ) : null}
      </div>

      {error ? <p className="auth-error">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="catalog-empty">
          <p>По таким условиям фильмов нет.</p>
          <button type="button" className="btn btn--ghost" onClick={resetAll}>
            Сбросить фильтры
          </button>
        </div>
      ) : null}

      <div className="media-grid">
        {items.map((item) => (
          <Link key={item.id} className="media-card" to={`/media/${item.slug || item.id}`}>
            <div className="media-card__poster">
              {item.posterUrl ? (
                <img src={item.posterUrl} alt={item.title} loading="lazy" />
              ) : (
                <span className="media-card__poster-fallback">{item.title.slice(0, 1)}</span>
              )}
              {item.hasVideo ? <span className="media-card__badge">▶ смотреть</span> : null}
              <button
                type="button"
                className="media-card__lang"
                title={`Все фильмы на ${languagePrep(item.language)}`}
                onClick={filterFromCard({ language: item.language })}
              >
                <Flag code={item.language} size="sm" />
              </button>
            </div>
            <div className="media-card__body">
              <h2 className="media-card__title">{item.title}</h2>
              <p className="media-card__meta">
                {item.year || '—'}
                {item.countries?.length ? (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className="media-card__link"
                      title={`Фильмы: ${item.countries[0]}`}
                      onClick={filterFromCard({ country: item.countries[0] })}
                    >
                      {item.countries[0]}
                    </button>
                  </>
                ) : null}
                {item.recommendedLevel ? ` · ${item.recommendedLevel}` : ''}
                {item.ratingAvg != null ? (
                  <span className="media-card__rating" title={`${item.ratingCount} оценок`}>
                    ★ {item.ratingAvg.toFixed(1)}
                  </span>
                ) : null}
              </p>
              {item.description ? <p className="media-card__desc">{item.description}</p> : null}
              <div className="media-card__tags">
                {(item.genres || []).slice(0, 2).map((g) => (
                  <button
                    type="button"
                    className={`tag tag--accent tag--clickable${query.genre === g ? ' is-active' : ''}`}
                    key={`g-${g}`}
                    title={`Все фильмы жанра «${genreLabel(g)}»`}
                    onClick={filterFromCard({ genre: g })}
                  >
                    {genreLabel(g)}
                  </button>
                ))}
                {item.runtimeMin ? <span className="tag">{runtimeLabel(item.runtimeMin)}</span> : null}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {items.length < total ? (
        <div className="catalog-more">
          <button type="button" className="btn btn--ghost" disabled={loading} onClick={() => setPage((p) => p + 1)}>
            {loading ? 'Загрузка…' : `Показать ещё (${total - items.length})`}
          </button>
        </div>
      ) : null}
    </AppShell>
  );
}
