import { fileURLToPath } from 'node:url';
import { pool } from '../src/db/pool.js';

/** Страна, режиссёр и длительность для демо-фильмов (заполняются, только если пусто). */
export const FILM_FACTS = {
  'Tears of Steel': { countries: ['Нидерланды'], director: 'Ян Хьюберт', runtimeMin: 12 },
  Sintel: { countries: ['Нидерланды'], director: 'Колин Леви', runtimeMin: 15 },
  'Sprite Fright': { countries: ['Нидерланды'], director: 'Мэттью Лун, Хьялти Хьялмарссон', runtimeMin: 10 },
  'Cosmos Laundromat': { countries: ['Нидерланды'], director: 'Матьё Авре', runtimeMin: 12 },
  Paddington: { countries: ['Великобритания', 'Франция'], director: 'Пол Кинг', runtimeMin: 95 },
  'The Social Network': { countries: ['США'], director: 'Дэвид Финчер', runtimeMin: 120 },
  "The King's Speech": { countries: ['Великобритания', 'Австралия', 'США'], director: 'Том Хупер', runtimeMin: 118 },
  Arrival: { countries: ['США'], director: 'Дени Вильнёв', runtimeMin: 116 },
};

export async function applyFilmFacts() {
  let updated = 0;
  for (const [title, facts] of Object.entries(FILM_FACTS)) {
    const { rowCount } = await pool.query(
      `UPDATE media_items SET
         countries = CASE WHEN cardinality(countries) = 0 THEN $2 ELSE countries END,
         director = COALESCE(director, $3),
         runtime_min = COALESCE(runtime_min, $4)
       WHERE title = $1 AND (cardinality(countries) = 0 OR director IS NULL OR runtime_min IS NULL)`,
      [title, facts.countries, facts.director, facts.runtimeMin],
    );
    updated += rowCount;
  }
  return updated;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  applyFilmFacts()
    .then(async (n) => {
      console.log(`[facts] updated ${n} films`);
      await pool.end();
    })
    .catch(async (err) => {
      console.error(err);
      await pool.end();
      process.exit(1);
    });
}
