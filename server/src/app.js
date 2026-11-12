import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { config } from './config/index.js';
import apiRoutes from './routes/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { uploadsRoot } from './middleware/upload.js';

/**
 * Собирает Express-приложение без запуска listen.
 * Слои: routes → controllers → services → repositories → db.
 */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: config.clientOrigin,
      credentials: true,
    }),
  );
  app.use(
    morgan(config.nodeEnv === 'production' ? 'combined' : 'dev', {
      skip: (req) =>
        req.originalUrl.startsWith('/api/v1/stream/') || req.originalUrl === '/api/v1/health',
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  // Uploaded videos/subtitles — served for in-site player
  app.use(
    '/uploads',
    express.static(uploadsRoot, {
      fallthrough: false,
      maxAge: config.nodeEnv === 'production' ? '1d' : 0,
    }),
  );

  app.use('/api/v1', apiRoutes);

  app.use((_req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  });

  app.use(errorHandler);

  return app;
}
