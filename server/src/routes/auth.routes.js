import { Router } from 'express';
import { authController } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.get('/providers', authController.providers);
router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/google', authController.googleStart);
router.get('/google/callback', authController.googleCallback);
router.post('/logout', authController.logout);
router.post('/refresh', authController.refresh);
router.get('/me', requireAuth, authController.me);

export default router;
