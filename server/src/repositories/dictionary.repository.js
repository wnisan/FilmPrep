import { pool } from '../db/pool.js';

const ACTIVITY_TZ = 'Europe/Minsk';

function mapWord(row) {
  return {
    id: row.id,
    kind: row.kind,
    word: row.word,
    translation: row.translation,
    context: row.context,
    note: row.note,
    level: row.level,
    language: row.language || 'en',
    source: row.source,
    timestampMs: row.timestamp_ms,
    media: row.media_id ? { id: row.media_id, title: row.media_title } : null,
    createdAt: row.created_at,
  };
}

export const dictionaryRepository = {
  /**
   * The learner's dictionary: words saved by hand/from subtitles plus words marked
   * as learned in film vocabularies (one row per word).
   */
  async listForUser(userId) {
    const { rows } = await pool.query(
      `SELECT * FROM (
         SELECT uw.id, 'saved' AS kind, uw.word, uw.translation, uw.context, uw.note, uw.source,
                uw.timestamp_ms, uw.media_id, m.title AS media_title, uw.created_at,
                COALESCE(le.cefr_level, lvl.cefr_level) AS level, uw.language
         FROM user_words uw
         LEFT JOIN media_items m ON m.id = uw.media_id
         LEFT JOIN lexicon_entries le ON le.id = uw.lexicon_entry_id
         LEFT JOIN LATERAL (
           SELECT x.cefr_level FROM lexicon_entries x JOIN media_items xm ON xm.id = x.media_id
           WHERE lower(x.lemma) = uw.word_key AND xm.language = uw.language AND x.cefr_level IS NOT NULL
           LIMIT 1
         ) lvl ON TRUE
         WHERE uw.user_id = $1
         UNION ALL
         (SELECT DISTINCT ON (m.language, lower(le.lemma))
                le.id, 'learned' AS kind, le.lemma AS word, le.definition_ru AS translation,
                le.example_subtitle AS context, NULL AS note, 'lexicon' AS source,
                le.timestamp_ms, le.media_id, m.title AS media_title, ll.created_at,
                le.cefr_level AS level, m.language
         FROM lexicon_learned ll
         JOIN lexicon_entries le ON le.id = ll.entry_id
         JOIN media_items m ON m.id = le.media_id
         WHERE ll.user_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM user_words uw
             WHERE uw.user_id = $1 AND uw.language = m.language AND uw.word_key = lower(le.lemma)
           )
         ORDER BY m.language, lower(le.lemma), ll.created_at DESC)
       ) words
       ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(mapWord);
  },

  async findSaved(userId, id) {
    const { rows } = await pool.query(`SELECT * FROM user_words WHERE id = $1 AND user_id = $2`, [id, userId]);
    return rows[0] || null;
  },

  /** Insert or refresh (same word saved twice keeps one row). */
  async save(userId, data) {
    const { rows } = await pool.query(
      `INSERT INTO user_words
         (user_id, word, word_key, translation, context, note, media_id, lexicon_entry_id, timestamp_ms, source, language)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (user_id, language, word_key) DO UPDATE SET
         translation = COALESCE(EXCLUDED.translation, user_words.translation),
         context = COALESCE(user_words.context, EXCLUDED.context),
         media_id = COALESCE(user_words.media_id, EXCLUDED.media_id),
         timestamp_ms = COALESCE(user_words.timestamp_ms, EXCLUDED.timestamp_ms),
         lexicon_entry_id = COALESCE(user_words.lexicon_entry_id, EXCLUDED.lexicon_entry_id)
       RETURNING id, (xmax = 0) AS inserted`,
      [
        userId,
        data.word,
        data.wordKey,
        data.translation ?? null,
        data.context ?? null,
        data.note ?? null,
        data.mediaId ?? null,
        data.lexiconEntryId ?? null,
        data.timestampMs ?? null,
        data.source,
        data.language || 'en',
      ],
    );
    return rows[0];
  },

  async update(userId, id, { translation, note }) {
    const { rows } = await pool.query(
      `UPDATE user_words SET
         translation = CASE WHEN $3::boolean THEN $4 ELSE translation END,
         note = CASE WHEN $5::boolean THEN $6 ELSE note END
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, userId, translation !== undefined, translation ?? null, note !== undefined, note ?? null],
    );
    return rows[0] || null;
  },

  async remove(userId, id) {
    const { rowCount } = await pool.query(`DELETE FROM user_words WHERE id = $1 AND user_id = $2`, [id, userId]);
    return rowCount > 0;
  },

  /**
   * A word learned in film lexicons: the list shows it once per language, so it
   * is unmarked in every film where it was learned; per-film counters follow.
   */
  async removeLearned(userId, entryId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `DELETE FROM lexicon_learned ll
         USING lexicon_entries le, media_items m, lexicon_entries src, media_items sm
         WHERE ll.user_id = $1 AND ll.entry_id = le.id AND le.media_id = m.id
           AND src.id = $2 AND sm.id = src.media_id
           AND lower(le.lemma) = lower(src.lemma) AND m.language = sm.language
         RETURNING le.media_id`,
        [userId, entryId],
      );
      const mediaIds = [...new Set(rows.map((r) => r.media_id))];
      for (const mediaId of mediaIds) {
        await client.query(
          `UPDATE learning_progress SET lexicon_learned_count = (
             SELECT COUNT(*)::int FROM lexicon_learned ll
             JOIN lexicon_entries le ON le.id = ll.entry_id
             WHERE ll.user_id = $1 AND le.media_id = $2)
           WHERE user_id = $1 AND media_id = $2`,
          [userId, mediaId],
        );
      }
      await client.query('COMMIT');
      return rows.length > 0;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /** The learner's own entry for one of the word forms (if saved). */
  async findSavedByKeys(userId, keys, language = 'en') {
    const { rows } = await pool.query(
      `SELECT id, word, translation FROM user_words
       WHERE user_id = $1 AND language = $3 AND word_key = ANY($2)
       ORDER BY array_position($2, word_key) LIMIT 1`,
      [userId, keys, language],
    );
    return rows[0] || null;
  },

  /** Every word from the vocabularies of published films, grouped by language + lemma. */
  async browse({ userId, q, level, language, page, limit }) {
    const where = [`m.status = 'published'`];
    const params = [];
    const add = (value) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (q) where.push(`(lower(le.lemma) LIKE ${add(`${q.toLowerCase()}%`)} OR lower(coalesce(le.definition_ru, '')) LIKE ${add(`%${q.toLowerCase()}%`)})`);
    if (level) where.push(`le.cefr_level = ${add(level)}`);
    if (language) where.push(`m.language = ${add(language)}`);

    const grouped = `
      SELECT m.language, lower(le.lemma) AS word_key,
             MIN(le.lemma) AS word,
             (ARRAY_AGG(le.definition_ru ORDER BY le.definition_ru IS NULL, le.frequency DESC))[1] AS translation,
             (ARRAY_AGG(le.example_subtitle ORDER BY le.frequency DESC))[1] AS context,
             (ARRAY_AGG(le.id ORDER BY le.frequency DESC))[1] AS entry_id,
             MIN(le.cefr_level) AS level,
             SUM(le.frequency)::int AS frequency,
             ARRAY_AGG(DISTINCT m.title) AS films
      FROM lexicon_entries le
      JOIN media_items m ON m.id = le.media_id
      WHERE ${where.join(' AND ')}
      GROUP BY m.language, lower(le.lemma)`;

    const { rows: countRows } = await pool.query(`SELECT COUNT(*)::int AS total FROM (${grouped}) g`, params);
    const userRef = add(userId);
    const limitRef = add(limit);
    const offsetRef = add((page - 1) * limit);
    const { rows } = await pool.query(
      `SELECT g.*, EXISTS (
         SELECT 1 FROM user_words uw
         WHERE uw.user_id = ${userRef} AND uw.language = g.language AND uw.word_key = g.word_key
       ) OR EXISTS (
         SELECT 1 FROM lexicon_learned ll
         JOIN lexicon_entries x ON x.id = ll.entry_id
         JOIN media_items xm ON xm.id = x.media_id
         WHERE ll.user_id = ${userRef} AND xm.language = g.language AND lower(x.lemma) = g.word_key
       ) AS in_dictionary
       FROM (${grouped}) g
       ORDER BY g.word_key, g.language
       LIMIT ${limitRef} OFFSET ${offsetRef}`,
      params,
    );
    return {
      total: countRows[0].total,
      items: rows.map((r) => ({
        entryId: r.entry_id,
        language: r.language,
        word: r.word,
        translation: r.translation,
        context: r.context,
        level: r.level,
        frequency: r.frequency,
        films: r.films,
        inDictionary: r.in_dictionary,
      })),
    };
  },

  /** Film vocabulary entry for a word form (lemma or surface form); the given film first. */
  async lookupLexicon(keys, mediaId, language = 'en') {
    const { rows } = await pool.query(
      `SELECT le.id, le.lemma, le.definition_ru, le.cefr_level
       FROM lexicon_entries le
       JOIN media_items m ON m.id = le.media_id
       WHERE le.definition_ru IS NOT NULL
         AND m.language = $3
         AND (lower(le.lemma) = ANY($1)
              OR EXISTS (SELECT 1 FROM unnest(le.surface_forms) s WHERE lower(s) = ANY($1)))
       ORDER BY (le.media_id = $2) DESC NULLS LAST, array_position($1, lower(le.lemma)) NULLS LAST, le.frequency DESC
       LIMIT 1`,
      [keys, mediaId ?? null, language],
    );
    return rows[0] || null;
  },

  async cachedTranslation(wordKey, language = 'en') {
    const { rows } = await pool.query(
      `SELECT translation, source FROM word_translations WHERE word_key = $1 AND language = $2`,
      [wordKey, language],
    );
    return rows[0] || null;
  },

  async cachedKeys(wordKeys, language = 'en') {
    if (!wordKeys.length) return new Set();
    const { rows } = await pool.query(
      `SELECT word_key FROM word_translations WHERE language = $1 AND word_key = ANY($2::text[])`,
      [language, wordKeys],
    );
    return new Set(rows.map((row) => row.word_key));
  },

  async cacheTranslation(wordKey, translation, source, language = 'en') {
    await pool.query(
      `INSERT INTO word_translations (word_key, translation, source, language) VALUES ($1, $2, $3, $4)
       ON CONFLICT (language, word_key) DO UPDATE SET translation = EXCLUDED.translation, source = EXCLUDED.source`,
      [wordKey, translation, source, language],
    );
  },

  /** New words per local day: learned in vocabularies + saved to the dictionary (distinct words). */
  async dailyWordCounts(userId, days = 400) {
    const { rows } = await pool.query(
      `SELECT day::text, COUNT(DISTINCT word_key)::int AS words FROM (
         SELECT (ll.created_at AT TIME ZONE '${ACTIVITY_TZ}')::date AS day, lower(le.lemma) AS word_key
         FROM lexicon_learned ll JOIN lexicon_entries le ON le.id = ll.entry_id
         WHERE ll.user_id = $1
         UNION ALL
         SELECT (created_at AT TIME ZONE '${ACTIVITY_TZ}')::date, word_key FROM user_words WHERE user_id = $1
       ) w
       WHERE day > (NOW() AT TIME ZONE '${ACTIVITY_TZ}')::date - $2::int
       GROUP BY day ORDER BY day`,
      [userId, days],
    );
    return rows;
  },

  async goalSettings(userId) {
    const { rows } = await pool.query(
      `SELECT daily_goal, reminder_enabled, reminder_time FROM users WHERE id = $1`,
      [userId],
    );
    return rows[0] || null;
  },

  async updateGoalSettings(userId, { dailyGoal, reminderEnabled, reminderTime }) {
    await pool.query(
      `UPDATE users SET
         daily_goal = COALESCE($2, daily_goal),
         reminder_enabled = COALESCE($3, reminder_enabled),
         reminder_time = COALESCE($4, reminder_time),
         updated_at = NOW()
       WHERE id = $1`,
      [userId, dailyGoal ?? null, reminderEnabled ?? null, reminderTime ?? null],
    );
  },
};
