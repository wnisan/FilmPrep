import { useRef, useState } from 'react';
import '../styles/filePicker.css';

function formatSize(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} ГБ`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} МБ`;
  return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
}

const ICONS = {
  video: <path d="M4 6h11v12H4zM15 10l5-3v10l-5-3" />,
  image: <path d="M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a1.5 1.5 0 100-.01" />,
  text: <path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6" />,
};

/** Styled file input with drag & drop; the native "Выберите файл" button is hidden. */
export function FilePicker({ accept, onChange, file, disabled, icon = 'text', title = 'Выбрать файл', hint }) {
  const inputRef = useRef(null);
  const [over, setOver] = useState(false);

  function pick(f) {
    if (f && !disabled) onChange(f);
  }

  return (
    <div
      className={`file-picker${over ? ' is-over' : ''}${file ? ' has-file' : ''}${disabled ? ' is-disabled' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files?.[0]);
      }}
    >
      <button type="button" className="file-picker__button" disabled={disabled} onClick={() => inputRef.current?.click()}>
        <span className="file-picker__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            {ICONS[icon]}
          </svg>
        </span>
        <span className="file-picker__text">
          {file ? (
            <>
              <strong title={file.name}>{file.name}</strong>
              <small>{formatSize(file.size)} · нажмите, чтобы выбрать другой</small>
            </>
          ) : (
            <>
              <strong>{title}</strong>
              <small>{hint || 'или перетащите его сюда'}</small>
            </>
          )}
        </span>
      </button>
      {file ? (
        <button
          type="button"
          className="file-picker__clear"
          onClick={() => onChange(null)}
          disabled={disabled}
          aria-label="Убрать файл"
        >
          ×
        </button>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          pick(e.target.files?.[0] || null);
          e.target.value = '';
        }}
      />
    </div>
  );
}
