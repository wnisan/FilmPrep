const PALETTE = ['#e8b86d', '#6fcf97', '#56ccf2', '#bb6bd9', '#f2994a', '#eb5757', '#2d9cdb', '#9b51e0'];

function colorFor(seed = '') {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

export function Avatar({ user, size = 40, className = '' }) {
  const name = user?.displayName || user?.username || '';
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };

  if (user?.avatarUrl) {
    return (
      <img
        className={`avatar ${className}`}
        src={user.avatarUrl}
        alt={name}
        style={style}
        loading="lazy"
      />
    );
  }

  return (
    <span
      className={`avatar avatar--initials ${className}`}
      style={{ ...style, background: colorFor(user?.username || name) }}
      aria-label={name}
    >
      {initials(name)}
    </span>
  );
}
