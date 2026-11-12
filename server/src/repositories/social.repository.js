import { pool } from '../db/pool.js';

const ACTIVITY_TZ = 'Europe/Minsk';

function mapAuthor(row) {
  return {
    id: row.user_id,
    username: row.username,
    displayName: row.display_name,
    avatarPath: row.avatar_path,
    role: row.role,
  };
}

function mapComment(row) {
  const deleted = Boolean(row.deleted_at);
  return {
    id: row.id,
    mediaId: row.media_id,
    parentId: row.parent_id,
    body: deleted ? '' : row.body,
    deleted,
    edited: !deleted && row.updated_at - row.created_at > 1000,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    author: deleted ? null : mapAuthor(row),
    authorRating: deleted || row.author_rating == null ? null : Number(row.author_rating),
  };
}

function mapStats(row) {
  return {
    userId: row.user_id,
    wordsLearned: row.words_learned,
    quizzesTaken: row.quizzes_taken,
    quizzesPassed: row.quizzes_passed,
    perfectQuizzes: row.perfect_quizzes,
    bestPoints: row.best_points,
    attempts: row.attempts,
    filmsStudied: row.films_studied,
    comments: row.comments,
    ratings: row.ratings,
    favorites: row.favorites,
  };
}

/**
 * Aggregated counters for XP / achievements.
 * userIds = null → every user (leaderboard).
 */
const STATS_SQL = `
  WITH target AS (
    SELECT id FROM users WHERE $1::uuid[] IS NULL OR id = ANY($1)
  ),
  best AS (
    SELECT DISTINCT ON (qa.user_id, qa.quiz_id) qa.user_id, qa.score, qa.max_score
    FROM quiz_attempts qa
    JOIN target t ON t.id = qa.user_id
    ORDER BY qa.user_id, qa.quiz_id, (qa.score / NULLIF(qa.max_score, 0)) DESC
  ),
  quiz AS (
    SELECT user_id,
           COUNT(*)::int AS taken,
           COUNT(*) FILTER (WHERE score / max_score >= 0.6)::int AS passed,
           COUNT(*) FILTER (WHERE score >= max_score)::int AS perfect,
           COALESCE(SUM(score), 0)::int AS points
    FROM best GROUP BY user_id
  )
  SELECT
    t.id AS user_id,
    (SELECT COUNT(*)::int FROM lexicon_learned ll WHERE ll.user_id = t.id) AS words_learned,
    COALESCE(q.taken, 0) AS quizzes_taken,
    COALESCE(q.passed, 0) AS quizzes_passed,
    COALESCE(q.perfect, 0) AS perfect_quizzes,
    COALESCE(q.points, 0) AS best_points,
    (SELECT COUNT(*)::int FROM quiz_attempts qa WHERE qa.user_id = t.id) AS attempts,
    (SELECT COUNT(*)::int FROM learning_progress lp
      WHERE lp.user_id = t.id AND lp.materials_opened_at IS NOT NULL) AS films_studied,
    (SELECT COUNT(*)::int FROM media_comments c
      WHERE c.user_id = t.id AND c.deleted_at IS NULL) AS comments,
    (SELECT COUNT(*)::int FROM media_ratings r WHERE r.user_id = t.id) AS ratings,
    (SELECT COUNT(*)::int FROM media_favorites f WHERE f.user_id = t.id) AS favorites
  FROM target t
  LEFT JOIN quiz q ON q.user_id = t.id
`;

const COMMENT_SELECT = `
  c.id, c.media_id, c.parent_id, c.body, c.created_at, c.updated_at, c.deleted_at,
  c.user_id, u.username, u.display_name, u.avatar_path, u.role,
  r.stars AS author_rating
`;

