import { Link } from 'react-router-dom';

const Chevron = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="m15 6-6 6 6 6" />
  </svg>
);

/** Pill "back" control; pass `to` for a link or `onClick` for a button. */
export function BackLink({ to, onClick, children }) {
  if (to) {
    return (
      <Link className="back-link" to={to}>
        <Chevron />
        <span>{children}</span>
      </Link>
    );
  }
  return (
    <button type="button" className="back-link" onClick={onClick}>
      <Chevron />
      <span>{children}</span>
    </button>
  );
}
