/**
 * Парсинг субтитров SRT / простой VTT → массив { index, startMs, endMs, text }.
 */

function parseTimestampToMs(value) {
  // 00:01:02,345 or 00:01:02.345
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':');
  if (parts.length !== 3) return 0;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = Number(parts[2]);
  if ([hours, minutes, seconds].some((n) => Number.isNaN(n))) return 0;
  return Math.round(((hours * 60 + minutes) * 60 + seconds) * 1000);
}

function cleanCueText(raw) {
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{.*?\}/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseSrt(content) {
  const blocks = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/);

  const cues = [];

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    let idx = 0;
    if (/^\d+$/.test(lines[0])) idx = 1;
    const timeLine = lines[idx];
    if (!timeLine || !timeLine.includes('-->')) continue;

    const [startRaw, endRaw] = timeLine.split('-->').map((s) => s.trim());
    const text = cleanCueText(lines.slice(idx + 1).join(' '));
    if (!text) continue;

    cues.push({
      index: cues.length + 1,
      startMs: parseTimestampToMs(startRaw.split(' ')[0]),
      endMs: parseTimestampToMs(endRaw.split(' ')[0]),
      text,
    });
  }

  return cues;
}

export function parseVtt(content) {
  const withoutHeader = content.replace(/^\uFEFF?WEBVTT[^\n]*\n/i, '');
  // VTT похож на SRT после удаления заголовка
  return parseSrt(withoutHeader);
}

export function parseSubtitles(content, format) {
  if (format === 'vtt') return parseVtt(content);
  return parseSrt(content);
}
