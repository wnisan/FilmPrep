import { useEffect, useMemo, useRef, useState } from 'react';
import { checkRetell, fetchLexicon, fetchPhrases, fetchPracticeScene } from '../api/media.js';
import { canSpeak, speak, stopSpeaking } from '../utils/speech.js';
import { languageInfo, languagePrep } from '../utils/languages.js';
import { cleanPhrase, diffWords, shuffle, wordKey, wordsOf } from '../utils/practice.js';
import { BackLink } from './BackLink.jsx';
import '../styles/practice.css';

const MODES = [
  { id: 'order', icon: 'order', title: 'Собери фразу', text: 'Расставьте слова реплики по порядку' },
  { id: 'match', icon: 'match', title: 'Сопоставь пары', text: 'Слово из фильма и его перевод' },
  { id: 'dictation', icon: 'dictation', title: 'Диктант', text: 'Послушайте реплику и запишите её' },
  { id: 'listening', icon: 'ear', title: 'Аудирование', text: 'Что прозвучало? Выберите вариант' },
  { id: 'speak', icon: 'mic', title: 'Произношение', text: 'Скажите фразу в микрофон' },
  { id: 'retell', icon: 'pen', title: 'Перескажи сцену', text: 'Проверка пересказа' },
];

const ICONS = {
  order: <path d="M4 7h7M4 12h11M4 17h5M16 5l3 3-3 3M19 8h-6" />,
  match: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M8 6.5 16 17.5M8 17.5l8-11" />
    </>
  ),
  dictation: <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4" />,
  ear: <path d="M8 18a3 3 0 0 0 5.5 1.5c1-1.6 2-2.5 3.2-4A6 6 0 1 0 6 9M9.5 9.5a2.5 2.5 0 1 1 4 2c-1 .8-1.5 1.5-1.5 2.5" />,
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ),
  pen: <path d="M5 4h10l4 4v12H5zM14 4v5h5M8 13h8M8 17h5" />,
};

function Icon({ name }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[name]}
    </svg>
  );
}

/** Original voice from the film when possible, otherwise the browser's voice. */
function ListenButton({ clip, clipKey, phrase, language, label = 'Слушать', slow = false }) {
  const fromFilm = clip.available && phrase.timestampMs != null && !slow;
  const active = clip.playingKey === clipKey || clip.loadingKey === clipKey;
  function onClick() {
    if (fromFilm) clip.play(clipKey, phrase.timestampMs, phrase.text);
    else speak(cleanPhrase(phrase.text), { lang: language, rate: slow ? 0.65 : 0.9 });
  }
  if (!fromFilm && !canSpeak()) return null;
  return (
    <button type="button" className={`practice-listen${active ? ' is-active' : ''}`} onClick={onClick}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4Zm12.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4Z" />
      </svg>
      {label}
      {fromFilm ? <span className="practice-listen__src">из фильма</span> : null}
    </button>
  );
}

function Rounds({ index, total, score }) {
  return (
    <div className="practice-rounds">
      <span>
        {Math.min(index + 1, total)} / {total}
      </span>
      <div className="practice-rounds__bar">
        <div style={{ width: `${(index / total) * 100}%` }} />
      </div>
      <span className="practice-rounds__score">✓ {score}</span>
    </div>
  );
}

function Finish({ score, total, onRestart, children }) {
  const pct = total ? Math.round((score / total) * 100) : 0;
  return (
    <div className="practice-finish">
      <strong>
        {score} из {total}
      </strong>
      <span className="muted">{pct >= 80 ? 'Отлично!' : pct >= 50 ? 'Неплохо, ещё разок?' : 'Попробуйте ещё раз'}</span>
      {children}
      <button className="btn btn--primary" type="button" onClick={onRestart}>
        Ещё раунд
      </button>
    </div>
  );
}

