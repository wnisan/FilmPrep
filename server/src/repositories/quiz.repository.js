import { pool } from '../db/pool.js';

function mapQuiz(row) {
  if (!row) return null;
  return {
    id: row.id,
    mediaId: row.media_id,
    title: row.title,
    isPublished: row.is_published,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapQuestion(row, { includeAnswers = false } = {}) {
  if (!row) return null;
  const base = {
    id: row.id,
    quizId: row.quiz_id,
    questionType: row.question_type,
    prompt: row.prompt,
    options: row.options_json,
    sortOrder: row.sort_order,
    explanation: includeAnswers ? row.explanation : undefined,
  };
  if (includeAnswers) {
    base.correctAnswer = row.correct_answer_json;
  }
  return base;
}

function mapAttempt(row) {
  return {
    id: row.id,
    userId: row.user_id,
    quizId: row.quiz_id,
    score: Number(row.score),
    maxScore: Number(row.max_score),
    answers: row.answers_json,
    createdAt: row.created_at,
  };
}

export const quizRepository = {
  async findByMediaId(mediaId) {
    const { rows } = await pool.query(
      `SELECT id, media_id, title, is_published, created_at, updated_at
       FROM quizzes WHERE media_id = $1`,
      [mediaId],
    );
    return mapQuiz(rows[0]);
  },

  async upsertQuiz({ mediaId, title, isPublished }) {
    const { rows } = await pool.query(
      `INSERT INTO quizzes (media_id, title, is_published)
       VALUES ($1, $2, $3)
       ON CONFLICT (media_id) DO UPDATE SET
         title = EXCLUDED.title,
         is_published = EXCLUDED.is_published,
         updated_at = NOW()
       RETURNING id, media_id, title, is_published, created_at, updated_at`,
      [mediaId, title || 'Тест по фильму', isPublished ?? false],
    );
    return mapQuiz(rows[0]);
  },

  async listQuestions(quizId, { includeAnswers = false } = {}) {
    const { rows } = await pool.query(
      `SELECT id, quiz_id, question_type, prompt, options_json, correct_answer_json,
              explanation, sort_order
       FROM quiz_questions
       WHERE quiz_id = $1
       ORDER BY sort_order ASC, created_at ASC`,
      [quizId],
    );
    return rows.map((row) => mapQuestion(row, { includeAnswers }));
  },

  async appendQuestions(quizId, questions) {
    const { rows } = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1)::int AS last FROM quiz_questions WHERE quiz_id = $1',
      [quizId],
    );
    let order = rows[0].last;
    for (const q of questions) {
      order += 1;
      await pool.query(
        `INSERT INTO quiz_questions (
           quiz_id, question_type, prompt, options_json, correct_answer_json, explanation, sort_order
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          quizId,
          q.questionType,
          q.prompt,
          JSON.stringify(q.options ?? []),
          JSON.stringify(q.correctAnswer),
          q.explanation ?? null,
          order,
        ],
      );
    }
  },

  async replaceQuestions(quizId, questions) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM quiz_questions WHERE quiz_id = $1', [quizId]);
      for (let i = 0; i < questions.length; i += 1) {
        const q = questions[i];
        await client.query(
          `INSERT INTO quiz_questions (
             quiz_id, question_type, prompt, options_json, correct_answer_json,
             explanation, sort_order
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            quizId,
            q.questionType,
            q.prompt,
            JSON.stringify(q.options ?? []),
            JSON.stringify(q.correctAnswer),
            q.explanation ?? null,
            q.sortOrder ?? i,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async getQuestionsWithAnswers(quizId) {
    const { rows } = await pool.query(
      `SELECT id, quiz_id, question_type, prompt, options_json, correct_answer_json,
              explanation, sort_order
       FROM quiz_questions WHERE quiz_id = $1`,
      [quizId],
    );
    return rows.map((row) => mapQuestion(row, { includeAnswers: true }));
  },

  async createAttempt({ userId, quizId, score, maxScore, answers }) {
    const { rows } = await pool.query(
      `INSERT INTO quiz_attempts (user_id, quiz_id, score, max_score, answers_json)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, quiz_id, score, max_score, answers_json, created_at`,
      [userId, quizId, score, maxScore, JSON.stringify(answers)],
    );
    return mapAttempt(rows[0]);
  },

  async listAttemptsForUserQuiz(userId, quizId) {
    const { rows } = await pool.query(
      `SELECT id, user_id, quiz_id, score, max_score, answers_json, created_at
       FROM quiz_attempts
       WHERE user_id = $1 AND quiz_id = $2
       ORDER BY created_at DESC`,
      [userId, quizId],
    );
    return rows.map(mapAttempt);
  },

  async getBestAttempt(userId, quizId) {
    const { rows } = await pool.query(
      `SELECT id, user_id, quiz_id, score, max_score, answers_json, created_at
       FROM quiz_attempts
       WHERE user_id = $1 AND quiz_id = $2
       ORDER BY (score / NULLIF(max_score, 0)) DESC, created_at DESC
       LIMIT 1`,
      [userId, quizId],
    );
    return rows[0] ? mapAttempt(rows[0]) : null;
  },
};