export const socialRepository = {
  async statsForUsers(userIds) {
    const { rows } = await pool.query(STATS_SQL, [userIds]);
    return rows.map(mapStats);
  },

  /** Per-question correctness in chronological order (for the "correct answers in a row" badge). */
  async answerHistory(userId) {
    const { rows } = await pool.query(
      `SELECT answers_json -> 'details' AS details
       FROM quiz_attempts WHERE user_id = $1
       ORDER BY created_at ASC`,
      [userId],
    );
    return rows.flatMap((r) => (Array.isArray(r.details) ? r.details.map((d) => Boolean(d.correct)) : []));
  },

  /** Distinct local dates with any learning or community activity (for day streaks). */
  async activityDays(userId) {
    const { rows } = await pool.query(
      `SELECT DISTINCT d::text AS day FROM (
         SELECT (created_at AT TIME ZONE '${ACTIVITY_TZ}')::date AS d FROM quiz_attempts WHERE user_id = $1
         UNION SELECT (created_at AT TIME ZONE '${ACTIVITY_TZ}')::date FROM lexicon_learned WHERE user_id = $1
         UNION SELECT (created_at AT TIME ZONE '${ACTIVITY_TZ}')::date FROM media_comments WHERE user_id = $1
         UNION SELECT (updated_at AT TIME ZONE '${ACTIVITY_TZ}')::date FROM media_ratings WHERE user_id = $1
         UNION SELECT (last_activity_at AT TIME ZONE '${ACTIVITY_TZ}')::date FROM learning_progress WHERE user_id = $1
       ) days
       ORDER BY day`,
      [userId],
    );
    return rows.map((r) => r.day);
  },

  async todayLocal() {
    const { rows } = await pool.query(`SELECT (NOW() AT TIME ZONE '${ACTIVITY_TZ}')::date::text AS day`);
    return rows[0].day;
  },

  // ---- ratings -------------------------------------------------------------

  async ratingSummary(mediaId, userId) {
    const { rows } = await pool.query(
      `SELECT
         ROUND(AVG(stars)::numeric, 1) AS average,
         COUNT(*)::int AS count,
         MAX(stars) FILTER (WHERE user_id = $2) AS mine,
         COUNT(*) FILTER (WHERE stars = 5)::int AS s5,
         COUNT(*) FILTER (WHERE stars = 4)::int AS s4,
         COUNT(*) FILTER (WHERE stars = 3)::int AS s3,
         COUNT(*) FILTER (WHERE stars = 2)::int AS s2,
         COUNT(*) FILTER (WHERE stars = 1)::int AS s1
       FROM media_ratings WHERE media_id = $1`,
      [mediaId, userId],
    );
    const row = rows[0];
    return {
      average: row.average != null ? Number(row.average) : null,
      count: row.count,
      mine: row.mine != null ? Number(row.mine) : null,
      distribution: { 5: row.s5, 4: row.s4, 3: row.s3, 2: row.s2, 1: row.s1 },
    };
  },

  async setRating(userId, mediaId, stars) {
    await pool.query(
      `INSERT INTO media_ratings (user_id, media_id, stars) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, media_id) DO UPDATE SET stars = $3, updated_at = NOW()`,
      [userId, mediaId, stars],
    );
  },

  async removeRating(userId, mediaId) {
    await pool.query(`DELETE FROM media_ratings WHERE user_id = $1 AND media_id = $2`, [userId, mediaId]);
  },

  // ---- favorites -----------------------------------------------------------

  async favoriteSummary(mediaId, userId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS count, BOOL_OR(user_id = $2) AS mine
       FROM media_favorites WHERE media_id = $1`,
      [mediaId, userId],
    );
    return { count: rows[0].count, mine: Boolean(rows[0].mine) };
  },

  async setFavorite(userId, mediaId, on) {
    if (on) {
      await pool.query(
        `INSERT INTO media_favorites (user_id, media_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, mediaId],
      );
    } else {
      await pool.query(`DELETE FROM media_favorites WHERE user_id = $1 AND media_id = $2`, [userId, mediaId]);
    }
  },

  async listFavorites(userId) {
    const { rows } = await pool.query(
      `SELECT m.id, m.title, m.year, m.poster_url, m.recommended_level, f.created_at,
              r.stars AS my_rating
       FROM media_favorites f
       JOIN media_items m ON m.id = f.media_id AND m.status = 'published'
       LEFT JOIN media_ratings r ON r.user_id = f.user_id AND r.media_id = m.id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [userId],
    );
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      year: r.year,
      posterUrl: r.poster_url,
      recommendedLevel: r.recommended_level,
      addedAt: r.created_at,
      myRating: r.my_rating != null ? Number(r.my_rating) : null,
    }));
  },

  // ---- comments ------------------------------------------------------------

  async listComments(mediaId) {
    const { rows } = await pool.query(
      `SELECT ${COMMENT_SELECT}
       FROM media_comments c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN media_ratings r ON r.user_id = c.user_id AND r.media_id = c.media_id
       WHERE c.media_id = $1
       ORDER BY c.created_at ASC`,
      [mediaId],
    );
    return rows.map(mapComment);
  },

  async findComment(id) {
    const { rows } = await pool.query(
      `SELECT ${COMMENT_SELECT}
       FROM media_comments c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN media_ratings r ON r.user_id = c.user_id AND r.media_id = c.media_id
       WHERE c.id = $1`,
      [id],
    );
    return rows[0] ? { ...mapComment(rows[0]), userId: rows[0].user_id } : null;
  },

  async createComment({ mediaId, userId, parentId, body }) {
    const { rows } = await pool.query(
      `INSERT INTO media_comments (media_id, user_id, parent_id, body)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [mediaId, userId, parentId ?? null, body],
    );
    return this.findComment(rows[0].id);
  },

  async updateComment(id, body) {
    await pool.query(`UPDATE media_comments SET body = $2, updated_at = NOW() WHERE id = $1`, [id, body]);
    return this.findComment(id);
  },

  /** Hard delete if nobody replied, otherwise keep a "deleted" placeholder. */
  async deleteComment(id) {
    const { rows } = await pool.query(`SELECT 1 FROM media_comments WHERE parent_id = $1 LIMIT 1`, [id]);
    if (rows.length) {
      await pool.query(`UPDATE media_comments SET deleted_at = NOW(), body = '—' WHERE id = $1`, [id]);
    } else {
      await pool.query(`DELETE FROM media_comments WHERE id = $1`, [id]);
    }
  },

  async listUserComments(userId, limit = 30) {
    const { rows } = await pool.query(
      `SELECT c.id, c.media_id, c.parent_id, c.body, c.created_at,
              m.title AS media_title, m.poster_url,
              r.stars AS author_rating
       FROM media_comments c
       JOIN media_items m ON m.id = c.media_id AND m.status = 'published'
       LEFT JOIN media_ratings r ON r.user_id = c.user_id AND r.media_id = c.media_id
       WHERE c.user_id = $1 AND c.deleted_at IS NULL
       ORDER BY c.created_at DESC
       LIMIT $2`,
      [userId, limit],
    );
    return rows.map((r) => ({
      id: r.id,
      mediaId: r.media_id,
      mediaTitle: r.media_title,
      posterUrl: r.poster_url,
      isReply: Boolean(r.parent_id),
      body: r.body,
      createdAt: r.created_at,
      authorRating: r.author_rating != null ? Number(r.author_rating) : null,
    }));
  },

  async listUsers(userIds) {
    const { rows } = await pool.query(
      `SELECT id, username, display_name, avatar_path, role, cefr_level, learning_languages,
              active_language, created_at
       FROM users WHERE $1::uuid[] IS NULL OR id = ANY($1)`,
      [userIds],
    );
    return rows;
  },
};
