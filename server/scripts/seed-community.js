import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';

/**
 * Демо-сообщество: несколько учеников с разным прогрессом (звания, достижения),
 * оценками, избранным и обсуждениями с ответами. Идемпотентно: если пользователи
 * уже есть — ничего не делает.
 *
 *   npm run demo:community
 */

const PASSWORD = 'demo12345';

const USERS = [
  {
    username: 'denis_polyglot',
    email: 'denis@filmprep.demo',
    displayName: 'Денис Орлов',
    cefr: 'C1',
    bio: 'Преподаю английский восемь лет. Собираю фильмы для учеников и разбираю с ними живую речь.',
    words: 120,
    quizScore: 1, // доля правильных ответов
    days: 9,
  },
  {
    username: 'anna_film',
    email: 'anna@filmprep.demo',
    displayName: 'Анна Ковалёва',
    cefr: 'B2',
    bio: 'Смотрю сериалы в оригинале уже два года. Любимое — Sherlock и всё от Pixar.',
    words: 60,
    quizScore: 0.84,
    days: 5,
  },
  {
    username: 'max_cinema',
    email: 'max@filmprep.demo',
    displayName: 'Максим',
    cefr: 'B1',
    bio: 'Учу английский для работы в IT. Начал с мультфильмов — оказалось, самое то.',
    words: 25,
    quizScore: 0.67,
    days: 3,
  },
  {
    username: 'kate_subs',
    email: 'kate@filmprep.demo',
    displayName: 'Катя',
    cefr: 'A2',
    bio: 'Только начинаю. Цель — посмотреть «Гарри Поттера» без перевода.',
    words: 8,
    quizScore: 0.6,
    days: 1,
  },
];

const RATINGS = {
  denis_polyglot: { Paddington: 5, Sintel: 5, 'Tears of Steel': 4, Arrival: 5, "The King's Speech": 5, 'Cosmos Laundromat': 4 },
  anna_film: { Paddington: 5, 'Sprite Fright': 5, Sintel: 4, 'Cosmos Laundromat': 4, Arrival: 4 },
  max_cinema: { 'Tears of Steel': 4, 'The Social Network': 4, Paddington: 4, 'Sprite Fright': 3 },
  kate_subs: { Paddington: 5, 'Cosmos Laundromat': 3 },
};

const FAVORITES = {
  denis_polyglot: ['Arrival', "The King's Speech", 'Sintel'],
  anna_film: ['Paddington', 'Sprite Fright', 'Arrival', 'Sintel'],
  max_cinema: ['Tears of Steel', 'The Social Network'],
  kate_subs: ['Paddington'],
};

// [film, author, text, hoursAgo, replies[]]
const THREADS = [
  ['Paddington', 'anna_film',
    'Идеальный фильм для старта: британский акцент, но говорят медленно и чётко. Фраза «If we are kind and polite, the world will be right» теперь мой девиз.', 70, [
      ['kate_subs', 'Смотрела с английскими субтитрами — поняла почти всё! Спасибо за совет.', 50],
      ['denis_polyglot', 'Показываю его ученикам A2. Обратите внимание на вежливые конструкции вроде «Would you mind…» — их там очень много.', 30, [
        ['anna_film', 'О, точно, а я даже не замечала. Пересмотрю с этим фокусом.', 26],
      ]],
    ]],
  ['Paddington', 'max_cinema', 'Словарь по фильму очень помог, особенно слова про Лондон и транспорт.', 20, []],
  ['Sintel', 'denis_polyglot',
    'Реплик мало, но каждая — отличный пример Past Simple и повелительного наклонения. Рекомендую пройти тест сразу после просмотра.', 96, [
      ['anna_film', 'Концовка… я не ожидала. Английский простой, а эмоций на полнометражный фильм.', 90],
    ]],
  ['Tears of Steel', 'max_cinema',
    'Живой разговорный английский и много жаргона вроде «We\'re on in one». Сначала пришлось смотреть с русскими субтитрами.', 60, [
      ['denis_polyglot', '«We\'re on in one» — «выходим через минуту», типичный жаргон съёмочной площадки. Хорошо, что в фильме такое есть.', 58, [
        ['max_cinema', 'Вот оно что! А я думал, это ошибка в субтитрах :)', 57],
      ]],
    ]],
  ['Sprite Fright', 'anna_film',
    'Британский подростковый сленг во всей красе. Для B1 местами быстро, но режим «обе дорожки» спасает.', 40, []],
  ['Cosmos Laundromat', 'kate_subs',
    'Сложновато для меня, но овечка Франк прекрасна. Выучила слово «laundromat» — прачечная самообслуживания.', 12, [
      ['anna_film', 'Попробуй оставить только английские субтитры и ставить паузу на новых словах. Клавиша R повторяет реплику.', 10],
    ]],
  ['Arrival', 'denis_polyglot',
    'Лучший фильм о языке вообще. Лингвистика, гипотеза Сепира — Уорфа… После просмотра хочется учить языки ещё сильнее.', 120, []],
  ['The Social Network', 'max_cinema',
    'Диалоги очень быстрые, Цукерберг говорит как пулемёт. Уровень B2 — честный, я пока смотрю по кусочкам.', 34, []],
];

