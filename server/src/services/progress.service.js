import { progressRepository } from '../repositories/progress.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { findViewableMedia } from '../utils/mediaAccess.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const progressService = {
  async getMine(userId) {
    const items = await progressRepository.listForUser(userId);
    const withQuiz = items.filter((i) => i.bestScore != null).length;
    const materialsOpened = items.filter((i) => i.materialsOpenedAt).length;
    const scored = items.filter((i) => i.bestScore != null && i.bestMaxScore);
    const avgScorePct = scored.length
      ? Math.round((scored.reduce((sum, i) => sum + i.bestScore / i.bestMaxScore, 0) / scored.length) * 100)
      : null;

    return {
      summary: {
        mediaTracked: items.length,
        materialsOpened,
        quizzesTaken: withQuiz,
        wordsLearned: items.reduce((sum, i) => sum + (i.lexiconLearnedCount || 0), 0),
        avgScorePct,
      },
      items,
    };
  },

  async openMaterials(userId, mediaId) {
    await findViewableMedia(mediaId, userId);
    await progressRepository.touchMaterials(userId, mediaId);
    return { ok: true };
  },

  async setLexiconLearned(userId, mediaId, learnedCount) {
    await findViewableMedia(mediaId, userId);
    const count = Number(learnedCount);
    if (!Number.isInteger(count) || count < 0) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'learnedCount must be a non-negative integer');
    }
    await progressRepository.setLexiconLearned(userId, mediaId, count);
    return { ok: true, learnedCount: count };
  },

  async getLearnedEntries(userId, mediaId) {
    await findViewableMedia(mediaId, userId);
    const entryIds = await progressRepository.listLearnedEntryIds(userId, mediaId);
    return { entryIds };
  },

  async getLearnedGrammar(userId, mediaId) {
    await findViewableMedia(mediaId, userId);
    return { patternIds: await progressRepository.listLearnedPatternIds(userId, mediaId) };
  },

  async setGrammarLearned(userId, mediaId, body) {
    await findViewableMedia(mediaId, userId);
    const ids = Array.isArray(body?.patternIds) ? body.patternIds.filter((id) => UUID.test(String(id))) : [];
    if (!ids.length || ids.length > 50 || typeof body?.learned !== 'boolean') {
      throw createHttpError(400, 'VALIDATION_ERROR', 'patternIds (uuid[]) и learned (boolean) обязательны');
    }
    const matched = await progressRepository.setPatternsLearned(userId, mediaId, ids, body.learned);
    if (!matched) throw createHttpError(404, 'NOT_FOUND', 'Правило не найдено');
    return { ok: true, learned: body.learned };
  },

  async myGrammar(userId) {
    return { items: await progressRepository.listMyGrammar(userId) };
  },

  async removeMyGrammar(userId, body) {
    const ids = Array.isArray(body?.patternIds) ? body.patternIds.filter((id) => UUID.test(String(id))) : [];
    if (!ids.length) throw createHttpError(400, 'VALIDATION_ERROR', 'patternIds обязательны');
    await progressRepository.removeMyGrammar(userId, ids);
    return { ok: true };
  },

  async setEntryLearned(userId, mediaId, entryId, learned) {
    await findViewableMedia(mediaId, userId);
    if (typeof learned !== 'boolean') {
      throw createHttpError(400, 'VALIDATION_ERROR', 'learned must be boolean');
    }
    const belongs = await progressRepository.entryBelongsToMedia(entryId, mediaId);
    if (!belongs) {
      throw createHttpError(404, 'NOT_FOUND', 'Word not found');
    }
    const learnedCount = await progressRepository.setEntryLearned(userId, mediaId, entryId, learned);
    return { ok: true, learned, learnedCount };
  },
};
