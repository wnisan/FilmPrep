import { Router } from 'express';
import { pingDatabase } from '../db/pool.js';

const router = Router();

/**
 * GET /api/v1/health
 * Служебный эндпоинт для проверки API и PostgreSQL.
 */
router.get('/', async (_req, res) => {
  const db = await pingDatabase();

  res.status(db.ok ? 200 : 503).json({
    status: db.ok ? 'ok' : 'degraded',
    service: 'filmprep-api',
    timestamp: new Date().toISOString(),
    database: db.ok ? 'up' : 'down',
    ...(db.error ? { databaseError: db.error } : {}),
  });
});

export default router;