function DiffLine({ parts }) {
  return (
    <p className="practice-diff">
      {parts.map((p, i) => (
        <span key={i} className={p.ok ? 'is-ok' : p.extra ? 'is-extra' : 'is-missed'}>
          {p.word}
        </span>
      ))}
    </p>
  );
}

/* ——— Собери фразу ——— */
function WordOrder({ phrases, clip, language }) {
  const pool = useMemo(
    () => phrases.filter((p) => wordsOf(p.text).length >= 3 && wordsOf(p.text).length <= 10),
    [phrases],
  );
  const [round, setRound] = useState(0);
  const [items, setItems] = useState(() => shuffle(pool).slice(0, 5));
  const [picked, setPicked] = useState([]);
  const [checked, setChecked] = useState(null);
  const [score, setScore] = useState(0);
  const phrase = items[round];
  const tokens = useMemo(() => (phrase ? shuffle(wordsOf(phrase.text).map((w, i) => ({ w, i }))) : []), [phrase]);

  if (pool.length < 2) return <p className="muted">Для этого упражнения у фильма пока мало фраз.</p>;
  if (!phrase) {
    return (
      <Finish
        score={score}
        total={items.length}
        onRestart={() => {
          setItems(shuffle(pool).slice(0, 5));
          setRound(0);
          setScore(0);
        }}
      />
    );
  }

  const expected = wordsOf(phrase.text);
  function check() {
    const ok = picked.map((t) => wordKey(t.w)).join(' ') === expected.map(wordKey).join(' ');
    setChecked(ok);
    if (ok) setScore((s) => s + 1);
  }
  function next() {
    setRound((r) => r + 1);
    setPicked([]);
    setChecked(null);
  }

  return (
    <div className="practice-card">
      <Rounds index={round} total={items.length} score={score} />
      <p className="practice-hint">{phrase.translationRu ? `«${phrase.translationRu}»` : 'Соберите реплику из фильма'}</p>
      <div className={`practice-answer${checked === true ? ' is-ok' : checked === false ? ' is-bad' : ''}`}>
        {picked.length ? null : <span className="muted">Нажимайте на слова ниже</span>}
        {picked.map((t) => (
          <button key={t.i} type="button" className="chip chip--picked" disabled={checked !== null} onClick={() => setPicked((p) => p.filter((x) => x.i !== t.i))}>
            {t.w}
          </button>
        ))}
      </div>
      <div className="practice-bank">
        {tokens.map((t) => {
          const used = picked.some((x) => x.i === t.i);
          return (
            <button key={t.i} type="button" className="chip" disabled={used || checked !== null} onClick={() => setPicked((p) => [...p, t])}>
              {t.w}
            </button>
          );
        })}
      </div>
      {checked === false ? <p className="practice-correct">Правильно: «{cleanPhrase(phrase.text)}»</p> : null}
      <div className="practice-actions">
        <ListenButton clip={clip} clipKey={`order-${phrase.id}`} phrase={phrase} language={language} label="Подсказка: послушать" />
        {checked === null ? (
          <button className="btn btn--primary" type="button" disabled={picked.length !== tokens.length} onClick={check}>
            Проверить
          </button>
        ) : (
          <button className="btn btn--primary" type="button" onClick={next}>
            Дальше
          </button>
        )}
      </div>
    </div>
  );
}

