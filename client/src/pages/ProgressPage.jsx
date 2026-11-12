import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMyProgress, updateMyProfile } from '../api/media.js';
import { useAuthStore } from '../store/authStore.js';
import { AppShell } from '../components/AppShell.jsx';
import { GoalCard } from '../components/DailyGoal.jsx';
import { Flag } from '../components/Flag.jsx';
import { activeLanguageOf, languageGen, languageName } from '../utils/languages.js';
import { plural } from '../utils/format.js';
import '../styles/app.css';
import '../styles/materials.css';

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const STAT_ICONS = {
  films: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
    </>
  ),
  materials: (
    <>
      <path d="M12 6.5C10.5 5.2 8.3 4.5 5.5 4.5H3v14h2.5c2.8 0 5 .7 6.5 2 1.5-1.3 3.7-2 6.5-2H21v-14h-2.5c-2.8 0-5 .7-6.5 2Z" />
      <path d="M12 6.5v14" />
    </>
  ),
  quizzes: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.8 2.8L16.5 9.5" />
    </>
  ),
};

function StatIcon({ name }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {STAT_ICONS[name]}
    </svg>
  );
}

export function ProgressPage() {
  const user = useAuthStore((s) => s.user);
  const bootstrap = useAuthStore((s) => s.bootstrap);
  const [data, setData] = useState(null);
  const language = activeLanguageOf(user);
  const [level, setLevel] = useState(user?.cefrLevel || 'B1');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const result = await fetchMyProgress();
      setData(result);
    } catch (err) {
      setError(err.message || 'Не удалось загрузить прогресс');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (user?.cefrLevel) setLevel(user.cefrLevel);
  }, [user?.cefrLevel]);

  async function onSaveLevel(event) {
    event.preventDefault();
    setMessage('');
    setError('');
    try {
      await updateMyProfile({ cefrLevel: level });
      await bootstrap();
      setMessage('Уровень сохранён');
    } catch (err) {
      setError(err.message || 'Не удалось сохранить уровень');
    }
  }

  return (
    <AppShell>
      <h1 className="page-title">Мой прогресс</h1>
      <p className="page-lead">Дневная цель, серия дней и результаты тестов</p>

      <GoalCard />

      <form className="filters" onSubmit={onSaveLevel} style={{ gridTemplateColumns: '1fr auto' }}>
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label={`Уровень ${languageGen(language)}`}>
          {CEFR.map((item) => (
            <option key={item} value={item}>
              {languageName(language)} — уровень {item}
            </option>
          ))}
        </select>
        <button className="btn btn--primary" type="submit">
          Сохранить уровень
        </button>
      </form>

      {message ? <p className="landing__status--ok">{message}</p> : null}
      {error ? <p className="auth-error">{error}</p> : null}
      {loading ? <p className="muted">Загрузка…</p> : null}

      {data ? (
        <>
          <div className="stat-grid">
            {[
              [
                'films',
                data.summary.mediaTracked,
                plural(data.summary.mediaTracked, ['фильм начат', 'фильма начато', 'фильмов начато']),
              ],
              [
                'materials',
                data.summary.wordsLearned ?? 0,
                plural(data.summary.wordsLearned ?? 0, ['слово выучено', 'слова выучено', 'слов выучено']),
              ],
              [
                'quizzes',
                data.summary.avgScorePct != null ? `${data.summary.avgScorePct}%` : '—',
                'средний балл в тестах',
              ],
            ].map(([icon, value, label]) => (
              <div key={icon} className="stat-card">
                <span className="stat-card__icon" aria-hidden="true">
                  <StatIcon name={icon} />
                </span>
                <span className="stat-card__value">{value}</span>
                <span className="stat-card__label">{label}</span>
              </div>
            ))}
          </div>

          <h2 className="progress-section-title">Мои фильмы в изучении</h2>
          {data.items.length === 0 ? (
            <p className="muted">
              Пока пусто. Пройдите тест по фильму или отметьте слово или правило как выученное — фильм появится здесь.
            </p>
          ) : (
            <ul className="progress-films">
              {data.items.map((item) => {
                const words = item.lexiconTotal
                  ? Math.round(((item.lexiconLearnedCount || 0) / item.lexiconTotal) * 100)
                  : 0;
                const quizPct =
                  item.bestScore != null && item.bestMaxScore
                    ? Math.round((item.bestScore / item.bestMaxScore) * 100)
                    : null;
                return (
                  <li key={item.mediaId}>
                    <Link className="progress-film" to={`/media/${item.mediaId}`}>
                      <span className="progress-film__poster">
                        {item.posterUrl ? (
                          <img src={item.posterUrl} alt="" loading="lazy" />
                        ) : (
                          <span>{item.mediaTitle.slice(0, 1)}</span>
                        )}
                      </span>
                      <span className="progress-film__body">
                        <span className="progress-film__title">
                          {item.language ? <Flag code={item.language} size="sm" /> : null}
                          <strong>{item.mediaTitle}</strong>
                          {item.recommendedLevel ? <span className="level-badge">{item.recommendedLevel}</span> : null}
                          {item.isPrivate ? <span className="progress-film__private">личный</span> : null}
                        </span>
                        <span className="progress-film__metric">
                          <span className="progress-film__metric-label">
                            Слова
                            <b>
                              {item.lexiconLearnedCount || 0} / {item.lexiconTotal ?? 0}
                            </b>
                          </span>
                          <span className="progress-film__bar">
                            <i style={{ width: `${words}%` }} />
                          </span>
                        </span>
                        <span className="progress-film__metric">
                          <span className="progress-film__metric-label">
                            Тест
                            <b>
                              {quizPct != null
                                ? `${item.bestScore} / ${item.bestMaxScore} · ${item.attemptsCount} ${plural(item.attemptsCount, ['попытка', 'попытки', 'попыток'])}`
                                : 'ещё не пройден'}
                            </b>
                          </span>
                          <span className="progress-film__bar progress-film__bar--quiz">
                            <i style={{ width: `${quizPct || 0}%` }} />
                          </span>
                        </span>
                      </span>
                      <span className="progress-film__go" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="18" height="18">
                          <path d="m9 6 6 6-6 6" />
                        </svg>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      ) : null}
    </AppShell>
  );
}
