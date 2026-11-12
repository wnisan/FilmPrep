import { useState } from 'react';
import '../styles/passwordInput.css';

function EyeIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {open ? null : <path d="M4 4l16 16" />}
    </svg>
  );
}

/** Password field with a show/hide toggle; all other props go to the <input>. */
export function PasswordInput(props) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="pwd-field">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button
        type="button"
        className="pwd-field__toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        title={visible ? 'Скрыть пароль' : 'Показать пароль'}
        aria-pressed={visible}
      >
        <EyeIcon open={!visible} />
      </button>
    </span>
  );
}
