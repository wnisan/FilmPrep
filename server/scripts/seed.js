import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';
import { ROLES } from '../src/constants.js';
import { uploadsRoot } from '../src/middleware/upload.js';
import { subtitlesRepository } from '../src/repositories/subtitles.repository.js';
import { jobsRepository } from '../src/repositories/jobs.repository.js';
import { processingService } from '../src/services/processing.service.js';
import { quizService } from '../src/services/quiz.service.js';
import { applyFilmFacts } from './film-facts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEMO_MEDIA = [
  {
    title: 'The Social Network',
    description:
      'Студент Гарварда Марк Цукерберг создаёт сайт, который превратится в Facebook, и теряет лучшего друга.',
    synopsis:
      'Осень 2003 года. Второкурсник Гарварда Марк Цукерберг после неудачного свидания за одну ночь пишет сайт, который обрушивает университетскую сеть. Вскоре близнецы Уинклвоссы предлагают ему поработать над их социальной сетью, но Марк запускает собственный проект — TheFacebook. Деньги на старт даёт его лучший друг Эдуардо Саверин.\n\nСайт стремительно растёт: от Гарварда до университетов всей страны. В жизнь Марка входит создатель Napster Шон Паркер, который обещает превратить проект в компанию на миллиард долларов. Дружба с Эдуардо трещит, а Уинклвоссы обвиняют Марка в краже идеи.\n\nИстория рассказана через два судебных процесса, где бывшие партнёры выясняют, кому на самом деле принадлежит Facebook. Быстрые диалоги Аарона Соркина, деловая и юридическая лексика и студенческий сленг делают фильм отличной тренировкой для уровня B1–B2.',
    year: 2010,
    genres: ['drama', 'biography'],
    themes: ['technology', 'ambition', 'friendship'],
    recommendedLevel: 'B1',
    posterUrl: '/posters/social-network.png',
    externalWatchUrl: 'https://www.imdb.com/title/tt1285016/',
    videoUrl: null,
    status: 'published',
  },
  {
    title: 'Paddington',
    description:
      'Вежливый медвежонок из Перу приезжает в Лондон и находит новую семью.',
    synopsis:
      'В дремучих лесах Перу живёт медвежонок, которого дядя и тётя научили английскому и любви к апельсиновому джему. Когда землетрясение разрушает их дом, тётя Люси отправляет племянника в Лондон — город, где, по её словам, всегда рады путникам.\n\nНа вокзале Паддингтон одинокого медвежонка в красной шляпе замечает семья Браунов. Они называют его в честь вокзала и приводят к себе домой — «всего на одну ночь». Паддингтон изо всех сил старается быть вежливым, но его появление превращает жизнь Браунов в череду смешных катастроф.\n\nТем временем за редким медведем охотится таксидермист из Музея естествознания. Добрый семейный фильм с ясной британской речью, бытовыми диалогами и простой грамматикой — хороший старт для уровня A2–B1.',
    year: 2014,
    genres: ['comedy', 'family'],
    themes: ['family', 'kindness', 'london'],
    recommendedLevel: 'A2',
    posterUrl: '/posters/paddington.jpg',
    externalWatchUrl: 'https://www.imdb.com/title/tt1109624/',
    videoUrl: null,
    status: 'published',
  },
  {
    title: "The King's Speech",
    description:
      'Будущий король Георг VI вместе с необычным логопедом борется с заиканием накануне войны.',
    synopsis:
      'Принц Альберт, второй сын короля Георга V, с детства заикается, и каждое публичное выступление превращается для него в мучение. Жена Елизавета, отчаявшись найти помощь у придворных врачей, приводит мужа к австралийскому логопеду Лайонелу Логу, чьи методы кажутся возмутительно неформальными.\n\nПосле смерти отца и отречения старшего брата Эдуарда Альберт неожиданно становится королём Георгом VI. Британия стоит на пороге войны с Германией, и стране нужен голос, которому поверят миллионы.\n\nФильм о дружбе, преодолении страха и цене публичной речи. Формальный британский английский, королевский этикет и богатый словарь делают его хорошим выбором для уровня B2 и выше.',
    year: 2010,
    genres: ['drama', 'history'],
    themes: ['speech', 'courage', 'royalty'],
    recommendedLevel: 'B2',
    posterUrl: '/posters/kings-speech.jpg',
    externalWatchUrl: 'https://www.imdb.com/title/tt1504320/',
    videoUrl: null,
    status: 'published',
  },
  {
    title: 'Arrival',
    description:
      'Лингвист пытается понять язык пришельцев, пока мир стоит на грани войны.',
    synopsis:
      'Двенадцать гигантских инопланетных кораблей одновременно зависают над разными точками Земли. Военные привлекают лингвиста Луизу Бэнкс и физика Иэна Доннелли, чтобы выяснить главное: зачем пришельцы прилетели.\n\nЛуиза шаг за шагом расшифровывает письменность гептаподов — круглые символы, в которых нет начала и конца. Чем глубже она погружается в чужой язык, тем сильнее меняется её восприятие времени, а в памяти всплывают странные образы дочери.\n\nТем временем страны перестают доверять друг другу, и хрупкий контакт может обернуться войной. Умная фантастика о языке, памяти и выборе. Абстрактная и научная лексика подойдёт уровню B2–C1.',
    year: 2016,
    genres: ['sci-fi', 'drama'],
    themes: ['language', 'time', 'first contact'],
    recommendedLevel: 'B2',
    posterUrl: '/posters/arrival.jpg',
    externalWatchUrl: 'https://www.imdb.com/title/tt2543164/',
    videoUrl: null,
    status: 'published',
  },
  {
    title: 'Черновик: без названия',
    description: '',
    synopsis: '',
    year: 2026,
    genres: ['drama'],
    themes: ['demo'],
    recommendedLevel: 'B1',
    posterUrl: null,
    externalWatchUrl: null,
    videoUrl: null,
    status: 'draft',
  },
];

