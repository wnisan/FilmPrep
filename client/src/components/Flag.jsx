import { languageInfo } from '../utils/languages.js';
import '../styles/languages.css';

// Only the flags of study languages end up in the bundle (keep in sync with LANGUAGES)
const FLAG_URLS = import.meta.glob(
  '/node_modules/flag-icons/flags/4x3/{gb,es,fr,de,it,pt,nl,se,no,dk,fi,pl,cz,ua,gr,tr,sa,jp,kr,cn}.svg',
  { eager: true, query: '?url', import: 'default' },
);

function flagUrl(country) {
  return FLAG_URLS[`/node_modules/flag-icons/flags/4x3/${country}.svg`];
}

/** Flag of a study language (SVG — Windows has no emoji flags). */
export function Flag({ code, size = 'md', title }) {
  const info = languageInfo(code);
  const url = flagUrl(info.flag);
  return (
    <span
      className={`flag flag--${size}`}
      style={url ? { backgroundImage: `url("${url}")` } : undefined}
      role="img"
      aria-label={title ?? info.name}
      title={title ?? info.name}
    />
  );
}

/** Flag + name, optionally with the learner's level. */
export function LanguageTag({ code, level, compact = false }) {
  const info = languageInfo(code);
  return (
    <span className={`lang-tag${compact ? ' lang-tag--compact' : ''}`}>
      <Flag code={code} size="sm" />
      {compact ? null : <span>{info.name}</span>}
      {level ? <span className="lang-tag__level">{level}</span> : null}
    </span>
  );
}
