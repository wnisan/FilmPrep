/**
 * Imports open-licensed films (Blender Open Movies, CC BY) for the demo:
 * download → HLS → storage (S3 or local) → EN/RU subtitles → NLP → English quiz.
 *
 *   npm run demo:import                 all films
 *   npm run demo:import -- tos,sintel   only some (keys below)
 *   npm run demo:import -- --force-video   re-transcode video
 *   npm run demo:import -- --reprocess     re-run subtitle analysis
 *   npm run demo:import -- --quiz          overwrite demo quizzes
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { pool } from '../src/db/pool.js';
import { config } from '../src/config/index.js';
import { uploadsRoot } from '../src/middleware/upload.js';
import { mediaRepository } from '../src/repositories/media.repository.js';
import { subtitlesRepository } from '../src/repositories/subtitles.repository.js';
import { jobsRepository } from '../src/repositories/jobs.repository.js';
import { processingService } from '../src/services/processing.service.js';
import { quizService } from '../src/services/quiz.service.js';
import { videoService } from '../src/services/video.service.js';
import { applyFilmFacts } from './film-facts.js';
import { subtitleTranslationService } from '../src/services/subtitleTranslation.service.js';

const cacheDir = path.join(uploadsRoot, 'demo-cache');
const ARCHIVE = 'https://archive.org/download';

const FILMS = [
  {
    key: 'tos',
    title: 'Tears of Steel',
    year: 2012,
    description:
      'Амстердам будущего захвачен роботами. Учёные пытаются спасти мир, вернувшись к одному неудачному расставанию.',
    synopsis:
      'Будущее. Амстердам лежит в руинах после нашествия гигантских роботов. Небольшая группа учёных и бойцов укрылась в старой церкви и готовит отчаянный план.\n\nВсё началось много лет назад на мосту, где Селия рассталась с Томом после ссоры. Учёные создают симуляцию того самого дня, чтобы Том смог сказать слова, которые не сказал тогда, — и, возможно, остановить войну.\n\nКороткий научно-фантастический фильм Blender Foundation (лицензия CC BY). Живые диалоги, разговорные фразы и эмоциональная лексика — хорошая тренировка для уровня B1.',
    genres: ['sci-fi', 'action'],
    themes: ['science fiction', 'robots', 'relationships'],
    recommendedLevel: 'B1',
    posterUrl: '/posters/tears-of-steel.jpg',
    externalWatchUrl: 'https://mango.blender.org/',
    video: 'https://download.blender.org/demo/movies/ToS/tears_of_steel_720p.mov',
    subtitles: {
      en: 'https://download.blender.org/demo/movies/ToS/subtitles/TOS-en.srt',
      ru: 'https://download.blender.org/demo/movies/ToS/subtitles/TOS-ru.srt',
    },
    quiz: [
      {
        questionType: 'single_choice',
        prompt: 'In which city does the story take place?',
        options: ['Amsterdam', 'London', 'Paris', 'Berlin'],
        correctAnswer: 'Amsterdam',
        explanation: 'The film is set in a future, ruined Amsterdam.',
      },
      {
        questionType: 'fill_blank',
        prompt: 'Complete Celia\'s line from the first scene: "You\'re a ____, Thom!"',
        correctAnswer: 'jerk',
        explanation: '"Jerk" is an informal word for a rude, unkind person.',
      },
      {
        questionType: 'true_false',
        prompt: 'The scientists recreate the moment when Celia and Thom broke up.',
        options: [true, false],
        correctAnswer: true,
        explanation: 'They build a simulation of the bridge scene to change what happened.',
      },
      {
        questionType: 'single_choice',
        prompt: 'What do the people in the film have to fight against?',
        options: ['Robots', 'Zombies', 'Aliens', 'Dragons'],
        correctAnswer: 'Robots',
        explanation: 'Giant robots have taken over the city.',
      },
      {
        questionType: 'single_choice',
        prompt: 'What does Thom want to say to Celia?',
        options: ['That he is sorry', 'That he is leaving', 'That he hates robots', 'That he is a scientist'],
        correctAnswer: 'That he is sorry',
        explanation: 'The whole plan is about Thom apologising to Celia.',
      },
    ],
  },
  {
    key: 'sprite',
    title: 'Sprite Fright',
    year: 2021,
    description:
      'Компания подростков приезжает на вечеринку в лес и встречает его хозяев — маленьких и совсем не милых спрайтов.',
    synopsis:
      'Британия, 1980-е. Шумная компания подростков отправляется в лес, чтобы как следует оторваться. С ними увязывается Рубин — тихий любитель природы, который знает латинское название каждой улитки.\n\nОчень скоро выясняется, что лес обитаем: крошечные грибные спрайты не терпят тех, кто топчет, мусорит и ломает. Весёлый пикник превращается в комедийный хоррор, где выжить помогает уважение к природе.\n\nКороткометражка Blender Studio (лицензия CC BY). Британский акцент, подростковый сленг и много коротких реплик — уровень B1.',
    genres: ['comedy', 'horror', 'animation'],
    themes: ['nature', 'friendship', 'teenagers'],
    recommendedLevel: 'B1',
    posterUrl: '/posters/sprite-fright.jpg',
    externalWatchUrl: 'https://studio.blender.org/films/sprite-fright/',
    video: `${ARCHIVE}/sprite-fright-blender-open-movie_202406/Sprite%20Fright%20-%20Blender%20Open%20Movie.mp4`,
    subtitles: {
      en: `${ARCHIVE}/sprite-fright-blender-open-movie_202406/%5BEnglish%5D%20Sprite%20Fright%20-%20Blender%20Open%20Movie.str`,
      ru: `${ARCHIVE}/sprite-fright-blender-open-movie_202406/%5BRussian%5D%20Sprite%20Fright%20-%20Blender%20Open%20Movie.srt`,
    },
    quiz: [
      {
        questionType: 'single_choice',
        prompt: 'Where do the teenagers go to have a party?',
        options: ['To a forest', 'To the beach', 'To a castle', 'To a school'],
        correctAnswer: 'To a forest',
        explanation: 'The whole story happens in the woods.',
      },
      {
        questionType: 'single_choice',
        prompt: 'What are the sprites?',
        options: ['Tiny forest creatures', 'Robots', 'Ghosts of old teachers', 'Police officers'],
        correctAnswer: 'Tiny forest creatures',
        explanation: 'The sprites are small mushroom-like creatures who live in the forest.',
      },
      {
        questionType: 'fill_blank',
        prompt: 'Complete the line: "Latin ____ bonus-points!"',
        correctAnswer: 'name',
        explanation: 'Rubin uses the Latin name of the snail: cornu aspersum.',
      },
      {
        questionType: 'true_false',
        prompt: 'The sprites protect the forest from people who damage it.',
        options: [true, false],
        correctAnswer: true,
        explanation: 'They attack the teenagers who treat nature badly.',
      },
      {
        questionType: 'single_choice',
        prompt: 'What is "cornu aspersum"?',
        options: ['A snail', 'A mushroom', 'A bird', 'A type of tree'],
        correctAnswer: 'A snail',
        explanation: 'It is the Latin name of the garden snail.',
      },
    ],
  },
  {
    key: 'sintel',
    title: 'Sintel',
    year: 2010,
    description:
      'Одинокая девушка отправляется через горы и снега на поиски маленького дракона, которого у неё похитили.',
    synopsis:
      'Сразу после бури странница Синтел находит в горах раненого детёныша дракона. Она выхаживает его, даёт ему имя Скейлз, и они становятся неразлучны.\n\nОднажды взрослый дракон уносит малыша. Синтел отправляется в долгое и опасное путешествие через снега, пустыни и горы, чтобы вернуть друга. По дороге она встречает старого шамана, который предупреждает: одному в пути не выжить.\n\nЭпическое фэнтези Blender Foundation (лицензия CC BY) с неожиданным финалом. Реплик немного, они короткие и чёткие — удобно для уровня A2.',
    genres: ['fantasy', 'animation', 'adventure'],
    themes: ['dragons', 'journey', 'loss'],
    recommendedLevel: 'A2',
    posterUrl: '/posters/sintel.jpg',
    externalWatchUrl: 'https://durian.blender.org/',
    video: `${ARCHIVE}/Sintel/sintel-2048-stereo.mp4`,
    subtitles: {
      en: 'https://durian.blender.org/wp-content/content/subtitles/sintel_en.srt',
      ru: 'https://durian.blender.org/wp-content/content/subtitles/sintel_ru.srt',
    },
    quiz: [
      {
        questionType: 'single_choice',
        prompt: 'What is the name of Sintel\'s baby dragon?',
        options: ['Scales', 'Smoky', 'Fire', 'Wings'],
        correctAnswer: 'Scales',
        explanation: 'Sintel calls the little dragon Scales.',
      },
      {
        questionType: 'single_choice',
        prompt: 'Who takes the baby dragon away?',
        options: ['An adult dragon', 'A hunter', 'The shaman', 'A group of soldiers'],
        correctAnswer: 'An adult dragon',
        explanation: 'A big dragon grabs Scales and flies away.',
      },
      {
        questionType: 'fill_blank',
        prompt: 'Complete the shaman\'s words: "You\'re a fool for traveling ____."',
        correctAnswer: 'alone',
        explanation: 'He warns Sintel that travelling alone is dangerous.',
      },
      {
        questionType: 'true_false',
        prompt: 'At the end, Sintel understands that the big dragon was Scales.',
        options: [true, false],
        correctAnswer: true,
        explanation: 'Scales has grown up during the years of her search.',
      },
      {
        questionType: 'single_choice',
        prompt: 'What has happened to Sintel by the end of her journey?',
        options: ['She has become much older', 'She has become a dragon', 'She has found her family', 'She has lost her memory'],
        correctAnswer: 'She has become much older',
        explanation: 'Her search took many years.',
      },
    ],
  },
  {
    key: 'cosmos',
    title: 'Cosmos Laundromat',
    year: 2015,
    description:
      'Разочарованный в жизни баран Франк встречает загадочного продавца, который предлагает ему целую новую жизнь.',
    synopsis:
      'На пустынном острове живёт баран Франк. Он одинок, его никто не понимает, и он уверен, что жизнь не удалась.\n\nВ самый тёмный момент перед ним появляется странный торговец Виктор в костюме. Он предлагает Франку сделку, от которой трудно отказаться: целую новую жизнь, любую, какую тот захочет. Но у каждой сделки есть цена.\n\nПервая глава проекта Blender Institute (лицензия CC BY), сюрреалистичная и смешная. Вежливые обращения, торговые фразы и диалог двух очень разных героев — уровень B1.',
    genres: ['comedy', 'fantasy', 'animation'],
    themes: ['meaning of life', 'choice', 'loneliness'],
    recommendedLevel: 'B1',
    posterUrl: '/posters/cosmos-laundromat.jpg',
    externalWatchUrl: 'https://gooseberry.blender.org/',
    video: `${ARCHIVE}/CosmosLaundromatFirstCycle/Cosmos%20Laundromat%20-%20First%20Cycle%20(1080p).mp4`,
    subtitles: {
      en: `${ARCHIVE}/CosmosLaundromatFirstCycle/CosmosLaundromat-FirstCycle1080p.en.srt`,
      // no official Russian track — translated by the LLM if enabled
    },
    quiz: [
      {
        questionType: 'single_choice',
        prompt: 'What kind of animal is Franck?',
        options: ['A sheep', 'A goat', 'A dog', 'A horse'],
        correctAnswer: 'A sheep',
        explanation: 'Franck is a sheep living on a lonely island.',
      },
      {
        questionType: 'fill_blank',
        prompt: 'Complete Victor\'s first words: "Excuse me, ____?"',
        correctAnswer: 'sir',
        explanation: '"Sir" is a polite way to address a man.',
      },
      {
        questionType: 'true_false',
        prompt: 'At the beginning of the film, Franck is happy with his life.',
        options: [true, false],
        correctAnswer: false,
        explanation: 'Franck is lonely and unhappy.',
      },
      {
        questionType: 'single_choice',
        prompt: 'What is the salesman\'s real name?',
        options: ['Victor', 'Hector', 'Casper', 'Franck'],
        correctAnswer: 'Victor',
        explanation: 'Franck keeps getting it wrong: "Hector", "Casper" — but it is Victor.',
      },
      {
        questionType: 'fill_blank',
        prompt: 'Complete Victor\'s words: "Just like me, you\'re... a lone ____."',
        correctAnswer: 'wolf',
        explanation: '"A lone wolf" is someone who prefers to be alone.',
      },
      {
        questionType: 'single_choice',
        prompt: 'What does Victor promise Franck?',
        options: [
          'All the lives he has ever wanted',
          'A lot of money',
          'A new farm',
          'A trip to the city',
        ],
        correctAnswer: 'All the lives he has ever wanted',
        explanation: 'Victor says: "All the lives you\'ve ever wanted."',
      },
    ],
  },
];

function log(msg) {
  console.log(`[demo] ${msg}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Download with resume: archive.org sometimes drops long connections. */
