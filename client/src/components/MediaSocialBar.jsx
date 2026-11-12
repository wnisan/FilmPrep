import { useEffect, useState } from 'react';
import { fetchMediaSocial, rateMedia, setFavorite, unrateMedia } from '../api/social.js';
import { plural } from '../utils/format.js';
import { StarInput, Stars } from './StarRating.jsx';

export function MediaSocialBar({ mediaId }) {
  const [rating, setRating] = useState(null);
  const [favorite, setFavoriteState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchMediaSocial(mediaId)
      .then((data) => {
        if (cancelled) return;
        setRating(data.rating);
        setFavoriteState(data.favorite);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  async function onRate(stars) {
    setBusy(true);
    setError('');
    try {
      const data = stars ? await rateMedia(mediaId, stars) : await unrateMedia(mediaId);
      setRating(data.rating);
    } catch (err) {
      setError(err.message || 'Не удалось сохранить оценку');
    } finally {
      setBusy(false);
    }
  }

  async function onToggleFavorite() {
    const next = !favorite.mine;
    setFavoriteState((f) => ({ mine: next, count: f.count + (next ? 1 : -1) }));
    try {
      const data = await setFavorite(mediaId, next);
      setFavoriteState(data.favorite);
    } catch (err) {
      setFavoriteState((f) => ({ mine: !next, count: f.count + (next ? -1 : 1) }));
      setError(err.message || 'Не удалось обновить избранное');
    }
  }

  if (!rating || !favorite) return null;

  return (
    <div className="social-bar">
      <div className="social-bar__score">
        <span className="social-bar__avg">{rating.average != null ? rating.average.toFixed(1) : '—'}</span>
        <div>
          <Stars value={rating.average || 0} size={18} />
          <div className="muted social-bar__count">
            {rating.count
              ? `${rating.count} ${plural(rating.count, ['оценка', 'оценки', 'оценок'])}`
              : 'оценок пока нет'}
          </div>
        </div>
      </div>

      <div className="social-bar__mine">
        <StarInput value={rating.mine} onChange={onRate} disabled={busy} size={26} />
      </div>

      <button
        type="button"
        className={`btn fav-btn${favorite.mine ? ' fav-btn--on' : ''}`}
        onClick={onToggleFavorite}
        aria-pressed={favorite.mine}
      >
        <span className="fav-btn__icon">{favorite.mine ? '♥' : '♡'}</span>
        {favorite.mine ? 'В избранном' : 'В избранное'}
        {favorite.count ? <span className="fav-btn__count">{favorite.count}</span> : null}
      </button>

      {error ? <p className="auth-error social-bar__error">{error}</p> : null}
    </div>
  );
}