async function upsertAdmin() {
  const email = 'admin@filmprep.local';
  const password = 'admin12345';
  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows[0]) {
    await pool.query(
      `UPDATE users SET role = $2, password_hash = $3, display_name = $4, updated_at = NOW()
       WHERE email = $1`,
      [email, ROLES.ADMIN, passwordHash, 'FilmPrep Admin'],
    );
    console.log(`[seed] admin updated: ${email} / ${password}`);
    return;
  }

  await pool.query(
    `INSERT INTO users (email, password_hash, role, cefr_level, display_name, username)
     VALUES ($1, $2, $3, $4, $5, 'admin')`,
    [email, passwordHash, ROLES.ADMIN, 'C1', 'FilmPrep Admin'],
  );
  console.log(`[seed] admin created: ${email} / ${password}`);
}

async function renameLegacyDemoRows() {
  await pool.query(
    `UPDATE media_items SET title = 'Черновик: без названия', description = ''
     WHERE title = 'Draft: Untitled Pilot'`,
  );
  await pool.query(
    `UPDATE quizzes SET title = replace(title, 'film quiz', 'тест по фильму')
     WHERE title LIKE '%film quiz'`,
  );
  await pool.query(
    `UPDATE media_items SET video_url = NULL
     WHERE video_url LIKE '%youtube.com%' OR video_url LIKE '%youtu.be%'`,
  );
}

