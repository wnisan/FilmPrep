import { plural } from '../utils/format.js';

const TIER_LABELS = {
  bronze: 'Бронза',
  silver: 'Серебро',
  gold: 'Золото',
  platinum: 'Платина',
};

/** «Знаток · ур. 4» under a name. */
export function RankTitle({ title, level, compact = false }) {
  if (!title) return null;
  return (
    <span className={`rank-title rank-title--l${Math.min(level || 1, 8)}${compact ? ' rank-title--compact' : ''}`}>
      {title}
      {compact ? null : <span className="rank-title__level">ур. {level}</span>}
    </span>
  );
}

export function XpBar({ rank }) {
  const percent = Math.round(rank.progress * 100);
  return (
    <div className="xp-bar">
      <div className="xp-bar__head">
        <span>
          <strong>{rank.xp}</strong> XP
        </span>
        <span className="muted">
          {rank.nextXp != null
            ? `до звания «${rank.nextTitle}» — ${rank.nextXp - rank.xp} XP`
            : 'максимальное звание'}
        </span>
      </div>
      <div className="xp-bar__track">
        <div className="xp-bar__fill" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function BadgeIcon({ achievement, size = 44 }) {
  const tier = achievement.unlocked ? achievement.tier : 'locked';
  return (
    <span
      className={`badge-icon badge-icon--${tier}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {achievement.icon}
    </span>
  );
}

/** Small icons next to the name. */
export function FeaturedBadges({ items }) {
  if (!items?.length) return null;
  return (
    <span className="featured-badges">
      {items.map((a) => (
        <span key={a.id} title={`${a.name} — ${a.desc}`}>
          <BadgeIcon achievement={a} size={26} />
        </span>
      ))}
    </span>
  );
}

export function AchievementGrid({ items }) {
  return (
    <div className="achievements">
      {items.map((a) => {
        const target = a.next?.at;
        const percent = target ? Math.min(100, Math.round((a.value / target) * 100)) : 100;
        return (
          <div key={a.id} className={`achievement${a.unlocked ? '' : ' achievement--locked'}`}>
            <BadgeIcon achievement={a} />
            <div className="achievement__body">
              <div className="achievement__name">
                {a.name}
                {a.unlocked ? (
                  <span className={`achievement__tier achievement__tier--${a.tier}`}>
                    {TIER_LABELS[a.tier]}
                  </span>
                ) : null}
              </div>
              <div className="achievement__desc">{a.desc}</div>
              {a.next ? (
                <>
                  <div className="achievement__track">
                    <div className="achievement__fill" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="achievement__next">
                    {a.unlocked ? `Дальше: «${a.next.name}» — ` : ''}
                    {a.value} / {a.next.at} {a.unit}
                  </div>
                </>
              ) : (
                <div className="achievement__next">Высшая ступень · {a.value} {a.unit}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function unlockedCount(items) {
  const n = items.filter((a) => a.unlocked).length;
  return `${n} ${plural(n, ['достижение', 'достижения', 'достижений'])} из ${items.length}`;
}