/* ——— Сопоставь пары ——— */
const shortDef = (text) => String(text || '').split(/[;(]/)[0].trim().slice(0, 60);

function Matching({ lexicon }) {
  const pool = useMemo(() => {
    const seen = new Set();
    return lexicon
      .filter((w) => w.definitionRu)
      .map((w) => ({ id: w.id, word: w.lemma, def: shortDef(w.definitionRu) }))
      .filter((p) => p.def && !seen.has(p.def) && seen.add(p.def));
  }, [lexicon]);
  const [set, setSet] = useState(() => shuffle(pool).slice(0, 5));
  const [right, setRight] = useState(() => shuffle(set));
  const [selected, setSelected] = useState(null);
  const [done, setDone] = useState(() => new Set());
  const [wrong, setWrong] = useState(null);
  const [mistakes, setMistakes] = useState(0);

  if (pool.length < 4) return <p className="muted">Для этого упражнения нужно больше слов с переводом — подготовьте материалы с нейросетью.</p>;

  function restart() {
    const next = shuffle(pool).slice(0, 5);
    setSet(next);
    setRight(shuffle(next));
    setDone(new Set());
    setSelected(null);
    setMistakes(0);
  }

  function pickRight(item) {
    if (!selected || done.has(item.id)) return;
    if (selected === item.id) {
      setDone((d) => new Set(d).add(item.id));
      setSelected(null);
    } else {
      setWrong(item.id);
      setMistakes((m) => m + 1);
      setTimeout(() => setWrong(null), 500);
    }
  }

  const finished = done.size === set.length;
  return (
    <div className="practice-card">
      <p className="practice-hint">Выберите слово слева, затем его перевод справа</p>
      <div className="practice-match">
        <div>
          {set.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`match-item${done.has(p.id) ? ' is-done' : ''}${selected === p.id ? ' is-selected' : ''}`}
              disabled={done.has(p.id)}
              onClick={() => setSelected(p.id)}
            >
              {p.word}
            </button>
          ))}
        </div>
        <div>
          {right.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`match-item${done.has(p.id) ? ' is-done' : ''}${wrong === p.id ? ' is-wrong' : ''}`}
              disabled={done.has(p.id)}
              onClick={() => pickRight(p)}
            >
              {p.def}
            </button>
          ))}
        </div>
      </div>
      {finished ? (
        <Finish score={set.length - Math.min(mistakes, set.length)} total={set.length} onRestart={restart}>
          <span className="muted">Ошибок: {mistakes}</span>
        </Finish>
      ) : null}
    </div>
  );
}

/* ——— Диктант ——— */
function Dictation({ phrases, clip, language }) {
  const pool = useMemo(() => phrases.filter((p) => wordsOf(p.text).length >= 2 && wordsOf(p.text).length <= 14), [phrases]);
  const [items, setItems] = useState(() => shuffle(pool).slice(0, 5));
  const [round, setRound] = useState(0);
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);
  const [total, setTotal] = useState(0);
  const phrase = items[round];

  if (pool.length < 2) return <p className="muted">Для диктанта у фильма пока мало фраз.</p>;
  if (!phrase) {
    return (
      <Finish
        score={Math.round(total)}
        total={items.length}
        onRestart={() => {
          setItems(shuffle(pool).slice(0, 5));
          setRound(0);
          setTotal(0);
        }}
      >
        <span className="muted">Точность: {Math.round((total / items.length) * 100)}%</span>
      </Finish>
    );
  }

  function check(e) {
    e.preventDefault();
    const diff = diffWords(phrase.text, input);
    setResult(diff);
    setTotal((t) => t + diff.score);
  }

  return (
    <form className="practice-card" onSubmit={check}>
      <Rounds index={round} total={items.length} score={Math.round(total)} />
      <div className="practice-actions practice-actions--start">
        <ListenButton clip={clip} clipKey={`dict-${phrase.id}`} phrase={phrase} language={language} />
        <ListenButton clip={clip} clipKey={`dict-slow-${phrase.id}`} phrase={phrase} language={language} label="Медленно" slow />
      </div>
      <input
        className="practice-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        disabled={Boolean(result)}
        placeholder={`Запишите, что услышали, на ${languagePrep(language)}`}
        autoFocus
      />
      {result ? (
        <>
          <DiffLine parts={result.parts} />
          <p className="muted">
            Точность {Math.round(result.score * 100)}%{phrase.translationRu ? ` · «${phrase.translationRu}»` : ''}
          </p>
        </>
      ) : null}
      <div className="practice-actions">
        {result ? (
          <button
            className="btn btn--primary"
            type="button"
            onClick={() => {
              setRound((r) => r + 1);
              setInput('');
              setResult(null);
            }}
          >
            Дальше
          </button>
        ) : (
          <button className="btn btn--primary" type="submit" disabled={!input.trim()}>
            Проверить
          </button>
        )}
      </div>
      <p className="practice-legend">
        <span className="is-ok">верно</span> <span className="is-missed">пропущено</span> <span className="is-extra">лишнее</span>
      </p>
    </form>
  );
}

