import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { browseWords, deleteWord, fetchDictionary, saveWord, translateWord, updateWord } from '../api/learning.js';
import { AppShell } from '../components/AppShell.jsx';
import { Flag } from '../components/Flag.jsx';
import { GrammarQuiz } from '../components/GrammarQuiz.jsx';
import { HighlightedExample } from '../components/PronounceButtons.jsx';
import { useAuthStore } from '../store/authStore.js';
import { useGoalStore } from '../store/goalStore.js';
import { plural } from '../utils/format.js';
import { activeLanguageOf, languageName, languagePrep, userLanguages } from '../utils/languages.js';
import { canSpeak, speak } from '../utils/speech.js';
import { fetchMyGrammar, removeMyGrammar } from '../api/media.js';
import { grammarGuide } from '../utils/grammarGuide.js';
import '../styles/materials.css';
const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const BROWSE_PAGE = 50;

function SpeakButton({ text, language }) {
  if (!canSpeak()) return null;
  return (
    <button
      type="button"
      className="say-btn say-btn--icon"
      onClick={() => speak(text, { lang: language })}
      title={`Произнести «${text}»`}
      aria-label={`Произнести «${text}»`}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" className="say-btn__icon">
        <path d="M4 9h4l5-4v14l-5-4H4zM16 8.5a4.5 4.5 0 010 7M18.5 6a8 8 0 010 12" />
      </svg>
    </button>
  );
}

