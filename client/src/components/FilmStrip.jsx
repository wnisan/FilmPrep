import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchRecommendations, fetchSimilar } from '../api/learning.js';
import { useAuthStore } from '../store/authStore.js';
import { genreLabel } from '../utils/labels.js';
import { Flag } from './Flag.jsx';

const GAP = 16;
const MIN_CARD = 300;
const DURATION = 450;

function StripCard({ film }) {
  return (
    <Link className="strip-card" to={`/media/${film.slug || film.id}`} draggable={false}>
      <div className="strip-card__poster">
        {film.posterUrl ? (
          <img src={film.posterUrl} alt={film.title} loading="lazy" draggable={false} />
        ) : (
          <span className="media-card__poster-fallback">{film.title.slice(0, 1)}</span>
        )}
        {film.recommendedLevel ? <span className="strip-card__level">{film.recommendedLevel}</span> : null}
        {film.language ? (
          <span className="strip-card__lang">
            <Flag code={film.language} size="sm" />
          </span>
        ) : null}
      </div>
      <div className="strip-card__body">
        <h3 className="strip-card__title">{film.title}</h3>
        <p className="strip-card__meta">
          {[film.year, film.genres?.[0] ? genreLabel(film.genres[0]) : null].filter(Boolean).join(' · ')}
          {film.ratingAvg != null ? <span className="media-card__rating">★ {film.ratingAvg.toFixed(1)}</span> : null}
        </p>
        {film.reasons?.length ? (
          <ul className="strip-card__reasons">
            {film.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : film.description ? (
          <p className="strip-card__desc">{film.description}</p>
        ) : null}
      </div>
    </Link>
  );
}

function Arrow({ dir, onClick }) {
  return (
    <button
      type="button"
      className={`carousel__arrow carousel__arrow--${dir}`}
      onClick={onClick}
      aria-label={dir === 'prev' ? 'Назад' : 'Вперёд'}
    >
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path d={dir === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  );
}

/**
 * Infinite carousel: clones of the edge cards sit on both sides of the track,
 * so after the last card it slides on to the first one and then silently
 * jumps back to the real slide.
 */
function Carousel({ items }) {
  const viewportRef = useRef(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [animate, setAnimate] = useState(false);
  const lockRef = useRef(false);
  const touchRef = useRef(null);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const perView = Math.max(1, Math.floor((width + GAP) / (MIN_CARD + GAP)));
  const cardWidth = width ? (width - GAP * (perView - 1)) / perView : MIN_CARD;
  const looping = items.length > perView;
  const clones = looping ? perView : 0;
  const slides = looping ? [...items.slice(-clones), ...items, ...items.slice(0, clones)] : items;

  useEffect(() => {
    setAnimate(false);
    setIndex(clones);
  }, [clones, items]);

  const go = useCallback(
    (delta) => {
      if (!looping || lockRef.current) return;
      lockRef.current = true;
      setAnimate(true);
      setIndex((i) => i + delta);
    },
    [looping],
  );

  function onTransitionEnd(event) {
    if (event.target !== event.currentTarget) return;
    lockRef.current = false;
    if (index >= items.length + clones) {
      setAnimate(false);
      setIndex(index - items.length);
    } else if (index < clones) {
      setAnimate(false);
      setIndex(index + items.length);
    }
  }

  // Safety net: if transitionend never fires (tab hidden), unlock anyway
  useEffect(() => {
    if (!animate) return undefined;
    const timer = setTimeout(() => {
      lockRef.current = false;
    }, DURATION + 100);
    return () => clearTimeout(timer);
  }, [animate, index]);

  const offset = index * (cardWidth + GAP);

  return (
    <div
      className={`carousel${looping ? ' carousel--loop' : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
      }}
    >
      {looping ? <Arrow dir="prev" onClick={() => go(-1)} /> : null}
      <div
        className="carousel__viewport"
        ref={viewportRef}
        onTouchStart={(e) => {
          touchRef.current = e.touches[0].clientX;
        }}
        onTouchEnd={(e) => {
          if (touchRef.current == null) return;
          const dx = e.changedTouches[0].clientX - touchRef.current;
          touchRef.current = null;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
        }}
      >
        <div
          className="carousel__track"
          style={{
            gap: `${GAP}px`,
            transform: `translate3d(${-offset}px, 0, 0)`,
            transition: animate ? `transform ${DURATION}ms cubic-bezier(0.22, 0.61, 0.36, 1)` : 'none',
          }}
          onTransitionEnd={onTransitionEnd}
        >
          {slides.map((film, i) => (
            <div
              className="carousel__slide"
              key={`${film.id}-${i}`}
              style={{ width: `${cardWidth}px` }}
              aria-hidden={looping && (i < clones || i >= clones + items.length) ? 'true' : undefined}
            >
              <StripCard film={film} />
            </div>
          ))}
        </div>
      </div>
      {looping ? <Arrow dir="next" onClick={() => go(1)} /> : null}
    </div>
  );
}

function Strip({ title, lead, items }) {
  if (!items.length) return null;
  return (
    <section className="strip">
      <div className="strip__head">
        <h2 className="strip__title">{title}</h2>
        {lead ? <p className="muted strip__lead">{lead}</p> : null}
      </div>
      <Carousel items={items} />
    </section>
  );
}

/** "Вам подойдёт": personal picks by level, taste and ratings. */
export function RecommendedStrip() {
  const [items, setItems] = useState([]);
  // Re-pick when the learner switches the studied language or its level
  const languageKey = useAuthStore((s) => `${s.user?.activeLanguage}:${s.user?.cefrLevel}`);

  useEffect(() => {
    fetchRecommendations({ limit: 10 })
      .then((data) => setItems(data.items || []))
      .catch(() => setItems([]));
  }, [languageKey]);

  return <Strip title="Вам подойдёт" lead="Подобрано по вашим предпочтениям" items={items} />;
}

export function SimilarStrip({ mediaId }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    setItems([]);
    fetchSimilar(mediaId)
      .then((data) => setItems(data.items || []))
      .catch(() => setItems([]));
  }, [mediaId]);

  return <Strip title="Похожие фильмы" items={items} />;
}
