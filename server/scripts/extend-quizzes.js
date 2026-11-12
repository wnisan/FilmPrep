import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';
import { learningRepository } from '../src/repositories/learning.repository.js';
import { quizRepository } from '../src/repositories/quiz.repository.js';
import { formatQuestions } from '../src/services/quizGenerator.service.js';

const NEW_FORMATS = ['word_order', 'matching', 'listening'];

/** Adds «собери фразу», «сопоставь пары» and «что прозвучало» to quizzes that don't have them yet. */
export async function extendQuizzes({ log = console.log } = {}) {
  const { rows } = await pool.query(
    `SELECT q.id, q.media_id, m.title,
            ARRAY(SELECT DISTINCT question_type FROM quiz_questions qq WHERE qq.quiz_id = q.id) AS types
     FROM quizzes q JOIN media_items m ON m.id = q.media_id`,
  );
  let extended = 0;
  for (const quiz of rows) {
    const missing = NEW_FORMATS.filter((t) => !quiz.types.includes(t));
    if (!missing.length) continue;
    const [lexicon, phrases] = await Promise.all([
      learningRepository.getLexicon(quiz.media_id),
      learningRepository.getPhrases(quiz.media_id),
    ]);
    const questions = formatQuestions({ lexicon, phrases }).filter((q) => missing.includes(q.questionType));
    if (!questions.length) continue;
    await quizRepository.appendQuestions(quiz.id, questions);
    extended += 1;
    log(`[quiz-formats] ${quiz.title}: +${questions.map((q) => q.questionType).join(', ')}`);
  }
  return extended;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  extendQuizzes()
    .then(async (n) => {
      console.log(`[quiz-formats] extended ${n} quizzes`);
      await pool.end();
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
