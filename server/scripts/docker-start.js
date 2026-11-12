import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/**
 * Точка входа контейнера API:
 * ждёт PostgreSQL → миграции → API → сид (только на пустой базе) →
 * фоновый импорт демо-фильмов, если их ещё нет.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.resolve(__dirname, '..');
const DEMO_TITLES = ['Tears of Steel', 'Sintel', 'Sprite Fright', 'Cosmos Laundromat'];

function log(message) {
  console.log(`[docker] ${message}`);
}

function runNode(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: serverDir, stdio: 'inherit' });
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${script} завершился с кодом ${code}`)),
    );
  });
}

async function query(sql, params = []) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}

async function waitForDatabase() {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    try {
      await query('SELECT 1');
      return;
    } catch (err) {
      if (attempt === 1) log(`жду PostgreSQL… (${err.message})`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('PostgreSQL недоступен');
}

async function needsSeed() {
  const { rows } = await query('SELECT COUNT(*)::int AS n FROM media_items');
  return rows[0].n === 0;
}

async function missingDemoFilms() {
  const { rows } = await query(
    `SELECT title FROM media_items WHERE title = ANY($1) AND video_status = 'ready'`,
    [DEMO_TITLES],
  );
  const ready = new Set(rows.map((r) => r.title));
  return DEMO_TITLES.filter((t) => !ready.has(t));
}

async function seedCommunity() {
  await runNode('scripts/seed-languages.js').catch((err) => log(`фильмы на других языках: ${err.message}`));
  await runNode('scripts/film-facts.js').catch((err) => log(`данные фильмов: ${err.message}`));
  await runNode('scripts/extend-quizzes.js').catch((err) => log(`новые форматы тестов: ${err.message}`));
  await runNode('scripts/seed-community.js').catch((err) => log(`демо-сообщество: ${err.message}`));
}

function startDemoImport() {
  const logFile = path.join(serverDir, process.env.UPLOAD_DIR || 'uploads', 'demo-import-docker.log');
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const out = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, ['scripts/import-demo.js'], {
    cwd: serverDir,
    stdio: ['ignore', out, out],
  });
  child.on('exit', (code) => {
    log(`импорт демо-фильмов завершён (код ${code}), лог: ${logFile}`);
    // comments reference the demo films, so the community goes in after them
    seedCommunity();
  });
}

async function main() {
  await waitForDatabase();
  await runNode('scripts/migrate.js');

  const emptyDatabase = await needsSeed();

  await import('../src/index.js');

  if (emptyDatabase) {
    log('пустая база — заполняю демо-данными (анализ субтитров займёт пару минут)');
    await runNode('scripts/seed.js').catch((err) => log(`сид не удался: ${err.message}`));
  }

  const missing =
    String(process.env.AUTO_DEMO_IMPORT || 'true').toLowerCase() !== 'false' ? await missingDemoFilms() : [];
  if (missing.length) {
    log(`нет видео у демо-фильмов: ${missing.join(', ')} — скачиваю и нарезаю в фоне`);
    // Даём API завершить onStartup, чтобы он не пометил свежие задачи как прерванные
    setTimeout(startDemoImport, 20000);
  } else {
    await seedCommunity();
  }
}

main().catch((err) => {
  console.error('[docker] запуск не удался:', err);
  process.exit(1);
});
