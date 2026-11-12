import { createApp } from './app.js';
import { config } from './config/index.js';
import { pingDatabase } from './db/pool.js';
import { mediaRepository } from './repositories/media.repository.js';
import { subtitleVocabService } from './services/subtitleVocab.service.js';
import { videoService } from './services/video.service.js';

const app = createApp();

async function start() {
  const db = await pingDatabase();
  if (!db.ok) {
    console.warn(`[filmprep] PostgreSQL unavailable: ${db.error || 'unknown'}`);
  } else {
    console.log('[filmprep] PostgreSQL connected');
    await videoService.onStartup();
    const slugs = await mediaRepository.fillMissingSlugs();
    if (slugs) console.log(`[filmprep] readable URLs assigned to ${slugs} film(s)`);
    const storage = await videoService.storageInfo();
    console.log(
      `[filmprep] Video storage: ${storage.label}${storage.ok ? '' : ` — недоступно: ${storage.error}`}`,
    );
    setTimeout(() => {
      subtitleVocabService.scheduleAll().catch((err) => console.warn(`[vocab] ${err.message}`));
    }, 30000).unref();
  }

  app.listen(config.port, () => {
    console.log(`[filmprep] API http://localhost:${config.port}/api/v1/health`);
  });
}

start().catch((err) => {
  console.error('[filmprep] Failed to start', err);
  process.exit(1);
});
