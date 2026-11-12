/**
 * Subtitle helpers: decoding (UTF-8 / Windows-1251), SRT+VTT parsing, SRT writing.
 */

export function decodeSubtitleBuffer(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    // Old Russian .srt files are often in cp1251
    return new TextDecoder('windows-1251').decode(buffer);
  }
}

function parseTimestamp(value) {
  const match = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/.exec(value);
  if (!match) return null;
  const [, h = '0', m, s, ms] = match;
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
}

function cleanText(lines) {
  return lines
    .join('\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .trim();
}

export function parseSubtitleCues(text) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    const timeIndex = lines.findIndex((l) => l.includes('-->'));
    if (timeIndex === -1) continue;
    const [startRaw, endRaw] = lines[timeIndex].split('-->');
    const start = parseTimestamp(startRaw);
    const end = parseTimestamp(endRaw);
    const body = cleanText(lines.slice(timeIndex + 1));
    if (start == null || end == null || !body) continue;
    cues.push({ start, end, text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

function formatSrtTime(seconds) {
  const totalMs = Math.round(seconds * 1000);
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const pad = (n, size = 2) => String(n).padStart(size, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function cuesToSrt(cues) {
  return cues
    .map((cue, i) => `${i + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}\n`)
    .join('\n');
}
