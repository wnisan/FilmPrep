import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchProfile } from '../api/social.js';
import { AppShell } from '../components/AppShell.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { AchievementGrid, FeaturedBadges, RankTitle, XpBar, unlockedCount } from '../components/Badges.jsx';
import { LanguageTag } from '../components/Flag.jsx';
import { Stars } from '../components/StarRating.jsx';
import { memberSince, plural, timeAgo } from '../utils/format.js';
import { userLanguages } from '../utils/languages.js';
import '../styles/app.css';

function StatTile({ value, label }) {
  return (
    <div className="profile-stat">
      <span className="profile-stat__value">{value}</span>
      <span className="profile-stat__label">{label}</span>
    </div>
  );
}

export function ProfilePage() {
  const { username } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('achievements');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError('');
    setTab('achievements');
    fetchProfile(username)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Профиль не найден');
      });
    return () => {
      cancelled = true;
    };
  }, [username]);

  if (error) {
    return (
      <AppShell>
        <p className="auth-error">{error}</p>
        <Link className="btn btn--ghost" to="/community">
          К участникам
        </Link>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <p className="muted">Загрузка профиля…</p>
      </AppShell>
    );
  }

  const { user, rank, stats, achievements, featured, favorites, comments, isOwner } = data;
  const tabs = [
    { id: 'achievements', label: 'Достижения', count: achievements.filter((a) => a.unlocked).length },
    { id: 'favorites', label: 'Избранное', count: favorites.length },
    { id: 'comments', label: 'Комментарии', count: comments.length },
  ];

  return (
    <AppShell>
      <section className="profile-hero">
        <Avatar user={user} size={112} className="profile-hero__avatar" />
        <div className="profile-hero__info">
          <div className="profile-hero__name-row">
            <h1 className="profile-hero__name">{user.displayName}</h1>
            <FeaturedBadges items={featured} />
          </div>
          <div className="profile-hero__meta">
            <span className="muted">@{user.username}</span>
            <RankTitle title={rank.title} level={rank.level} />
            {user.role === 'admin' ? <span className="tag">администратор</span> : null}
          </div>
          <div className="profile-hero__langs" aria-label="Изучаемые языки">
            {userLanguages(user).map((l) => (
              <LanguageTag key={l.code} code={l.code} level={l.level} />
            ))}
          </div>
          <p className="profile-hero__rank-hint muted">{rank.hint}</p>
          {user.bio ? <p className="profile-hero__bio">{user.bio}</p> : null}
          <p className="muted profile-hero__since">На FilmPrep с {memberSince(user.createdAt)}</p>
        </div>
        {isOwner ? (
          <Link className="btn btn--ghost profile-hero__edit" to="/profile/edit">
            Редактировать профиль
          </Link>
        ) : null}
      </section>

      <XpBar rank={rank} />

      <div className="profile-stats">
        <StatTile value={stats.wordsLearned} label={plural(stats.wordsLearned, ['слово выучено', 'слова выучено', 'слов выучено'])} />
        <StatTile value={stats.quizzesPassed} label={plural(stats.quizzesPassed, ['тест сдан', 'теста сдано', 'тестов сдано'])} />
        <StatTile value={stats.perfectQuizzes} label="без ошибок" />
        <StatTile value={stats.bestAnswerStreak} label="лучшая серия ответов" />
        <StatTile
          value={stats.currentDayStreak}
          label={`${plural(stats.currentDayStreak, ['день', 'дня', 'дней'])} подряд · рекорд ${stats.bestDayStreak}`}
        />
      </div>

      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tabs__btn${tab === t.id ? ' tabs__btn--active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label} <span className="tabs__count">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === 'achievements' ? (
        <>
          <p className="muted profile-section-lead">{unlockedCount(achievements)}</p>
          <AchievementGrid items={achievements} />
        </>
      ) : null}

      {tab === 'favorites' ? (
        favorites.length === 0 ? (
          <p className="muted">Избранного пока нет.</p>
        ) : (
          <div className="fav-grid">
            {favorites.map((film) => (
              <Link key={film.id} className="fav-card" to={`/media/${film.slug || film.id}`}>
                <div className="fav-card__poster">
                  {film.posterUrl ? (
                    <img src={film.posterUrl} alt={film.title} loading="lazy" />
                  ) : (
                    <span className="media-card__poster-fallback">{film.title.slice(0, 1)}</span>
                  )}
                </div>
                <div className="fav-card__title">{film.title}</div>
                <div className="fav-card__meta muted">
                  {film.year || '—'}
                  {film.recommendedLevel ? ` · ${film.recommendedLevel}` : ''}
                </div>
                {film.myRating ? <Stars value={film.myRating} size={13} /> : null}
              </Link>
            ))}
          </div>
        )
      ) : null}

      {tab === 'comments' ? (
        comments.length === 0 ? (
          <p className="muted">Комментариев пока нет.</p>
        ) : (
          <ul className="profile-comments">
            {comments.map((c) => (
              <li key={c.id} className="profile-comment">
                <Link to={`/media/${c.mediaId}`} className="profile-comment__poster">
                  {c.posterUrl ? <img src={c.posterUrl} alt="" loading="lazy" /> : null}
                </Link>
                <div className="profile-comment__body">
                  <div className="profile-comment__head">
                    <Link to={`/media/${c.mediaId}`} className="profile-comment__film">
                      {c.mediaTitle}
                    </Link>
                    {c.authorRating ? <Stars value={c.authorRating} size={13} /> : null}
                    {c.isReply ? <span className="tag">ответ</span> : null}
                    <span className="muted profile-comment__time">{timeAgo(c.createdAt)}</span>
                  </div>
                  <p className="comment__body">{c.body}</p>
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </AppShell>
  );
}