/* ——— Аудирование ——— */
function Listening({ phrases, clip, language }) {
  const pool = useMemo(() => phrases.filter((p) => wordsOf(p.text).length >= 2), [phrases]);
  const makeRounds = () =>
    shuffle(pool)
      .slice(0, 6)
      .map((p) => ({
        phrase: p,
        choices: shuffle([p, ...shuffle(pool.filter((o) => o.id !== p.id)).slice(0, 3)]),
      }));
  const [rounds, setRounds] = useState(makeRounds);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const round = rounds[index];

  if (pool.length < 4) return <p className="muted">Для аудирования у фильма пока мало фраз.</p>;
  if (!round) {
    return (
      <Finish
        score={score}
        total={rounds.length}
        onRestart={() => {
          setRounds(makeRounds());
          setIndex(0);
          setScore(0);
        }}
      />
    );
  }

  function choose(choice) {
    if (picked) return;
    setPicked(choice.id);
    if (choice.id === round.phrase.id) setScore((s) => s + 1);
  }

  return (
    <div className="practice-card">
      <Rounds index={index} total={rounds.length} score={score} />
      <div className="practice-actions practice-actions--start">
        <ListenButton clip={clip} clipKey={`listen-${round.phrase.id}`} phrase={round.phrase} language={language} label="Послушать реплику" />
      </div>
      <div className="practice-choices">
        {round.choices.map((c) => {
          const state = !picked ? '' : c.id === round.phrase.id ? ' is-ok' : c.id === picked ? ' is-bad' : '';
          return (
            <button key={c.id} type="button" className={`practice-choice${state}`} onClick={() => choose(c)}>
              {cleanPhrase(c.text)}
            </button>
          );
        })}
      </div>
      {picked ? (
        <>
          {round.phrase.translationRu ? <p className="muted">«{round.phrase.translationRu}»</p> : null}
          <div className="practice-actions">
            <button
              className="btn btn--primary"
              type="button"
              onClick={() => {
                setIndex((i) => i + 1);
                setPicked(null);
              }}
            >
              Дальше
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ——— Произношение ——— */
const Recognition = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

function Pronunciation({ phrases, clip, language }) {
  const pool = useMemo(() => phrases.filter((p) => wordsOf(p.text).length >= 2 && wordsOf(p.text).length <= 10), [phrases]);
  const [items, setItems] = useState(() => shuffle(pool).slice(0, 5));
  const [index, setIndex] = useState(0);
  const [listening, setListening] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);
  const recRef = useRef(null);
  const phrase = items[index];

  useEffect(() => () => recRef.current?.abort(), []);

  if (!Recognition) {
    return (
      <p className="muted">
        Ваш браузер не умеет распознавать речь. Откройте сайт в Google Chrome или Microsoft Edge — и разрешите доступ к
        микрофону.
      </p>
    );
  }
  if (pool.length < 2) return <p className="muted">Для этого упражнения у фильма пока мало фраз.</p>;
  if (!phrase) {
    return (
      <Finish
        score={Math.round(total)}
        total={items.length}
        onRestart={() => {
          setItems(shuffle(pool).slice(0, 5));
          setIndex(0);
          setTotal(0);
        }}
      >
        <span className="muted">Средняя точность: {Math.round((total / items.length) * 100)}%</span>
      </Finish>
    );
  }

  function record() {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    clip.stop();
    stopSpeaking();
    setError('');
    setResult(null);
    const rec = new Recognition();
    rec.lang = languageInfo(language).tts;
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onresult = (event) => {
      const alternatives = Array.from(event.results[0]).map((a) => a.transcript);
      const best = alternatives
        .map((text) => ({ text, ...diffWords(phrase.text, text) }))
        .sort((a, b) => b.score - a.score)[0];
      setResult(best);
      setTotal((t) => t + best.score);
    };
    rec.onerror = (event) => {
      setError(
        event.error === 'not-allowed'
          ? 'Нет доступа к микрофону — разрешите его в настройках браузера'
          : event.error === 'no-speech'
            ? 'Ничего не услышали — попробуйте говорить громче'
            : 'Не удалось распознать речь — попробуйте ещё раз',
      );
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  const pct = result ? Math.round(result.score * 100) : null;
  return (
    <div className="practice-card">
      <Rounds index={index} total={items.length} score={Math.round(total)} />
      <p className="practice-say">{cleanPhrase(phrase.text)}</p>
      {phrase.translationRu ? <p className="muted">«{phrase.translationRu}»</p> : null}
      <div className="practice-actions practice-actions--start">
        <ListenButton clip={clip} clipKey={`speak-${phrase.id}`} phrase={phrase} language={language} label="Как звучит" />
        <button type="button" className={`practice-mic${listening ? ' is-on' : ''}`} onClick={record}>
          <Icon name="mic" />
          {listening ? 'Говорите… (нажмите, чтобы закончить)' : result ? 'Ещё раз' : 'Сказать'}
        </button>
      </div>
      {error ? <p className="auth-error">{error}</p> : null}
      {result ? (
        <div className={`practice-speak-result${pct >= 80 ? ' is-ok' : pct >= 50 ? ' is-mid' : ' is-bad'}`}>
          <strong>{pct}%</strong>
          <div>
            <DiffLine parts={result.parts} />
            <span className="muted">Распознано: «{result.text}»</span>
          </div>
        </div>
      ) : null}
      <div className="practice-actions">
        <button
          className="btn btn--primary"
          type="button"
          disabled={!result || listening}
          onClick={() => {
            setIndex((i) => i + 1);
            setResult(null);
          }}
        >
          Дальше
        </button>
      </div>
    </div>
  );
}

/* ——— Перескажи сцену ——— */
function Retell({ mediaId, clip, language }) {
  const [scene, setScene] = useState(null);
  const [hideText, setHideText] = useState(false);
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadScene(exclude) {
    setError('');
    setResult(null);
    setText('');
    try {
      setScene(await fetchPracticeScene(mediaId, exclude));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadScene();
  }, [mediaId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setResult(await checkRetell(mediaId, scene.start, text));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function playScene() {
    const first = scene.lines[0];
    const last = scene.lines[scene.lines.length - 1];
    if (clip.available) clip.playRange('scene', first.startMs, last.startMs);
    else speak(scene.lines.map((l) => l.text).join(' '), { lang: language });
  }

  if (!scene) return error ? <p className="auth-error">{error}</p> : <p className="muted">Выбираем сцену…</p>;

  return (
    <div className="practice-card">
      <div className="practice-actions practice-actions--start">
        <button type="button" className={`practice-listen${clip.playingKey === 'scene' ? ' is-active' : ''}`} onClick={playScene}>
          ▶ {clip.available ? 'Посмотреть сцену (звук из фильма)' : 'Прослушать сцену'}
        </button>
        <label className="practice-toggle">
          <input type="checkbox" checked={hideText} onChange={(e) => setHideText(e.target.checked)} />
          Скрыть текст (только на слух)
        </label>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => loadScene(scene.start)}>
          Другая сцена
        </button>
      </div>
      {!hideText ? (
        <blockquote className="practice-scene">
          {scene.lines.map((l, i) => (
            <p key={i}>{l.text}</p>
          ))}
        </blockquote>
      ) : null}

      {!result ? (
        <form className="practice-retell" onSubmit={submit}>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder={`Перескажите сцену своими словами на ${languagePrep(language)}: кто что говорит и что происходит`}
          />
          <div className="practice-actions">
            <span className="muted">{text.trim().split(/\s+/).filter(Boolean).length} слов</span>
            <button className="btn btn--primary" type="submit" disabled={busy || text.trim().length < 15 || !scene.llmEnabled}>
              {busy ? 'Нейросеть проверяет…' : 'Проверить'}
            </button>
          </div>
          {!scene.llmEnabled ? <p className="muted">Нейросеть не настроена — проверка недоступна.</p> : null}
        </form>
      ) : (
        <div className="retell-result">
          <div className="retell-result__head">
            <span className={`retell-score${result.score >= 8 ? ' is-ok' : result.score >= 5 ? ' is-mid' : ' is-bad'}`}>
              {result.score}
              <small>/10</small>
            </span>
            <p>{result.verdict}</p>
          </div>
          {result.good.length ? (
            <ul className="retell-good">
              {result.good.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          ) : null}
          {result.mistakes.length ? (
            <div className="retell-mistakes">
              <strong>Ошибки</strong>
              {result.mistakes.map((m, i) => (
                <div key={i} className="retell-mistake">
                  <span className="retell-mistake__wrong">{m.wrong}</span>
                  <span aria-hidden="true">→</span>
                  <span className="retell-mistake__right">{m.right}</span>
                  {m.why ? <span className="retell-mistake__why">{m.why}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
          {result.improved ? (
            <div className="retell-improved">
              <strong>Как можно сказать лучше</strong>
              <p>{result.improved}</p>
            </div>
          ) : null}
          <div className="practice-actions">
            <button className="btn btn--ghost" type="button" onClick={() => setResult(null)}>
              Исправить пересказ
            </button>
            <button className="btn btn--primary" type="button" onClick={() => loadScene(scene.start)}>
              Следующая сцена
            </button>
          </div>
        </div>
      )}
      {error ? <p className="auth-error">{error}</p> : null}
    </div>
  );
}

export function PracticeHub({ mediaId, language, clip }) {
  const [mode, setMode] = useState(null);
  const [lexicon, setLexicon] = useState(null);
  const [phrases, setPhrases] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchLexicon(mediaId), fetchPhrases(mediaId)])
      .then(([lex, ph]) => {
        if (cancelled) return;
        setLexicon(lex.items);
        setPhrases(ph.items);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  useEffect(() => {
    clip.stop();
    stopSpeaking();
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <p className="auth-error">{error}</p>;
  if (!lexicon || !phrases) return <p className="muted">Загрузка упражнений…</p>;

  const current = MODES.find((m) => m.id === mode);
  if (!current) {
    return (
      <div className="practice-grid">
        {MODES.map((m) => (
          <button key={m.id} type="button" className="practice-mode" onClick={() => setMode(m.id)}>
            <span className="practice-mode__icon">
              <Icon name={m.icon} />
            </span>
            <strong>{m.title}</strong>
            <span className="muted">{m.text}</span>
          </button>
        ))}
      </div>
    );
  }

  const props = { phrases, lexicon, clip, language, mediaId };
  return (
    <div className="practice">
      <div className="practice__head">
        <BackLink onClick={() => setMode(null)}>Все упражнения</BackLink>
        <h2>
          <Icon name={current.icon} /> {current.title}
        </h2>
      </div>
      {mode === 'order' ? <WordOrder {...props} /> : null}
      {mode === 'match' ? <Matching {...props} /> : null}
      {mode === 'dictation' ? <Dictation {...props} /> : null}
      {mode === 'listening' ? <Listening {...props} /> : null}
      {mode === 'speak' ? <Pronunciation {...props} /> : null}
      {mode === 'retell' ? <Retell {...props} /> : null}
      {clip.error ? <p className="auth-error">{clip.error}</p> : null}
    </div>
  );
}
