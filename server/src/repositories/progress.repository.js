import { pool } from '../db/pool.js';

function mapProgress(row) {
  return {
    userId: row.user_id,
    mediaId: row.media_id,
    mediaTitle: row.media_title,
    recommendedLevel: row.recommended_level,
    posterUrl: row.poster_url || null,
    language: row.language || null,
    isPrivate: row.media_status === 'private',
    lexiconLearnedCount: row.lexicon_learned_count,
    materialsOpenedAt: row.materials_opened_at,
    lastActivityAt: row.last_activity_at,
    lexiconTotal: row.lexicon_total != null ? Number(row.lexicon_total) : undefined,
    bestScore: row.best_score != null ? Number(row.best_score) : null,
    bestMaxScore: row.best_max_score != null ? Number(row.best_max_score) : null,
    attemptsCount: row.attempts_count != null ? Number(row.attempts_count) : 0,
  };
}

export const progressRepository = {
  async touchMaterials(userId, mediaId) {
    await pool.query(
      `INSERT INTO learning_progress (user_id, media_id, materials_opened_at, last_activity_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id, media_id) DO UPDATE SET
         materials_opened_at = COALESCE(learning_progress.materials_opened_at, NOW()),
         last_activity_at = NOW()`,
      [userId, mediaId],
    );
  },

  async touchActivity(userId, mediaId) {
    await pool.query(
      `INSERT INTO learning_progress (user_id, media_id, last_activity_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (user_id, media_id) DO UPDATE SET last_activity_at = NOW()`,
      [userId, mediaId],
    );
  },

  async setLexiconLearned(userId, mediaId, count) {
    await pool.query(
      `INSERT INTO learning_progress (user_id, media_id, lexicon_learned_count, last_activity_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, media_id) DO UPDATE SET
         lexicon_learned_count = $3,
         last_activity_at = NOW()`,
      [userId, mediaId, count],
    );
  },

  async listLearnedEntryIds(userId, mediaId) {
    const { rows } = await pool.query(
      `SELECT ll.entry_id
       FROM lexicon_learned ll
       JOIN lexicon_entries le ON le.id = ll.entry_id
       WHERE ll.user_id = $1 AND le.media_id = $2`,
      [userId, mediaId],
    );
    return rows.map((r) => r.entry_id);
  },

  async listLearnedPatternIds(userId, mediaId) {
    const { rows } = await pool.query(
      `SELECT gl.pattern_id FROM grammar_learned gl
       JOIN grammar_patterns gp ON gp.id = gl.pattern_id
       WHERE gl.user_id = $1 AND gp.media_id = $2`,
      [userId, mediaId],
    );
    return rows.map((r) => r.pattern_id);
  },

  /** Only patterns of this film are touched; returns how many ids matched the film. */
  async setPatternsLearned(userId, mediaId, patternIds, learned) {
    const { rows } = await pool.query(
      `SELECT id FROM grammar_patterns WHERE media_id = $1 AND id = ANY($2::uuid[])`,
      [mediaId, patternIds],
    );
    const ids = rows.map((r) => r.id);
    if (!ids.length) return 0;
    if (learned) {
      await pool.query(
        `INSERT INTO grammar_learned (user_id, pattern_id)
         SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING`,
        [userId, ids],
      );
    } else {
      await pool.query(`DELETE FROM grammar_learned WHERE user_id = $1 AND pattern_id = ANY($2::uuid[])`, [
        userId,
        ids,
      ]);
    }
    await this.touchActivity(userId, mediaId);
    return ids.length;
  },

  /** "Мои правила": one row per rule title and language, with every film it came from. */
  async listMyGrammar(userId) {
    const { rows } = await pool.query(
      `SELECT lower(gp.title) AS key, m.language,
              MIN(gp.title) AS title,
              MIN(gp.explanation_ru) AS explanation_ru,
              MIN(gp.pattern_type) AS pattern_type,
              MIN(gp.cefr_level) AS cefr_level,
              array_agg(DISTINCT gp.example) FILTER (WHERE gp.example IS NOT NULL) AS examples,
              array_agg(gp.id) AS pattern_ids,
              json_agg(DISTINCT jsonb_build_object('id', m.id, 'title', m.title)) AS films,
              MAX(gl.created_at) AS learned_at
       FROM grammar_learned gl
       JOIN grammar_patterns gp ON gp.id = gl.pattern_id
       JOIN media_items m ON m.id = gp.media_id
       WHERE gl.user_id = $1
       GROUP BY lower(gp.title), m.language
       ORDER BY learned_at DESC`,
      [userId],
    );
    return rows.map((r) => ({
      key: `${r.language}:${r.key}`,
      title: r.title,
      language: r.language,
      explanationRu: r.explanation_ru,
      patternType: r.pattern_type,
      cefrLevel: r.cefr_level,
      examples: (r.examples || []).slice(0, 4),
      patternIds: r.pattern_ids,
      films: r.films,
      learnedAt: r.learned_at,
    }));
  },

  async removeMyGrammar(userId, patternIds) {
    await pool.query(`DELETE FROM grammar_learned WHERE user_id = $1 AND pattern_id = ANY($2::uuid[])`, [
      userId,
      patternIds,
    ]);
  },

  async entryBelongsToMedia(entryId, mediaId) {
    const { rows } = await pool.query(
      `SELECT 1 FROM lexicon_entries WHERE id = $1 AND media_id = $2`,
      [entryId, mediaId],
    );
    return rows.length > 0;
  },

  /** Marks/unmarks a word and keeps learning_progress.lexicon_learned_count in sync. */
  async setEntryLearned(userId, mediaId, entryId, learned) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (learned) {
        await client.query(
          `INSERT INTO lexicon_learned (user_id, entry_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [userId, entryId],
        );
      } else {
        await client.query(`DELETE FROM lexicon_learned WHERE user_id = $1 AND entry_id = $2`, [
          userId,
          entryId,
        ]);
      }
      const { rows } = await client.query(
        `SELECT COUNT(*)::int AS count
         FROM lexicon_learned ll
         JOIN lexicon_entries le ON le.id = ll.entry_id
         WHERE ll.user_id = $1 AND le.media_id = $2`,
        [userId, mediaId],
      );
      const count = rows[0].count;
      await client.query(
        `INSERT INTO learning_progress (user_id, media_id, lexicon_learned_count, last_activity_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, media_id) DO UPDATE SET
           lexicon_learned_count = $3,
           last_activity_at = NOW()`,
        [userId, mediaId, count],
      );
      await client.query('COMMIT');
      return count;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async listForUser(userId) {
    const { rows } = await pool.query(
      `SELECT
         lp.user_id,
         lp.media_id,
         m.title AS media_title,
         m.recommended_level,
         m.poster_url,
         m.language,
         m.status AS media_status,
         lp.lexicon_learned_count,
         lp.materials_opened_at,
         lp.last_activity_at,
         (SELECT COUNT(*)::int FROM lexicon_entries le WHERE le.media_id = m.id) AS lexicon_total,
         best.score AS best_score,
         best.max_score AS best_max_score,
         COALESCE(att.attempts_count, 0) AS attempts_count
       FROM learning_progress lp
       JOIN media_items m ON m.id = lp.media_id
       LEFT JOIN quizzes q ON q.media_id = m.id AND q.is_published = TRUE
       LEFT JOIN LATERAL (
         SELECT qa.score, qa.max_score
         FROM quiz_attempts qa
         WHERE qa.user_id = lp.user_id AND qa.quiz_id = q.id
         ORDER BY (qa.score / NULLIF(qa.max_score, 0)) DESC, qa.created_at DESC
         LIMIT 1
       ) best ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS attempts_count
         FROM quiz_attempts qa
         WHERE qa.user_id = lp.user_id AND qa.quiz_id = q.id
       ) att ON TRUE
       WHERE lp.user_id = $1
         -- only films with real results: a quiz attempt, a learned word or a learned rule
         AND (
           COALESCE(att.attempts_count, 0) > 0
           OR EXISTS (
             SELECT 1 FROM lexicon_learned ll
             JOIN lexicon_entries le ON le.id = ll.entry_id
             WHERE ll.user_id = lp.user_id AND le.media_id = m.id
           )
           OR EXISTS (
             SELECT 1 FROM grammar_learned gl
             JOIN grammar_patterns gp ON gp.id = gl.pattern_id
             WHERE gl.user_id = lp.user_id AND gp.media_id = m.id
           )
         )
       ORDER BY lp.last_activity_at DESC`,
      [userId],
    );
    return rows.map(mapProgress);
  },
};
