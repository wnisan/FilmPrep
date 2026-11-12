const CYRILLIC = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  і: 'i', ї: 'yi', є: 'ye', ґ: 'g',
};
const SPECIAL = { ß: 'ss', æ: 'ae', œ: 'oe', ø: 'o', ł: 'l', đ: 'd', þ: 'th' };

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "Le Fabuleux Destin d’Amélie Poulain" → "le-fabuleux-destin-d-amelie-poulain", "Брат" → "brat". */
export function slugify(text, maxLength = 70) {
  const latin = String(text || '')
    .toLowerCase()
    // English possessive "king's" → "kings"; French "d’Amélie" stays "d-amelie"
    .replace(/['’ʼ`]s\b/g, 's')
    .replace(/[а-яёіїєґ]/g, (ch) => CYRILLIC[ch] ?? ch)
    .replace(/[ßæœøłđþ]/g, (ch) => SPECIAL[ch])
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return latin
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}
