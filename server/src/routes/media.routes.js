import { Router } from 'express';
import { mediaController } from '../controllers/media.controller.js';
import { learningController } from '../controllers/processing.controller.js';
import { quizController, progressController } from '../controllers/quiz.controller.js';
import { socialController } from '../controllers/social.controller.js';
import { recommendationsController } from '../controllers/dictionary.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { mediaRepository } from '../repositories/media.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { UUID_RE } from '../utils/slug.js';
import { filmChatService } from '../services/filmChat.service.js';
import { practiceService } from '../services/practice.service.js';

const router = Router();

const handle = (fn) => async (req, res, next) => {
  try {
    res.json(await fn(req));
  } catch (err) {
    next(err);
  }
};

const chat = handle((req) => filmChatService.ask(req.params.id, req.user.id, req.body));
const scene = handle((req) => practiceService.scene(req.params.id, req.user.id, req.query));
const retell = handle((req) => practiceService.checkRetell(req.params.id, req.user.id, req.body));

// The client links films by readable slug; handlers below always get the UUID
router.param('id', async (req, _res, next, value) => {
  try {
    if (!UUID_RE.test(value)) {
      const id = await mediaRepository.findIdBySlug(value);
      if (!id) throw createHttpError(404, 'NOT_FOUND', 'Фильм не найден');
      req.params.id = id;
    }
    next();
  } catch (err) {
    next(err);
  }
});

router.get('/', requireAuth, mediaController.list);
router.get('/filters', requireAuth, mediaController.filters);
router.get('/:id', requireAuth, mediaController.getById);
router.get('/:id/lexicon', requireAuth, learningController.lexicon);
router.get('/:id/phrases', requireAuth, learningController.phrases);
router.get('/:id/grammar', requireAuth, learningController.grammar);
router.get('/:id/subtitle-tracks', requireAuth, learningController.subtitleTracks);
router.get('/:id/subtitle-tracks/:subtitleId', requireAuth, learningController.subtitleCues);
router.post('/:id/materials-opened', requireAuth, progressController.openMaterials);
router.post('/:id/lexicon-progress', requireAuth, progressController.setLexiconLearned);
router.get('/:id/lexicon-learned', requireAuth, progressController.learnedEntries);
router.put('/:id/lexicon-learned/:entryId', requireAuth, progressController.setEntryLearned);
router.get('/:id/grammar-learned', requireAuth, progressController.learnedGrammar);
router.put('/:id/grammar-learned', requireAuth, progressController.setGrammarLearned);
router.get('/:id/similar', requireAuth, recommendationsController.similar);
router.get('/:id/social', requireAuth, socialController.summary);
router.put('/:id/rating', requireAuth, socialController.rate);
router.delete('/:id/rating', requireAuth, socialController.unrate);
router.put('/:id/favorite', requireAuth, socialController.favorite);
router.delete('/:id/favorite', requireAuth, socialController.unfavorite);
router.get('/:id/comments', requireAuth, socialController.comments);
router.post('/:id/comments', requireAuth, socialController.addComment);
router.get('/:id/quiz', requireAuth, quizController.get);
router.post('/:id/quiz/attempts', requireAuth, quizController.submit);
router.post('/:id/chat', requireAuth, chat);
router.get('/:id/practice/scene', requireAuth, scene);
router.post('/:id/practice/retell', requireAuth, retell);

export default router;
