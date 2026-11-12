import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteComment, editComment, fetchComments, postComment } from '../api/social.js';
import { useAuthStore } from '../store/authStore.js';
import { plural, timeAgo } from '../utils/format.js';
import { Avatar } from './Avatar.jsx';
import { RankTitle } from './Badges.jsx';
import { Stars } from './StarRating.jsx';

const MAX_DEPTH = 3;
const MAX_LENGTH = 2000;

/** Flat list → tree: newest threads first, replies in chronological order. */
function buildTree(items) {
  const byId = new Map(items.map((c) => [c.id, { ...c, replies: [] }]));
  const roots = [];
  for (const c of byId.values()) {
    const parent = c.parentId ? byId.get(c.parentId) : null;
    if (parent) parent.replies.push(c);
    else roots.push(c);
  }
  roots.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return roots;
}

function CommentForm({ initial = '', placeholder, submitLabel, onSubmit, onCancel, autoFocus }) {
  const [text, setText] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(body);
      setText('');
    } catch (err) {
      setError(err.message || 'Не удалось отправить');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="comment-form" onSubmit={submit}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_LENGTH))}
        placeholder={placeholder}
        rows={3}
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit(e);
        }}
      />
      <div className="comment-form__bar">
        <span className="muted comment-form__count">
          {text.length > MAX_LENGTH - 200 ? `${text.length}/${MAX_LENGTH}` : ''}
        </span>
        {error ? <span className="auth-error comment-form__error">{error}</span> : null}
        {onCancel ? (
          <button className="btn btn--ghost btn--sm" type="button" onClick={onCancel}>
            Отмена
          </button>
        ) : null}
        <button className="btn btn--primary btn--sm" type="submit" disabled={busy || !text.trim()}>
          {busy ? 'Отправка…' : submitLabel}
        </button>
      </div>
    </form>
  );
}

function CommentItem({ comment, depth, parentAuthor, actions }) {
  const [mode, setMode] = useState(null); // null | 'reply' | 'edit'
  const author = comment.author;

  return (
    <li className={`comment${depth > 0 ? ' comment--reply' : ''}`}>
      {comment.deleted ? (
        <div className="comment__deleted muted">Комментарий удалён</div>
      ) : (
        <div className="comment__main">
          <Link to={`/profile/${author.username}`} className="comment__avatar">
            <Avatar user={author} size={depth > 0 ? 32 : 40} />
          </Link>
          <div className="comment__content">
            <div className="comment__head">
              <Link to={`/profile/${author.username}`} className="comment__author">
                {author.displayName}
              </Link>
              <RankTitle title={author.rankTitle} level={author.rankLevel} compact />
              {author.role === 'admin' ? <span className="tag">админ</span> : null}
              {comment.authorRating ? <Stars value={comment.authorRating} size={13} /> : null}
              <span className="comment__time muted" title={new Date(comment.createdAt).toLocaleString('ru-RU')}>
                {timeAgo(comment.createdAt)}
                {comment.edited ? ' · изменён' : ''}
              </span>
            </div>

            {mode === 'edit' ? (
              <CommentForm
                initial={comment.body}
                submitLabel="Сохранить"
                autoFocus
                onCancel={() => setMode(null)}
                onSubmit={async (body) => {
                  await actions.edit(comment.id, body);
                  setMode(null);
                }}
              />
            ) : (
              <p className="comment__body">
                {depth >= MAX_DEPTH && parentAuthor ? (
                  <span className="comment__mention">@{parentAuthor.username} </span>
                ) : null}
                {comment.body}
              </p>
            )}

            {mode !== 'edit' ? (
              <div className="comment__actions">
                <button type="button" onClick={() => setMode(mode === 'reply' ? null : 'reply')}>
                  Ответить
                </button>
                {comment.canEdit ? (
                  <button type="button" onClick={() => setMode('edit')}>
                    Изменить
                  </button>
                ) : null}
                {comment.canDelete ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Удалить комментарий?')) actions.remove(comment.id);
                    }}
                  >
                    Удалить
                  </button>
                ) : null}
              </div>
            ) : null}

            {mode === 'reply' ? (
              <CommentForm
                placeholder={`Ответ для ${author.displayName}…`}
                submitLabel="Ответить"
                autoFocus
                onCancel={() => setMode(null)}
                onSubmit={async (body) => {
                  await actions.reply(comment.id, body);
                  setMode(null);
                }}
              />
            ) : null}
          </div>
        </div>
      )}

      {comment.replies.length ? (
        <ul className={`comment__replies${depth + 1 >= MAX_DEPTH ? ' comment__replies--flat' : ''}`}>
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              depth={Math.min(depth + 1, MAX_DEPTH)}
              parentAuthor={comment.author}
              actions={actions}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function CommentsSection({ mediaId }) {
  const user = useAuthStore((s) => s.user);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchComments(mediaId)
      .then((data) => {
        if (!cancelled) setItems(data.items);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Не удалось загрузить комментарии');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mediaId]);

  const tree = useMemo(() => buildTree(items), [items]);
  const visibleCount = items.filter((c) => !c.deleted).length;

  const actions = {
    async add(body) {
      const { item } = await postComment(mediaId, body);
      setItems((prev) => [...prev, item]);
    },
    async reply(parentId, body) {
      const { item } = await postComment(mediaId, body, parentId);
      setItems((prev) => [...prev, item]);
    },
    async edit(id, body) {
      const { item } = await editComment(id, body);
      setItems((prev) => prev.map((c) => (c.id === id ? { ...c, ...item } : c)));
    },
    async remove(id) {
      try {
        await deleteComment(id);
        // server keeps a placeholder only when someone replied
        setItems((prev) =>
          prev.some((c) => c.parentId === id)
            ? prev.map((c) => (c.id === id ? { ...c, deleted: true, body: '', author: null } : c))
            : prev.filter((c) => c.id !== id),
        );
      } catch (err) {
        setError(err.message || 'Не удалось удалить');
      }
    },
  };

  return (
    <section className="comments">
      <h2 className="comments__title">
        Обсуждение
        <span className="muted">
          {' '}
          · {visibleCount} {plural(visibleCount, ['комментарий', 'комментария', 'комментариев'])}
        </span>
      </h2>

      <div className="comments__new">
        <Avatar user={user} size={40} />
        <CommentForm
          placeholder="Поделитесь впечатлениями"
          submitLabel="Отправить"
          onSubmit={actions.add}
        />
      </div>

      {error ? <p className="auth-error">{error}</p> : null}
      {loading ? <p className="muted">Загрузка комментариев…</p> : null}
      {!loading && tree.length === 0 ? (
        <p className="muted">Комментариев пока нет — будьте первым.</p>
      ) : null}

      <ul className="comments__list">
        {tree.map((comment) => (
          <CommentItem key={comment.id} comment={comment} depth={0} actions={actions} />
        ))}
      </ul>
    </section>
  );
}
