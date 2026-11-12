import { Router } from 'express';
import { adminMediaController } from '../controllers/media.controller.js';
import { processingController } from '../controllers/processing.controller.js';
import { adminQuizController } from '../controllers/quiz.controller.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { posterUpload, subtitleUpload, videoUpload } from '../middleware/upload.js';
import { ROLES } from '../constants.js';

const router = Router();

router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get('/storage', adminMediaController.storageInfo);
router.get('/yadisk/videos', adminMediaController.yandexDiskVideos);
router.get('/media', adminMediaController.list);
router.get('/media/:id', adminMediaController.getById);
router.post('/media', adminMediaController.create);
router.patch('/media/:id', adminMediaController.update);
router.delete('/media/:id', adminMediaController.remove);

router.post(
  '/media/:id/video',
  videoUpload.single('file'),
  adminMediaController.uploadVideo,
);
router.delete('/media/:id/video', adminMediaController.removeVideo);
router.put('/media/:id/poster', posterUpload.single('file'), adminMediaController.uploadPoster);
router.delete('/media/:id/poster', adminMediaController.removePoster);
router.post('/media/:id/video/yadisk', adminMediaController.importFromYandexDisk);
router.post('/media/:id/subtitles/translate', processingController.startTranslation);
router.get('/media/:id/subtitles/translate', processingController.translationStatus);

router.get('/media/:id/subtitles', processingController.listSubtitles);
router.post(
  '/media/:id/subtitles',
  subtitleUpload.single('file'),
  processingController.upload,
);
router.post('/media/:id/process', processingController.process);
router.get('/media/:id/process', processingController.prepStatus);
router.get('/jobs', processingController.listJobs);

router.get('/media/:id/quiz', adminQuizController.get);
router.put('/media/:id/quiz', adminQuizController.upsert);

export default router;