async function download(url, target) {
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
  const expected = Number(head?.headers.get('content-length')) || 0;
  const stat = await fsp.stat(target).catch(() => null);
  if (stat && (!expected || stat.size === expected)) {
    return target;
  }

  const tmp = `${target}.part`;
  let lastLogged = -10;

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const have = (await fsp.stat(tmp).catch(() => null))?.size || 0;
    if (expected && have === expected) break;
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: have ? { Range: `bytes=${have}-` } : {},
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const resumed = res.status === 206;
      let received = resumed ? have : 0;
      const total = expected || Number(res.headers.get('content-length')) || 0;
      const source = Readable.fromWeb(res.body);
      source.on('data', (chunk) => {
        received += chunk.length;
        if (total > 5_000_000) {
          const pct = Math.floor((received / total) * 100);
          if (pct >= lastLogged + 10) {
            lastLogged = pct;
            log(`  скачивание ${path.basename(target)}: ${pct}% (${Math.round(received / 1e6)} МБ)`);
          }
        }
      });
      await pipeline(source, fs.createWriteStream(tmp, { flags: resumed ? 'a' : 'w' }));
      if (!expected || received >= expected) break;
    } catch (err) {
      if (attempt === 8) throw new Error(`Не удалось скачать ${url}: ${err.message}`);
      log(`  обрыв соединения (${err.message}), повтор ${attempt}/7…`);
      await sleep(3000 * attempt);
    }
  }

  await fsp.rename(tmp, target);
  return target;
}

