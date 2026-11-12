import { pool } from '../db/pool.js';

export const grammarExercisesRepository = {
  /** Patterns the user may study: catalog films, own films, or anything for admins. */
  async findViewablePatterns(user, ids) {
    const { rows } = await pool.query(
      `SELECT g.id, g.title, g.explanation_ru, g.example, m.language
         FROM grammar_patterns g
         JOIN media_items m ON m.id = g.media_id
        WHERE g.id = ANY($1::uuid[])
          AND (m.status = 'published' OR m.owner_id = $2 OR $3)`,
      [ids, user.id, user.role === 'admin'],
    );
    return rows;
  },

  async findByKeys(keys) {
    if (!keys.length) return new Map();
    const { rows } = await pool.query(
      `SELECT rule_key, items FROM grammar_exercises WHERE rule_key = ANY($1::text[])`,
      [keys],
    );
    return new Map(rows.map((r) => [r.rule_key, r.items]));
  },

  async save(key, items) {
    await pool.query(
      `INSERT INTO grammar_exercises (rule_key, items) VALUES ($1, $2::jsonb)
       ON CONFLICT (rule_key) DO UPDATE SET items = EXCLUDED.items, created_at = NOW()`,
      [key, JSON.stringify(items)],
    );
  },
};
