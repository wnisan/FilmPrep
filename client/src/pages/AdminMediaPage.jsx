import { useEffect, useMemo, useState } from 'react';
import {
  createAdminMedia,
  deleteAdminMedia,
  fetchAdminJobs,
  fetchPrepStatus,
  fetchAdminMedia,
  fetchAdminMediaList,
  fetchAdminQuiz,
  fetchAdminSubtitles,
  fetchStorageInfo,
  fetchSubtitleTracks,
  fetchSubtitleTranslation,
  processMedia,
  removeAdminPoster,
  removeAdminVideo,
  uploadAdminPoster,
  saveAdminQuiz,
  startSubtitleTranslation,
  updateAdminMedia,
  uploadSubtitle,
  uploadVideo,
} from '../api/media.js';
import { AppShell } from '../components/AppShell.jsx';
import { FilmPlayer } from '../components/FilmPlayer.jsx';
import { Flag } from '../components/Flag.jsx';
import { YandexDiskImport } from '../components/YandexDiskImport.jsx';
import { FilePicker } from '../components/FilePicker.jsx';
import { PrepSteps } from '../components/PrepSteps.jsx';
import { LANGUAGES, languageName } from '../utils/languages.js';
import { genreLabel, genreTag, themeLabel, themeTag } from '../utils/labels.js';
import '../styles/app.css';

const STORAGE_DRIVER_LABELS = {
  s3: 'облачное хранилище S3',
  yadisk: 'Яндекс Диск',
  local: 'локальная папка',
};

const emptyForm = {
  title: '',
  description: '',
  synopsis: '',
  year: '',
  genres: '',
  themes: '',
  countries: '',
  director: '',
  runtimeMin: '',
  language: 'en',
  recommendedLevel: 'B1',
  videoUrl: '',
  status: 'draft',
};

const emptyQuestion = {
  questionType: 'single_choice',
  prompt: '',
  optionsText: '',
  correctAnswer: '',
  explanation: '',
};

const STATUS_LABELS = {
  draft: 'черновик',
  published: 'опубликован',
};

const PANEL_TABS = [
  { id: 'card', label: 'Карточка' },
  { id: 'video', label: 'Видео' },
  { id: 'nlp', label: 'Субтитры' },
  { id: 'quiz', label: 'Тест' },
];

const JOB_STATUS_LABELS = {
  queued: 'в очереди',
  processing: 'обрабатывается',
  done: 'готово',
  failed: 'ошибка',
};

const VIDEO_STAGE_LABELS = {
  downloading: 'Скачивание с Яндекс Диска',
  queued: 'В очереди на обработку',
  transcoding: 'Нарезка в HLS',
  uploading: 'Отправка в хранилище',
};

function LanguageSelect({ value, onChange }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {LANGUAGES.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name} ({l.native})
        </option>
      ))}
    </select>
  );
}