async function ensureMedia(film) {
  const { rows } = await pool.query('SELECT id FROM media_items WHERE title = $1 LIMIT 1', [film.title]);
  const data = {
    title: film.title,
    description: film.description,
    synopsis: film.synopsis,
    year: film.year,
    genres: film.genres,
    themes: film.themes,
    language: 'en',
    recommendedLevel: film.recommendedLevel,
    posterUrl: film.posterUrl,
    externalWatchUrl: film.externalWatchUrl,
    status: 'published',
  };
  if (rows[0]) {
    return mediaRepository.update(rows[0].id, data);
  }
  return mediaRepository.create(data);
}

async function ensureSubtitle(media, language, url, dir) {
  const existing = await subtitlesRepository.findLatestByMedia(media.id, language);
  if (existing) return existing;
  const local = await download(url, path.join(dir, `subs.${language}.srt`));
  const filename = `demo-${media.id}-${language}-${Date.now()}.srt`;
  await fsp.copyFile(local, path.join(uploadsRoot, filename));
  log(`  субтитры ${language.toUpperCase()} добавлены`);
  return subtitlesRepository.create({
    mediaId: media.id,
    originalFilename: path.basename(decodeURIComponent(url)).replace(/\.str$/, '.srt'),
    storagePath: filename,
    format: 'srt',
    language,
  });
}

