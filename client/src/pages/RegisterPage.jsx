import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Dropdown } from '../components/Dropdown.jsx';
import { Flag } from '../components/Flag.jsx';
import { GoogleSignInButton } from '../components/GoogleSignInButton.jsx';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { useAuthStore } from '../store/authStore.js';
import { LANGUAGES, languageGen } from '../utils/languages.js';
import '../styles/auth.css';

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const LANGUAGE_OPTIONS = LANGUAGES.map((l) => ({
  value: l.code,
  label: `${l.name} (${l.native})`,
  icon: <Flag code={l.code} size="sm" />,
}));
const CEFR_OPTIONS = CEFR.map((level) => ({ value: level, label: level }));

export function RegisterPage() {
  const navigate = useNavigate();
  const register = useAuthStore((s) => s.register);
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    cefrLevel: 'B1',
    language: 'en',
  });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function onSubmit(event) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await register({
        email: form.email,
        password: form.password,
        displayName: form.displayName || undefined,
        cefrLevel: form.cefrLevel || undefined,
        language: form.language,
      });
      navigate('/catalog');
    } catch (err) {
      setError(err.message || 'Не удалось зарегистрироваться');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-card__brand">FilmPrep</p>
        <h1 className="auth-card__title">Регистрация</h1>
        <p className="auth-card__lead">Создайте аккаунт и выберите уровень языка</p>

        <GoogleSignInButton label="Продолжить с Google" />

        <form className="auth-form" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="displayName">Имя</label>
            <input
              id="displayName"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              placeholder="Как к вам обращаться"
            />
          </div>
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
            <label htmlFor="password">Пароль (мин. 8 символов)</label>
            <PasswordInput
              id="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Какой язык учите</label>
            <Dropdown
              label="Какой язык учите"
              value={form.language}
              options={LANGUAGE_OPTIONS}
              onChange={(language) => setForm((f) => ({ ...f, language }))}
            />
          </div>
          <div className="field">
            <label>Уровень {languageGen(form.language)}</label>
            <Dropdown
              label={`Уровень ${languageGen(form.language)}`}
              value={form.cefrLevel}
              options={CEFR_OPTIONS}
              onChange={(cefrLevel) => setForm((f) => ({ ...f, cefrLevel }))}
            />
          </div>

          {error ? <p className="auth-error">{error}</p> : null}

          <button className="btn btn--primary" type="submit" disabled={pending}>
            {pending ? 'Создаём…' : 'Зарегистрироваться'}
          </button>
        </form>

        <p className="auth-card__footer">
          Уже есть аккаунт? <Link to="/login">Войти</Link>
        </p>
      </div>
    </div>
  );
}
