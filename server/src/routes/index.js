import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import mediaRoutes from './media.routes.js';
import adminRoutes from './admin.routes.js';
import meRoutes from './me.routes.js';
import { usersRouter, commentsRouter } from './users.routes.js';
import { streamController } from '../controllers/media.controller.js';

const router = Router();

// Signed token in the path: relative HLS URLs keep it without extra headers
router.get('/stream/:mediaId/:token/*', streamController.serve);

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/media', mediaRoutes);
router.use('/admin', adminRoutes);
router.use('/me', meRoutes);
router.use('/users', usersRouter);
router.use('/comments', commentsRouter);

export default router;
