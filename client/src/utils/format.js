/** plural(5, ['слово', 'слова', 'слов']) → 'слов' */
export function plural(n, [one, few, many]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function timeAgo(value) {
  const date = new Date(value);
  const sec = Math.round((Date.now() - date.getTime()) / 1000);
  if (sec < 45) return 'только что';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} ${plural(min, ['минуту', 'минуты', 'минут'])} назад`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} ${plural(hours, ['час', 'часа', 'часов'])} назад`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function memberSince(value) {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}
