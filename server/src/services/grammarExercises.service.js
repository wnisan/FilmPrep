import { config } from '../config/index.js';
import { grammarExercisesRepository } from '../repositories/grammarExercises.repository.js';
import { createHttpError } from '../utils/httpError.js';
import { languageRu } from '../utils/languages.js';
import { chatJson, toRows } from './llm.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GAP = '___';
const PER_RULE = 4;
const MAX_RULES = 30;
// One LLM call per batch keeps the prompt short enough for free models
const BATCH = 6;
// After a failed call learners get built-in drills at once instead of waiting for a dead provider
const COOLDOWN_MS = 5 * 60 * 1000;
let llmDownUntil = 0;

const ruleKey = (language, title) => `${language}|${String(title).trim().toLowerCase()}`;

const SYSTEM_PROMPT = `Ты методист по иностранным языкам. Составляешь грамматические упражнения «вставь пропущенную форму» для русскоязычных студентов.
Отвечай ТОЛЬКО JSON-массивом без пояснений.`;

function userPrompt(rules) {
  const list = rules
    .map(
      (r, i) =>
        `${i}. Язык: ${languageRu(r.language)} (${r.language}). Правило: «${r.title}».` +
        (r.explanation ? ` Пояснение: ${r.explanation}` : '') +
        (r.example ? ` Пример из фильма: "${r.example}"` : ''),
    )
    .join('\n');
  return `Для каждого правила составь ${PER_RULE} разных упражнения на это правило.
Каждое упражнение — короткое естественное предложение на языке правила, где ровно одно место заменено на ${GAP}.
Пропуск — это форма, которую требует правило (форма глагола, вспомогательный глагол, артикль и т. п.), а не случайное слово.
В скобках после пропуска дай подсказку: начальную форму слова, например "She ${GAP} (see) this film twice."
Варианты: 4 штуки — правильная форма и 3 неправильные формы ТОГО ЖЕ слова (другое время, лицо, число, наклонение). Ровно один вариант верный.
Поля: "i" — номер правила, "sentence" — предложение с ${GAP}, "options" — массив из 4 строк, "answer" — правильный вариант (точно как в options), "translation" — перевод предложения на русский, "explain" — одно короткое предложение по-русски, почему именно эта форма.
Пример: [{"i":0,"sentence":"I ${GAP} (lose) my keys, can you help me?","options":["have lost","lost","has lost","am losing"],"answer":"have lost","translation":"Я потерял ключи, поможешь?","explain":"Результат к настоящему моменту — Present Perfect: have + V3."}]

Правила:
${list}`;
}

function cleanExercise(row) {
  const sentence = String(row?.sentence || '').trim();
  const answer = String(row?.answer || '').trim();
  const options = Array.isArray(row?.options)
    ? [...new Set(row.options.map((o) => String(o).trim()).filter(Boolean))]
    : [];
  if (sentence.split(GAP).length !== 2 || sentence.length > 220) return null;
  if (options.length < 3 || options.length > 5 || !options.includes(answer)) return null;
  return {
    sentence,
    options,
    answer,
    translation: String(row?.translation || '').trim().slice(0, 300),
    explain: String(row?.explain || '').trim().slice(0, 300),
  };
}

async function generate(rules) {
  const parsed = await chatJson(SYSTEM_PROMPT, userPrompt(rules), { retries: 1 });
  const byRule = new Map();
  for (const row of toRows(parsed)) {
    const rule = rules[Number(row?.i)];
    const exercise = rule && cleanExercise(row);
    if (!exercise) continue;
    const list = byRule.get(rule.key) || [];
    if (list.length < PER_RULE && !list.some((e) => e.sentence === exercise.sentence)) list.push(exercise);
    byRule.set(rule.key, list);
  }
  return byRule;
}

export const grammarExercisesService = {
  /**
   * Gap-fill exercises for the given grammar patterns, grouped by rule.
   * Rules the LLM couldn't cover come back with an empty list — the client then uses its built-in drills.
   */
  async forPatterns(user, body) {
    const ids = Array.isArray(body?.patternIds)
      ? [...new Set(body.patternIds.map(String).filter((id) => UUID.test(id)))]
      : [];
    if (!ids.length || ids.length > 200) {
      throw createHttpError(400, 'VALIDATION_ERROR', 'patternIds (uuid[]) обязательны');
    }

    const patterns = await grammarExercisesRepository.findViewablePatterns(user, ids);
    const rules = new Map();
    for (const p of patterns) {
      const key = ruleKey(p.language, p.title);
      if (!rules.has(key)) {
        rules.set(key, {
          key,
          title: p.title,
          language: p.language,
          explanation: p.explanation_ru || '',
          example: p.example || '',
          patternIds: [],
        });
      }
      rules.get(key).patternIds.push(p.id);
    }
    const list = [...rules.values()].slice(0, MAX_RULES);

    const cached = await grammarExercisesRepository.findByKeys(list.map((r) => r.key));
    const missing = list.filter((r) => !cached.has(r.key));
    if (missing.length && config.llm.enabled && config.llm.apiKey && Date.now() > llmDownUntil) {
      for (let i = 0; i < missing.length; i += BATCH) {
        const batch = missing.slice(i, i + BATCH);
        try {
          const made = await generate(batch);
          for (const [key, items] of made) {
            if (items.length < 2) continue;
            cached.set(key, items);
            await grammarExercisesRepository.save(key, items);
          }
        } catch (err) {
          console.warn(`[grammar] exercises not generated: ${err.message}`);
          llmDownUntil = Date.now() + COOLDOWN_MS;
          break;
        }
      }
    }

    return {
      items: list.map((r) => ({
        title: r.title,
        language: r.language,
        patternIds: r.patternIds,
        exercises: cached.get(r.key) || [],
      })),
    };
  },
};