function formatTimecode(ms) {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function AddWordForm({ language, onAdded }) {
  const [word, setWord] = useState('');
  const [translation, setTranslation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function autoTranslate() {
    if (!word.trim()) return;
    setBusy(true);
    setError('');
    try {
      const result = await translateWord({ word: word.trim(), language });
      if (result.translation) setTranslation(result.translation);
      else setError('Автоперевод не нашёлся — впишите свой');
    } catch (err) {
      setError(err.message || 'Не удалось перевести');
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    if (!word.trim()) return;
    setBusy(true);
    setError('');
    try {
      await saveWord({ word: word.trim(), translation: translation.trim() || null, source: 'manual', language });
      setWord('');
      setTranslation('');
      onAdded();
    } catch (err) {
      setError(err.message || 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="dict-add" onSubmit={onSubmit}>
      <input
        placeholder={`Слово на ${languagePrep(language)}`}
        lang={language}
        value={word}
        onChange={(e) => setWord(e.target.value)}
        maxLength={80}
      />
      <input
        placeholder="Перевод"
        value={translation}
        onChange={(e) => setTranslation(e.target.value)}
        maxLength={300}
      />
      <button type="button" className="btn btn--ghost" onClick={autoTranslate} disabled={busy || !word.trim()}>
        Перевести
      </button>
      <button type="submit" className="btn btn--primary" disabled={busy || !word.trim()}>
        Добавить
      </button>
      {error ? <p className="auth-error dict-add__error">{error}</p> : null}
    </form>
  );
}

function WordRow({ item, showLanguage, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.translation || '');
  const saved = item.kind === 'saved';

  async function saveTranslation() {
    setEditing(false);
    if (draft.trim() === (item.translation || '')) return;
    await updateWord(item.id, { translation: draft.trim() || null });
    onChanged();
  }

  async function remove() {
    await deleteWord(item.id, item.kind);
    onChanged();
  }

  return (
    <li className="dict-row">
      <div className="dict-row__head">
        {showLanguage ? <Flag code={item.language} size="sm" title={languageName(item.language)} /> : null}
        <strong className="dict-row__word" lang={item.language}>
          {item.word}
        </strong>
        <SpeakButton text={item.word} language={item.language} />
        {item.level ? <span className="tag tag--accent">{item.level}</span> : null}
        <span className={`dict-badge dict-badge--${saved ? item.source : 'learned'}`}>
          {saved ? { subtitle: 'из субтитров', lexicon: 'из словаря фильма', manual: 'добавлено вручную' }[item.source] : 'выучено'}
        </span>
        <span className="dict-row__spacer" />
        <button
          type="button"
          className="dict-row__remove"
          onClick={remove}
          title={saved ? 'Удалить из словаря' : 'Убрать из словаря (снимет отметку «выучено» в фильмах)'}
        >
          ×
        </button>
      </div>

      {editing ? (
        <input
          className="dict-row__edit"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={saveTranslation}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(item.translation || '');
              setEditing(false);
            }
          }}
        />
      ) : (
        <p
          className={`dict-row__translation${saved ? ' dict-row__translation--editable' : ''}`}
          onClick={() => saved && setEditing(true)}
          title={saved ? 'Нажмите, чтобы изменить перевод' : undefined}
        >
          {item.translation || <span className="muted">{saved ? 'Добавить перевод…' : 'без перевода'}</span>}
        </p>
      )}

      {item.context ? (
        <p className="materials__example">
          “<HighlightedExample text={item.context} forms={[item.word]} language={item.language} />”
        </p>
      ) : null}
      {item.media ? (
        <p className="dict-row__film">
          <Link to={`/media/${item.media.id}`}>{item.media.title}</Link>
          {item.timestampMs != null ? <span className="muted"> · {formatTimecode(item.timestampMs)}</span> : null}
        </p>
      ) : null}
    </li>
  );
}

function MyWords({ language, addLanguage, onCounts }) {
  const [allItems, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [film, setFilm] = useState('');
  const [level, setLevel] = useState('');
  const [adding, setAdding] = useState(false);

  async function load() {
    try {
      const data = await fetchDictionary();
      setItems(data.items);
      onCounts(data.languages || {});
      setError('');
    } catch (err) {
      setError(err.message || 'Не удалось загрузить словарь');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function changed() {
    load();
    useGoalStore.getState().refresh();
  }

  const items = useMemo(
    () => (language ? allItems.filter((i) => i.language === language) : allItems),
    [allItems, language],
  );

  useEffect(() => {
    setFilm('');
  }, [language]);

  const films = useMemo(() => {
    const map = new Map();
    items.forEach((i) => i.media && map.set(i.media.id, i.media.title));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);

  const visible = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase();
    return items.filter(
      (i) =>
        (!needle ||
          i.word.toLocaleLowerCase().includes(needle) ||
          (i.translation || '').toLocaleLowerCase().includes(needle)) &&
        (!kind || i.kind === kind) &&
        (!film || i.media?.id === film) &&
        (!level || i.level === level),
    );
  }, [items, q, kind, film, level]);

  return (
    <>
      <div className="dict-toolbar">
        <input placeholder="Поиск по слову или переводу" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Тип">
          <option value="">Все слова</option>
          <option value="saved">Сохранённые</option>
          <option value="learned">Выученные в фильмах</option>
        </select>
        <select value={film} onChange={(e) => setFilm(e.target.value)} aria-label="Фильм">
          <option value="">Все фильмы</option>
          {films.map(([id, title]) => (
            <option key={id} value={id}>
              {title}
            </option>
          ))}
        </select>
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Уровень">
          <option value="">Любой уровень</option>
          {CEFR.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>

      <div className="dict-actions">
        <span className="muted">
          {visible.length === items.length
            ? `${items.length} ${plural(items.length, ['слово', 'слова', 'слов'])}`
            : `Показано ${visible.length} из ${items.length}`}
        </span>
        <span className="dict-row__spacer" />
        <button type="button" className="btn btn--ghost" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Скрыть' : '+ Добавить слово'}
        </button>
      </div>

      {adding ? <AddWordForm language={language || addLanguage} onAdded={changed} /> : null}
      {error ? <p className="auth-error">{error}</p> : null}
      {loading ? <p className="muted">Загрузка…</p> : null}

      {!loading && items.length === 0 ? (
        <div className="catalog-empty">
          <p>{language ? `Слов на ${languagePrep(language)} пока нет.` : 'Словарь пока пуст.'}</p>
          <p className="muted">
            Во время просмотра нажмите на слово в субтитрах и добавьте его, отметьте слова выученными во вкладке
            «Словарь» у фильма или загляните во вкладку «Все слова из фильмов».
          </p>
        </div>
      ) : null}

      <ul className="dict-list">
        {visible.map((item) => (
          <WordRow key={`${item.kind}-${item.id}`} item={item} showLanguage={!language} onChanged={changed} />
        ))}
      </ul>
    </>
  );
}

function AllWords({ language }) {
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState('');
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const handle = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(handle);
  }, [q]);

  useEffect(() => {
    setPage(1);
  }, [query, level, language]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    browseWords({ q: query, level, language, page, limit: BROWSE_PAGE })
      .then((data) => {
        if (cancelled) return;
        setItems((prev) => (page === 1 ? data.items : [...prev, ...data.items]));
        setTotal(data.total);
        setError('');
      })
      .catch((err) => !cancelled && setError(err.message || 'Не удалось загрузить слова'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [query, level, language, page]);

  async function add(item) {
    try {
      await saveWord({
        word: item.word,
        translation: item.translation,
        context: item.context,
        lexiconEntryId: item.entryId,
        source: 'lexicon',
        language: item.language,
      });
      setItems((prev) => prev.map((i) => (i.entryId === item.entryId ? { ...i, inDictionary: true } : i)));
      useGoalStore.getState().refresh();
    } catch (err) {
      setError(err.message || 'Не удалось добавить');
    }
  }

  return (
    <>
      <div className="dict-toolbar dict-toolbar--short">
        <input placeholder="Начало слова или перевод" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Уровень">
          <option value="">Любой уровень</option>
          {CEFR.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <p className="muted dict-actions">
        {loading && page === 1 ? 'Загрузка…' : `${total} ${plural(total, ['слово', 'слова', 'слов'])} из словарей всех фильмов`}
      </p>
      {error ? <p className="auth-error">{error}</p> : null}

      <ul className="dict-list dict-list--compact">
        {items.map((item) => (
          <li key={`${item.language}-${item.entryId}`} className="dict-row dict-row--compact">
            <div className="dict-row__head">
              {!language ? <Flag code={item.language} size="sm" title={languageName(item.language)} /> : null}
              <strong className="dict-row__word" lang={item.language}>
                {item.word}
              </strong>
              <SpeakButton text={item.word} language={item.language} />
              {item.level ? <span className="tag tag--accent">{item.level}</span> : null}
              <span className="dict-row__translation">{item.translation || <span className="muted">—</span>}</span>
              <span className="dict-row__spacer" />
              <span className="muted dict-row__films" title={item.films.join(', ')}>
                {item.films.length === 1 ? item.films[0] : `${item.films.length} ${plural(item.films.length, ['фильм', 'фильма', 'фильмов'])}`}
              </span>
              {item.inDictionary ? (
                <span className="dict-badge dict-badge--in">✓ в словаре</span>
              ) : (
                <button type="button" className="say-btn" onClick={() => add(item)}>
                  + В словарь
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {items.length < total ? (
        <div className="catalog-more">
          <button type="button" className="btn btn--ghost" disabled={loading} onClick={() => setPage((p) => p + 1)}>
            {loading ? 'Загрузка…' : `Показать ещё (${total - items.length})`}
          </button>
        </div>
      ) : null}
    </>
  );
}

function MyGrammar({ language }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [quiz, setQuiz] = useState(false);

  useEffect(() => {
    fetchMyGrammar()
      .then((d) => setItems(d.items))
      .catch((err) => setError(err.message || 'Не удалось загрузить правила'));
  }, []);

  async function remove(rule) {
    setItems((prev) => prev.filter((r) => r.key !== rule.key));
    try {
      await removeMyGrammar(rule.patternIds);
    } catch (err) {
      setError(err.message || 'Не удалось убрать правило');
    }
  }

  const visible = (items || []).filter((r) => !language || r.language === language);
  if (error) return <p className="auth-error">{error}</p>;
  if (!items) return <p className="muted">Загрузка…</p>;

  if (quiz) {
    const groups = visible.map((r) => ({
      ...r,
      id: r.key,
      ids: r.patternIds,
      examples: r.examples || [],
    }));
    return (
      <GrammarQuiz
        groups={groups}
        language={language || visible[0]?.language}
        learnedIds={new Set()}
        backLabel="Мои правила"
        onClose={() => setQuiz(false)}
      />
    );
  }

  return (
    <>
      <div className="dict-actions my-rules__bar">
        <span className="muted">
          {visible.length
            ? `${visible.length} ${plural(visible.length, ['правило', 'правила', 'правил'])}`
            : null}
        </span>
        {visible.length ? (
          <button type="button" className="btn btn--primary btn--sm" onClick={() => setQuiz(true)}>
            Проверить себя
          </button>
        ) : null}
      </div>
      {!visible.length ? (
        <div className="catalog-empty">
          <p>Выученных правил пока нет.</p>
          <p className="muted">
            Откройте вкладку «Грамматика» у фильма и нажмите «Я выучил правило» или пройдите «Проверить себя» —
            правила, где вы ответили без ошибок, можно сразу добавить сюда.
          </p>
        </div>
      ) : null}
      <ul className="my-rules">
        {visible.map((rule) => {
          const guide = grammarGuide(rule);
          return (
            <li key={rule.key} className="my-rule">
              <div className="my-rule__head">
                {!language ? <Flag code={rule.language} size="sm" title={languageName(rule.language)} /> : null}
                <strong>{rule.title}</strong>
                {rule.cefrLevel ? <span className="level-badge">{rule.cefrLevel}</span> : null}
                <span className="dict-row__spacer" />
                <button type="button" className="dict-row__remove" onClick={() => remove(rule)} title="Убрать из моих правил">
                  ×
                </button>
              </div>
              {guide ? (
                <div className="gram-formula gram-formula--sm">
                  {guide.formula.map((part, i) => (
                    <span key={i} className={['+', ',', '/'].includes(part) ? 'gram-formula__op' : 'gram-formula__part'}>
                      {part}
                    </span>
                  ))}
                </div>
              ) : null}
              {rule.explanationRu ? <p className="my-rule__explain">{rule.explanationRu}</p> : null}
              {rule.examples[0] ? (
                <p className="materials__example" lang={rule.language}>
                  “{rule.examples[0]}”
                </p>
              ) : null}
              <p className="dict-row__film">
                {rule.films.map((f, i) => (
                  <span key={f.id}>
                    {i ? ', ' : ''}
                    <Link to={`/media/${f.slug || f.id}`}>{f.title}</Link>
                  </span>
                ))}
              </p>
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function DictionaryPage() {
  const [params, setParams] = useSearchParams();
  const tab = ['all', 'grammar'].includes(params.get('tab')) ? params.get('tab') : 'mine';
  const user = useAuthStore((s) => s.user);
  const active = activeLanguageOf(user);
  const [counts, setCounts] = useState({});
  const [language, setLanguage] = useState(active);

  // Studied languages first, then any other language that already has saved words
  const languages = useMemo(() => {
    const list = userLanguages(user).map((l) => l.code);
    Object.keys(counts).forEach((code) => !list.includes(code) && list.push(code));
    return list;
  }, [user, counts]);

  useEffect(() => {
    setLanguage(active);
  }, [active]);

  return (
    <AppShell>
      <h1 className="page-title">Мой словарь</h1>

      {languages.length > 1 ? (
        <div className="catalog-langs dict-langs" role="group" aria-label="Язык словаря">
          <button
            type="button"
            className={`catalog-lang${!language ? ' is-active' : ''}`}
            onClick={() => setLanguage('')}
          >
            Все языки
          </button>
          {languages.map((code) => (
            <button
              key={code}
              type="button"
              className={`catalog-lang${language === code ? ' is-active' : ''}`}
              onClick={() => setLanguage(code)}
            >
              <Flag code={code} size="sm" />
              {languageName(code)}
              {counts[code] ? <span className="catalog-lang__count">{counts[code]}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <div className="tabs">
        <button
          type="button"
          className={`tabs__btn${tab === 'mine' ? ' tabs__btn--active' : ''}`}
          onClick={() => setParams({}, { replace: true })}
        >
          Мои слова
        </button>
        <button
          type="button"
          className={`tabs__btn${tab === 'all' ? ' tabs__btn--active' : ''}`}
          onClick={() => setParams({ tab: 'all' }, { replace: true })}
        >
          Все слова из фильмов
        </button>
        <button
          type="button"
          className={`tabs__btn${tab === 'grammar' ? ' tabs__btn--active' : ''}`}
          onClick={() => setParams({ tab: 'grammar' }, { replace: true })}
        >
          Мои правила
        </button>
      </div>

      {tab === 'mine' ? <MyWords language={language} addLanguage={active} onCounts={setCounts} /> : null}
      {tab === 'all' ? <AllWords language={language} /> : null}
      {tab === 'grammar' ? <MyGrammar language={language} /> : null}
    </AppShell>
  );
}
