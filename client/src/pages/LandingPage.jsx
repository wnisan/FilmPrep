import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore.js';
import '../styles/landing.css';

export function LandingPage() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const logout = useAuthStore((s) => s.logout);
  const isAuthed = status === 'authenticated' && user;
  // The saved session is checked on load: show nothing instead of flashing the wrong button
  const checking = status === 'idle' || status === 'loading';

  return (
    <div className="landing">
      <header className="landing__nav">
        <div className="landing__brand">
          <img src="/favicon.svg" alt="" className="landing__logo" />
          FilmPrep
        </div>
        <div className="landing__nav-actions">
          {checking ? null : isAuthed ? (
            <>
              <span className="landing__who">Вы вошли как {user.displayName || user.email}</span>
              <button className="btn btn--ghost" type="button" onClick={() => logout()}>
                Выйти
              </button>
            </>
          ) : (
            <Link className="btn btn--ghost" to="/login">
              Войти
            </Link>
          )}
        </div>
      </header>

      <main className="landing__hero">
        <p className="landing__eyebrow">Иностранные языки через кино</p>
        <h1 className="landing__title">Смотри фильмы в оригинале без языкового барьера</h1>
        <p className="landing__lead">
          Изучение грамматики, новых слов и фраз вместе с просмотром любимого кино
        </p>
        <div className="landing__cta">
          {isAuthed ? (
            <Link className="btn btn--primary" to="/catalog">
              Открыть каталог
            </Link>
          ) : (
            <Link className="btn btn--primary" to="/register">
              Начать бесплатно
            </Link>
          )}
        </div>
      </main>
    </div>
  );
}
