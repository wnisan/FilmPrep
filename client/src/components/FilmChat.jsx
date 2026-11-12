import { useEffect, useRef, useState } from 'react';
import { askFilmChat } from '../api/media.js';
import '../styles/filmChat.css';

const SUGGESTIONS = [
  'О чём этот фильм простыми словами?',
  'Какие 5 фраз из фильма самые полезные в жизни?',
  'Объясни главную грамматику из фильма на примерах',
  'Придумай мне 3 упражнения по этому фильму',
];

/** **bold** inside a line → <strong>, the rest stays plain text (no HTML injection). */
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  );
}

function RichText({ text }) {
  const blocks = [];
  let list = null;
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    const item = /^([-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      if (!list) {
        list = [];
        blocks.push(<ul key={`l${index}`}>{list}</ul>);
      }
      list.push(<li key={index}>{inline(item[2])}</li>);
      return;
    }
    list = null;
    if (line) blocks.push(<p key={index}>{inline(line.replace(/^#+\s*/, ''))}</p>);
  });
  return <>{blocks}</>;
}

function storageKey(mediaId) {
  return `filmchat:${mediaId}`;
}

function loadHistory(mediaId) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storageKey(mediaId)) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function FilmChat({ mediaId, title, quote, onQuoteUsed }) {
  const [messages, setMessages] = useState(() => loadHistory(mediaId));
  const [input, setInput] = useState('');
  const [attached, setAttached] = useState(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    setMessages(loadHistory(mediaId));
  }, [mediaId]);

  useEffect(() => {
    sessionStorage.setItem(storageKey(mediaId), JSON.stringify(messages.slice(-30)));
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, mediaId]);

  useEffect(() => {
    if (!quote) return;
    setAttached(quote.text);
    setInput(quote.question);
    onQuoteUsed?.();
    inputRef.current?.focus();
  }, [quote, onQuoteUsed]);

  async function send(text) {
    const content = text.trim();
    if (!content || sending) return;
    const next = [...messages, { role: 'user', content, quote: attached }];
    setMessages(next);
    setInput('');
    setError('');
    setSending(true);
    const usedQuote = attached;
    setAttached(null);
    try {
      const data = await askFilmChat(mediaId, {
        messages: next.map(({ role, content: c }) => ({ role, content: c })),
        quote: usedQuote,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setError(err.message);
      setMessages((prev) => prev.slice(0, -1));
      setInput(content);
      setAttached(usedQuote);
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="film-chat">
      <div className="film-chat__head">
        <span className="film-chat__avatar" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="22" height="22">
            <path d="M12 3l1.8 4.6L18.5 9l-4.7 1.5L12 15l-1.8-4.5L5.5 9l4.7-1.4z" />
            <path d="M18.5 15l.8 2 2 .8-2 .7-.8 2-.7-2-2-.7 2-.8z" />
          </svg>
        </span>
        <div className="film-chat__title">
          <strong>Помощник по фильму</strong>
          <span>«{title}» · фразы, сцены, грамматика, шутки</span>
        </div>
        {messages.length ? (
          <button
            className="film-chat__clear"
            type="button"
            onClick={() => setMessages([])}
            disabled={sending}
            title="Очистить переписку"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
            </svg>
            Очистить
          </button>
        ) : null}
      </div>

      <div className="film-chat__list" ref={listRef}>
        {!messages.length ? (
          <div className="film-chat__empty">
            <p className="muted">
              Нейросеть знает реплики этого фильма и ваш уровень. Во вкладках «Фразы» и «Грамматика» у каждого пункта
              есть кнопка «Спросить».
            </p>
            <div className="film-chat__suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => send(s)} disabled={sending}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={`film-chat__msg film-chat__msg--${m.role}`}>
            {m.quote ? <blockquote>{m.quote}</blockquote> : null}
            {m.role === 'assistant' ? <RichText text={m.content} /> : <p>{m.content}</p>}
          </div>
        ))}
        {sending ? (
          <div className="film-chat__msg film-chat__msg--assistant film-chat__typing" aria-label="Нейросеть печатает">
            <span />
            <span />
            <span />
          </div>
        ) : null}
      </div>

      {error ? <p className="auth-error">{error}</p> : null}

      <form
        className="film-chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        {attached ? (
          <div className="film-chat__attached">
            <span>«{attached}»</span>
            <button type="button" onClick={() => setAttached(null)} aria-label="Убрать фразу">
              ×
            </button>
          </div>
        ) : null}
        <div className="film-chat__row">
          <textarea
            ref={inputRef}
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={2000}
            placeholder="Например: почему здесь «have been»? Enter — отправить, Shift+Enter — новая строка"
          />
          <button className="btn btn--primary" type="submit" disabled={sending || !input.trim()}>
            {sending ? '…' : 'Спросить'}
          </button>
        </div>
      </form>
    </div>
  );
}
