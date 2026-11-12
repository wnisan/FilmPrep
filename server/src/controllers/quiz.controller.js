import { quizService } from '../services/quiz.service.js';
import { progressService } from '../services/progress.service.js';
import { grammarExercisesService } from '../services/grammarExercises.service.js';

export const quizController = {
  async get(req, res, next) {
    try {
      const data = await quizService.getForLearner(req.params.id, req.user.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async submit(req, res, next) {
    try {
      const data = await quizService.submitAttempt(req.params.id, req.user.id, req.body);
      res.status(201).json(data);
    } catch (err) {
      next(err);
    }
  },
};

export const adminQuizController = {
  async get(req, res, next) {
    try {
      const data = await quizService.getAdminQuiz(req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async upsert(req, res, next) {
    try {
      const data = await quizService.upsertAdminQuiz(req.params.id, req.body);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
};

export const progressController = {
  async mine(req, res, next) {
    try {
      const data = await progressService.getMine(req.user.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async openMaterials(req, res, next) {
    try {
      const data = await progressService.openMaterials(req.user.id, req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async setLexiconLearned(req, res, next) {
    try {
      const data = await progressService.setLexiconLearned(
        req.user.id,
        req.params.id,
        req.body?.learnedCount,
      );
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async learnedGrammar(req, res, next) {
    try {
      res.json(await progressService.getLearnedGrammar(req.user.id, req.params.id));
    } catch (err) {
      next(err);
    }
  },

  async setGrammarLearned(req, res, next) {
    try {
      res.json(await progressService.setGrammarLearned(req.user.id, req.params.id, req.body));
    } catch (err) {
      next(err);
    }
  },

  async myGrammar(req, res, next) {
    try {
      res.json(await progressService.myGrammar(req.user.id));
    } catch (err) {
      next(err);
    }
  },

  async removeMyGrammar(req, res, next) {
    try {
      res.json(await progressService.removeMyGrammar(req.user.id, req.body));
    } catch (err) {
      next(err);
    }
  },

  async grammarExercises(req, res, next) {
    try {
      res.json(await grammarExercisesService.forPatterns(req.user, req.body));
    } catch (err) {
      next(err);
    }
  },

  async learnedEntries(req, res, next) {
    try {
      const data = await progressService.getLearnedEntries(req.user.id, req.params.id);
      res.json(data);
    } catch (err) {
      next(err);
    }
  },

  async setEntryLearned(req, res, next) {
    try {
      const data = await progressService.setEntryLearned(
        req.user.id,
        req.params.id,
        req.params.entryId,
        req.body?.learned,
      );
      res.json(data);
    } catch (err) {
      next(err);
    }
  },
};
