import { z } from 'zod';
import { mediaRepository } from '../repositories/media.repository.js';
import { quizRepository } from '../repositories/quiz.repository.js';
import { progressRepository } from '../repositories/progress.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { findViewableMedia } from '../utils/mediaAccess.js';

const MIN_QUESTIONS = 5;

function normalizeAnswer(value) {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value;
  return value;
}

const sentenceKey = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}']+/gu, ' ')
    .trim();

function answersEqual(expected, actual, questionType) {
  if (questionType === 'word_order') {
    return sentenceKey(expected) === sentenceKey(Array.isArray(actual) ? actual.join(' ') : actual);
  }
  if (questionType === 'matching') {
    if (!expected || typeof expected !== 'object' || !actual || typeof actual !== 'object') return false;
    return Object.entries(expected).every(([left, right]) => actual[left] === right);
  }
  if (Array.isArray(expected)) {
    const actualNorm = normalizeAnswer(actual);
    return expected.some((item) => normalizeAnswer(item) === actualNorm);
  }
  return normalizeAnswer(expected) === normalizeAnswer(actual);
}

const submitSchema = z.object({
  answers: z.record(z.string().uuid(), z.any()),
});

export const quizService = {
  async getForLearner(mediaId, userId) {
    await findViewableMedia(mediaId, userId);

    const quiz = await quizRepository.findByMediaId(mediaId);
    if (!quiz || !quiz.isPublished) {
      throw createHttpError(404, 'QUIZ_NOT_READY', 'Quiz is not available yet');
    }

    const questions = await quizRepository.listQuestions(quiz.id, { includeAnswers: false });
    if (questions.length < MIN_QUESTIONS) {
      throw createHttpError(404, 'QUIZ_NOT_READY', 'Quiz does not have enough questions');
    }

    await progressRepository.touchActivity(userId, mediaId);

    const best = await quizRepository.getBestAttempt(userId, quiz.id);
    const attempts = await quizRepository.listAttemptsForUserQuiz(userId, quiz.id);

    return {
      quiz: {
        id: quiz.id,
        mediaId: quiz.mediaId,
        title: quiz.title,
        questionCount: questions.length,
      },
      questions,
      bestAttempt: best,
      attemptsCount: attempts.length,
    };
  },

  async submitAttempt(mediaId, userId, body) {
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'Invalid answers payload');
    }

    await findViewableMedia(mediaId, userId);

    const quiz = await quizRepository.findByMediaId(mediaId);
    if (!quiz || !quiz.isPublished) {
      throw createHttpError(404, 'QUIZ_NOT_READY', 'Quiz is not available yet');
    }

    const questions = await quizRepository.getQuestionsWithAnswers(quiz.id);
    if (questions.length < MIN_QUESTIONS) {
      throw createHttpError(404, 'QUIZ_NOT_READY', 'Quiz does not have enough questions');
    }

    const { answers } = parsed.data;
    let score = 0;
    const details = [];

    for (const question of questions) {
      const given = answers[question.id];
      const correct = answersEqual(question.correctAnswer, given, question.questionType);
      if (correct) score += 1;
      details.push({
        questionId: question.id,
        correct,
        explanation: question.explanation || null,
        correctAnswer: question.correctAnswer,
        givenAnswer: given ?? null,
      });
    }

    const maxScore = questions.length;
    const attempt = await quizRepository.createAttempt({
      userId,
      quizId: quiz.id,
      score,
      maxScore,
      answers: { submitted: answers, details },
    });

    await progressRepository.touchActivity(userId, mediaId);

    return {
      attempt: {
        id: attempt.id,
        score: attempt.score,
        maxScore: attempt.maxScore,
        percent: Math.round((attempt.score / attempt.maxScore) * 100),
        createdAt: attempt.createdAt,
      },
      details,
    };
  },

  async upsertAdminQuiz(mediaId, { title, isPublished, questions }) {
    const media = await mediaRepository.findById(mediaId);
    if (!media) {
      throw createHttpError(404, 'NOT_FOUND', 'Media not found');
    }

    const quiz = await quizRepository.upsertQuiz({
      mediaId,
      title,
      isPublished,
    });

    if (Array.isArray(questions)) {
      await quizRepository.replaceQuestions(quiz.id, questions);
    }

    const savedQuestions = await quizRepository.listQuestions(quiz.id, {
      includeAnswers: true,
    });

    return { quiz, questions: savedQuestions };
  },

  async getAdminQuiz(mediaId) {
    const quiz = await quizRepository.findByMediaId(mediaId);
    if (!quiz) {
      return { quiz: null, questions: [] };
    }
    const questions = await quizRepository.listQuestions(quiz.id, { includeAnswers: true });
    return { quiz, questions };
  },
};
