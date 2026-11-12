import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell.jsx';
import { Flag } from '../components/Flag.jsx';
import { fetchMyFilms } from '../api/myFilms.js';
import { languagePrep } from '../utils/languages.js';
import '../styles/myFilms.css';

function filmState(item) {
  if (item.pipeline?.state === 'running') return { label: 'Готовим материалы…', tone: 'busy' };
  if (item.videoStatus === 'processing') return { label: 'Обрабатываем видео…', tone: 'busy' };
  if (item.words > 0) return { label: item.hasQuiz ? 'Готов · есть тест' : 'Готов', tone: 'ok' };
  if (item.pipeline?.state === 'failed') return { label: 'Ошибка подготовки', tone: 'bad' };
  return { label: 'Нужны субтитры', tone: 'todo' };
}

export function MyFilmsPage() {
  const [items, setItems] = useState([]);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchMyFilms()
        .then((data) => {
          if (cancelled) return;
          setItems(data.items);
          setLimit(data.limit);
          setError('');
        })
        .catch((err) => !cancelled && setError(err.message))
        .finally(() => !cancelled && setLoading(false));
    load();
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const full = items.length >= limit;

  return (
    <AppShell>
      <div className="myfilms-head">
        <div>
          <h1 className="page-title">Мои фильмы</h1>
          <p className="page-lead">
            Добавьте свой фильм или ссылку на него и субтитры — FilmPrep подготовит слова, фразы, грамматику и
            тест. Эти фильмы видите только вы, в общий каталог они не попадают.
          </p>
        </div>
        {loading || (!items.length && !error) ? null : full ? (
          <span className="muted" title="Удалите ненужный фильм, чтобы добавить новый">
            {items.length} / {limit} — лимит
          </span>
        ) : (
          <Link className="btn btn--primary" to="/my-films/new">
            + Добавить фильм
          </Link>
        )}
      </div>

      {error ? <p className="auth-error">{error}</p> : null}

      {!loading && !items.length && !error ? (
        <div className="myfilms-empty">
          <h2>Как это работает</h2>
          <ol className="myfilms-steps">
            <li>
              <strong>Опишите фильм</strong>
            </li>
            <li>
              <strong>Добавьте видео</strong> — скачанным файлом с устройства, ссылкой YouTube / Vimeo / Яндекс
              Диска или вовсе без него.
            </li>
            <li>
              <strong>Загрузите субтитры</strong> .srt или .vtt на языке фильма (русские — по желанию, могут быть
              переведены нашей нейросетью).
            </li>
            <li>
              <strong>Нажмите «Подготовить материалы»</strong> — получите словарь, фразы, грамматику и тест.
            </li>
          </ol>
          <Link className="btn btn--primary" to="/my-films/new">
            Добавить первый фильм
          </Link>
        </div>
      ) : null}

      <div className="media-grid">
        {items.map((item) => {
          const state = filmState(item);
          return (
            <article key={item.id} className="media-card myfilm-card">
              <Link className="media-card__poster" to={item.words > 0 ? `/media/${item.slug || item.id}` : `/my-films/${item.id}`}>
                {item.posterUrl ? (
                  <img src={item.posterUrl} alt={item.title} loading="lazy" />
                ) : (
                  <span className="media-card__poster-fallback">{item.title.slice(0, 1)}</span>
                )}
                {item.hasVideo ? <span className="media-card__badge">▶ смотреть</span> : null}
                <span className="media-card__lang">
                  <Flag code={item.language} size="sm" title={`На ${languagePrep(item.language)}`} />
                </span>
              </Link>
              <div className="media-card__body">
                <h2 className="media-card__title">{item.title}</h2>
                <p className="media-card__meta">
                  {[item.recommendedLevel, item.words ? `${item.words} слов` : null].filter(Boolean).join(' · ') || '—'}
                </p>
                <span className={`myfilm-state myfilm-state--${state.tone}`}>{state.label}</span>
                <div className="myfilm-card__actions">
                  {item.words > 0 ? (
                    <Link className="btn btn--primary btn--sm" to={`/media/${item.slug || item.id}`}>
                      Открыть
                    </Link>
                  ) : null}
                  <Link className="btn btn--ghost btn--sm" to={`/my-films/${item.id}`}>
                    Настроить
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </AppShell>
  );
}