function formatDuration(sec) {
  if (!sec) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return h ? `${h} ч ${m} мин` : `${m} мин ${String(s).padStart(2, '0')} с`;
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

const QUESTION_TYPE_LABELS = {
  single_choice: 'выбор ответа',
  true_false: 'верно / неверно',
  fill_blank: 'вписать слово',
};

function splitList(value) {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function PosterField({ src, file, busy, onPick, onRemove }) {
  return (
    <div className="poster-field">
      <span className="poster-field__preview">{src ? <img src={src} alt="" /> : 'нет обложки'}</span>
      <div className="poster-field__side">
        <FilePicker
          icon="image"
          accept="image/jpeg,image/png,image/webp,image/gif"
          file={file}
          disabled={busy}
          title={busy ? 'Загрузка…' : src ? 'Заменить обложку' : 'Загрузить обложку'}
          onChange={onPick}
        />
        {onRemove ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onRemove} disabled={busy}>
            Убрать обложку
          </button>
        ) : null}
      </div>
    </div>
  );
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

export function AdminMediaPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [panelTab, setPanelTab] = useState('video');
  const [subtitles, setSubtitles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [file, setFile] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrlDraft, setVideoUrlDraft] = useState('');
  const [cardDraft, setCardDraft] = useState({
    title: '',
    description: '',
    synopsis: '',
    posterUrl: '',
    year: '',
    genres: '',
    themes: '',
    countries: '',
    director: '',
    runtimeMin: '',
    language: 'en',
  });
  const [quizTitle, setQuizTitle] = useState('Тест по фильму');
  const [quizPublished, setQuizPublished] = useState(true);
  const [questions, setQuestions] = useState([]);
  const [newQuestion, setNewQuestion] = useState(emptyQuestion);
  const [adminItem, setAdminItem] = useState(null);
  const [storage, setStorage] = useState(null);
  const [videoUploadPct, setVideoUploadPct] = useState(null);
  const [subLanguage, setSubLanguage] = useState('en');
  const [translation, setTranslation] = useState(null);
  const [prep, setPrep] = useState(null);
  const [previewTracks, setPreviewTracks] = useState([]);
  const [newPosterFile, setNewPosterFile] = useState(null);
  const [posterBusy, setPosterBusy] = useState(false);
  const newPosterPreview = useMemo(
    () => (newPosterFile ? URL.createObjectURL(newPosterFile) : ''),
    [newPosterFile],
  );

  useEffect(() => () => newPosterPreview && URL.revokeObjectURL(newPosterPreview), [newPosterPreview]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminMediaList({ limit: 50 });
      setItems(data.items);
    } catch (err) {
      setError(err.message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }

  async function loadSelected(mediaId) {
    if (!mediaId) return;
    try {
      const [subs, jobList, quizData, list, media, tr, tracks, prepData] = await Promise.all([
        fetchAdminSubtitles(mediaId),
        fetchAdminJobs(mediaId),
        fetchAdminQuiz(mediaId),
        fetchAdminMediaList({ limit: 50 }),
        fetchAdminMedia(mediaId),
        fetchSubtitleTranslation(mediaId).catch(() => ({ status: null })),
        fetchSubtitleTracks(mediaId).catch(() => ({ items: [] })),
        fetchPrepStatus(mediaId).catch(() => ({ prep: null })),
      ]);
      setPrep(prepData.prep);
      setItems(list.items);
      setAdminItem(media.item);
      setTranslation(tr.status);
      setPreviewTracks(tracks.items || []);
      const current = list.items.find((i) => i.id === mediaId);
      setVideoUrlDraft(current?.videoUrl || '');
      setCardDraft({
        title: current?.title || '',
        description: current?.description || '',
        synopsis: current?.synopsis || '',
        posterUrl: current?.posterUrl || '',
        year: current?.year ? String(current.year) : '',
        genres: (current?.genres || []).map(genreLabel).join(', '),
        themes: (current?.themes || []).map(themeLabel).join(', '),
        countries: (current?.countries || []).join(', '),
        director: current?.director || '',
        runtimeMin: current?.runtimeMin ? String(current.runtimeMin) : '',
        language: current?.language || 'en',
      });
      setSubLanguage(current?.language || 'en');
      setSubtitles(subs.items);
      setJobs(jobList.items);
      setQuizTitle(quizData.quiz?.title || 'Тест по фильму');
      setQuizPublished(quizData.quiz?.isPublished ?? true);
      setQuestions(
        (quizData.questions || []).map((q) => ({
          questionType: q.questionType,
          prompt: q.prompt,
          optionsText: Array.isArray(q.options) ? q.options.join(', ') : '',
          correctAnswer: Array.isArray(q.correctAnswer)
            ? q.correctAnswer[0]
            : String(q.correctAnswer ?? ''),
          explanation: q.explanation || '',
        })),
      );
    } catch (err) {
      setError(err.message || 'Не удалось загрузить панель фильма');
    }
  }

  useEffect(() => {
    load();
    fetchStorageInfo()
      .then((data) => setStorage(data.storage))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedId) {
      setPanelTab('card');
      setAdminItem(null);
      loadSelected(selectedId);
    }
  }, [selectedId]);

  const videoBusy = adminItem?.videoStatus === 'processing';
  const translationBusy = translation?.state === 'running';

  // Live status while ffmpeg / LLM translation work in the background
  useEffect(() => {
    if (!selectedId || (!videoBusy && !translationBusy)) return undefined;
    const timer = setInterval(async () => {
      try {
        const [media, tr] = await Promise.all([
          fetchAdminMedia(selectedId),
          fetchSubtitleTranslation(selectedId),
        ]);
        setAdminItem(media.item);
        setTranslation(tr.status);
        const videoFinished = videoBusy && media.item.videoStatus !== 'processing';
        const translationFinished = translationBusy && tr.status?.state !== 'running';
        if (videoFinished || translationFinished) {
          loadSelected(selectedId);
        }
      } catch {
        // next tick will retry
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [selectedId, videoBusy, translationBusy]);

  async function onCreate(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const created = await createAdminMedia({
        title: form.title,
        description: form.description,
        synopsis: form.synopsis,
        year: form.year ? Number(form.year) : null,
        genres: splitList(form.genres).map(genreTag),
        themes: splitList(form.themes).map(themeTag),
        countries: splitList(form.countries),
        director: form.director.trim() || null,
        runtimeMin: form.runtimeMin ? Number(form.runtimeMin) : null,
        language: form.language,
        recommendedLevel: form.recommendedLevel || null,
        videoUrl: form.videoUrl || null,
        status: form.status,
      });
      if (newPosterFile && created?.item?.id) {
        await uploadAdminPoster(created.item.id, newPosterFile).catch((err) =>
          setError(`Фильм создан, но обложка не загрузилась: ${err.message}`),
        );
      }
      setForm(emptyForm);
      setNewPosterFile(null);
      setMessage('Фильм добавлен в каталог');
      await load();
      if (created?.item?.id) setSelectedId(created.item.id);
    } catch (err) {
      setError(err.message || 'Не удалось создать');
    }
  }

  async function toggleStatus(item) {
    const next = item.status === 'published' ? 'draft' : 'published';
    try {
      await updateAdminMedia(item.id, { status: next });
      await load();
      if (selectedId === item.id) await loadSelected(item.id);
    } catch (err) {
      setError(err.message || 'Не удалось обновить статус');
    }
  }

  async function onDelete(id) {
    if (!window.confirm('Удалить фильм из каталога?')) return;
    try {
      await deleteAdminMedia(id);
      if (selectedId === id) setSelectedId(null);
      await load();
      setMessage('Удалено');
    } catch (err) {
      setError(err.message || 'Не удалось удалить');
    }
  }

  async function onUpload(event) {
    event.preventDefault();
    if (!selectedId || !file) return;
    setError('');
    setMessage('');
    try {
      const data = await uploadSubtitle(selectedId, file, subLanguage);
      setFile(null);
      setMessage(
        data.prep?.state === 'running'
          ? 'Субтитры загружены — готовим словарь, перевод и тест'
          : `Субтитры загружены: ${languageName(subLanguage).toLowerCase()}`,
      );
      await loadSelected(selectedId);
    } catch (err) {
      setError(err.message || 'Ошибка загрузки файла');
    }
  }

  async function onUploadVideo(event) {
    event.preventDefault();
    if (!selectedId || !videoFile) return;
    setError('');
    setMessage('');
    setVideoUploadPct(0);
    try {
      const data = await uploadVideo(selectedId, videoFile, (ratio) => setVideoUploadPct(ratio * 100));
      setVideoFile(null);
      setAdminItem((prev) => ({ ...prev, ...data.item }));
      setMessage('Файл загружен — идёт обработка');
    } catch (err) {
      setError(err.message || 'Ошибка загрузки видео');
    } finally {
      setVideoUploadPct(null);
    }
  }

  async function onRemoveVideo() {
    if (!selectedId || !window.confirm('Удалить видео этого фильма из хранилища?')) return;
    setError('');
    setMessage('');
    try {
      await removeAdminVideo(selectedId);
      setMessage('Видео удалено');
      await loadSelected(selectedId);
    } catch (err) {
      setError(err.message || 'Не удалось удалить видео');
    }
  }

  async function onTranslate() {
    if (!selectedId) return;
    setError('');
    setMessage('');
    try {
      const { status } = await startSubtitleTranslation(selectedId);
      setTranslation(status);
    } catch (err) {
      setError(err.message || 'Не удалось запустить перевод');
    }
  }

  async function onSaveCard(event) {
    event.preventDefault();
    if (!selectedId) return;
    setError('');
    setMessage('');
    try {
      await updateAdminMedia(selectedId, {
        title: cardDraft.title.trim(),
        description: cardDraft.description,
        synopsis: cardDraft.synopsis,
        year: cardDraft.year ? Number(cardDraft.year) : null,
        genres: splitList(cardDraft.genres).map(genreTag),
        themes: splitList(cardDraft.themes).map(themeTag),
        countries: splitList(cardDraft.countries),
        director: cardDraft.director.trim() || null,
        runtimeMin: cardDraft.runtimeMin ? Number(cardDraft.runtimeMin) : null,
        language: cardDraft.language,
      });
      setMessage('Карточка сохранена');
      await loadSelected(selectedId);
    } catch (err) {
      setError(err.message || 'Не удалось сохранить карточку');
    }
  }

  async function onPickPoster(posterFile) {
    if (!selectedId || !posterFile) return;
    setError('');
    setMessage('');
    setPosterBusy(true);
    try {
      const { item } = await uploadAdminPoster(selectedId, posterFile);
      setCardDraft((d) => ({ ...d, posterUrl: item.posterUrl || '' }));
      setMessage('Обложка обновлена');
      await load();
    } catch (err) {
      setError(err.message || 'Не удалось загрузить обложку');
    } finally {
      setPosterBusy(false);
    }
  }

  async function onRemovePoster() {
    if (!selectedId) return;
    setPosterBusy(true);
    try {
      await removeAdminPoster(selectedId);
      setCardDraft((d) => ({ ...d, posterUrl: '' }));
      await load();
    } catch (err) {
      setError(err.message || 'Не удалось удалить обложку');
    } finally {
      setPosterBusy(false);
    }
  }

  async function onSaveVideoUrl(event) {
    event.preventDefault();
    if (!selectedId) return;
    setError('');
    setMessage('');
    try {
      await updateAdminMedia(selectedId, { videoUrl: videoUrlDraft.trim() || null });
      setMessage('Ссылка на видео сохранена');
      await loadSelected(selectedId);
    } catch (err) {
      setError(err.message || 'Не удалось сохранить video URL');
    }
  }

  async function onProcess() {
    if (!selectedId) return;
    setError('');
    setMessage('');
    const regenerateQuiz =
      questions.length >= 5 && window.confirm('Пересоздать и тест? «Отмена» — оставить текущий тест как есть.');
    try {
      const data = await processMedia(selectedId, { regenerateQuiz });
      setPrep(data.prep);
    } catch (err) {
      setError(err.message || 'Не удалось запустить подготовку');
    }
  }

  const prepRunning = prep?.state === 'running';
  useEffect(() => {
    if (!prepRunning || !selectedId) return undefined;
    const timer = setInterval(async () => {
      try {
        const data = await fetchPrepStatus(selectedId);
        setPrep(data.prep);
        if (data.prep?.state !== 'running') loadSelected(selectedId);
      } catch {
        /* next tick */
      }
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prepRunning, selectedId]);

  function addQuestion(event) {
    event.preventDefault();
    if (!newQuestion.prompt.trim() || !newQuestion.correctAnswer.trim()) {
      setError('Нужны текст вопроса и правильный ответ');
      return;
    }
    setQuestions((prev) => [...prev, { ...newQuestion }]);
    setNewQuestion(emptyQuestion);
    setError('');
    setMessage('Вопрос добавлен в список — не забудьте «Сохранить тест»');
  }

  async function onSaveQuiz() {
    if (!selectedId) return;
    setError('');
    setMessage('');
    try {
      const payloadQuestions = questions.map((q, index) => {
        let correctAnswer = q.correctAnswer;
        if (q.questionType === 'true_false') {
          correctAnswer = String(q.correctAnswer).toLowerCase() === 'true';
        }
        return {
          questionType: q.questionType,
          prompt: q.prompt,
          options:
            q.questionType === 'fill_blank'
              ? []
              : q.questionType === 'true_false'
                ? [true, false]
                : splitList(q.optionsText),
          correctAnswer:
            q.questionType === 'fill_blank' ? [correctAnswer, String(correctAnswer)] : correctAnswer,
          explanation: q.explanation || null,
          sortOrder: index,
        };
      });

      await saveAdminQuiz(selectedId, {
        title: quizTitle,
        isPublished: quizPublished,
        questions: payloadQuestions,
      });
      setMessage(
        payloadQuestions.length >= 5
          ? 'Тест сохранён'
          : 'Тест сохранён, но для прохождения нужно минимум 5 вопросов',
      );
      await loadSelected(selectedId);
    } catch (err) {
      setError(err.message || 'Не удалось сохранить тест');
    }
  }

  const selected = items.find((i) => i.id === selectedId) || null;
  const latestJob = jobs[0] || null;

  return (
    <AppShell>
      <header className="admin-hero">
        <h1 className="page-title">Админка</h1>
      </header>

      {error ? <p className="auth-error admin-flash">{error}</p> : null}
      {message ? <p className="landing__status--ok admin-flash">{message}</p> : null}

      <div className="admin-layout">
        <section className="admin-panel admin-panel--catalog">
          <div className="admin-panel__head">
            <h2>Каталог</h2>
            <span className="muted">{items.length} шт.</span>
          </div>

          {loading ? <p className="muted">Загрузка…</p> : null}

          <div className="admin-catalog">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`admin-catalog__item${selectedId === item.id ? ' is-active' : ''}`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="admin-catalog__top">
                  <strong>{item.title}</strong>
                  <span className={`admin-status admin-status--${item.status}`}>
                    {STATUS_LABELS[item.status] || item.status}
                  </span>
                </div>
                <div className="admin-catalog__meta">
                  <Flag code={item.language} size="sm" title={languageName(item.language)} /> {item.year || '—'} ·{' '}
                  {item.recommendedLevel || 'уровень не указан'}
                  {item.videoStatus === 'processing'
                    ? ' · видео обрабатывается'
                    : item.hasVideo || item.videoUrl
                      ? ' · видео'
                      : ''}
                  {item.hasMaterials ? ' · материалы' : ''}
                  {item.hasQuiz ? ' · тест' : ''}
                </div>
                <div className="admin-catalog__actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn btn--ghost btn--sm" type="button" onClick={() => toggleStatus(item)}>
                    {item.status === 'published' ? 'В черновики' : 'Опубликовать'}
                  </button>
                  <button className="btn btn--ghost btn--sm" type="button" onClick={() => onDelete(item.id)}>
                    Удалить
                  </button>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="admin-panel">
          <div className="admin-panel__head">
            <h2>Новый фильм</h2>
          </div>
          <form className="admin-grid-form" onSubmit={onCreate}>
            <Field label="Название">
              <input
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Paddington"
              />
            </Field>
            <Field label="Язык фильма" hint="на нём должны быть оригинальные субтитры">
              <LanguageSelect value={form.language} onChange={(language) => setForm((f) => ({ ...f, language }))} />
            </Field>
            <Field label="Краткое описание" hint="для карточки в каталоге">
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Вежливый медвежонок из Перу приезжает в Лондон…"
              />
            </Field>
            <Field label="Полное описание" hint="для страницы фильма; абзацы через пустую строку">
              <textarea
                value={form.synopsis}
                onChange={(e) => setForm((f) => ({ ...f, synopsis: e.target.value }))}
              />
            </Field>
            <Field label="Обложка" hint="JPG, PNG или WebP до 5 МБ, лучше вертикальная 2:3">
              <PosterField
                src={newPosterPreview}
                file={newPosterFile}
                onPick={setNewPosterFile}
              />
            </Field>
            <div className="admin-grid-form__row">
              <Field label="Год">
                <input
                  value={form.year}
                  onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                  placeholder="2014"
                />
              </Field>
              <Field label="Уровень CEFR">
                <select
                  value={form.recommendedLevel}
                  onChange={(e) => setForm((f) => ({ ...f, recommendedLevel: e.target.value }))}
                >
                  {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Статус">
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="draft">Черновик</option>
                  <option value="published">Опубликован</option>
                </select>
              </Field>
            </div>
            <Field label="Жанры" hint="через запятую">
              <input
                value={form.genres}
                onChange={(e) => setForm((f) => ({ ...f, genres: e.target.value }))}
                placeholder="комедия, семейный"
              />
            </Field>
            <Field label="Темы" hint="через запятую">
              <input
                value={form.themes}
                onChange={(e) => setForm((f) => ({ ...f, themes: e.target.value }))}
                placeholder="Лондон, доброта"
              />
            </Field>
            <div className="admin-grid-form__row">
              <Field label="Страны" hint="через запятую">
                <input
                  value={form.countries}
                  onChange={(e) => setForm((f) => ({ ...f, countries: e.target.value }))}
                  placeholder="Великобритания, Франция"
                />
              </Field>
              <Field label="Режиссёр">
                <input
                  value={form.director}
                  onChange={(e) => setForm((f) => ({ ...f, director: e.target.value }))}
                  placeholder="Пол Кинг"
                />
              </Field>
              <Field label="Длительность, мин">
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={form.runtimeMin}
                  onChange={(e) => setForm((f) => ({ ...f, runtimeMin: e.target.value }))}
                  placeholder="95"
                />
              </Field>
            </div>
            <button className="btn btn--primary" type="submit">
              Добавить в каталог
            </button>
          </form>
        </section>
      </div>

      {selected ? (
        <section className="admin-workspace">
          <div className="admin-workspace__head">
            <div>
              <p className="admin-workspace__eyebrow">Редактирование</p>
              <h2 className="admin-workspace__title">{selected.title}</h2>
              <p className="muted">
                <Flag code={selected.language} size="sm" /> {languageName(selected.language)} · {selected.year || '—'} ·{' '}
                {selected.recommendedLevel || '—'} · {STATUS_LABELS[selected.status] || selected.status}
              </p>
            </div>
            <button className="btn btn--ghost" type="button" onClick={() => setSelectedId(null)}>
              Закрыть
            </button>
          </div>

          <div className="tabs">
            {PANEL_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tabs__btn${panelTab === t.id ? ' tabs__btn--active' : ''}`}
                onClick={() => setPanelTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {panelTab === 'card' ? (
            <div className="admin-section">
              <h3>Карточка фильма</h3>
              <form className="admin-grid-form" onSubmit={onSaveCard}>
                <Field label="Название">
                  <input
                    required
                    maxLength={200}
                    value={cardDraft.title}
                    onChange={(e) => setCardDraft((d) => ({ ...d, title: e.target.value }))}
                  />
                </Field>
                <Field label="Краткое описание" hint="отображается в каталоге">
                  <textarea
                    value={cardDraft.description}
                    onChange={(e) => setCardDraft((d) => ({ ...d, description: e.target.value }))}
                  />
                </Field>
                <Field label="Полное описание" hint="на странице фильма; абзацы через пустую строку">
                  <textarea
                    className="admin-textarea--tall"
                    value={cardDraft.synopsis}
                    onChange={(e) => setCardDraft((d) => ({ ...d, synopsis: e.target.value }))}
                  />
                </Field>
                <Field label="Обложка" hint="JPG, PNG или WebP до 5 МБ — сохраняется сразу">
                  <PosterField
                    src={cardDraft.posterUrl}
                    busy={posterBusy}
                    onPick={onPickPoster}
                    onRemove={cardDraft.posterUrl ? onRemovePoster : null}
                  />
                </Field>
                <div className="admin-grid-form__row">
                  <Field label="Год">
                    <input
                      type="number"
                      min="1888"
                      max="2100"
                      value={cardDraft.year}
                      onChange={(e) => setCardDraft((d) => ({ ...d, year: e.target.value }))}
                    />
                  </Field>
                  <Field label="Длительность, мин">
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={cardDraft.runtimeMin}
                      onChange={(e) => setCardDraft((d) => ({ ...d, runtimeMin: e.target.value }))}
                    />
                  </Field>
                  <Field label="Режиссёр">
                    <input
                      value={cardDraft.director}
                      onChange={(e) => setCardDraft((d) => ({ ...d, director: e.target.value }))}
                    />
                  </Field>
                </div>
                <div className="admin-grid-form__row">
                  <Field label="Язык фильма" hint="по нему строится словарь и фильтр каталога">
                    <LanguageSelect
                      value={cardDraft.language}
                      onChange={(language) => setCardDraft((d) => ({ ...d, language }))}
                    />
                  </Field>
                  <Field label="Страны" hint="через запятую, по-русски — так они попадут в фильтр каталога">
                    <input
                      value={cardDraft.countries}
                      onChange={(e) => setCardDraft((d) => ({ ...d, countries: e.target.value }))}
                    />
                  </Field>
                </div>
                <div className="admin-grid-form__row">
                  <Field label="Жанры" hint="через запятую">
                    <input
                      value={cardDraft.genres}
                      onChange={(e) => setCardDraft((d) => ({ ...d, genres: e.target.value }))}
                    />
                  </Field>
                  <Field label="Темы" hint="через запятую">
                    <input
                      value={cardDraft.themes}
                      onChange={(e) => setCardDraft((d) => ({ ...d, themes: e.target.value }))}
                    />
                  </Field>
                </div>
                <button className="btn btn--primary" type="submit">
                  Сохранить карточку
                </button>
              </form>
            </div>
          ) : null}

          {panelTab === 'video' ? (
            <div className="admin-section">
              <div className="admin-section__head">
                <h3>Видео</h3>
                {storage ? (
                  <span className="storage-badge" title={storage.error || ''}>
                    <span
                      className={`storage-badge__dot${
                        !storage.ok ? ' storage-badge__dot--bad' : storage.driver === 'local' ? ' storage-badge__dot--warn' : ''
                      }`}
                    />
                    Хранилище: {storage.label}
                    {storage.ok ? '' : ' — недоступно'}
                  </span>
                ) : null}
              </div>

              {adminItem?.streamUrl && !videoBusy ? (
                <FilmPlayer
                  mediaId={adminItem.id}
                  src={adminItem.streamUrl}
                  title={adminItem.title}
                  tracks={previewTracks}
                  resumeKey={`admin:${adminItem.id}`}
                />
              ) : null}

              {videoBusy ? (
                <ProgressBar
                  value={adminItem.videoProgress}
                  label={VIDEO_STAGE_LABELS[adminItem.videoStage] || 'Обработка'}
                />
              ) : null}

              {adminItem?.videoStatus === 'failed' ? (
                <p className="auth-error">Ошибка обработки: {adminItem.videoError}</p>
              ) : null}

              {adminItem?.videoStatus === 'ready' ? (
                <div className="admin-inline-form">
                  <span className="muted">
                    Готово
                    {adminItem.videoDurationSec ? ` · ${formatDuration(adminItem.videoDurationSec)}` : ''}
                    {' · '}
                    {STORAGE_DRIVER_LABELS[adminItem.videoStorageDriver] || 'локальная папка'}
                  </span>
                  <button className="btn btn--ghost btn--sm" type="button" onClick={onRemoveVideo}>
                    Удалить видео
                  </button>
                </div>
              ) : null}

              <form className="admin-inline-form" onSubmit={onUploadVideo}>
                <Field
                  label={adminItem?.videoStatus === 'ready' ? 'Заменить видеофайл' : 'Видеофайл'}
                  hint=".mp4, .mkv, .mov, .avi"
                >
                  <FilePicker
                    icon="video"
                    accept="video/*,.mkv,.mov,.avi,.m4v"
                    file={videoFile}
                    title="Выбрать видеофайл"
                    disabled={videoBusy || videoUploadPct != null}
                    onChange={setVideoFile}
                  />
                </Field>
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={!videoFile || videoBusy || videoUploadPct != null}
                >
                  Загрузить
                </button>
              </form>
              {videoUploadPct != null ? <ProgressBar value={videoUploadPct} label="Загрузка на сервер" /> : null}

              <YandexDiskImport
                mediaId={selectedId}
                connected={Boolean(storage?.yadiskConnected)}
                disabled={videoBusy || videoUploadPct != null}
                onStarted={(item) => {
                  setError('');
                  setAdminItem((prev) => ({ ...prev, ...item }));
                  setMessage('Импорт с Яндекс Диска начался — можно закрыть страницу, обработка идёт на сервере');
                }}
                onError={setError}
              />

              <form className="admin-inline-form" onSubmit={onSaveVideoUrl}>
                <Field label="Или ссылка на видео" hint="прямая ссылка на .mp4 или .m3u8">
                  <input
                    value={videoUrlDraft}
                    onChange={(e) => setVideoUrlDraft(e.target.value)}
                    placeholder="https://…/film.m3u8"
                  />
                </Field>
                <button className="btn btn--ghost" type="submit">
                  Сохранить ссылку
                </button>
              </form>
            </div>
          ) : null}

          {panelTab === 'nlp' ? (
            <div className="admin-section">
              <h3>Субтитры → словарь, фразы, грамматика</h3>
              <form className="admin-inline-form" onSubmit={onUpload}>
                <Field label="Язык">
                  <select value={subLanguage} onChange={(e) => setSubLanguage(e.target.value)}>
                    <option value={selected.language}>{languageName(selected.language)} (оригинал)</option>
                    <option value="ru">Русский (перевод)</option>
                  </select>
                </Field>
                <Field label="Файл субтитров (.srt / .vtt)">
                  <FilePicker accept=".srt,.vtt" file={file} title="Выбрать субтитры" onChange={setFile} />
                </Field>
                <button className="btn btn--primary" type="submit" disabled={!file}>
                  Загрузить
                </button>
              </form>

              <p className="muted">
                После загрузки субтитров на языке фильма всё готовится само: словарь, фразы и грамматика, русские
                субтитры, русский перевод слов и фраз и тест.
              </p>
              <PrepSteps prep={prep} translation={translation} />

              <div className="admin-inline-form">
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={onProcess}
                  disabled={prepRunning || !subtitles.some((s) => s.language === selected.language)}
                >
                  {prepRunning ? 'Готовим…' : 'Подготовить заново'}
                </button>
                <button
                  className="btn btn--ghost"
                  type="button"
                  onClick={onTranslate}
                  disabled={translationBusy || !subtitles.some((s) => s.language === selected.language)}
                  title={`${languageName(selected.language)} → русский`}
                >
                  Перевести на русский (ИИ)
                </button>
              </div>
              {translationBusy ? (
                <ProgressBar
                  value={translation.total ? (translation.done / translation.total) * 100 : 0}
                  label={`Перевод реплик${translation.total ? ` (${translation.done} / ${translation.total})` : ''}`}
                />
              ) : null}
              {translation?.state === 'failed' ? (
                <p className="auth-error">Перевод не удался: {translation.error}</p>
              ) : null}

              <div className="admin-stats">
                <div className="admin-stat">
                  <span className="admin-stat__label">Субтитры</span>
                  <strong>{subtitles.length}</strong>
                </div>
                <div className="admin-stat">
                  <span className="admin-stat__label">Последняя обработка</span>
                  <strong>{latestJob ? JOB_STATUS_LABELS[latestJob.status] || latestJob.status : '—'}</strong>
                </div>
              </div>

              {subtitles.length ? (
                <ul className="materials__list">
                  {subtitles.map((s) => (
                    <li key={s.id} className="materials__item">
                      <span className="tag tag--accent">{s.language.toUpperCase()}</span>{' '}
                      {s.source === 'ai' ? <span className="tag">ИИ</span> : null} {s.originalFilename} ·{' '}
                      {new Date(s.uploadedAt).toLocaleString()}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Файлов субтитров пока нет.</p>
              )}

              {jobs.length ? (
                <ul className="materials__list">
                  {jobs.slice(0, 5).map((j) => (
                    <li key={j.id} className="materials__item">
                      <span className={`tag${j.status === 'done' ? ' tag--accent' : ''}`}>
                        {JOB_STATUS_LABELS[j.status] || j.status}
                      </span>{' '}
                      {j.errorMessage ? <span className="auth-error">{j.errorMessage}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          {panelTab === 'quiz' ? (
            <div className="admin-section">
              <h3>Тест после фильма</h3>

              <div className="admin-grid-form">
                <Field label="Название теста">
                  <input
                    value={quizTitle}
                    onChange={(e) => setQuizTitle(e.target.value)}
                    placeholder="Тест по фильму"
                  />
                </Field>
                <label className="quiz-option">
                  <input
                    type="checkbox"
                    checked={quizPublished}
                    onChange={(e) => setQuizPublished(e.target.checked)}
                  />
                  <span>Опубликован</span>
                </label>
              </div>

              <p className="muted">Вопросов: {questions.length} (минимум 5)</p>

              <ul className="materials__list">
                {questions.map((q, index) => (
                  <li key={`${q.prompt}-${index}`} className="materials__item">
                    <div className="materials__head">
                      <strong>
                        {index + 1}. {q.prompt}
                      </strong>
                      <span className="tag">{QUESTION_TYPE_LABELS[q.questionType] || q.questionType}</span>
                      <button
                        className="btn btn--ghost btn--sm"
                        type="button"
                        onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== index))}
                      >
                        Удалить
                      </button>
                    </div>
                    <p className="materials__example">Ответ: {String(q.correctAnswer)}</p>
                  </li>
                ))}
              </ul>

              <form className="admin-grid-form admin-quiz-add" onSubmit={addQuestion}>
                <Field label="Тип вопроса">
                  <select
                    value={newQuestion.questionType}
                    onChange={(e) =>
                      setNewQuestion((q) => ({ ...q, questionType: e.target.value }))
                    }
                  >
                    <option value="single_choice">Выбор ответа</option>
                    <option value="true_false">Верно / неверно</option>
                    <option value="fill_blank">Вписать слово</option>
                  </select>
                </Field>
                <Field label="Вопрос">
                  <input
                    required
                    placeholder="Who is Paddington?"
                    value={newQuestion.prompt}
                    onChange={(e) => setNewQuestion((q) => ({ ...q, prompt: e.target.value }))}
                  />
                </Field>
                {newQuestion.questionType === 'single_choice' ? (
                  <Field label="Варианты ответа" hint="через запятую">
                    <input
                      placeholder="A bear from Peru, A robot, A detective"
                      value={newQuestion.optionsText}
                      onChange={(e) =>
                        setNewQuestion((q) => ({ ...q, optionsText: e.target.value }))
                      }
                    />
                  </Field>
                ) : null}
                <Field
                  label="Правильный ответ"
                  hint={
                    newQuestion.questionType === 'true_false'
                      ? 'true или false'
                      : 'должен совпадать с одним из вариантов'
                  }
                >
                  <input
                    required
                    placeholder={
                      newQuestion.questionType === 'true_false' ? 'true' : 'A bear from Peru'
                    }
                    value={newQuestion.correctAnswer}
                    onChange={(e) =>
                      setNewQuestion((q) => ({ ...q, correctAnswer: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Пояснение (необязательно)">
                  <input
                    placeholder="He is a polite bear from Peru."
                    value={newQuestion.explanation}
                    onChange={(e) =>
                      setNewQuestion((q) => ({ ...q, explanation: e.target.value }))
                    }
                  />
                </Field>
                <button className="btn btn--ghost" type="submit">
                  Добавить вопрос
                </button>
              </form>

              <button className="btn btn--primary" type="button" onClick={onSaveQuiz}>
                Сохранить тест
              </button>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="muted admin-empty">Выбери фильм слева, чтобы настроить его</p>
      )}
    </AppShell>
  );
}
