import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackLink } from '../components/BackLink.jsx';
import { FilePicker } from '../components/FilePicker.jsx';
import { AppShell } from '../components/AppShell.jsx';
import { Flag } from '../components/Flag.jsx';
import { PrepSteps } from '../components/PrepSteps.jsx';
import { useAuthStore } from '../store/authStore.js';
import {
  createMyFilm,
  deleteMyFilm,
  fetchMyFilm,
  prepareMyFilm,
  removeMyFilmPoster,
  removeMyFilmSubtitles,
  removeMyFilmVideo,
  searchMyFilmPosters,
  translateMyFilmSubtitles,
  uploadMyFilmPoster,
  setMyFilmVideoLink,
  updateMyFilm,
  uploadMyFilmSubtitle,
  uploadMyFilmVideo,
} from '../api/myFilms.js';
import { activeLanguageOf, CEFR_LEVELS, LANGUAGES, languageGen, languageName, levelFor } from '../utils/languages.js';
import '../styles/myFilms.css';

const VIDEO_STAGES = {
  downloading: 'Скачиваем с Яндекс Диска',
  queued: 'В очереди на обработку',
  transcoding: 'Готовим видео для плеера',
  uploading: 'Сохраняем',
};

function linkKind(url) {
  if (/youtube\.com|youtu\.be/i.test(url)) return 'YouTube';
  if (/vimeo\.com/i.test(url)) return 'Vimeo';
  if (/disk\.yandex|yadi\.sk/i.test(url)) return 'Яндекс Диск';
  return 'прямая ссылка';
}

function Field({ label, hint, children }) {
  return (
    <label className="admin-field">
      <span className="admin-field__label">{label}</span>
      {children}
      {hint ? <span className="admin-field__hint">{hint}</span> : null}
    </label>
  );
}

function ProgressBar({ value, label }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="upload-progress">
      <span className="muted">
        {label}: {pct}%
      </span>
      <div className="upload-progress__bar">
        <div className="upload-progress__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function toForm(film, fallbackLanguage, fallbackLevel) {
  return {
    title: film?.title || '',
    language: film?.language || fallbackLanguage,
    recommendedLevel: film?.recommendedLevel || fallbackLevel || '',
    externalWatchUrl: film?.externalWatchUrl || '',
    description: film?.description || '',
  };
}

function toPayload(form) {
  return {
    title: form.title.trim(),
    language: form.language,
    recommendedLevel: form.recommendedLevel || null,
    externalWatchUrl: form.externalWatchUrl.trim() || null,
    description: form.description.trim(),
  };
}

function BasicsForm({ film, onSaved }) {
  const user = useAuthStore((s) => s.user);
  const fallbackLanguage = activeLanguageOf(user);
  const [form, setForm] = useState(() => toForm(film, fallbackLanguage, levelFor(user, fallbackLanguage)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const languageLocked = Boolean(film?.subtitles?.original);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const payload = toPayload(form);
      const data = film ? await updateMyFilm(film.id, payload) : await createMyFilm(payload);
      setMessage(film ? 'Сохранено' : '');
      onSaved(data.item);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="myfilm-form" onSubmit={onSubmit}>
      <div className="myfilm-form__grid">
        <Field label="Название *">
          <input value={form.title} onChange={set('title')} maxLength={200} required placeholder="Например, Notting Hill" />
        </Field>
        <Field
          label="Язык фильма"
          hint={languageLocked ? 'Субтитры уже загружены — язык менять нельзя' : 'На нём должны быть основные субтитры'}
        >
          <select value={form.language} onChange={set('language')} disabled={languageLocked}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.native})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Уровень">
          <select value={form.recommendedLevel} onChange={set('recommendedLevel')}>
            <option value="">не знаю</option>
            {CEFR_LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Где смотреть (ссылка)" hint="Если видео не добавляете — кнопка «Смотреть» откроет эту страницу">
          <input
            type="url"
            value={form.externalWatchUrl}
            onChange={set('externalWatchUrl')}
            placeholder="https://www.kinopoisk.ru/…"
          />
        </Field>
      </div>
      <Field label="Комментарий" hint="Необязательно, виден только вам">
        <textarea
          rows={3}
          value={form.description}
          onChange={set('description')}
          maxLength={3000}
          placeholder="Например: смотрю с сестрой, выписать фразы из второй половины"
        />
      </Field>
      {error ? <p className="auth-error">{error}</p> : null}
      <div className="myfilm-form__actions">
        <button className="btn btn--primary" type="submit" disabled={busy || !form.title.trim()}>
          {busy ? 'Сохраняем…' : film ? 'Сохранить' : 'Создать и продолжить'}
        </button>
        {message ? <span className="muted">{message}</span> : null}
      </div>
    </form>
  );
}

