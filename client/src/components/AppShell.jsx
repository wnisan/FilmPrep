import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import { useGoalStore } from '../store/goalStore.js';
import { Avatar } from './Avatar.jsx';
import { GoalReminder, ProgressNav } from './DailyGoal.jsx';
import { LanguageSwitcher } from './LanguageSwitcher.jsx';
import '../styles/app.css';
import '../styles/social.css';
import '../styles/learning.css';

const navClass = ({ isActive }) => `btn btn--ghost${isActive ? ' btn--nav-active' : ''}`;

export function AppShell({ children }) {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const resetGoal = useGoalStore((s) => s.reset);
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    resetGoal();
    navigate('/');
  }

  return (
    <div className="shell">
      <header className="shell__nav">
        <Link className="shell__brand" to="/catalog">
          <img src="/favicon.svg" alt="" className="shell__logo" />
          FilmPrep
        </Link>
        <div className="shell__nav-right">
          <NavLink className={navClass} to="/catalog">
            Каталог
          </NavLink>
          <NavLink className={navClass} to="/my-films">
            Мои фильмы
          </NavLink>
          <NavLink className={navClass} to="/dictionary">
            Словарь
          </NavLink>
          <NavLink className={navClass} to="/community">
            Сообщество
          </NavLink>
          {user?.role === 'admin' ? (
            <NavLink className={navClass} to="/admin/media">
              Админка
            </NavLink>
          ) : null}
          {user ? <LanguageSwitcher /> : null}
          {user ? <ProgressNav /> : null}
          {user ? (
            <Link className="shell__me" to={`/profile/${user.username}`} title="Мой профиль">
              <Avatar user={user} size={32} />
              <span className="shell__user">{user.displayName || user.username}</span>
            </Link>
          ) : null}
          <button className="btn btn--ghost" type="button" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </header>
      <main className="shell__main">{children}</main>
      {user ? <GoalReminder /> : null}
    </div>
  );
}
