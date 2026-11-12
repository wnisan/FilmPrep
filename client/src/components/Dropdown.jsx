import { useEffect, useRef, useState } from 'react';
import '../styles/dropdown.css';

/**
 * Styled replacement for <select>: the native popup can't be themed on Windows
 * (white list, grey scrollbar).
 * options: [{ value, label, icon? }]
 */
export function Dropdown({ value, options, onChange, placeholder = 'Любой', label, className = '' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const current = options.find((o) => String(o.value) === String(value ?? ''));

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector('.dropdown__option.is-selected')?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  function pick(v) {
    onChange(v);
    setOpen(false);
  }

  return (
    <div className={`dropdown${open ? ' is-open' : ''} ${className}`} ref={rootRef}>
      <button
        type="button"
        className="dropdown__button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`dropdown__value${current ? '' : ' is-placeholder'}`}>
          {current?.icon}
          {current ? current.label : placeholder}
        </span>
        <svg className="dropdown__chevron" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <ul className="dropdown__list" role="listbox">
          {options.map((o) => {
            const selected = String(o.value) === String(value ?? '');
            return (
              <li key={String(o.value)}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`dropdown__option${selected ? ' is-selected' : ''}`}
                  onClick={() => pick(o.value)}
                >
                  {o.icon}
                  <span>{o.label}</span>
                  {selected ? <span className="dropdown__tick">✓</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
