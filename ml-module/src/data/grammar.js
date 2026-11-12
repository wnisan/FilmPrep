/** Шаблоны грамматических конструкций для эвристического извлечения. */
export const GRAMMAR_RULES = [
  {
    patternType: 'conditionals',
    cefrLevel: 'B1',
    title: 'First / Second Conditional',
    explanationRu:
      'Условные предложения: If + Present → will / would. Часто встречаются в диалогах о решениях и гипотезах.',
    test: (text) => /\bif\b.+\b(will|would|can|could)\b/i.test(text) || /\b(will|would)\b.+\bif\b/i.test(text),
  },
  {
    patternType: 'passive',
    cefrLevel: 'B1',
    title: 'Passive Voice',
    explanationRu:
      'Страдательный залог: be + V3 (was told, were chosen). Полезно замечать в сюжете и новостных репликах.',
    test: (text) => /\b(am|is|are|was|were|be|been|being)\s+\w+ed\b/i.test(text),
  },
  {
    patternType: 'present_perfect',
    cefrLevel: 'A2',
    title: 'Present Perfect',
    explanationRu:
      'Present Perfect: have/has + V3. Связь прошлого с настоящим — типично для разговоров о опыте.',
    test: (text) => /\b(have|has)\s+(already\s+)?\w+ed\b/i.test(text) || /\b(have|has)\s+been\b/i.test(text),
  },
  {
    patternType: 'modals',
    cefrLevel: 'A2',
    title: 'Modal Verbs',
    explanationRu:
      'Модальные глаголы (must, might, should, could) выражают обязанность, совет, возможность.',
    test: (text) => /\b(must|might|should|could|may|ought to)\b/i.test(text),
  },
  {
    patternType: 'phrasal_verbs',
    cefrLevel: 'B1',
    title: 'Phrasal Verbs',
    explanationRu:
      'Фразовые глаголы: глагол + частица (give up, look after, find out). Часты в разговорной речи фильмов.',
    test: (text) =>
      /\b(give up|look after|find out|figure out|come across|run into|take off|put off|turn on|turn off|get along|hang out)\b/i.test(
        text,
      ),
  },
];
