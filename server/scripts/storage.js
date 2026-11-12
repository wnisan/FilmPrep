/**
 *   npm run storage:check    — which storage is active, test write/read/delete
 *   npm run storage:migrate  — move already processed videos from the local folder to the cloud
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pool } from '../src/db/pool.js';
import { getStorage } from '../src/services/storage.service.js';
import { videoService } from '../src/services/video.service.js';

async function check() {
  const info = await videoService.storageInfo();
  console.log(`Хранилище: ${info.label} (driver=${info.driver}, segments=${info.segments})`);
  if (!info.ok) {
    console.error(`Недоступно: ${info.error}`);
    process.exitCode = 1;
    return;
  }
  const storage = getStorage();
  const tmp = path.join(os.tmpdir(), `filmprep-check-${Date.now()}.txt`);
  const key = `healthcheck/${path.basename(tmp)}`;
  await fs.writeFile(tmp, 'filmprep ok');
  await storage.putFile(tmp, key);
  const text = await storage.getText(key);
  await storage.removePrefix('healthcheck/');
  await fs.rm(tmp, { force: true });
  console.log(text === 'filmprep ok' ? 'Запись, чтение и удаление работают ✓' : 'Прочитано не то, что записано ✗');
}

async function migrate() {
  const moved = await videoService.migrateLocalToCloud();
  console.log(`Перенесено фильмов: ${moved}`);
}

const command = process.argv[2];
const run = command === 'migrate' ? migrate : check;

run()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
