import { CEFR_LEVELS } from '../constants.js';
import { learningRepository } from '../repositories/learning.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { findViewableMedia } from '../utils/mediaAccess.js';

export const learningService = {
  async getLexicon(mediaId, level, user) {
    await findViewableMedia(mediaId, user);
    if (level && !CEFR_LEVELS.includes(level)) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Invalid CEFR level');
    }
    return learningRepository.getLexicon(mediaId, { level });
  },

  async getPhrases(mediaId, user) {
    await findViewableMedia(mediaId, user);
    return learningRepository.getPhrases(mediaId);
  },

  async getGrammar(mediaId, user) {
    await findViewableMedia(mediaId, user);
    return learningRepository.getGrammar(mediaId);
  },
};