async function seedMedia() {
  await renameLegacyDemoRows();
  for (const item of DEMO_MEDIA) {
    const found = await pool.query(
      'SELECT id, video_url, poster_url, synopsis FROM media_items WHERE title = $1',
      [item.title],
    );
    const row = found.rows[0];
    if (row) {
      const updates = [];
      if (item.videoUrl && !row.video_url) {
        await pool.query(`UPDATE media_items SET video_url = $2 WHERE id = $1`, [row.id, item.videoUrl]);
        updates.push('video');
      }
      if (item.posterUrl && !row.poster_url) {
        await pool.query(`UPDATE media_items SET poster_url = $2 WHERE id = $1`, [row.id, item.posterUrl]);
        updates.push('poster');
      }
      if (item.synopsis && !row.synopsis) {
        await pool.query(
          `UPDATE media_items SET synopsis = $2, description = $3 WHERE id = $1`,
          [row.id, item.synopsis, item.description],
        );
        updates.push('descriptions');
      }
      console.log(
        updates.length
          ? `[seed] updated ${item.title}: ${updates.join(', ')}`
          : `[seed] skip media: ${item.title}`,
      );
      continue;
    }

    await pool.query(
      `INSERT INTO media_items (
         title, description, year, genres, themes, language,
         recommended_level, poster_url, external_watch_url, video_url, status, synopsis
       ) VALUES ($1,$2,$3,$4,$5,'en',$6,$7,$8,$9,$10,$11)`,
      [
        item.title,
        item.description,
        item.year,
        item.genres,
        item.themes,
        item.recommendedLevel,
        item.posterUrl,
        item.externalWatchUrl,
        item.videoUrl,
        item.status,
        item.synopsis,
      ],
    );
    console.log(`[seed] media: ${item.title} (${item.status})`);
  }
}

async function seedMediaSubtitles(title, fixtureFile) {
  const { rows } = await pool.query(`SELECT id FROM media_items WHERE title = $1 LIMIT 1`, [title]);
  const media = rows[0];
  if (!media) {
    console.log(`[seed] ${title} not found, skip subtitles`);
    return;
  }

  const existing = await subtitlesRepository.findLatestByMedia(media.id);
  if (existing) {
    console.log(`[seed] ${title} already has subtitles, re-processing…`);
    const job = await jobsRepository.create({
      mediaId: media.id,
      subtitleId: existing.id,
    });
    await processingService.runJob(job.id);
    return;
  }

  const fixturePath = path.resolve(__dirname, '../fixtures', fixtureFile);
  const filename = `seed-${fixtureFile.replace('.srt', '')}-${Date.now()}.srt`;
  await fs.mkdir(uploadsRoot, { recursive: true });
  await fs.copyFile(fixturePath, path.join(uploadsRoot, filename));

  const subtitle = await subtitlesRepository.create({
    mediaId: media.id,
    originalFilename: fixtureFile,
    storagePath: filename,
    format: 'srt',
  });

  const job = await jobsRepository.create({
    mediaId: media.id,
    subtitleId: subtitle.id,
  });
  await processingService.runJob(job.id);
  console.log(`[seed] ${title} subtitles processed`);
}

async function seedPaddingtonSubtitles() {
  await seedMediaSubtitles('Paddington', 'paddington.demo.srt');
}

async function seedSocialNetworkSubtitles() {
  await seedMediaSubtitles('The Social Network', 'social-network.demo.srt');
}

