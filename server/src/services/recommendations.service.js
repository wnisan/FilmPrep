import { pool } from '../db/pool.js';
import { mediaRepository } from '../repositories/media.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { languageRu, normalizeLanguage } from '../utils/languages.js';
import { learningLanguagesOf } from '../utils/userView.js';

const CEFR = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

const toCard = (m) => ({
  id: m.id,
  title: m.title,
  year: m.year,
  posterUrl: m.posterUrl,
  description: m.description,
  recommendedLevel: m.recommendedLevel,
  genres: m.genres,
  language: m.language,
  countries: m.countries,
  runtimeMin: m.runtimeMin,
  ratingAvg: m.ratingAvg,
  ratingCount: m.ratingCount,
  hasVideo: m.hasVideo,
});

function levelDistance(a, b) {
  const i = CEFR.indexOf(a);
  const j = CEFR.indexOf(b);
  return i < 0 || j < 0 ? null : j - i;
}

async function allPublished() {
  const { items } = await mediaRepository.listPublished({ limit: 1000, sort: 'title' });
  return items;
}

async function userSignals(userId) {
  const { rows } = await pool.query(
    `SELECT u.cefr_level, u.learning_languages, u.active_language,
       COALESCE((SELECT json_agg(json_build_object('mediaId', media_id, 'stars', stars))
                 FROM media_ratings WHERE user_id = u.id), '[]') AS ratings,
       COALESCE((SELECT json_agg(media_id) FROM media_favorites WHERE user_id = u.id), '[]') AS favorites,
       COALESCE((SELECT json_agg(media_id) FROM learning_progress
                 WHERE user_id = u.id AND materials_opened_at IS NOT NULL), '[]') AS studied,
       COALESCE((SELECT json_agg(DISTINCT q.media_id) FROM quiz_attempts qa
                 JOIN quizzes q ON q.id = qa.quiz_id WHERE qa.user_id = u.id), '[]') AS quizzed
     FROM users u WHERE u.id = $1`,
    [userId],
  );
  return rows[0];
}

/**
 * Content-based scoring: CEFR level fit + genre taste (from ratings, favorites and
 * studied films) + community rating. Each pick comes with human-readable reasons.
 */
export const recommendationsService = {
  async forUser(userId, { limit = 6 } = {}) {
    const [films, signals] = await Promise.all([allPublished(), userSignals(userId)]);
    if (!signals) throw createHttpError(404, 'NOT_FOUND', 'Пользователь не найден');

    const byId = new Map(films.map((f) => [f.id, f]));
    const ratings = new Map(signals.ratings.map((r) => [r.mediaId, r.stars]));
    const favorites = new Set(signals.favorites);
    const studied = new Set(signals.studied);
    const quizzed = new Set(signals.quizzed);

    // Genre taste: liked films push their genres up, disliked ones down
    const taste = new Map();
    const liked = [];
    const bump = (film, weight) => {
      if (!film) return;
      film.genres.forEach((g) => taste.set(g, (taste.get(g) || 0) + weight));
    };
    ratings.forEach((stars, id) => {
      bump(byId.get(id), stars - 3);
      if (stars >= 4 && byId.get(id)) liked.push(byId.get(id));
    });
    favorites.forEach((id) => {
      bump(byId.get(id), 1.5);
      if (byId.get(id) && !liked.includes(byId.get(id))) liked.push(byId.get(id));
    });
    studied.forEach((id) => bump(byId.get(id), 0.5));

    const { learningLanguages, activeLanguage } = learningLanguagesOf(signals);
    const levelFor = new Map(learningLanguages.map((l) => [l.code, l.level]));

    // Films in the languages the learner studies; others only if there is nothing else
    const seen = (id) => ratings.has(id) || quizzed.has(id);
    const studiedLanguage = (f) => levelFor.has(normalizeLanguage(f.language));
    let candidates = films.filter((f) => !seen(f.id) && studiedLanguage(f));
    if (candidates.length < limit) candidates = films.filter((f) => !ratings.has(f.id) && studiedLanguage(f));
    if (!candidates.length) candidates = films.filter((f) => !ratings.has(f.id));

    const scored = candidates.map((film) => {
      const reasons = [];
      let score = 0;
      const language = normalizeLanguage(film.language);

      if (language === activeLanguage) score += 3;
      else if (levelFor.has(language)) {
        score += 1;
        if (learningLanguages.length > 1) reasons.push(`На ${languageRu(language, 'prep')}`);
      } else score -= 4;

      const dist = levelDistance(levelFor.get(language) ?? null, film.recommendedLevel);
      if (dist === 0) {
        score += 3;
        reasons.push(`Ваш уровень ${film.recommendedLevel}`);
      } else if (dist === 1) {
        score += 2;
        reasons.push(`Чуть выше вашего уровня — ${film.recommendedLevel}`);
      } else if (dist === -1) {
        score += 1.5;
        reasons.push(`Лёгкий для вас — ${film.recommendedLevel}`);
      } else if (dist != null && Math.abs(dist) >= 3) {
        score -= 1.5;
      }

      const genreScore = film.genres.reduce((sum, g) => sum + (taste.get(g) || 0), 0);
      score += Math.max(-3, Math.min(4, genreScore * 0.8));
      const twin = liked
        .filter((l) => l.id !== film.id)
        .map((l) => ({ film: l, shared: l.genres.filter((g) => film.genres.includes(g)).length }))
        .sort((a, b) => b.shared - a.shared)[0];
      if (twin?.shared) reasons.push(`Похож на «${twin.film.title}»`);

      if (film.ratingAvg != null) {
        const confidence = Math.min(1, film.ratingCount / 3);
        score += (film.ratingAvg - 3) * 0.9 * confidence;
        if (film.ratingAvg >= 4 && film.ratingCount >= 2) reasons.push(`Высокий рейтинг ★ ${film.ratingAvg.toFixed(1)}`);
      }
      if (film.hasVideo) {
        score += 0.6;
        if (reasons.length < 2) reasons.push('Можно смотреть на сайте');
      }
      if (studied.has(film.id)) {
        score += 0.4;
        reasons.unshift('Вы уже начали изучать');
      }

      return { ...toCard(film), score: Math.round(score * 100) / 100, reasons: reasons.slice(0, 2) };
    });

    scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
    return {
      items: scored.slice(0, limit),
      level: levelFor.get(activeLanguage) ?? signals.cefr_level,
      language: activeLanguage,
    };
  },

  /** Films close to the given one: shared genres/themes, same country, similar level. */
  async similar(mediaId, { limit = 4 } = {}) {
    const films = await allPublished();
    const base = films.find((f) => f.id === mediaId);
    if (!base) throw createHttpError(404, 'NOT_FOUND', 'Фильм не найден');

    const overlap = (a, b) => {
      const union = new Set([...a, ...b]);
      return union.size ? a.filter((x) => b.includes(x)).length / union.size : 0;
    };

    const items = films
      .filter((f) => f.id !== mediaId)
      .map((film) => {
        const dist = levelDistance(base.recommendedLevel, film.recommendedLevel);
        const score =
          (film.language === base.language ? 2.5 : 0) +
          overlap(base.genres, film.genres) * 4 +
          overlap(base.themes, film.themes) * 2 +
          (film.countries.some((c) => base.countries.includes(c)) ? 0.7 : 0) +
          (dist == null ? 0 : Math.max(0, 1.5 - Math.abs(dist) * 0.75)) +
          ((film.ratingAvg || 3) - 3) * 0.3;
        return { ...toCard(film), score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return { items };
  },
};
