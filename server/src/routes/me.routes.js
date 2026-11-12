import { Router } from 'express';
import { progressController } from '../controllers/quiz.controller.js';
import { profileController } from '../controllers/social.controller.js';
import {
  dictionaryController,
  goalsController,
  recommendationsController,
} from '../controllers/dictionary.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { avatarUpload, posterUpload, subtitleUpload, videoUpload } from '../middleware/upload.js';
import { myFilmsController } from '../controllers/myFilms.controller.js';

const router = Router();

router.use(requireAuth);
router.get('/progress', progressController.mine);
router.get('/grammar', progressController.myGrammar);
router.post('/grammar/remove', progressController.removeMyGrammar);
router.post('/grammar/exercises', progressController.grammarExercises);
router.get('/profile', profileController.mine);
router.patch('/profile', profileController.update);
router.put('/password', profileController.changePassword);
router.post('/delete-account', profileController.deleteAccount);
router.put('/languages', profileController.updateLanguages);
router.put('/avatar', avatarUpload.single('file'), profileController.setAvatar);
router.delete('/avatar', profileController.removeAvatar);
router.get('/goal', goalsController.status);
router.patch('/goal', goalsController.update);
router.get('/dictionary', dictionaryController.list);
router.post('/dictionary', dictionaryController.save);
router.get('/dictionary/browse', dictionaryController.browse);
router.post('/dictionary/translate', dictionaryController.translate);
router.patch('/dictionary/:wordId', dictionaryController.update);
router.delete('/dictionary/:wordId', dictionaryController.remove);
router.get('/recommendations', recommendationsController.mine);
router.get('/films', myFilmsController.list);
router.post('/films', myFilmsController.create);
router.get('/films/:id', myFilmsController.get);
router.patch('/films/:id', myFilmsController.update);
router.delete('/films/:id', myFilmsController.remove);
router.post('/films/:id/video', videoUpload.single('file'), myFilmsController.uploadVideo);
router.put('/films/:id/video-link', myFilmsController.setVideoLink);
router.delete('/films/:id/video', myFilmsController.removeVideo);
router.post('/films/:id/subtitles', subtitleUpload.single('file'), myFilmsController.uploadSubtitle);
router.post('/films/:id/subtitles/translate', myFilmsController.translateSubtitles);
router.delete('/films/:id/subtitles/:role', myFilmsController.removeSubtitles);
router.post('/films/:id/prepare', myFilmsController.prepare);
router.put('/films/:id/poster', posterUpload.single('file'), myFilmsController.uploadPoster);
router.delete('/films/:id/poster', myFilmsController.removePoster);
router.get('/films/:id/poster-search', myFilmsController.searchPosters);

export default router;
