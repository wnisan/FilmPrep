import pg from 'pg';
import { config } from '../config/index.js';

const { Pool } = pg;

/** Пул подключений PostgreSQL (единственная точка доступа к БД). */
export const pool = new Pool({
  connectionString: config.databaseUrl,
});

/**
 * Проверка доступности БД.
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function pingDatabase() {
  if (!config.databaseUrl) {
    return { ok: false, error: 'DATABASE_URL is not set' };
  }

  try {
    const result = await pool.query('SELECT 1 AS ok');
    return { ok: result.rows[0]?.ok === 1 };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
