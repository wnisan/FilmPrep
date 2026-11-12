import { useEffect, useMemo, useState } from 'react';
import { fetchYandexDiskVideos, importVideoFromYandexDisk } from '../api/media.js';

function formatSize(bytes) {
  if (!bytes) return '';
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? `${gb.toFixed(1)} ГБ` : `${Math.round(bytes / 1024 ** 2)} МБ`;
}

/** Picks a film from the admin's Yandex Disk or from any public Disk link. */
export function YandexDiskImport({ mediaId, connected, disabled, onStarted, onError }) {
  const [publicUrl, setPublicUrl] = useState('');
  const [files, setFiles] = useState(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !connected || files) return;
    fetchYandexDiskVideos()
      .then((data) => setFiles(data.items || []))
      .catch((err) => {
        setFiles([]);
        onError?.(err.message || 'Не удалось получить список файлов с Диска');
      });
  }, [open, connected, files, onError]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (files || []).filter((f) => !q || f.name.toLowerCase().includes(q)).slice(0, 60);
  }, [files, query]);

  async function start(payload) {
    setBusy(true);
    try {
      const data = await importVideoFromYandexDisk(mediaId, payload);
      setPublicUrl('');
      setOpen(false);
      onStarted?.(data.item);
    } catch (err) {
      onError?.(err.message || 'Не удалось начать импорт');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="yadisk">
      <div className="yadisk__head">
        <span className="yadisk__logo" aria-hidden="true">Я</span>
        <div>
          <strong>Взять с Яндекс Диска</strong>
          <p className="muted">Сервер сам скачает файл, нарежет его и сохранит в хранилище — загружать через браузер не нужно.</p>
        </div>
      </div>

      <form
        className="admin-inline-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (publicUrl.trim()) start({ publicUrl: publicUrl.trim() });
        }}
      >
        <label className="admin-field">
          <span className="admin-field__label">Публичная ссылка на видео</span>
          <input
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            placeholder="https://disk.yandex.ru/d/…"
            disabled={disabled || busy}
          />
          <span className="admin-field__hint">На Диске: файл → «Поделиться» → «Скопировать ссылку»</span>
        </label>
        <button className="btn btn--primary" type="submit" disabled={disabled || busy || !publicUrl.trim()}>
          Импортировать
        </button>
      </form>

      {connected ? (
        <>
          <button className="btn btn--ghost btn--sm" type="button" onClick={() => setOpen((v) => !v)} disabled={disabled}>
            {open ? 'Скрыть мои видео' : 'Выбрать из моих видео на Диске'}
          </button>
          {open ? (
            <div className="yadisk__browser">
              <input
                className="yadisk__search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск по названию файла"
              />
              {!files ? <p className="muted">Загружаю список…</p> : null}
              {files && !visible.length ? <p className="muted">Видео не найдено.</p> : null}
              <ul className="yadisk__list">
                {visible.map((f) => (
                  <li key={f.path} className="yadisk__file">
                    <span className="yadisk__name" title={f.path.replace(/^disk:/, '')}>
                      🎞 {f.name}
                    </span>
                    <span className="muted">{formatSize(f.size)}</span>
                    <button
                      className="btn btn--ghost btn--sm"
                      type="button"
                      disabled={disabled || busy}
                      onClick={() => start({ path: f.path })}
                    >
                      Взять
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
