import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchLeaderboard } from '../api/social.js';
import { AppShell } from '../components/AppShell.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { RankTitle } from '../components/Badges.jsx';
import { Flag } from '../components/Flag.jsx';
import { languageName, userLanguages } from '../utils/languages.js';
import { useAuthStore } from '../store/authStore.js';
import '../styles/app.css';

const RANK_LADDER = [
  ['Новичок', 0],
  ['Зритель', 50],
  ['Киноман', 150],
  ['Знаток', 350],
  ['Эксперт', 700],
  ['Полиглот', 1200],
  ['Магистр субтитров', 2000],
  ['Легенда кино', 3500],
];

export function CommunityPage() {
  const me = useAuthStore((s) => s.user);
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchLeaderboard()
      .then((data) => setItems(data.items))
      .catch((err) => setError(err.message || 'Не удалось загрузить рейтинг'));
  }, []);

  return (
    <AppShell>
      <h1 className="page-title">Сообщество</h1>
      <p className="page-lead">Рейтинг пользователей</p>

      <div className="community">
        <section>
          {error ? <p className="auth-error">{error}</p> : null}
          {!items && !error ? <p className="muted">Загрузка…</p> : null}
          {items && items.length === 0 ? (
            <p className="muted">Пока никто не набрал опыта — выучите пару слов и станьте первым.</p>
          ) : null}
          <ol className="leaderboard">
            {(items || []).map((row) => (
              <li key={row.user.id} className={`leaderboard__row${row.user.id === me?.id ? ' leaderboard__row--me' : ''}`}>
                <span className={`leaderboard__place leaderboard__place--${row.place <= 3 ? row.place : 'n'}`}>{row.place}</span>
                <Link to={`/profile/${row.user.username}`} className="leaderboard__user">
                  <Avatar user={row.user} size={40} />
                  <span>
                    <span className="leaderboard__name">{row.user.displayName}</span>
                    <span className="leaderboard__sub">
                      <RankTitle title={row.rank.title} level={row.rank.level} compact />
                      <span className="muted">@{row.user.username}</span>
                      <span className="leaderboard__flags">
                        {userLanguages(row.user).map((l) => (
                          <Flag key={l.code} code={l.code} size="sm" title={`${languageName(l.code)}${l.level ? ` ${l.level}` : ''}`} />
                        ))}
                      </span>
                    </span>
                  </span>
                </Link>
                <span className="leaderboard__facts muted">
                  {row.wordsLearned} сл. · {row.quizzesPassed} тест.
                </span>
                <span className="leaderboard__xp">
                  {row.rank.xp} <small>XP</small>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <aside className="settings-card community__ranks">
          <h2 className="settings-card__title">Звания</h2>
          <ul className="rank-ladder">
            {RANK_LADDER.map(([title, xp], i) => (
              <li key={title}>
                <RankTitle title={title} level={i + 1} compact />
                <span className="muted">{xp} XP</span>
              </li>
            ))}
          </ul>
          <h3 className="community__subtitle">Как получить опыт</h3>
          <ul className="xp-rules muted">
            <li>+5 XP — выученное слово</li>
            <li>+10 XP — верный ответ в лучшей попытке теста</li>
            <li>+25 XP — тест без ошибок</li>
            <li>+3 XP — комментарий</li>
            <li>+2 XP — оценка фильма</li>
          </ul>
        </aside>
      </div>
    </AppShell>
  );
}
