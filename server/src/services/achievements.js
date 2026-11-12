/**
 * Звания (по XP) и достижения (по статистике). Ничего не хранится в БД —
 * всё считается из реальных действий, поэтому не рассинхронизируется.
 */

/** Очки опыта: учёба весит больше, чем активность в обсуждениях. */
export const XP_RULES = Object.freeze({
  word: 5, // выученное слово
  quizPoint: 10, // правильный ответ в лучшей попытке по каждому тесту
  perfectQuiz: 25, // бонус за тест без ошибок
  comment: 3,
  rating: 2,
});

export const RANKS = Object.freeze([
  { xp: 0, title: 'Новичок', hint: 'Только начинает смотреть кино в оригинале' },
  { xp: 50, title: 'Зритель', hint: 'Первые слова и первые тесты позади' },
  { xp: 150, title: 'Киноман', hint: 'Регулярно разбирает фильмы' },
  { xp: 350, title: 'Знаток', hint: 'Уверенно понимает диалоги' },
  { xp: 700, title: 'Эксперт', hint: 'Смотрит без русских субтитров' },
  { xp: 1200, title: 'Полиглот', hint: 'Большой словарный запас' },
  { xp: 2000, title: 'Магистр субтитров', hint: 'Разобрал десятки фильмов' },
  { xp: 3500, title: 'Легенда кино', hint: 'Высшее звание FilmPrep' },
]);

const TIERS = ['bronze', 'silver', 'gold', 'platinum'];

/**
 * Семейства достижений: у каждого несколько ступеней (бронза → платина).
 * metric — ключ из collectMetrics().
 */
export const ACHIEVEMENTS = Object.freeze([
  {
    id: 'words',
    icon: 'Aa',
    metric: 'wordsLearned',
    unit: 'слов',
    levels: [
      { at: 10, name: 'Первые слова', desc: 'Выучить 10 слов' },
      { at: 50, name: 'Словарный запас', desc: 'Выучить 50 слов' },
      { at: 150, name: 'Ходячий словарь', desc: 'Выучить 150 слов' },
      { at: 400, name: 'Лексикограф', desc: 'Выучить 400 слов' },
    ],
  },
  {
    id: 'streak',
    icon: 'ϟ',
    metric: 'bestAnswerStreak',
    unit: 'подряд',
    levels: [
      { at: 5, name: 'В ударе', desc: '5 правильных ответов подряд' },
      { at: 10, name: 'Снайпер', desc: '10 правильных ответов подряд' },
      { at: 20, name: 'Безошибочный', desc: '20 правильных ответов подряд' },
      { at: 40, name: 'Непогрешимый', desc: '40 правильных ответов подряд' },
    ],
  },
  {
    id: 'perfect',
    icon: '✓',
    metric: 'perfectQuizzes',
    unit: 'тестов',
    levels: [
      { at: 1, name: 'Отличник', desc: 'Пройти тест без единой ошибки' },
      { at: 3, name: 'Круглый отличник', desc: '3 теста без ошибок' },
      { at: 10, name: 'Гений тестов', desc: '10 тестов без ошибок' },
    ],
  },
  {
    id: 'quizzes',
    icon: '✎',
    metric: 'quizzesPassed',
    unit: 'тестов',
    levels: [
      { at: 1, name: 'Первый зачёт', desc: 'Сдать тест хотя бы на 60%' },
      { at: 5, name: 'Экзаменатор', desc: 'Сдать 5 тестов' },
      { at: 15, name: 'Марафонец', desc: 'Сдать 15 тестов' },
    ],
  },
  {
    id: 'days',
    icon: '✦',
    metric: 'bestDayStreak',
    unit: 'дней',
    levels: [
      { at: 3, name: 'Три дня подряд', desc: 'Заниматься 3 дня подряд' },
      { at: 7, name: 'Неделя с кино', desc: 'Заниматься 7 дней подряд' },
      { at: 30, name: 'Месяц без пропусков', desc: 'Заниматься 30 дней подряд' },
    ],
  },
  {
    id: 'films',
    icon: '▶',
    metric: 'filmsStudied',
    unit: 'фильмов',
    levels: [
      { at: 1, name: 'Первый фильм', desc: 'Открыть материалы фильма' },
      { at: 5, name: 'Исследователь', desc: 'Разобрать 5 фильмов' },
      { at: 15, name: 'Синефил', desc: 'Разобрать 15 фильмов' },
    ],
  },
  {
    id: 'critic',
    icon: '★',
    metric: 'ratings',
    unit: 'оценок',
    levels: [
      { at: 1, name: 'Первая оценка', desc: 'Оценить фильм' },
      { at: 10, name: 'Кинокритик', desc: 'Оценить 10 фильмов' },
      { at: 30, name: 'Главный критик', desc: 'Оценить 30 фильмов' },
    ],
  },
  {
    id: 'talk',
    icon: '❝',
    metric: 'comments',
    unit: 'комментариев',
    levels: [
      { at: 1, name: 'Голос зала', desc: 'Оставить первый комментарий' },
      { at: 10, name: 'Собеседник', desc: 'Оставить 10 комментариев' },
      { at: 50, name: 'Душа обсуждений', desc: 'Оставить 50 комментариев' },
    ],
  },
  {
    id: 'shelf',
    icon: '♥',
    metric: 'favorites',
    unit: 'фильмов',
    levels: [
      { at: 3, name: 'Своя полка', desc: 'Добавить 3 фильма в избранное' },
      { at: 10, name: 'Коллекционер', desc: 'Добавить 10 фильмов в избранное' },
    ],
  },
]);