async function importFilm(film, { forceVideo, reprocess, rewriteQuiz }) {
  log(`=== ${film.title}`);
  const dir = path.join(cacheDir, film.key);
  await fsp.mkdir(dir, { recursive: true });

  let media = await ensureMedia(film);

  const enSub = await ensureSubtitle(media, 'en', film.subtitles.en, dir);
  if (film.subtitles.ru) {
    await ensureSubtitle(media, 'ru', film.subtitles.ru, dir);
  }

  media = await mediaRepository.findById(media.id);
  if (!media.hasMaterials || reprocess) {
    log('  анализ субтитров (словарь, фразы, грамматика)…');
    const job = await jobsRepository.create({ mediaId: media.id, subtitleId: enSub.id });
    await processingService.runJob(job.id);
  }

  const quiz = await quizService.getAdminQuiz(media.id).catch(() => null);
  if (!quiz?.questions?.length || rewriteQuiz) {
    await quizService.upsertAdminQuiz(media.id, {
      title: `${film.title} — тест по фильму`,
      isPublished: true,
      questions: film.quiz.map((q, i) => ({ options: [], explanation: '', ...q, sortOrder: i })),
    });
    log('  тест создан');
  }

  if (media.videoStatus !== 'ready' || forceVideo) {
    const ext = path.extname(new URL(film.video).pathname) || '.mp4';
    const videoPath = await download(film.video, path.join(dir, `video${ext}`));
    log(`  нарезка в HLS (${config.video.variants.join('p, ')}p) и загрузка в хранилище…`);
    let lastPct = -10;
    const timer = setInterval(async () => {
      const current = await mediaRepository.findById(media.id).catch(() => null);
      if (current && current.videoProgress >= lastPct + 10) {
        lastPct = current.videoProgress;
        log(`  видео: ${current.videoStage === 'uploading' ? 'загрузка' : 'нарезка'} ${current.videoProgress}%`);
      }
    }, 3000);
    try {
      await videoService.importLocalFile(media.id, videoPath);
    } finally {
      clearInterval(timer);
    }
    log('  видео готово');
  }

  if (!film.subtitles.ru && config.llm.enabled && config.llm.apiKey) {
    const ru = await subtitlesRepository.findLatestByMedia(media.id, 'ru');
    if (!ru) {
      log('  перевод субтитров на русский нейросетью…');
      const status = await subtitleTranslationService.translateAndWait(media.id);
      log(`  перевод: ${status.state} (${status.done}/${status.total})`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const forceVideo = args.includes('--force-video');
  const reprocess = args.includes('--reprocess');
  const rewriteQuiz = args.includes('--quiz');
  const only = args
    .filter((a) => !a.startsWith('--'))
    .flatMap((a) => a.split(','))
    .map((a) => a.trim())
    .filter(Boolean);
  const films = only.length ? FILMS.filter((f) => only.includes(f.key)) : FILMS;

  await fsp.mkdir(cacheDir, { recursive: true });
  await videoService.onStartup();
  const storage = await videoService.storageInfo();
  log(`хранилище видео: ${storage.label}${storage.ok ? '' : ` (недоступно: ${storage.error})`}`);
  if (!storage.ok) throw new Error('Хранилище недоступно — проверьте S3_* в server/.env');

  for (const film of films) {
    try {
      await importFilm(film, { forceVideo, reprocess, rewriteQuiz });
    } catch (err) {
      console.error(`[demo] ${film.title}: ошибка — ${err.message}`);
    }
  }
  await applyFilmFacts();
  log('готово. Скачанные исходники лежат в uploads/demo-cache — их можно удалить.');
}

main()
  .catch((err) => {
    console.error('[demo] failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
