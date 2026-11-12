import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleSignInButton } from '../components/GoogleSignInButton.jsx';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { useAuthStore } from '../store/authStore.js';
import '../styles/auth.css';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const login = useAuthStore((s) => s.login);
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(() => params.get('google_error') || '');
  const [pending, setPending] = useState(false);
  const redirectTo = location.state?.from || '/catalog';

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await login(form);
      navigate(redirectTo);
    } catch (err) {
      setError(err.message || 'Не удалось войти');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-card__brand">FilmPrep</p>
        <h1 className="auth-card__title">Вход</h1>
        <p className="auth-card__lead">С возвращением!</p>

        <GoogleSignInButton />

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Пароль</label>
            <PasswordInput
              id="password"
              required
              autoComplete="current-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>

          {error ? <p className="auth-error">{error}</p> : null}

          <button className="btn btn--primary" type="submit" disabled={pending}>
            {pending ? 'Входим…' : 'Войти'}
          </button>
        </form>

        <p className="auth-card__footer">
          Нет аккаунта? <Link to="/register">Регистрация</Link>
        </p>
      </div>
    </div>
  );
}
