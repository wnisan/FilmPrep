/**
 *   npm run materials:fill — for every prepared film: Russian for words and phrases
 *   that don't have it yet, and a quiz where there is none. No re-analysis, so
 *   learners' "learned" marks stay.
 */
import { pool } from '../src/db/pool.js';
import { mediaRepository } from '../src/repositories/media.repository.js';
import { quizRepository } from '../src/repositories/quiz.repository.js';
import { buildQuiz, filmPrepService } from '../src/services/filmPrep.service.js';

async function main() {
  const { rows } = await pool.query(
    `SELECT DISTINCT media_id FROM lexicon_entries`,
  );
  for (const { media_id: id } of rows) {
    const media = await mediaRepository.findById(id);
    if (!media) continue;
    const filled = await filmPrepService.fillTranslations(media);
    let quizNote = 'тест есть';
    const quiz = await quizRepository.findByMediaId(id);
    const count = quiz ? (await quizRepository.listQuestions(quiz.id)).length : 0;
    if (count < 5) {
      const made = await buildQuiz(media);
      quizNote = made.questions ? `тест создан (${made.questions} вопр.)` : 'тест не создан — мало материала';
    }
    console.log(
      `${media.title}: слов ${filled.words - filled.wordsLeft}/${filled.words}, ` +
        `фраз ${filled.phrases - filled.phrasesLeft}/${filled.phrases}, ${quizNote}`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