async function seedPaddingtonQuiz() {
  const { rows } = await pool.query(
    `SELECT id FROM media_items WHERE title = 'Paddington' LIMIT 1`,
  );
  const media = rows[0];
  if (!media) {
    console.log('[seed] Paddington not found, skip quiz');
    return;
  }

  await quizService.upsertAdminQuiz(media.id, {
    title: 'Paddington — тест по фильму',
    isPublished: true,
    questions: [
      {
        questionType: 'single_choice',
        prompt: 'Who is Paddington?',
        options: ['A helpful robot', 'A bear from Peru', 'A London detective', 'A school teacher'],
        correctAnswer: 'A bear from Peru',
        explanation: 'Paddington is a kind bear who comes to London from Peru.',
        sortOrder: 0,
      },
      {
        questionType: 'true_false',
        prompt: 'Paddington keeps a marmalade sandwich under his hat.',
        options: [true, false],
        correctAnswer: true,
        explanation: 'This is one of his famous habits.',
        sortOrder: 1,
      },
      {
        questionType: 'single_choice',
        prompt: 'Where does Paddington look for a home?',
        options: ['Paris', 'New York', 'London', 'Tokyo'],
        correctAnswer: 'London',
        explanation: 'The story is set in London.',
        sortOrder: 2,
      },
      {
        questionType: 'fill_blank',
        prompt: 'Complete: “Please don’t _____ up on me.” (phrasal verb)',
        options: [],
        correctAnswer: ['give', 'Give'],
        explanation: 'give up means to stop trying / abandon.',
        sortOrder: 3,
      },
      {
        questionType: 'single_choice',
        prompt: 'Which quality does Paddington show most in conversations?',
        options: ['Rudeness', 'Politeness', 'Greed', 'Indifference'],
        correctAnswer: 'Politeness',
        explanation: 'He tries to be polite and follow good manners.',
        sortOrder: 4,
      },
      {
        questionType: 'true_false',
        prompt: 'Paddington arrives after a strange accident at the station.',
        options: [true, false],
        correctAnswer: true,
        explanation: 'He mentions a strange accident at the station in the demo lines.',
        sortOrder: 5,
      },
    ],
  });

  console.log('[seed] Paddington quiz ready');
}

async function seedSocialNetworkQuiz() {
  const { rows } = await pool.query(
    `SELECT id FROM media_items WHERE title = 'The Social Network' LIMIT 1`,
  );
  const media = rows[0];
  if (!media) {
    console.log('[seed] The Social Network not found, skip quiz');
    return;
  }

  await quizService.upsertAdminQuiz(media.id, {
    title: 'The Social Network — тест по фильму',
    isPublished: true,
    questions: [
      {
        questionType: 'single_choice',
        prompt: 'What is The Social Network mainly about?',
        options: [
          'The creation of Facebook',
          'A bear travelling to London',
          'A royal speech',
          'First contact with aliens',
        ],
        correctAnswer: 'The creation of Facebook',
        explanation: 'The plot follows the founding of Facebook and related conflicts.',
        sortOrder: 0,
      },
      {
        questionType: 'true_false',
        prompt: 'Ambition, friendship and legal disputes are important themes.',
        options: [true, false],
        correctAnswer: true,
        explanation: 'These are key storylines in the film.',
        sortOrder: 1,
      },
      {
        questionType: 'single_choice',
        prompt: 'Which CEFR level does FilmPrep recommend for this film?',
        options: ['A1', 'A2', 'B1', 'C2'],
        correctAnswer: 'B1',
        explanation: 'In the catalog recommendedLevel is B1.',
        sortOrder: 2,
      },
      {
        questionType: 'fill_blank',
        prompt: 'Complete the phrasal verb: “We must _____ out the lawsuit…”',
        options: [],
        correctAnswer: ['figure', 'Figure'],
        explanation: 'figure out means to understand / solve.',
        sortOrder: 3,
      },
      {
        questionType: 'single_choice',
        prompt: 'According to the demo lines, what matters more than ambition?',
        options: ['Luck only', 'Evidence', 'Silence', 'Fashion'],
        correctAnswer: 'Evidence',
        explanation: '“Evidence matters more than ambition…”',
        sortOrder: 4,
      },
      {
        questionType: 'true_false',
        prompt: 'The characters discuss investors, contracts and startup reputation.',
        options: [true, false],
        correctAnswer: true,
        explanation: 'These topics appear in the demo subtitles.',
        sortOrder: 5,
      },
    ],
  });

  console.log('[seed] The Social Network quiz ready');
}

async function main() {
  await upsertAdmin();
  await seedMedia();
  await seedPaddingtonSubtitles();
  await seedSocialNetworkSubtitles();
  await seedPaddingtonQuiz();
  await seedSocialNetworkQuiz();
  await applyFilmFacts();
  console.log('[seed] done');
}

main()
  .then(async () => {
    await pool.end();
  })
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
