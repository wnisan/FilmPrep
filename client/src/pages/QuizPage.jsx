import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BackLink } from '../components/BackLink.jsx';
import { fetchMediaById, fetchQuiz, fetchSubtitleTracks, submitQuizAttempt } from '../api/media.js';
import { AppShell } from '../components/AppShell.jsx';
import { useFilmClip } from '../hooks/useFilmClip.js';
import { canSpeak, speak } from '../utils/speech.js';
import '../styles/app.css';
import '../styles/practice.css';

const NEW_FORMAT_LABELS = {
  word_order: 'Соберите фразу',
  matching: 'Сопоставьте пары',
  listening: 'Аудирование',
};

function WordOrderQuestion({ question, value = [], onChange }) {
  const tokens = question.options || [];
  return (
    <div className="quiz-new">
      <div className="practice-answer">
        {value.length ? null : <span className="muted">Нажимайте на слова по порядку</span>}
        {value.map((i) => (
          <button key={i} type="button" className="chip chip--picked" onClick={() => onChange(value.filter((x) => x !== i))}>
            {tokens[i]}
          </button>
        ))}
      </div>
      <div className="practice-bank">
        {tokens.map((t, i) => (
          <button key={i} type="button" className="chip" disabled={value.includes(i)} onClick={() => onChange([...value, i])}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

function MatchingQuestion({ question, value = {}, onChange }) {
  const { left = [], right = [] } = question.options || {};
  const [selected, setSelected] = useState(null);
  const usedRight = new Set(Object.values(value));
  return (
    <div className="quiz-new">
      <div className="practice-match">
        <div>
          {left.map((l) => (
            <button
              key={l}
              type="button"
              className={`match-item${selected === l ? ' is-selected' : ''}${value[l] ? ' is-paired' : ''}`}
              onClick={() => {
                if (value[l]) {
                  const next = { ...value };
                  delete next[l];
                  onChange(next);
                }
                setSelected(l);
              }}
            >
              {l}
              {value[l] ? <span className="match-item__pair"> → {value[l]}</span> : null}
            </button>
          ))}
        </div>
        <div>
          {right.map((r) => (
            <button
              key={r}
              type="button"
              className={`match-item${usedRight.has(r) ? ' is-used' : ''}`}
              disabled={!selected || usedRight.has(r)}
              onClick={() => {
                onChange({ ...value, [selected]: r });
                setSelected(null);
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <p className="admin-field__hint">Выберите слово слева, затем перевод справа. Нажмите на слово ещё раз, чтобы поменять пару.</p>
    </div>
  );
}

function ListeningQuestion({ question, value, onChange, clip, language }) {
  const { choices = [], timestampMs, text } = question.options || {};
  const key = `quiz-${question.id}`;
  const fromFilm = clip.available && timestampMs != null;
  return (
    <div className="quiz-new">
      {fromFilm || canSpeak() ? (
        <button
          type="button"
          className={`practice-listen${clip.playingKey === key ? ' is-active' : ''}`}
          onClick={() => (fromFilm ? clip.play(key, timestampMs, text) : speak(text, { lang: language }))}
        >
          ▶ Послушать{fromFilm ? <span className="practice-listen__src">из фильма</span> : null}
        </button>
      ) : null}
      <div className="quiz-options">
        {choices.map((opt) => (
          <label key={opt} className="quiz-option">
            <input type="radio" name={question.id} checked={value === opt} onChange={() => onChange(opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function isAnswered(question, value) {
  if (question.questionType === 'word_order') return Array.isArray(value) && value.length === (question.options || []).length;
  if (question.questionType === 'matching') {
    return Object.keys(value || {}).length === (question.options?.left || []).length;
  }
  return value !== undefined && value !== '';
}

function toSubmitValue(question, value) {
  if (question.questionType === 'word_order') return (value || []).map((i) => question.options[i]).join(' ');
  return value;
}

export function QuizPage() {
  const { id } = useParams();
  const [media, setMedia] = useState(null);
  const [tracks, setTracks] = useState([]);
  const clip = useFilmClip({ src: media?.streamUrl, mediaId: id, tracks });
  const [quizData, setQuizData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setResult(null);

    fetchQuiz(id)
      .then((data) => {
        if (!cancelled) setQuizData(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Тест пока недоступен');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  const needsAudio = useMemo(
    () => (quizData?.questions || []).some((q) => q.questionType === 'listening'),
    [quizData],
  );
  useEffect(() => {
    if (!needsAudio) return;
    fetchMediaById(id)
      .then((d) => setMedia(d.item))
      .catch(() => {});
    fetchSubtitleTracks(id)
      .then((d) => setTracks(d.items || []))
      .catch(() => {});
  }, [id, needsAudio]);

  function setAnswer(questionId, value) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  const unanswered = (quizData?.questions || []).filter((q) => !isAnswered(q, answers[q.id])).length;

  async function onSubmit(event) {
    event.preventDefault();
    if (unanswered) {
      setError(`Ответьте на все вопросы — осталось ${unanswered}`);
      return;
    }
    clip.stop();
    setSubmitting(true);
    setError('');
    try {
      const payload = Object.fromEntries(
        quizData.questions.map((q) => [q.id, toSubmitValue(q, answers[q.id])]),
      );
      const data = await submitQuizAttempt(id, payload);
      setResult(data);
    } catch (err) {
      setError(err.message || 'Не удалось отправить ответы');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell>
      <BackLink to={`/media/${id}`}>К фильму</BackLink>

      <h1 className="page-title">{quizData?.quiz?.title || 'Тест по фильму'}</h1>
      <p className="page-lead">Вопросы на языке фильма — проверьте, насколько хорошо вы поняли фильм</p>

      {loading ? <p className="muted">Загрузка…</p> : null}
      {error && (!quizData || result) ? <p className="auth-error">{error}</p> : null}

      {quizData && !result ? (
        <form className="quiz-form" onSubmit={onSubmit}>
          {quizData.bestAttempt ? (
            <p className="muted">
              Лучший результат: {quizData.bestAttempt.score}/{quizData.bestAttempt.maxScore} · попыток:{' '}
              {quizData.attemptsCount}
            </p>
          ) : null}

          {quizData.questions.map((q, index) => (
            <fieldset key={q.id} className="quiz-question">
              <legend>
                {NEW_FORMAT_LABELS[q.questionType] ? (
                  <span className="quiz-format">{NEW_FORMAT_LABELS[q.questionType]}</span>
                ) : null}
                {index + 1}. {q.prompt}
              </legend>

              {q.questionType === 'word_order' ? (
                <WordOrderQuestion question={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
              ) : null}
              {q.questionType === 'matching' ? (
                <MatchingQuestion question={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} />
              ) : null}
              {q.questionType === 'listening' ? (
                <ListeningQuestion
                  question={q}
                  value={answers[q.id]}
                  onChange={(v) => setAnswer(q.id, v)}
                  clip={clip}
                  language={media?.language}
                />
              ) : null}

              {q.questionType === 'single_choice' ? (
                <div className="quiz-options">
                  {(q.options || []).map((opt) => (
                    <label key={String(opt)} className="quiz-option">
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[q.id] === opt}
                        onChange={() => setAnswer(q.id, opt)}
                        required
                      />
                      <span>{String(opt)}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {q.questionType === 'true_false' ? (
                <div className="quiz-options">
                  {[true, false].map((opt) => (
                    <label key={String(opt)} className="quiz-option">
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[q.id] === opt}
                        onChange={() => setAnswer(q.id, opt)}
                        required
                      />
                      <span>{opt ? 'Верно' : 'Неверно'}</span>
                    </label>
                  ))}
                </div>
              ) : null}

              {q.questionType === 'fill_blank' ? (
                <input
                  className="quiz-input"
                  required
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  placeholder="Ответ на языке фильма"
                />
              ) : null}
            </fieldset>
          ))}

          {error ? <p className="auth-error">{error}</p> : null}
          <button className="btn btn--primary" type="submit" disabled={submitting}>
            {submitting ? 'Проверяем…' : 'Отправить ответы'}
          </button>
        </form>
      ) : null}

      {result ? (
        <section className="quiz-result">
          <h2 className="media-card__title">
            Результат: {result.attempt.score}/{result.attempt.maxScore} ({result.attempt.percent}%)
          </h2>
          <ul className="materials__list">
            {result.details.map((d) => (
              <li key={d.questionId} className="materials__item">
                <span className={`tag${d.correct ? ' tag--accent' : ''}`}>
                  {d.correct ? 'верно' : 'ошибка'}
                </span>
                {d.explanation ? <p className="materials__example">{d.explanation}</p> : null}
              </li>
            ))}
          </ul>
          <div className="detail__actions">
            <button
              className="btn btn--ghost"
              type="button"
              onClick={() => {
                setResult(null);
                setAnswers({});
              }}
            >
              Пройти ещё раз
            </button>
            <Link className="btn btn--primary" to="/progress">
              Мой прогресс
            </Link>
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
