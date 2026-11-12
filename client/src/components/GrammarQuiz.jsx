import { useEffect, useRef, useState } from 'react';
import { fetchGrammarExercises } from '../api/media.js';
import { buildGrammarQuiz, ruleKey } from '../utils/grammarGuide.js';
import { BackLink } from './BackLink.jsx';
import '../styles/practice.css';

/** Sentence with the gap highlighted; after the answer the gap shows the right form. */
function GapSentence({ text, fill, ok }) {
  const [before, after] = text.split('___');
  return (
    <>
      {before}
      <span className={`gram-gap${fill ? (ok ? ' is-ok' : ' is-bad') : ''}`}>{fill || '\u2003\u2003\u2003'}</span>
      {after}
    </>
  );
}

/** Gap-fill grammar self-check; perfectly answered rules can be saved as learned. */
export function GrammarQuiz({ groups, language, learnedIds, onMarkLearned, onClose, backLabel = 'Все правила' }) {
  const [exercises, setExercises] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState(null);
  const [results, setResults] = useState([]);
  const [saved, setSaved] = useState(false);
  const question = questions[index];
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  // Parents rebuild `groups` on every render; reload only when the set of rules changes
  const idsKey = groups.flatMap((g) => g.ids).join(',');

  useEffect(() => {
    let alive = true;
    setExercises(null);
    fetchGrammarExercises(idsKey.split(','))
      .then((data) => new Map(data.items.map((r) => [ruleKey(r.language, r.title), r.exercises])))
      .catch(() => new Map())
      .then((map) => {
        if (!alive) return;
        setExercises(map);
        setQuestions(buildGrammarQuiz(groupsRef.current, language, map));
      });
    return () => {
      alive = false;
    };
  }, [idsKey, language]);

  function restart() {
    setQuestions(buildGrammarQuiz(groups, language, exercises));
    setIndex(0);
    setPicked(null);
    setResults([]);
    setSaved(false);
  }

  function choose(option) {
    if (picked) return;
    setPicked(option);
    setResults((r) => [...r, { group: question.group, ok: option === question.answer }]);
  }

  const head = (
    <div className="practice__head">
      <BackLink onClick={onClose}>{backLabel}</BackLink>
      <h2>Проверка правил</h2>
    </div>
  );

  if (!exercises) {
    return (
      <div className="practice">
        {head}
        <p className="muted">Готовим упражнения… В первый раз это может занять до минуты.</p>
      </div>
    );
  }

  if (!questions.length) {
    return (
      <div className="practice">
        {head}
        <p className="muted">Для этих правил пока нет упражнений.</p>
      </div>
    );
  }

  if (!question) {
    const score = results.filter((r) => r.ok).length;
    const pct = Math.round((score / results.length) * 100);
    // A rule counts as mastered only if every question about it was answered right
    const byRule = new Map();
    results.forEach(({ group, ok }) => {
      byRule.set(group, (byRule.get(group) ?? true) && ok);
    });
    const mastered = [...byRule.entries()].filter(([, ok]) => ok).map(([g]) => g);
    const toSave = onMarkLearned ? mastered.filter((g) => !g.ids.every((id) => learnedIds.has(id))) : [];
    const weak = [...byRule.entries()].filter(([, ok]) => !ok).map(([g]) => g);

    return (
      <div className="practice">
        {head}
        <div className="practice-finish">
          <strong>
            {score} из {results.length}
          </strong>
          <span className="muted">{pct >= 80 ? 'Отлично!' : pct >= 50 ? 'Неплохо, ещё разок?' : 'Стоит повторить правила'}</span>
          {weak.length ? (
            <p className="gram-quiz__weak">
              Повторить: {weak.map((g) => `«${g.title}»`).join(', ')}
            </p>
          ) : null}
          {toSave.length && !saved ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={async () => {
                await onMarkLearned(toSave);
                setSaved(true);
              }}
            >
              Добавить в «Мои правила»: {toSave.map((g) => g.title).join(', ')}
            </button>
          ) : null}
          {saved ? <span className="gram-quiz__saved">✓ Добавлено в «Мои правила»</span> : null}
          <button className="btn btn--primary" type="button" onClick={restart}>
            Пройти ещё раз
          </button>
        </div>
      </div>
    );
  }

  const score = results.filter((r) => r.ok).length;
  return (
    <div className="practice">
      {head}
      <div className="practice-card">
        <div className="practice-rounds">
          <span>
            {index + 1} / {questions.length}
          </span>
          <div className="practice-rounds__bar">
            <div style={{ width: `${(index / questions.length) * 100}%` }} />
          </div>
          <span className="practice-rounds__score">✓ {score}</span>
        </div>
        <span className="gram-quiz__kind">{question.kind}</span>
        <p className="gram-quiz__prompt">{question.prompt}</p>
        {question.gap ? (
          <blockquote className="gram-quiz__quote gram-quiz__quote--gap" lang={question.lang}>
            <GapSentence text={question.gap} fill={picked ? question.answer : null} ok={picked === question.answer} />
            {question.quoteNote && picked ? <small>{question.quoteNote}</small> : null}
          </blockquote>
        ) : null}
        {question.quote ? (
          <blockquote className="gram-quiz__quote" lang={question.lang}>
            “{question.quote}”
            {question.quoteNote && picked ? <small>{question.quoteNote}</small> : null}
          </blockquote>
        ) : null}
        <div className="practice-choices">
          {question.options.map((option) => {
            const state = !picked
              ? ''
              : option === question.answer
                ? ' is-ok'
                : option === picked
                  ? ' is-bad'
                  : '';
            return (
              <button
                key={option}
                type="button"
                lang={question.gap ? question.lang : undefined}
                className={`practice-choice${state}`}
                onClick={() => choose(option)}
              >
                {option}
              </button>
            );
          })}
        </div>
        {picked ? (
          <>
            {question.explain ? <p className="muted gram-quiz__explain">{question.explain}</p> : null}
            <div className="practice-actions">
              <button
                className="btn btn--primary"
                type="button"
                onClick={() => {
                  setIndex((i) => i + 1);
                  setPicked(null);
                }}
              >
                {index + 1 < questions.length ? 'Дальше' : 'Результат'}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
