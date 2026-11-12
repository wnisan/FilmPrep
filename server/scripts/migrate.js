import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../migrations');

/**
 * Применяет SQL-файлы из server/migrations по имени (лексикографически).
 * Уже применённые пропускает (таблица schema_migrations).
 */
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const files = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('[migrate] No SQL files found');
    return;
  }

  for (const file of files) {
    const id = file;
    const { rows } = await pool.query(
      'SELECT 1 FROM schema_migrations WHERE id = $1',
      [id],
    );

    if (rows.length > 0) {
      console.log(`[migrate] skip ${id}`);
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
      await client.query('COMMIT');
      console.log(`[migrate] applied ${id}`);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] failed ${id}`);
      throw err;
    } finally {
      client.release();
    }
  }
}

migrate()
  .then(async () => {
    console.log('[migrate] done');
    await pool.end();
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