export function computeXp(stats) {
  return (
    stats.wordsLearned * XP_RULES.word +
    stats.bestPoints * XP_RULES.quizPoint +
    stats.perfectQuizzes * XP_RULES.perfectQuiz +
    stats.comments * XP_RULES.comment +
    stats.ratings * XP_RULES.rating
  );
}

export function computeRank(xp) {
  let index = 0;
  RANKS.forEach((rank, i) => {
    if (xp >= rank.xp) index = i;
  });
  const current = RANKS[index];
  const next = RANKS[index + 1] || null;
  return {
    level: index + 1,
    title: current.title,
    hint: current.hint,
    xp,
    levelXp: current.xp,
    nextXp: next ? next.xp : null,
    nextTitle: next ? next.title : null,
    progress: next ? Math.min(1, (xp - current.xp) / (next.xp - current.xp)) : 1,
  };
}

export function longestRun(flags) {
  let best = 0;
  let run = 0;
  for (const ok of flags) {
    run = ok ? run + 1 : 0;
    if (run > best) best = run;
  }
  return { best, current: run };
}

/** days: sorted 'YYYY-MM-DD'; current streak counts only if the last day is today or yesterday. */
export function dayStreaks(days, today) {
  const toNum = (d) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86400000);
  let best = 0;
  let run = 0;
  let prev = null;
  for (const day of days) {
    const n = toNum(day);
    run = prev != null && n === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = n;
  }
  const alive = prev != null && toNum(today) - prev <= 1;
  return { best, current: alive ? run : 0 };
}

export function computeAchievements(metrics) {
  return ACHIEVEMENTS.map((family) => {
    const value = metrics[family.metric] || 0;
    let reached = -1;
    family.levels.forEach((level, i) => {
      if (value >= level.at) reached = i;
    });
    const current = reached >= 0 ? family.levels[reached] : null;
    const next = family.levels[reached + 1] || null;
    return {
      id: family.id,
      icon: family.icon,
      unit: family.unit,
      value,
      unlocked: reached >= 0,
      tier: reached >= 0 ? TIERS[reached] : null,
      tierIndex: reached + 1,
      tierCount: family.levels.length,
      name: (current || family.levels[0]).name,
      desc: (current || family.levels[0]).desc,
      next: next ? { at: next.at, name: next.name, desc: next.desc } : null,
    };
  });
}

/** Up to 3 best badges to show next to the name: highest tier first, then rarer families. */
export function featuredAchievements(achievements, limit = 3) {
  return achievements
    .filter((a) => a.unlocked)
    .sort((a, b) => b.tierIndex - a.tierIndex || b.tierIndex / b.tierCount - a.tierIndex / a.tierCount)
    .slice(0, limit);
}
