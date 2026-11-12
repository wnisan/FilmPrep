import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  fetchGrammar,
  fetchLearnedEntries,
  fetchLearnedGrammar,
  setGrammarLearned,
  fetchLexicon,
  fetchMediaById,
  fetchPhrases,
  fetchSubtitleTracks,
  markMaterialsOpened,
  setEntryLearned,
} from '../api/media.js';
import { AppShell } from '../components/AppShell.jsx';
import { FilmPlayer } from '../components/FilmPlayer.jsx';
import { MediaSocialBar } from '../components/MediaSocialBar.jsx';
import { CommentsSection } from '../components/CommentsSection.jsx';
import { SimilarStrip } from '../components/FilmStrip.jsx';
import { useAuthStore } from '../store/authStore.js';
import { useGoalStore } from '../store/goalStore.js';
import { genreLabel, runtimeLabel, themeLabel } from '../utils/labels.js';
import { HighlightedExample, PronounceButtons } from '../components/PronounceButtons.jsx';
import { useFilmClip } from '../hooks/useFilmClip.js';
import { Flag } from '../components/Flag.jsx';
import { languageName } from '../utils/languages.js';
import { stopSpeaking } from '../utils/speech.js';
import { FilmChat } from '../components/FilmChat.jsx';
import { PracticeHub } from '../components/Practice.jsx';
import { BackLink } from '../components/BackLink.jsx';
import { grammarGuide, groupGrammar } from '../utils/grammarGuide.js';
import { GrammarQuiz } from '../components/GrammarQuiz.jsx';
import '../styles/app.css';
import '../styles/myFilms.css';
import '../styles/materials.css';

