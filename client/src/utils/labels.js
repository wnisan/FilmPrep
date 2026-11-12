/** Genre/theme tags are stored in English; the UI shows Russian names (unknown tags as is). */
const GENRES = {
  action: 'боевик',
  adventure: 'приключения',
  animation: 'мультфильм',
  biography: 'биография',
  comedy: 'комедия',
  crime: 'криминал',
  documentary: 'документальный',
  drama: 'драма',
  family: 'семейный',
  fantasy: 'фэнтези',
  history: 'исторический',
  horror: 'ужасы',
  musical: 'мюзикл',
  mystery: 'детектив',
  romance: 'мелодрама',
  'sci-fi': 'фантастика',
  thriller: 'триллер',
  war: 'военный',
  western: 'вестерн',
};

const THEMES = {
  ambition: 'амбиции',
  choice: 'выбор',
  courage: 'смелость',
  demo: 'открытые фильмы',
  dragons: 'драконы',
  family: 'семья',
  'first contact': 'первый контакт',
  friendship: 'дружба',
  journey: 'путешествие',
  kindness: 'доброта',
  language: 'язык',
  london: 'Лондон',
  loneliness: 'одиночество',
  loss: 'утрата',
  'meaning of life': 'смысл жизни',
  nature: 'природа',
  relationships: 'отношения',
  robots: 'роботы',
  royalty: 'монархия',
  'science fiction': 'научная фантастика',
  speech: 'речь',
  technology: 'технологии',
  teenagers: 'подростки',
  time: 'время',
  'fairy tale': 'сказка',
  war: 'война',
  'culture clash': 'разные культуры',
  love: 'любовь',
  history: 'история',
  chance: 'случай',
  paris: 'Париж',
  dreams: 'мечты',
};

export const genreLabel = (tag) => GENRES[tag] || tag;
export const themeLabel = (tag) => THEMES[tag] || tag;

const reverse = (map) => Object.fromEntries(Object.entries(map).map(([tag, label]) => [label.toLowerCase(), tag]));
const GENRE_TAGS = reverse(GENRES);
const THEME_TAGS = reverse(THEMES);

/** Admin types Russian names ("комедия") — they are stored as the same English tags. */
export const genreTag = (text) => GENRE_TAGS[text.trim().toLowerCase()] || text.trim();
export const themeTag = (text) => THEME_TAGS[text.trim().toLowerCase()] || text.trim();

export function runtimeLabel(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} ч ${m ? `${m} мин` : ''}`.trim() : `${m} мин`;
}
