/**
 * Resolve watchable source for in-site player.
 * Supports HLS (.m3u8), YouTube, Vimeo, direct video files and same-origin paths.
 */
export function resolveVideoSource(rawUrl) {
  if (!rawUrl) return null;
  const url = String(rawUrl).trim();
  if (!url) return null;

  const yt = parseYouTubeId(url);
  if (yt) {
    return {
      kind: 'youtube',
      embedUrl: `https://www.youtube-nocookie.com/embed/${yt}?rel=0`,
      sourceUrl: url,
    };
  }

  const vimeo = parseVimeoId(url);
  if (vimeo) {
    return {
      kind: 'vimeo',
      embedUrl: `https://player.vimeo.com/video/${vimeo}`,
      sourceUrl: url,
    };
  }

  if (/\.m3u8(\?|$)/i.test(url)) {
    return { kind: 'hls', fileUrl: url, sourceUrl: url };
  }

  if (
    url.startsWith('/') ||
    /\.(mp4|webm|ogg)(\?|$)/i.test(url) ||
    url.includes('googlevideo') ||
    url.includes('/video/')
  ) {
    return { kind: 'file', fileUrl: url, sourceUrl: url };
  }

  // Unknown absolute URL — try HTML5; browser will error if not a media file
  if (/^https?:\/\//i.test(url)) {
    return { kind: 'file', fileUrl: url, sourceUrl: url };
  }

  return null;
}

function parseYouTubeId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      return u.pathname.replace(/^\//, '').split('/')[0] || null;
    }
    if (u.hostname.includes('youtube.com') || u.hostname.includes('youtube-nocookie.com')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v');
      const parts = u.pathname.split('/').filter(Boolean);
      const embedIdx = parts.indexOf('embed');
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
      const shortsIdx = parts.indexOf('shorts');
      if (shortsIdx >= 0 && parts[shortsIdx + 1]) return parts[shortsIdx + 1];
    }
  } catch {
    return null;
  }
  return null;
}

function parseVimeoId(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('vimeo.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const id = parts.find((p) => /^\d+$/.test(p));
    return id || null;
  } catch {
    return null;
  }
}