function FactIcon({ name }) {
  const paths = {
    calendar: <path d="M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" />,
    globe: <path d="M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />,
    clock: <path d="M12 3a9 9 0 100 18 9 9 0 000-18zM12 7v5l3 2" />,
  };
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function AskButton({ onClick }) {
  return (
    <button type="button" className="ask-btn" onClick={onClick} title="Разобрать с помощником по фильму">
      <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
        <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4z" />
      </svg>
      Спросить ИИ
    </button>
  );
}

function GrammarCard({ pattern, language, isLearned, onToggleLearned, onAsk }) {
  const guide = grammarGuide(pattern);
  return (
    <li className={`gram-card${isLearned ? ' is-learned' : ''}`}>
      <header className="gram-card__head">
        <h3>{pattern.title}</h3>
        {pattern.cefrLevel ? <span className="level-badge">{pattern.cefrLevel}</span> : null}
        <button
          type="button"
          className={`gram-learn${isLearned ? ' is-on' : ''}`}
          onClick={onToggleLearned}
          aria-pressed={isLearned}
          title={isLearned ? 'Убрать из «Моих правил»' : 'Добавить в «Мои правила»'}
        >
          <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
            {isLearned ? <path d="m5 12.5 4.5 4.5L19 7.5" /> : <path d="M12 5v14M5 12h14" />}
          </svg>
          {isLearned ? 'Правило выучено' : 'Я выучил правило'}
        </button>
      </header>

      {guide ? (
        <div className="gram-formula" aria-label="Формула">
          {guide.formula.map((part, i) =>
            part === '+' || part === ',' || part === '/' ? (
              <span key={i} className="gram-formula__op">
                {part}
              </span>
            ) : (
              <span key={i} className="gram-formula__part">
                {part}
              </span>
            ),
          )}
        </div>
      ) : null}

      {pattern.explanationRu ? <p className="gram-card__explain">{pattern.explanationRu}</p> : null}

      {guide ? (
        <div className="gram-card__info">
          <section>
            <h4>Когда используют</h4>
            <ul className="gram-use">
              {guide.use.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </section>
          {guide.markers?.length ? (
            <section>
              <h4>Слова-подсказки</h4>
              <div className="gram-markers">
                {guide.markers.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}

      {guide?.rows?.length ? (
        <div className="gram-table-wrap">
          <table className="gram-table">
            <thead>
              <tr>
                <th>Форма</th>
                <th>Пример</th>
                <th>Перевод</th>
              </tr>
            </thead>
            <tbody>
              {guide.rows.map(([form, example, translation]) => (
                <tr key={form}>
                  <td className="gram-table__form">{form}</td>
                  <td lang={language}>{example}</td>
                  <td className="muted">{translation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {pattern.examples.length ? (
        <section className="gram-film">
          <h4>Как это звучит в фильме</h4>
          {pattern.examples.map((ex) => (
            <div key={ex} className="gram-film__line">
              <p lang={language}>“{ex}”</p>
              <PronounceButtons ttsText={ex} ttsLabel="Прочитать пример" language={language} />
            </div>
          ))}
        </section>
      ) : null}

      <footer className="gram-card__foot">
        <AskButton onClick={onAsk} />
      </footer>
    </li>
  );
}

const TABS = [
  { id: 'overview', label: 'Обзор' },
  { id: 'lexicon', label: 'Словарь' },
  { id: 'phrases', label: 'Фразы' },
  { id: 'grammar', label: 'Грамматика' },
  { id: 'practice', label: 'Тренировки' },
  { id: 'chat', label: 'Спросить ИИ' },
];

export function MediaDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [item, setItem] = useState(null);
  const [subtitleTracks, setSubtitleTracks] = useState([]);
  const userId = useAuthStore((s) => s.user?.id);
  const [lexicon, setLexicon] = useState([]);
  const [phrases, setPhrases] = useState([]);
  const [grammar, setGrammar] = useState([]);
  const [learned, setLearned] = useState(() => new Set());
  const [learnedRules, setLearnedRules] = useState(() => new Set());
  const [grammarQuiz, setGrammarQuiz] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const materialsTrackedRef = useRef(false);
  const [chatQuote, setChatQuote] = useState(null);
  const clearChatQuote = useCallback(() => setChatQuote(null), []);

  function askAbout(text, question) {
    setChatQuote({ text, question });
    setTab('chat');
  }
  const clip = useFilmClip({ src: item?.streamUrl, mediaId: id, tracks: subtitleTracks });

  useEffect(() => {
    clip.stop();
    stopSpeaking();
    setGrammarQuiz(false);
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    materialsTrackedRef.current = false;
    setLearned(new Set());
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    setSubtitleTracks([]);
    fetchSubtitleTracks(id)
      .then((data) => {
        if (!cancelled) setSubtitleTracks(data.items || []);
      })
      .catch(() => {});

    fetchMediaById(id)
      .then((data) => {
        if (cancelled) return;
        setItem(data.item);
        // Old links carry the UUID: show the readable address instead
        if (data.item.slug && data.item.slug !== id) {
          navigate(`/media/${data.item.slug}${window.location.search}`, { replace: true });
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Фильм не найден');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!item || tab === 'overview' || tab === 'chat' || tab === 'practice') return undefined;

    let cancelled = false;
    setMaterialsLoading(true);

    if (!materialsTrackedRef.current) {
      materialsTrackedRef.current = true;
      markMaterialsOpened(id).catch(() => {});
    }

    const load =
      tab === 'lexicon'
        ? Promise.all([fetchLexicon(id), fetchLearnedEntries(id).catch(() => ({ entryIds: [] }))]).then(
            ([lex, learnedData]) => {
              if (cancelled) return;
              setLexicon(lex.items);
              setLearned(new Set(learnedData.entryIds || []));
            },
          )
        : tab === 'phrases'
          ? fetchPhrases(id).then((d) => {
              if (!cancelled) setPhrases(d.items);
            })
          : Promise.all([fetchGrammar(id), fetchLearnedGrammar(id).catch(() => ({ patternIds: [] }))]).then(
              ([d, learnedData]) => {
                if (cancelled) return;
                setGrammar(d.items);
                setLearnedRules(new Set(learnedData.patternIds || []));
              },
            );

    load
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Не удалось загрузить материалы');
      })
      .finally(() => {
        if (!cancelled) setMaterialsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tab, id, item]);

  async function toggleLearned(entryId) {
    const nextValue = !learned.has(entryId);
    setLearned((prev) => {
      const next = new Set(prev);
      if (nextValue) next.add(entryId);
      else next.delete(entryId);
      return next;
    });
    try {
      await setEntryLearned(id, entryId, nextValue);
      useGoalStore.getState().refresh();
    } catch (err) {
      setLearned((prev) => {
        const next = new Set(prev);
        if (nextValue) next.delete(entryId);
        else next.add(entryId);
        return next;
      });
      setError(err.message || 'Не удалось сохранить отметку');
    }
  }

  /** groups: grammar cards (each holds the ids of the same rule found in several lines). */
  async function setRulesLearned(groups, value) {
    const ids = groups.flatMap((g) => g.ids);
    const apply = (on) =>
      setLearnedRules((prev) => {
        const next = new Set(prev);
        ids.forEach((pid) => (on ? next.add(pid) : next.delete(pid)));
        return next;
      });
    apply(value);
    try {
      await setGrammarLearned(id, ids, value);
    } catch (err) {
      apply(!value);
      setError(err.message || 'Не удалось сохранить правило');
    }
  }

  const grammarGroups = groupGrammar(grammar);
  const isRuleLearned = (g) => g.ids.every((pid) => learnedRules.has(pid));
  const isPrivate = item?.status === 'private';

  return (
    <AppShell>
      <BackLink to={isPrivate ? '/my-films' : '/catalog'}>{isPrivate ? 'Мои фильмы' : 'Каталог'}</BackLink>

      {loading ? <p className="muted">Загрузка…</p> : null}
      {error ? <p className="auth-error">{error}</p> : null}

      {item ? (
        <article className="detail">
          <h1 className="page-title">{item.title}</h1>
          {isPrivate ? (
            <p className="detail__private">
              🔒 Личный фильм · видите только вы
              {item.isOwn ? <Link to={`/my-films/${item.id}`}>Редактировать</Link> : null}
            </p>
          ) : null}
          <ul className="detail__facts">
            <li>
              {isPrivate ? (
                <span className="detail__fact">
                  <Flag code={item.language} size="sm" /> {languageName(item.language)}
                </span>
              ) : (
                <Link className="detail__fact" to={`/catalog?language=${item.language}`}>
                  <Flag code={item.language} size="sm" /> {languageName(item.language)}
                </Link>
              )}
            </li>
            {item.year ? (
              <li>
                <span className="detail__fact">
                  <FactIcon name="calendar" /> {item.year}
                </span>
              </li>
            ) : null}
            {(item.countries || []).map((c) => (
              <li key={c}>
                <Link className="detail__fact" to={`/catalog?country=${encodeURIComponent(c)}`}>
                  <FactIcon name="globe" /> {c}
                </Link>
              </li>
            ))}
            {item.runtimeMin ? (
              <li>
                <span className="detail__fact">
                  <FactIcon name="clock" /> {runtimeLabel(item.runtimeMin)}
                </span>
              </li>
            ) : null}
            {item.recommendedLevel ? (
              <li>
                <span className="detail__fact detail__fact--level" title="Рекомендуемый уровень языка">
                  <small>уровень</small> {item.recommendedLevel}
                </span>
              </li>
            ) : null}
          </ul>
          {item.director ? (
            <p className="detail__director">
              Режиссёр:{' '}
              <Link to={`/catalog?q=${encodeURIComponent(item.director)}`}>{item.director}</Link>
            </p>
          ) : null}

          {isPrivate ? null : <MediaSocialBar mediaId={item.id} />}

          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`tabs__btn${tab === t.id ? ' tabs__btn--active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' ? (
            <>
              <FilmPlayer
                mediaId={item.id}
                src={item.streamUrl}
                title={item.title}
                tracks={subtitleTracks}
                resumeKey={`${userId || 'guest'}:${item.id}`}
              />

              <div className="media-card__tags">
                {(item.genres || []).map((g) => (
                  <Link className="tag tag--accent" key={`g-${g}`} to={`/catalog?genre=${encodeURIComponent(g)}`}>
                    {genreLabel(g)}
                  </Link>
                ))}
                {(item.themes || []).map((t) => (
                  <Link className="tag" key={`t-${t}`} to={`/catalog?theme=${encodeURIComponent(t)}`}>
                    {themeLabel(t)}
                  </Link>
                ))}
              </div>

              <div className="detail__synopsis">
                {isPrivate && item.description ? <p className="muted">Ваш комментарий:</p> : null}
                {(item.synopsis || item.description || '')
                  .split(/\n{2,}/)
                  .filter(Boolean)
                  .map((paragraph, index) => (
                    <p key={index} className="detail__desc">
                      {paragraph}
                    </p>
                  ))}
              </div>

              <div className="detail__actions">
                <button className="btn btn--ghost" type="button" onClick={() => setTab('lexicon')}>
                  К словарю
                </button>
                {item.hasQuiz ? (
                  <Link className="btn btn--primary" to={`/media/${id}/quiz`}>
                    Тест по фильму
                  </Link>
                ) : (
                  <button className="btn btn--ghost" type="button" disabled>
                    Тест пока не готов
                  </button>
                )}
              </div>

              {isPrivate ? null : (
                <>
                  <SimilarStrip mediaId={item.id} />
                  <CommentsSection mediaId={item.id} />
                </>
              )}
            </>
          ) : null}

          {tab !== 'overview' && materialsLoading ? <p className="muted">Загрузка материалов…</p> : null}

          {clip.error ? <p className="auth-error">{clip.error}</p> : null}

          {tab === 'lexicon' && !materialsLoading ? (
            <div className="materials">
              {lexicon.length === 0 ? (
                <p className="muted">Словарь пока пуст</p>
              ) : (
                <>
                  <div className="lex-progress">
                    <span>
                      Выучено <strong>{learned.size}</strong> из {lexicon.length}
                    </span>
                    <div className="lex-progress__bar">
                      <i style={{ width: `${(learned.size / lexicon.length) * 100}%` }} />
                    </div>
                  </div>
                  <ul className="materials__list">
                    {lexicon.map((entry) => {
                      const isLearned = learned.has(entry.id);
                      const forms = [entry.lemma, ...(entry.surfaceForms || [])];
                      return (
                        <li key={entry.id} className={`lex-item${isLearned ? ' is-learned' : ''}`}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={isLearned}
                            className="lex-check"
                            title={isLearned ? 'Убрать из выученных' : 'Отметить как выученное'}
                            onClick={() => toggleLearned(entry.id)}
                          >
                            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
                              <path d="m5 12.5 4.5 4.5L19 7.5" />
                            </svg>
                          </button>
                          <div className="lex-item__body">
                            <div className="lex-item__head">
                              <strong className="lex-item__word">{entry.lemma}</strong>
                              {entry.cefrLevel ? <span className="level-badge">{entry.cefrLevel}</span> : null}
                              {entry.definitionRu ? <span className="lex-item__def">{entry.definitionRu}</span> : null}
                            </div>
                            {entry.exampleSubtitle ? (
                              <p className="materials__example">
                                “<HighlightedExample text={entry.exampleSubtitle} forms={forms} language={item.language} />”
                              </p>
                            ) : null}
                          </div>
                          <PronounceButtons
                            clip={clip}
                            clipKey={`w-${entry.id}`}
                            timestampMs={entry.exampleSubtitle ? entry.timestampMs : null}
                            clipText={entry.exampleSubtitle}
                            ttsText={entry.lemma}
                            ttsLabel={`Произнести «${entry.lemma}»`}
                            language={item.language}
                          />
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
            </div>
          ) : null}

          {tab === 'phrases' && !materialsLoading ? (
            <div className="materials">
              {phrases.length === 0 ? (
                <p className="muted">Фразы пока не добавлены</p>
              ) : (
                <ul className="materials__list">
                  {phrases.map((phrase) => (
                    <li key={phrase.id} className="phrase-item">
                      <div className="phrase-item__text">
                        <p className="phrase-item__original">{phrase.text}</p>
                        {phrase.translationRu ? (
                          <p className="phrase-item__translation">{phrase.translationRu}</p>
                        ) : null}
                      </div>
                      <div className="phrase-item__actions">
                        <PronounceButtons
                          clip={clip}
                          clipKey={`p-${phrase.id}`}
                          timestampMs={phrase.timestampMs}
                          clipText={phrase.text}
                          ttsText={phrase.text.replace(/^\.{3}|\.{3}$/g, '')}
                          ttsLabel="Прочитать синтезированным голосом"
                          language={item.language}
                        />
                        <AskButton
                          onClick={() =>
                            askAbout(phrase.text, 'Объясни эту фразу: смысл, грамматику и когда её говорят')
                          }
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === 'practice' ? <PracticeHub mediaId={item.id} language={item.language} clip={clip} /> : null}

          {tab === 'chat' ? (
            <FilmChat mediaId={item.id} title={item.title} quote={chatQuote} onQuoteUsed={clearChatQuote} />
          ) : null}

          {tab === 'grammar' && !materialsLoading ? (
            <div className="materials">
              {grammar.length === 0 ? (
                <p className="muted">Грамматические конструкции пока не добавлены</p>
              ) : grammarQuiz ? (
                <GrammarQuiz
                  groups={grammarGroups}
                  language={item.language}
                  learnedIds={learnedRules}
                  onMarkLearned={(groups) => setRulesLearned(groups, true)}
                  onClose={() => setGrammarQuiz(false)}
                />
              ) : (
                <>
                <div className="gram-toolbar">
                  <div className="lex-progress">
                    <span>
                      Выучено правил <strong>{grammarGroups.filter(isRuleLearned).length}</strong> из{' '}
                      {grammarGroups.length}
                    </span>
                    <div className="lex-progress__bar">
                      <i
                        style={{
                          width: `${(grammarGroups.filter(isRuleLearned).length / grammarGroups.length) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                  <Link className="gram-toolbar__mine" to="/dictionary?tab=grammar">
                    Мои правила
                  </Link>
                  <button type="button" className="btn btn--primary btn--sm" onClick={() => setGrammarQuiz(true)}>
                    Проверить себя
                  </button>
                </div>
                <ul className="gram-list">
                  {grammarGroups.map((g) => (
                    <GrammarCard
                      key={g.id}
                      pattern={g}
                      language={item.language}
                      isLearned={isRuleLearned(g)}
                      onToggleLearned={() => setRulesLearned([g], !isRuleLearned(g))}
                      onAsk={() =>
                        askAbout(
                          g.examples[0] || g.title,
                          `Объясни подробнее конструкцию «${g.title}» и дай ещё 3 примера с переводом`,
                        )
                      }
                    />
                  ))}
                </ul>
                </>
              )}
            </div>
          ) : null}
        </article>
      ) : null}
    </AppShell>
  );
}
