import '../styles/myFilms.css';

const STEP_LABELS = {
  analysis: 'Разбор субтитров: слова, фразы, грамматика',
  translation: 'Русские субтитры (перевод нейросетью)',
  words: 'Русский перевод слов и фраз',
  quiz: 'Тест по фильму',
};

const STEP_STATES = {
  pending: 'ждёт',
  running: 'в работе…',
  done: 'готово',
  skipped: 'пропущено',
  failed: 'ошибка',
};

/** Progress of the film preparation (server-side filmPrep run). */
export function PrepSteps({ prep, translation }) {
  if (!prep) return null;
  return (
    <>
      <ul className="myfilm-pipeline">
        {Object.entries(prep.steps).map(([key, step]) => (
          <li key={key} className={`myfilm-pipeline__step is-${step.state}`}>
            <span className="myfilm-pipeline__dot" aria-hidden="true" />
            <span>{STEP_LABELS[key] || key}</span>
            <span className="myfilm-pipeline__state">
              {STEP_STATES[step.state]}
              {key === 'translation' && step.state === 'running' && translation?.total
                ? ` ${translation.done}/${translation.total}`
                : ''}
              {step.note ? ` · ${step.note}` : ''}
            </span>
            {step.error ? <span className="myfilm-pipeline__error">{step.error}</span> : null}
          </li>
        ))}
      </ul>
      {prep.state === 'failed' && prep.error ? <p className="auth-error">{prep.error}</p> : null}
    </>
  );
}
