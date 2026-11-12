import { Router } from 'express';
import { profileController, socialController } from '../controllers/social.controller.js';
import { requireAuth } from '../middleware/auth.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);
usersRouter.get('/leaderboard', profileController.leaderboard);
usersRouter.get('/:username', profileController.byUsername);

export const commentsRouter = Router();
commentsRouter.use(requireAuth);
commentsRouter.patch('/:commentId', socialController.editComment);
commentsRouter.delete('/:commentId', socialController.deleteComment);
