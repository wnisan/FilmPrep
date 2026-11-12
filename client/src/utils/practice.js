/** Helpers shared by the practice modes and the new quiz formats. */

export function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Words without punctuation: «¿Qué haces, Ofelia?» → ["Qué", "haces", "Ofelia"]. */
export function wordsOf(text) {
  return String(text || '')
    .replace(/[.,!?¿¡…:;"«»“”„()[\]]/g, ' ')
    .replace(/\s[-–—]\s/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export const wordKey = (w) =>
  String(w || '')
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}']/gu, '');

/**
 * Word-level diff (LCS): which expected words the learner got and which extra words they added.
 * Returns { parts: [{ word, ok }], score: 0..1 }.
 */
export function diffWords(expectedText, actualText) {
  const expected = wordsOf(expectedText);
  const actual = wordsOf(actualText);
  const a = expected.map(wordKey);
  const b = actual.map(wordKey);
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const parts = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      parts.push({ word: expected[i], ok: true });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      parts.push({ word: expected[i], ok: false, missed: true });
      i += 1;
    } else {
      parts.push({ word: actual[j], ok: false, extra: true });
      j += 1;
    }
  }
  while (i < a.length) parts.push({ word: expected[i++], ok: false, missed: true });
  while (j < b.length) parts.push({ word: actual[j++], ok: false, extra: true });
  const matched = parts.filter((p) => p.ok).length;
  const score = expected.length ? matched / Math.max(expected.length, actual.length) : 0;
  return { parts, score };
}

export const cleanPhrase = (text) => String(text || '').replace(/^\.{3}|\.{3}$/g, '').trim();
