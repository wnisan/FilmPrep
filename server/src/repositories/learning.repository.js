import { pool } from '../db/pool.js';

function mapLexicon(row) {
  return {
    id: row.id,
    mediaId: row.media_id,
    lemma: row.lemma,
    surfaceForms: row.surface_forms || [],
    cefrLevel: row.cefr_level,
    frequency: row.frequency,
    definitionRu: row.definition_ru,
    exampleSubtitle: row.example_subtitle,
    timestampMs: row.timestamp_ms,
  };
}

function mapPhrase(row) {
  return {
    id: row.id,
    mediaId: row.media_id,
    text: row.text,
    translationRu: row.translation_ru,
    note: row.note,
    timestampMs: row.timestamp_ms,
  };
}

// Fallback for rows processed before cefr_level existed
const GRAMMAR_LEVELS = {
  conditionals: 'B1',
  passive: 'B1',
  present_perfect: 'A2',
  modals: 'A2',
  phrasal_verbs: 'B1',
};

function mapGrammar(row) {
  return {
    id: row.id,
    mediaId: row.media_id,
    title: row.title,
    explanationRu: row.explanation_ru,
    example: row.example,
    patternType: row.pattern_type,
    cefrLevel: row.cefr_level || GRAMMAR_LEVELS[row.pattern_type] || null,
  };
}

export const learningRepository = {
  async replaceMaterials(mediaId, { lexicon, phrases, grammar }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM lexicon_entries WHERE media_id = $1', [mediaId]);
      await client.query('DELETE FROM phrases WHERE media_id = $1', [mediaId]);
      await client.query('DELETE FROM grammar_patterns WHERE media_id = $1', [mediaId]);

      for (const item of lexicon) {
        await client.query(
          `INSERT INTO lexicon_entries (
             media_id, lemma, surface_forms, cefr_level, frequency,
             definition_ru, example_subtitle, timestamp_ms
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [
            mediaId,
            item.lemma,
            item.surfaceForms,
            item.cefrLevel,
            item.frequency,
            item.definitionRu,
            item.exampleSubtitle,
            item.timestampMs,
          ],
        );
      }

      for (const item of phrases) {
        await client.query(
          `INSERT INTO phrases (media_id, text, translation_ru, note, timestamp_ms)
           VALUES ($1,$2,$3,$4,$5)`,
          [mediaId, item.text, item.translationRu, item.note, item.timestampMs],
        );
      }

      for (const item of grammar) {
        await client.query(
          `INSERT INTO grammar_patterns (
             media_id, title, explanation_ru, example, pattern_type, cefr_level
           ) VALUES ($1,$2,$3,$4,$5,$6)`,
          [
            mediaId,
            item.title,
            item.explanationRu,
            item.example,
            item.patternType,
            item.cefrLevel ?? null,
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getLexicon(mediaId, { level } = {}) {
    const params = [mediaId];
    let levelFilter = '';
    if (level) {
      params.push(level);
      levelFilter = `AND cefr_level = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT id, media_id, lemma, surface_forms, cefr_level, frequency,
              definition_ru, example_subtitle, timestamp_ms
       FROM lexicon_entries
       WHERE media_id = $1 ${levelFilter}
       ORDER BY frequency DESC, lemma ASC`,
      params,
    );
    return rows.map(mapLexicon);
  },

  async getPhrases(mediaId) {
    const { rows } = await pool.query(
      `SELECT id, media_id, text, translation_ru, note, timestamp_ms
       FROM phrases WHERE media_id = $1
       ORDER BY timestamp_ms NULLS LAST, created_at ASC`,
      [mediaId],
    );
    return rows.map(mapPhrase);
  },

  /** rows: [{ id, definitionRu }] */
  async setWordTranslations(mediaId, rows) {
    for (const row of rows) {
      await pool.query(`UPDATE lexicon_entries SET definition_ru = $3 WHERE id = $1 AND media_id = $2`, [
        row.id,
        mediaId,
        row.definitionRu,
      ]);
    }
  },

  /** rows: [{ id, translationRu }] */
  async setPhraseTranslations(mediaId, rows) {
    for (const row of rows) {
      await pool.query(`UPDATE phrases SET translation_ru = $3 WHERE id = $1 AND media_id = $2`, [
        row.id,
        mediaId,
        row.translationRu,
      ]);
    }
  },

  async getGrammar(mediaId) {
    const { rows } = await pool.query(
      `SELECT id, media_id, title, explanation_ru, example, pattern_type, cefr_level
       FROM grammar_patterns WHERE media_id = $1
       ORDER BY created_at ASC`,
      [mediaId],
    );
    return rows.map(mapGrammar);
  },
};