async function filmIds() {
  const { rows } = await pool.query(`SELECT id, title FROM media_items WHERE status = 'published'`);
  return new Map(rows.map((r) => [r.title, r.id]));
}

async function createUsers() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const ids = {};
  for (const u of USERS) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, role, cefr_level, display_name, username, bio, created_at)
       VALUES ($1, $2, 'learner', $3, $4, $5, $6, NOW() - interval '30 days')
       RETURNING id`,
      [u.email, hash, u.cefr, u.displayName, u.username, u.bio],
    );
    ids[u.username] = rows[0].id;
  }
  return ids;
}

/** Spread activity over the last `days` days so day-streak badges work. */
function dayOffset(i, days) {
  return `${(days - 1 - (i % days))} days`;
}

async function seedLearning(user, userId, films) {
  const { rows: entries } = await pool.query(
    `SELECT le.id, le.media_id FROM lexicon_entries le
     JOIN media_items m ON m.id = le.media_id AND m.status = 'published'
     ORDER BY le.frequency DESC, le.id
     LIMIT $1`,
    [user.words],
  );
  for (const [i, e] of entries.entries()) {
    await pool.query(
      `INSERT INTO lexicon_learned (user_id, entry_id, created_at)
       VALUES ($1, $2, NOW() - $3::interval) ON CONFLICT DO NOTHING`,
      [userId, e.id, dayOffset(i, user.days)],
    );
  }

  const touched = new Set(entries.map((e) => e.media_id));
  const { rows: quizzes } = await pool.query(
    `SELECT q.id, q.media_id, array_agg(qq.id ORDER BY qq.sort_order) AS questions
     FROM quizzes q JOIN quiz_questions qq ON qq.quiz_id = q.id
     WHERE q.is_published = TRUE AND q.media_id = ANY($1)
     GROUP BY q.id`,
    [[...films.values()]],
  );
  const quizLimit = Math.max(1, Math.round(quizzes.length * Math.min(1, user.words / 60)));
  for (const [i, quiz] of quizzes.slice(0, quizLimit).entries()) {
    const correctCount = Math.round(quiz.questions.length * user.quizScore);
    const details = quiz.questions.map((questionId, n) => ({ questionId, correct: n < correctCount }));
    await pool.query(
      `INSERT INTO quiz_attempts (user_id, quiz_id, score, max_score, answers_json, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW() - $6::interval)`,
      [userId, quiz.id, correctCount, quiz.questions.length, { submitted: {}, details }, dayOffset(i, user.days)],
    );
    touched.add(quiz.media_id);
  }

  for (const mediaId of touched) {
    await pool.query(
      `INSERT INTO learning_progress (user_id, media_id, lexicon_learned_count, materials_opened_at, last_activity_at)
       VALUES ($1, $2,
         (SELECT COUNT(*) FROM lexicon_learned ll JOIN lexicon_entries le ON le.id = ll.entry_id
          WHERE ll.user_id = $1 AND le.media_id = $2),
         NOW() - interval '2 days', NOW() - interval '1 day')
       ON CONFLICT (user_id, media_id) DO NOTHING`,
      [userId, mediaId],
    );
  }
}

async function insertThread(films, ids, [film, author, text, hoursAgo, replies = []], parentId = null) {
  const mediaId = films.get(film);
  if (!mediaId) return;
  const { rows } = await pool.query(
    `INSERT INTO media_comments (media_id, user_id, parent_id, body, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW() - $5::interval, NOW() - $5::interval)
     RETURNING id`,
    [mediaId, ids[author], parentId, text, `${hoursAgo} hours`],
  );
  for (const [replyAuthor, replyText, replyHours, nested = []] of replies) {
    await insertThread(films, ids, [film, replyAuthor, replyText, replyHours, nested], rows[0].id);
  }
}

export async function seedCommunity() {
  const { rows } = await pool.query(`SELECT 1 FROM users WHERE username = $1`, [USERS[0].username]);
  if (rows.length) {
    console.log('[community] demo users already exist, skip');
    return;
  }

  const films = await filmIds();
  const ids = await createUsers();

  for (const user of USERS) {
    await seedLearning(user, ids[user.username], films);
  }

  for (const [username, ratings] of Object.entries(RATINGS)) {
    for (const [title, stars] of Object.entries(ratings)) {
      if (!films.has(title)) continue;
      await pool.query(
        `INSERT INTO media_ratings (user_id, media_id, stars) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [ids[username], films.get(title), stars],
      );
    }
  }

  for (const [username, titles] of Object.entries(FAVORITES)) {
    for (const title of titles) {
      if (!films.has(title)) continue;
      await pool.query(
        `INSERT INTO media_favorites (user_id, media_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [ids[username], films.get(title)],
      );
    }
  }

  for (const thread of THREADS) {
    await insertThread(films, ids, thread);
  }

  console.log(`[community] ${USERS.length} demo learners (password ${PASSWORD}): ${USERS.map((u) => u.username).join(', ')}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedCommunity()
    .then(() => pool.end())
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
