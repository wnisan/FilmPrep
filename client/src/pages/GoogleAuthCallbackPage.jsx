import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setAccessToken } from '../api/client.js';
import { fetchMe } from '../api/auth.js';
import { useAuthStore } from '../store/authStore.js';
import '../styles/auth.css';

export function GoogleAuthCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const token = params.get('access_token');
      if (!token) {
        setError('Нет access token от Google');
        return;
      }
      try {
        setAccessToken(token);
        const user = await fetchMe();
        if (cancelled) return;
        useAuthStore.setState({ user, status: 'authenticated', error: null });
        navigate('/catalog', { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Не удалось завершить вход через Google');
        }
      }
    }

    finish();
    return () => {
      cancelled = true;
    };
  }, [navigate, params]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <p className="auth-card__brand">FilmPrep</p>
        <h1 className="auth-card__title">Вход через Google</h1>
        {error ? (
          <p className="auth-error">{error}</p>
        ) : (
          <p className="auth-card__lead">Завершаем вход…</p>
        )}
      </div>
    </div>
  );
}
