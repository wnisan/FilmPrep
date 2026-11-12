/**
 * Демо-фильмы на испанском, немецком и французском: карточка, субтитры
 * (оригинал + русский), анализ лексики и тест на языке фильма.
 * Повторный запуск ничего не дублирует.
 *
 *   node scripts/seed-languages.js            добавить недостающее
 *   node scripts/seed-languages.js --reprocess   заново проанализировать субтитры
 *   node scripts/seed-languages.js amelie,lola-rennt --reprocess   только эти фильмы
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';
import { uploadsRoot } from '../src/middleware/upload.js';
import { mediaRepository } from '../src/repositories/media.repository.js';
import { subtitlesRepository } from '../src/repositories/subtitles.repository.js';
import { jobsRepository } from '../src/repositories/jobs.repository.js';
import { processingService } from '../src/services/processing.service.js';
import { quizService } from '../src/services/quiz.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, '../fixtures');

export const LANGUAGE_FILMS = [
  {
    key: 'pans-labyrinth',
    title: 'El laberinto del fauno',
    language: 'es',
    year: 2006,
    description: 'Испания, 1944 год. Девочка Офелия встречает в старом лабиринте фавна, который называет её потерянной принцессой.',
    synopsis:
      'Послевоенная Испания. Офелия вместе с беременной матерью переезжает в лесной штаб её нового мужа — жестокого капитана Видаля, который охотится на партизан.\n\nНочью фея приводит девочку в заброшенный лабиринт. Там живёт древний фавн: он говорит, что Офелия — дочь короля подземного мира, и чтобы вернуться домой, ей нужно пройти три испытания до полнолуния.\n\nМрачная сказка Гильермо дель Торо, где волшебный мир переплетается с реальной войной. Чёткая кастильская речь, сказочная и военная лексика, повелительное наклонение — уровень B1–B2.',
    genres: ['fantasy', 'drama', 'war'],
    themes: ['fairy tale', 'war', 'courage'],
    recommendedLevel: 'B2',
    posterUrl: '/posters/pans-labyrinth.jpg',
    externalWatchUrl: 'https://www.imdb.com/title/tt0457430/',
    countries: ['Мексика', 'Испания'],
    director: 'Гильермо дель Торо',
    runtimeMin: 118,
    quiz: [
      {
        questionType: 'single_choice',
        prompt: '¿Quién le dice a Ofelia que es una princesa?',
        options: ['El fauno', 'El capitán', 'Mercedes', 'Su madre'],
        correctAnswer: 'El fauno',
        explanation: 'El fauno le dice que es la princesa que estaban esperando.',
      },
      {
        questionType: 'single_choice',
        prompt: '¿Cuántas pruebas tiene que cumplir Ofelia?',
        options: ['Tres', 'Dos', 'Cinco', 'Una'],
        correctAnswer: 'Tres',
        explanation: '«Tienes que cumplir tres pruebas antes de que salga la luna llena.»',
      },
      {
        questionType: 'fill_blank',
        prompt: 'Completa: «Recuerda: no debes ____ nada en esa mesa.»',
        correctAnswer: ['comer', 'Comer'],
        explanation: '«Comer» — есть. No debes + infinitivo = нельзя что-то делать.',
      },
      {
        questionType: 'true_false',
        prompt: 'La madre de Ofelia cree en la magia.',
        options: [true, false],
        correctAnswer: false,
        explanation: '«La magia no existe, Ofelia.»',
      },
      {
        questionType: 'single_choice',
        prompt: '¿Qué quiere el fauno al final?',
        options: ['Al hermano de Ofelia', 'El libro', 'La llave', 'Al capitán'],
        correctAnswer: 'Al hermano de Ofelia',
        explanation: '«Dame al niño y la puerta se abrirá.»',
      },
    ],
  },
  {
    key: 'ocho-apellidos-vascos',
    title: 'Ocho apellidos vascos',
    language: 'es',
    year: 2014,
    description: 'Севильский весельчак влюбляется в баскскую девушку и едет на север, притворяясь баском перед её суровым отцом.',
    synopsis:
      'Рафа — андалузец до мозга костей: он никогда не покидал Севилью и уверен, что лучше юга ничего нет. Однажды ночью в баре он знакомится с Амайей из Страны Басков, и она уезжает, оставив сумку.\n\nРафа отправляется за ней на север, где всё непривычно: погода, еда, язык и характер людей. Когда к Амайе приезжает отец, Рафе приходится выдать себя за баска Анчона с «восемью баскскими фамилиями».\n\nСамая кассовая испанская комедия, построенная на стереотипах о регионах Испании. Разговорный испанский, шутки про акценты и бытовые диалоги — уровень B1.',
    genres: ['comedy', 'romance'],
    themes: ['culture clash', 'love', 'family'],
    recommendedLevel: 'B1',
    posterUrl: '/posters/ocho-apellidos-vascos.jpg',
    externalWatchUrl: 'https://www.imdb.com/title/tt2955316/',
    countries: ['Испания'],
    director: 'Эмилио Мартинес-Ласаро',
    runtimeMin: 98,
    quiz: [
      {
        questionType: 'single_choice',
        prompt: '¿De dónde es Rafa?',
        options: ['De Sevilla', 'De Bilbao', 'De Madrid', 'De Barcelona'],
        correctAnswer: 'De Sevilla',
        explanation: 'Rafa es andaluz: «¡Buenas noches, Sevilla!»',
      },
      {
        questionType: 'single_choice',
        prompt: '¿Qué se deja Amaia en el bar?',
        options: ['El bolso', 'El móvil', 'Las llaves', 'El abrigo'],
        correctAnswer: 'El bolso',
        explanation: '«Te dejaste el bolso en el bar.»',
      },
      {
        questionType: 'fill_blank',
        prompt: 'Completa: «Tienes que ____ que eres vasco.»',
        correctAnswer: ['fingir', 'Fingir'],
        explanation: '«Fingir» — притворяться. Tener que + infinitivo = быть должным.',
      },
      {
        questionType: 'true_false',
        prompt: 'Rafa habla euskera muy bien.',
        options: [true, false],
        correctAnswer: false,
        explanation: '«No sé ni una palabra de euskera.»',
      },
      {
        questionType: 'single_choice',
        prompt: '¿Cómo se llama Rafa cuando finge ser vasco?',
        options: ['Antxon', 'Koldo', 'Iñaki', 'Mikel'],
        correctAnswer: 'Antxon',
        explanation: '«A partir de hoy te llamas Antxon.»',
      },
    ],
  },
  {
    key: 'good-bye-lenin',
    title: 'Good Bye, Lenin!',
    language: 'de',
    year: 2003,
    description: 'Пока мать Алекса лежала в коме, пала Берлинская стена. Чтобы не волновать её, сын воссоздаёт ГДР в одной квартире.',
    synopsis:
      'Восточный Берлин, осень 1989 года. Мать Алекса, преданная идеям социализма, видит, как полиция задерживает сына на демонстрации, и впадает в кому.\n\nКогда через восемь месяцев она приходит в себя, страны, в которой она жила, уже нет: Стена пала, на улицах реклама «Кока-колы», а в магазинах западные товары. Врачи предупреждают, что любое потрясение может её убить, и Алекс решает сохранить для мамы ГДР — со старой мебелью, любимыми огурцами и поддельными выпусками новостей.\n\nТрогательная трагикомедия Вольфганга Беккера. Ясный литературный немецкий, бытовая и политическая лексика, прошедшее время Präteritum и Perfekt — уровень B1.',
    genres: ['comedy', 'drama'],
    themes: ['family', 'history', 'love'],
    recommendedLevel: 'B1',
    posterUrl: '/posters/good-bye-lenin.jpg',
    externalWatchUrl: 'https://www.imdb.com/title/tt0301357/',
    countries: ['Германия'],
    director: 'Вольфганг Беккер',
    runtimeMin: 121,
    quiz: [
      {
        questionType: 'single_choice',
        prompt: 'Was ist passiert, während die Mutter im Koma lag?',
        options: ['Die Mauer ist gefallen', 'Alex hat geheiratet', 'Der Vater ist zurückgekommen', 'Die Familie ist umgezogen'],
        correctAnswer: 'Die Mauer ist gefallen',
        explanation: '«Während sie schlief, ist die Mauer gefallen.»',
      },
      {
        questionType: 'true_false',
        prompt: 'Die Mutter darf erfahren, dass es die DDR nicht mehr gibt.',
        options: [true, false],
        correctAnswer: false,
        explanation: '«Sie darf nicht erfahren, dass es die DDR nicht mehr gibt.»',
      },
      {
        questionType: 'fill_blank',
        prompt: 'Ergänze: «Wo bekomme ich jetzt noch Spreewald____?»',
        correctAnswer: ['gurken', 'Gurken'],
        explanation: 'Spreewaldgurken — огурцы из Шпревальда, любимый продукт мамы.',
      },
      {
        questionType: 'single_choice',
        prompt: 'Was machen Alex und Denis für die Mutter?',
        options: ['Falsche Nachrichtensendungen', 'Ein Konzert', 'Eine Reise', 'Ein Buch'],
        correctAnswer: 'Falsche Nachrichtensendungen',
        explanation: 'Sie drehen eine eigene «Aktuelle Kamera».',
      },
      {
        questionType: 'single_choice',
        prompt: 'Was hat der Vater geschrieben?',
        options: ['Briefe', 'Gedichte', 'Ein Tagebuch', 'Nichts'],
        correctAnswer: 'Briefe',
        explanation: '«Dein Vater hat uns Briefe geschrieben. Viele Briefe.»',
      },
    ],
  },
  {
    key: 'lola-rennt',
    title: 'Lola rennt',
    language: 'de',
    year: 1998,
    description: 'У Лолы есть двадцать минут, чтобы найти сто тысяч марок и спасти своего парня. Фильм трижды показывает её забег.',
    synopsis:
      'Берлин, жаркий летний день. Звонит Манни: он потерял в метро сумку со ста тысячами марок, которые должен передать опасному боссу ровно в полдень. Если денег не будет — ему конец.\n\nУ Лолы двадцать минут. Она бежит через весь город, пытается занять деньги у отца-банкира и успеть к Манни. Фильм трижды проигрывает эти двадцать минут, и каждая мелочь — столкновение с прохожим, секунда задержки — меняет финал.\n\nДинамичный культовый фильм Тома Тыквера. Короткие эмоциональные реплики, повелительное наклонение и числа — удобно для уровня A2–B1.',
    genres: ['thriller', 'crime'],
    themes: ['chance', 'love', 'time'],
    recommendedLevel: 'A2',
    posterUrl: '/posters/lola-rennt.jpg',
    externalWatchUrl: 'https://www.imdb.com/title/tt0130827/',
    countries: ['Германия'],
    director: 'Том Тыквер',
    runtimeMin: 81,
    quiz: [
      {
        questionType: 'single_choice',
        prompt: 'Wo hat Manni die Tasche liegen lassen?',
        options: ['In der U-Bahn', 'Im Supermarkt', 'Zu Hause', 'Im Taxi'],
        correctAnswer: 'In der U-Bahn',
        explanation: '«Ich habe die Tasche mit dem Geld in der U-Bahn liegen lassen.»',
      },
      {
        questionType: 'single_choice',
        prompt: 'Wie viel Geld braucht Manni?',
        options: ['Hunderttausend Mark', 'Zehntausend Mark', 'Tausend Mark', 'Eine Million Mark'],
        correctAnswer: 'Hunderttausend Mark',
        explanation: '«Hunderttausend Mark!»',
      },
      {
        questionType: 'fill_blank',
        prompt: 'Ergänze: «____, Lola, lauf!»',
        correctAnswer: ['Lauf', 'lauf'],
        explanation: 'Imperativ от laufen — «беги».',
      },
      {
        questionType: 'true_false',
        prompt: 'Lolas Vater gibt ihr sofort das Geld.',
        options: [true, false],
        correctAnswer: false,
        explanation: '«Geh nach Hause, Lola.»',
      },
      {
        questionType: 'single_choice',
        prompt: 'Wie lange dauert ein Fußballspiel laut dem Anfang des Films?',
        options: ['Neunzig Minuten', 'Zwanzig Minuten', 'Eine Stunde', 'Zwei Stunden'],
        correctAnswer: 'Neunzig Minuten',
        explanation: '«Das Spiel dauert neunzig Minuten.»',
      },
    ],
  },
  {
    key: 'amelie',
    title: 'Le Fabuleux Destin d’Amélie Poulain',
    language: 'fr',
    year: 2001,
    description: 'Застенчивая официантка с Монмартра решает тайно делать счастливыми людей вокруг — и забывает о себе.',
    synopsis:
      'Амели выросла одинокой мечтательницей и теперь работает официанткой в маленьком кафе на Монмартре. Однажды за стеной своей ванной она находит жестяную коробку с детскими сокровищами, спрятанную десятки лет назад.\n\nАмели решает: если она найдёт владельца и это сделает его счастливым, она посвятит себя тайной помощи другим. Она мирит, утешает и разыгрывает соседей, но когда в её жизни появляется загадочный Нино, собирающий чужие фотографии, ей самой не хватает смелости сделать шаг.\n\nСказочный Париж Жана-Пьера Жёне. Много описаний, закадровый рассказчик, passé composé и imparfait — уровень B1.',
    genres: ['comedy', 'romance'],
    themes: ['paris', 'dreams', 'kindness'],
    recommendedLevel: 'B1',
    posterUrl: '/posters/amelie.jpg',
    externalWatchUrl: 'https://www.imdb.com/title/tt0211915/',
    countries: ['Франция', 'Германия'],
    director: 'Жан-Пьер Жёне',
    runtimeMin: 122,
    quiz: [
      {
        questionType: 'single_choice',
        prompt: 'Où travaille Amélie?',
        options: ['Dans un café', 'Dans une gare', 'Dans une école', 'Dans un musée'],
        correctAnswer: 'Dans un café',
        explanation: '«Elle est serveuse dans un café.»',
      },
      {
        questionType: 'single_choice',
        prompt: 'Qu’est-ce qu’Amélie trouve derrière le mur de la salle de bains?',
        options: ['Une vieille boîte en métal', 'Une lettre', 'Un chat', 'De l’argent'],
        correctAnswer: 'Une vieille boîte en métal',
        explanation: '«Elle trouve une vieille boîte en métal.»',
      },
      {
        questionType: 'fill_blank',
        prompt: 'Complétez: «Rendez-vous demain, à cinq heures, devant le ____.»',
        correctAnswer: ['manège', 'manege'],
        explanation: '«Le manège» — карусель.',
      },
      {
        questionType: 'true_false',
        prompt: 'Nino collectionne les photos oubliées à la gare.',
        options: [true, false],
        correctAnswer: true,
        explanation: '«Il ramasse les photos oubliées sous les cabines de la gare.»',
      },
      {
        questionType: 'single_choice',
        prompt: 'Qui voyage autour du monde?',
        options: ['Le nain de jardin', 'Nino', 'Le père d’Amélie', 'Le chat'],
        correctAnswer: 'Le nain de jardin',
        explanation: '«Le nain de jardin de mon père voyage autour du monde.»',
      },
    ],
  },
  {
    key: 'intouchables',
    title: 'Intouchables',
    language: 'fr',
    year: 2011,
    description: 'Богатый аристократ, прикованный к креслу, нанимает в помощники парня из пригорода, который совсем его не жалеет.',
    synopsis:
      'После несчастного случая с парапланом парижский аристократ Филипп парализован. Он ищет помощника и среди вежливых кандидатов с дипломами выбирает Дрисса — парня из пригорода, который пришёл только за подписью для пособия.\n\nДрисс не умеет ухаживать за больными и не испытывает к Филиппу жалости — и именно этим ему нравится. Два совершенно разных человека учат друг друга: Вивальди и фанк, современное искусство и шутки, свидания и полёты на параплане.\n\nФильм по реальной истории, одна из самых популярных французских комедий. Живой разговорный французский, контраст сленга и формальной речи — уровень B1–B2.',
    genres: ['comedy', 'drama', 'biography'],
    themes: ['friendship', 'paris', 'courage'],
    recommendedLevel: 'B1',
    posterUrl: '/posters/intouchables.jpg',
    externalWatchUrl: 'https://www.imdb.com/title/tt1675434/',
    countries: ['Франция'],
    director: 'Оливье Накаш, Эрик Толедано',
    runtimeMin: 112,
    quiz: [
      {
        questionType: 'single_choice',
        prompt: 'Pourquoi Driss vient-il à l’entretien?',
        options: ['Il a besoin d’une signature', 'Il veut devenir médecin', 'Il cherche un appartement', 'Il vend des tableaux'],
        correctAnswer: 'Il a besoin d’une signature',
        explanation: '«En fait, j’ai juste besoin d’une signature.»',
      },
      {
        questionType: 'true_false',
        prompt: 'Driss a beaucoup d’expérience avec les personnes handicapées.',
        options: [true, false],
        correctAnswer: false,
        explanation: '«Non, pas du tout.»',
      },
      {
        questionType: 'fill_blank',
        prompt: 'Complétez: «C’est exactement ce que je veux. Pas de ____.»',
        correctAnswer: ['pitié', 'pitie'],
        explanation: '«La pitié» — жалость.',
      },
      {
        questionType: 'single_choice',
        prompt: 'Combien coûte le tableau?',
        options: ['Quarante et un mille euros', 'Mille euros', 'Cent euros', 'Un million d’euros'],
        correctAnswer: 'Quarante et un mille euros',
        explanation: '«Quarante et un mille euros. Pour des taches?»',
      },
      {
        questionType: 'single_choice',
        prompt: 'Quel sport font Philippe et Driss?',
        options: ['Le parapente', 'Le football', 'Le tennis', 'La natation'],
        correctAnswer: 'Le parapente',
        explanation: '«On va faire du parapente.»',
      },
    ],
  },
];

function log(msg) {
  console.log(`[languages] ${msg}`);
}

async function ensureMedia(film) {
  const { rows } = await pool.query('SELECT id FROM media_items WHERE title = $1 LIMIT 1', [film.title]);
  if (rows[0]) return { media: await mediaRepository.findById(rows[0].id), created: false };
  const media = await mediaRepository.create({
    title: film.title,
    description: film.description,
    synopsis: film.synopsis,
    year: film.year,
    genres: film.genres,
    themes: film.themes,
    language: film.language,
    recommendedLevel: film.recommendedLevel,
    posterUrl: film.posterUrl,
    externalWatchUrl: film.externalWatchUrl,
    countries: film.countries,
    director: film.director,
    runtimeMin: film.runtimeMin,
    status: 'published',
  });
  return { media, created: true };
}

async function ensureSubtitle(media, film, language) {
  const existing = await subtitlesRepository.findLatestByMedia(media.id, language);
  if (existing) return existing;
  const fixture = `${film.key}.${language}.demo.srt`;
  const filename = `seed-${film.key}-${language}-${Date.now()}.srt`;
  await fs.mkdir(uploadsRoot, { recursive: true });
  await fs.copyFile(path.join(fixturesDir, fixture), path.join(uploadsRoot, filename));
  return subtitlesRepository.create({
    mediaId: media.id,
    originalFilename: fixture,
    storagePath: filename,
    format: 'srt',
    language,
  });
}

async function seedFilm(film, { reprocess }) {
  const { media, created } = await ensureMedia(film);
  const original = await ensureSubtitle(media, film, film.language);
  await ensureSubtitle(media, film, 'ru');

  const current = await mediaRepository.findById(media.id);
  if (!current.hasMaterials || reprocess) {
    const job = await jobsRepository.create({ mediaId: media.id, subtitleId: original.id });
    await processingService.runJob(job.id);
  }

  const quiz = await quizService.getAdminQuiz(media.id).catch(() => null);
  if (!quiz?.questions?.length) {
    await quizService.upsertAdminQuiz(media.id, {
      title: `${film.title} — тест по фильму`,
      isPublished: true,
      questions: film.quiz.map((q, i) => ({ options: [], explanation: '', ...q, sortOrder: i })),
    });
  }
  log(`${film.title} (${film.language}) ${created ? 'добавлен' : 'уже есть'}`);
}

export async function seedLanguageFilms({ reprocess = false, only = [] } = {}) {
  const films = only.length ? LANGUAGE_FILMS.filter((f) => only.includes(f.key)) : LANGUAGE_FILMS;
  for (const film of films) {
    try {
      await seedFilm(film, { reprocess });
    } catch (err) {
      console.error(`[languages] ${film.title}: ${err.message}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  seedLanguageFilms({
    reprocess: args.includes('--reprocess'),
    only: args.filter((a) => !a.startsWith('--')).flatMap((a) => a.split(',')),
  })
    .catch((err) => {
      console.error('[languages] failed', err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
