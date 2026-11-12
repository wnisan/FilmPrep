/**
 * Упрощённые CEFR-словари для эвристической разметки уровня слова.
 * Не претендует на полноту — достаточно для MVP и защиты.
 */
export const CEFR_WORDS = {
  A1: new Set([
    'hello', 'house', 'family', 'friend', 'food', 'water', 'school', 'book', 'city',
    'day', 'night', 'man', 'woman', 'boy', 'girl', 'child', 'mother', 'father',
    'please', 'thank', 'sorry', 'help', 'home', 'room', 'door', 'window', 'table',
    'bear', 'train', 'station', 'london', 'marmalade', 'sandwich',
  ]),
  A2: new Set([
    'travel', 'journey', 'airport', 'ticket', 'weather', 'holiday', 'clothes',
    'kitchen', 'garden', 'neighbour', 'invite', 'polite', 'strange', 'accident',
    'worried', 'excited', 'carefully', 'suddenly', 'almost', 'enough', 'probably',
  ]),
  B1: new Set([
    'ambition', 'opportunity', 'negotiate', 'contract', 'lawsuit', 'reputation',
    'betray', 'network', 'startup', 'investor', 'competition', 'strategy',
    'evidence', 'witness', 'decision', 'pressure', 'responsibility', 'confident',
  ]),
  B2: new Set([
    'eloquence', 'stammer', 'broadcast', 'sovereign', 'coronation', 'therapist',
    'technique', 'overcome', 'humiliation', 'determination', 'linguistics',
    'hypothesis', 'arrival', 'heptapod', 'nonlinear', 'perception', 'consequence',
  ]),
  C1: new Set([
    'rhetoric', 'proliferation', 'epistemology', 'interlocutor', 'paradigm',
    'vulnerability', 'unprecedented', 'meticulous', 'ambiguous', 'nuance',
  ]),
};

export function guessCefr(lemma) {
  for (const level of ['A1', 'A2', 'B1', 'B2', 'C1']) {
    if (CEFR_WORDS[level].has(lemma)) return level;
  }
  // эвристика по длине
  if (lemma.length <= 4) return 'A1';
  if (lemma.length <= 6) return 'A2';
  if (lemma.length <= 8) return 'B1';
  if (lemma.length <= 11) return 'B2';
  return 'C1';
}
