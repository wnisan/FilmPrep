import { pool } from '../db/pool.js';

function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    mediaId: row.media_id,
    subtitleId: row.subtitle_id,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export const jobsRepository = {
  async create({ mediaId, subtitleId }) {
    const { rows } = await pool.query(
      `INSERT INTO processing_jobs (media_id, subtitle_id, status)
       VALUES ($1, $2, 'queued')
       RETURNING id, media_id, subtitle_id, status, error_message, created_at, started_at, finished_at`,
      [mediaId, subtitleId],
    );
    return mapJob(rows[0]);
  },

  async markProcessing(id) {
    const { rows } = await pool.query(
      `UPDATE processing_jobs
       SET status = 'processing', started_at = NOW(), error_message = NULL
       WHERE id = $1
       RETURNING id, media_id, subtitle_id, status, error_message, created_at, started_at, finished_at`,
      [id],
    );
    return mapJob(rows[0]);
  },

  async markDone(id) {
    const { rows } = await pool.query(
      `UPDATE processing_jobs
       SET status = 'done', finished_at = NOW()
       WHERE id = $1
       RETURNING id, media_id, subtitle_id, status, error_message, created_at, started_at, finished_at`,
      [id],
    );
    return mapJob(rows[0]);
  },

  async markFailed(id, errorMessage) {
    const { rows } = await pool.query(
      `UPDATE processing_jobs
       SET status = 'failed', finished_at = NOW(), error_message = $2
       WHERE id = $1
       RETURNING id, media_id, subtitle_id, status, error_message, created_at, started_at, finished_at`,
      [id, errorMessage.slice(0, 1000)],
    );
    return mapJob(rows[0]);
  },

  async list({ mediaId, limit = 20 } = {}) {
    const params = [];
    let where = '';
    if (mediaId) {
      params.push(mediaId);
      where = `WHERE media_id = $${params.length}`;
    }
    params.push(limit);
    const { rows } = await pool.query(
      `SELECT id, media_id, subtitle_id, status, error_message, created_at, started_at, finished_at
       FROM processing_jobs
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows.map(mapJob);
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT id, media_id, subtitle_id, status, error_message, created_at, started_at, finished_at
       FROM processing_jobs WHERE id = $1`,
      [id],
    );
    return mapJob(rows[0]);
  },
};
