import { pool } from '../db/pool.js';

const FIELDS = 'id, media_id, original_filename, storage_path, format, language, source, uploaded_at';

function mapSubtitle(row) {
  if (!row) return null;
  return {
    id: row.id,
    mediaId: row.media_id,
    originalFilename: row.original_filename,
    storagePath: row.storage_path,
    format: row.format,
    language: row.language || 'en',
    source: row.source || 'upload',
    uploadedAt: row.uploaded_at,
  };
}

export const subtitlesRepository = {
  async create({ mediaId, originalFilename, storagePath, format, language = 'en', source = 'upload' }) {
    const { rows } = await pool.query(
      `INSERT INTO subtitles (media_id, original_filename, storage_path, format, language, source)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${FIELDS}`,
      [mediaId, originalFilename, storagePath, format, language, source],
    );
    return mapSubtitle(rows[0]);
  },

  async listByMedia(mediaId) {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM subtitles WHERE media_id = $1 ORDER BY uploaded_at DESC`,
      [mediaId],
    );
    return rows.map(mapSubtitle);
  },

  async findById(id) {
    const { rows } = await pool.query(`SELECT ${FIELDS} FROM subtitles WHERE id = $1`, [id]);
    return mapSubtitle(rows[0]);
  },

  async findLatestByMedia(mediaId, language = 'en') {
    const { rows } = await pool.query(
      `SELECT ${FIELDS} FROM subtitles
       WHERE media_id = $1 AND language = $2
       ORDER BY uploaded_at DESC LIMIT 1`,
      [mediaId, language],
    );
    return mapSubtitle(rows[0]);
  },

  /** All versions of one language (older uploads would otherwise become the current track). */
  async removeByLanguage(mediaId, language) {
    const { rows } = await pool.query(
      `DELETE FROM subtitles WHERE media_id = $1 AND language = $2 RETURNING storage_path`,
      [mediaId, language],
    );
    return rows.map((row) => row.storage_path);
  },

  /** Newest file per language — these are the tracks the player offers. */
  async latestPerLanguage(mediaId) {
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (language) ${FIELDS}
       FROM subtitles WHERE media_id = $1
       ORDER BY language, uploaded_at DESC`,
      [mediaId],
    );
    return rows.map(mapSubtitle);
  },
};