function PosterPicker({ film, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState(null);
  const [query, setQuery] = useState(film.title);
  const [results, setResults] = useState(null);
  const [link, setLink] = useState('');

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      const data = await action();
      onChange(data.item);
      setPanel(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function search(e) {
    e?.preventDefault();
    setBusy(true);
    setError('');
    setResults(null);
    try {
      const data = await searchMyFilmPosters(film.id, query.trim());
      setResults(data.items);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) run(() => uploadMyFilmPoster(film.id, file));
  }

  function openSearch() {
    setPanel(panel === 'search' ? null : 'search');
    if (panel !== 'search' && !results) search();
  }

  return (
    <div className="poster-picker">
      <div className="poster-picker__preview">
        {film.posterUrl ? (
          <img src={film.posterUrl} alt="" />
        ) : (
          <span className="media-card__poster-fallback">{film.title.slice(0, 1)}</span>
        )}
      </div>
      <div className="poster-picker__side">
        <strong>Обложка</strong>
        <p className="admin-field__hint">
          {film.posterUrl
            ? 'Её видно в списке «Мои фильмы».'
            : 'Пока нет — возьмём кадр из загруженного видео или превью YouTube/Vimeo. Или выберите сами:'}
        </p>
        <div className="poster-picker__actions">
          <label className={`btn btn--ghost btn--sm${busy ? ' is-busy' : ''}`}>
            Загрузить картинку
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onFile} hidden />
          </label>
          <button className="btn btn--ghost btn--sm" type="button" onClick={openSearch} disabled={busy}>
            Найти по названию
          </button>
          <button
            className="btn btn--ghost btn--sm"
            type="button"
            onClick={() => setPanel(panel === 'link' ? null : 'link')}
            disabled={busy}
          >
            Ссылка
          </button>
          {film.posterUrl ? (
            <button className="btn btn--ghost btn--sm" type="button" onClick={() => run(() => removeMyFilmPoster(film.id))} disabled={busy}>
              Убрать
            </button>
          ) : null}
        </div>

        {panel === 'link' ? (
          <form
            className="myfilm-inline"
            onSubmit={(e) => {
              e.preventDefault();
              if (link.trim()) run(() => updateMyFilm(film.id, { posterUrl: link.trim() }));
            }}
          >
            <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…/poster.jpg" />
            <button className="btn btn--primary btn--sm" type="submit" disabled={busy || !link.trim()}>
              Поставить
            </button>
          </form>
        ) : null}

        {panel === 'search' ? (
          <div className="poster-search">
            <form className="myfilm-inline" onSubmit={search}>
              <input
                className="poster-search__input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Название фильма"
              />
              <button className="btn btn--primary btn--sm" type="submit" disabled={busy || !query.trim()}>
                Искать
              </button>
            </form>
            {busy && !results ? <p className="muted">Ищем в Википедии…</p> : null}
            {results && !results.length ? (
              <p className="muted">Ничего не нашлось — попробуйте оригинальное название.</p>
            ) : null}
            {results?.length ? (
              <div className="poster-search__grid">
                {results.map((r) => (
                  <button
                    key={r.url}
                    type="button"
                    className="poster-search__item"
                    title={r.title}
                    disabled={busy}
                    onClick={() => run(() => updateMyFilm(film.id, { posterUrl: r.url }))}
                  >
                    <img src={r.url} alt={r.title} loading="lazy" />
                    <span>{r.title}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="auth-error">{error}</p> : null}
      </div>
    </div>
  );
}

function VideoStep({ film, onChange }) {
  const [mode, setMode] = useState('file');
  const [link, setLink] = useState('');
  const [uploadPct, setUploadPct] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [videoFile, setVideoFile] = useState(null);
  const processing = film.videoStatus === 'processing';

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      const data = await action();
      onChange(data.item);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
      setUploadPct(null);
    }
  }

  function onUpload(e) {
    e.preventDefault();
    const file = videoFile;
    if (!file) return;
    setUploadPct(0);
    run(() => uploadMyFilmVideo(film.id, file, (ratio) => setUploadPct(ratio * 100)));
  }

  function onLink(e) {
    e.preventDefault();
    if (!link.trim()) return;
    run(() => setMyFilmVideoLink(film.id, link.trim())).then(() => setLink(''));
  }

  let current = <p className="muted">Видео не добавлено — можно учить слова и без него.</p>;
  if (processing) {
    current = (
      <ProgressBar value={film.videoProgress || 0} label={VIDEO_STAGES[film.videoStage] || 'Обработка видео'} />
    );
  } else if (film.videoStatus === 'ready') {
    current = <p className="myfilm-ok">✓ Видео загружено и готово к просмотру</p>;
  } else if (film.videoUrl) {
    current = (
      <p className="myfilm-ok">
        ✓ Ссылка ({linkKind(film.videoUrl)}):{' '}
        <a href={film.videoUrl} target="_blank" rel="noreferrer">
          {film.videoUrl.length > 60 ? `${film.videoUrl.slice(0, 60)}…` : film.videoUrl}
        </a>
      </p>
    );
  } else if (film.videoStatus === 'failed') {
    current = <p className="auth-error">Не удалось обработать видео: {film.videoError || 'ошибка'}</p>;
  }

  const hasVideo = film.videoStatus === 'ready' || film.videoUrl;

  return (
    <>
      {current}
      {hasVideo && !processing ? (
        <button className="btn btn--ghost btn--sm" type="button" disabled={busy} onClick={() => run(() => removeMyFilmVideo(film.id))}>
          Убрать видео
        </button>
      ) : null}
      {!processing ? (
        <>
          <div className="myfilm-tabs" role="tablist">
            <button type="button" className={mode === 'file' ? 'is-active' : ''} onClick={() => setMode('file')}>
              Файл с устройства
            </button>
            <button type="button" className={mode === 'link' ? 'is-active' : ''} onClick={() => setMode('link')}>
              Ссылка
            </button>
          </div>
          {mode === 'file' ? (
            <form className="myfilm-inline" onSubmit={onUpload}>
              <FilePicker
                icon="video"
                accept="video/*,.mkv,.avi,.mov,.webm"
                file={videoFile}
                title="Выбрать видеофайл"
                disabled={busy}
                onChange={setVideoFile}
              />
              <button className="btn btn--primary" type="submit" disabled={busy || !videoFile}>
                Загрузить
              </button>
            </form>
          ) : (
            <form className="myfilm-inline" onSubmit={onLink}>
              <input
                type="url"
                value={link}
                onChange={(e) => setLink(e.target.value)}
                placeholder="https://youtu.be/…, https://disk.yandex.ru/i/…, https://…/film.mp4"
                disabled={busy}
              />
              <button className="btn btn--primary" type="submit" disabled={busy || !link.trim()}>
                Добавить
              </button>
            </form>
          )}
          <p className="admin-field__hint">
            {mode === 'file'
              ? 'Скачанный фильм с компьютера или телефона: MP4, MKV, MOV, AVI, WEBM до 8 ГБ. Не закрывайте страницу, пока загрузка не дойдёт до 100%.'
              : 'YouTube и Vimeo открываются во встроенном плеере (без наших субтитров поверх). Файл с публичной ссылки Яндекс Диска мы скачаем и подготовим, как загруженный.'}
          </p>
        </>
      ) : null}
      {uploadPct !== null ? <ProgressBar value={uploadPct} label="Загрузка файла" /> : null}
      {error ? <p className="auth-error">{error}</p> : null}
    </>
  );
}

function SubtitleSlot({ film, language, title, hint, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isRu = language === 'ru';
  const role = isRu ? 'ru' : 'original';
  const track = isRu ? film.subtitles.ru : film.subtitles.original;
  const translation = film.translation || {};
  const translating = translation.state === 'running';
  const locked = busy || translating || film.pipeline?.state === 'running';
  const canTranslate = isRu && !track && film.llmEnabled && Boolean(film.subtitles.original);

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      const data = await action();
      onChange(data.item);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) run(() => uploadMyFilmSubtitle(film.id, file, language));
  }

  function onRemove() {
    const what = isRu ? 'русские субтитры' : 'субтитры оригинала';
    const note = isRu ? '' : '\nСлова, фразы и тест останутся — после загрузки новых субтитров материалы соберутся заново.';
    if (window.confirm(`Удалить ${what}?${note}`)) run(() => removeMyFilmSubtitles(film.id, role));
  }

  return (
    <div className={`myfilm-sub${track ? ' myfilm-sub--done' : ''}`}>
      <div className="myfilm-sub__head">
        {isRu ? <span className="myfilm-sub__ru">RU</span> : <Flag code={film.language} size="sm" />}
        <strong>{title}</strong>
      </div>
      {track ? (
        <p className="myfilm-ok">
          ✓ {track.source === 'llm' || track.source === 'ai' ? 'переведено нейросетью' : track.filename}
        </p>
      ) : isRu && translating ? (
        <ProgressBar
          value={translation.total ? Math.round((translation.done / translation.total) * 100) : 0}
          label={`Нейросеть переводит (${translation.done} из ${translation.total || '…'} реплик)`}
        />
      ) : (
        <p className="muted">{hint}</p>
      )}
      {isRu && translation.state === 'failed' && !track ? (
        <p className="auth-error">Перевод не удался: {translation.error || 'нейросеть не ответила'}</p>
      ) : null}
      <div className="myfilm-sub__actions">
        <label className={`btn btn--ghost btn--sm myfilm-file${locked ? ' is-busy' : ''}`}>
          {busy ? 'Подождите…' : track ? 'Заменить файл' : 'Выбрать .srt / .vtt'}
          <input type="file" accept=".srt,.vtt" onChange={onFile} disabled={locked} hidden />
        </label>
        {canTranslate && !translating ? (
          <button
            className="btn btn--primary btn--sm"
            type="button"
            disabled={locked}
            onClick={() => run(() => translateMyFilmSubtitles(film.id))}
          >
            Перевести на русский (ИИ)
          </button>
        ) : null}
        {track ? (
          <button className="btn btn--ghost btn--sm myfilm-sub__remove" type="button" disabled={locked} onClick={onRemove}>
            Удалить
          </button>
        ) : null}
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}

function PrepareStep({ film, onChange }) {
  const [translate, setTranslate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pipeline = film.pipeline;
  const running = pipeline?.state === 'running';
  const ready = film.materials.words > 0;
  const canTranslate = film.llmEnabled && !film.subtitles.ru;

  async function onPrepare() {
    setBusy(true);
    setError('');
    try {
      const data = await prepareMyFilm(film.id, { translate: canTranslate && translate });
      onChange(data.item);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {!film.subtitles.original ? (
        <p className="muted">Сначала загрузите субтитры на {languageName(film.language).toLowerCase().replace(/ий$/, 'ом')}.</p>
      ) : null}
      {canTranslate && !running ? (
        <label className="myfilm-check">
          <input type="checkbox" checked={translate} onChange={(e) => setTranslate(e.target.checked)} />
          Перевести субтитры на русский нейросетью (несколько минут)
        </label>
      ) : null}
      <div className="myfilm-form__actions">
        <button
          className="btn btn--primary"
          type="button"
          onClick={onPrepare}
          disabled={busy || running || !film.subtitles.original}
        >
          {running ? 'Готовим…' : ready ? 'Подготовить заново' : 'Подготовить материалы'}
        </button>
        {ready && !running ? (
          <Link className="btn btn--ghost" to={`/media/${film.slug || film.id}`}>
            Открыть фильм →
          </Link>
        ) : null}
      </div>
      {error ? <p className="auth-error">{error}</p> : null}

      <PrepSteps prep={pipeline} translation={film.translation} />

      {ready ? (
        <div className="myfilm-stats">
          <div>
            <strong>{film.materials.words}</strong>
            <span>слов</span>
          </div>
          <div>
            <strong>{film.materials.phrases}</strong>
            <span>фраз</span>
          </div>
          <div>
            <strong>{film.materials.grammar}</strong>
            <span>тем грамматики</span>
          </div>
          <div>
            <strong>{film.materials.quizQuestions}</strong>
            <span>вопросов в тесте</span>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Step({ number, title, done, children, optional }) {
  return (
    <section className={`myfilm-step${done ? ' myfilm-step--done' : ''}`}>
      <header className="myfilm-step__head">
        <span className="myfilm-step__num">{done ? '✓' : number}</span>
        <h2>
          {title}
          {optional ? <span className="muted"> · необязательно</span> : null}
        </h2>
      </header>
      <div className="myfilm-step__body">{children}</div>
    </section>
  );
}

export function MyFilmEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const [film, setFilm] = useState(null);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const data = await fetchMyFilm(id);
      setFilm(data.item);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setFilm(null);
    setLoading(!isNew);
    load();
  }, [load, isNew]);

  const busy =
    film &&
    (film.videoStatus === 'processing' ||
      film.pipeline?.state === 'running' ||
      film.translation?.state === 'running');
  useEffect(() => {
    if (!busy) return undefined;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [busy, load]);

  async function onDelete() {
    if (!window.confirm(`Удалить «${film.title}» вместе с видео, субтитрами и материалами?`)) return;
    try {
      await deleteMyFilm(film.id);
      navigate('/my-films');
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <AppShell>
      <BackLink to="/my-films">Мои фильмы</BackLink>
      <h1 className="page-title">{isNew ? 'Новый фильм' : film?.title || 'Фильм'}</h1>
      <p className="page-lead">
        {film ? (
          <>
            <Flag code={film.language} size="sm" /> Фильм на {languageName(film.language).toLowerCase().replace(/ий$/, 'ом')} ·
            виден только вам
          </>
        ) : (
          'Личный фильм виден только вам и не попадает в общий каталог.'
        )}
      </p>

      {error ? <p className="auth-error">{error}</p> : null}
      {loading ? <p className="muted">Загрузка…</p> : null}

      {isNew ? (
        <div className="myfilm-steps">
          <Step number={1} title="О фильме">
            <BasicsForm film={null} onSaved={(item) => navigate(`/my-films/${item.id}`, { replace: true })} />
          </Step>
          {[
            ['Видео', 'Скачанный файл с устройства или ссылка — после шага 1'],
            ['Субтитры', 'Файл .srt или .vtt — после шага 2'],
            ['Материалы для изучения', 'Слова, фразы, грамматика и тест — после шага 3'],
          ].map(([title, hint], index) => (
            <section key={title} className="myfilm-step myfilm-step--locked">
              <header className="myfilm-step__head">
                <span className="myfilm-step__num">{index + 2}</span>
                <h2>
                  {title} <span className="muted">· {hint}</span>
                </h2>
              </header>
            </section>
          ))}
        </div>
      ) : null}

      {film ? (
        <div className="myfilm-steps">
          <Step number={1} title="О фильме" done>
            <BasicsForm key={film.id} film={film} onSaved={setFilm} />
            <PosterPicker key={`poster-${film.id}`} film={film} onChange={setFilm} />
          </Step>
          <Step
            number={2}
            title="Видео"
            optional
            done={film.videoStatus === 'ready' || Boolean(film.videoUrl)}
          >
            <VideoStep film={film} onChange={setFilm} />
          </Step>
          <Step number={3} title="Субтитры" done={Boolean(film.subtitles.original)}>
            <div className="myfilm-subs">
              <SubtitleSlot
                film={film}
                language={film.language}
                title={`Оригинал (${languageName(film.language).toLowerCase()})`}
                hint={`Обязательно: по ним соберём слова, фразы и грамматику ${languageGen(film.language)}`}
                onChange={setFilm}
              />
              <SubtitleSlot
                film={film}
                language="ru"
                title="Русские"
                hint={
                  film.llmEnabled
                    ? 'Необязательно — могут быть переведены нашей нейросетью'
                    : 'Необязательно — для перевода в плеере'
                }
                onChange={setFilm}
              />
            </div>
          </Step>
          <Step number={4} title="Материалы для изучения" done={film.materials.words > 0}>
            <PrepareStep film={film} onChange={setFilm} />
          </Step>

          <div className="myfilm-danger">
            <button className="btn btn--ghost btn--sm" type="button" onClick={onDelete} disabled={busy}>
              Удалить фильм
            </button>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
