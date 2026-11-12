import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BackLink } from '../components/BackLink.jsx';
import { changePassword, deleteAccount, removeAvatar, updateProfile, uploadAvatar } from '../api/social.js';
import { AppShell } from '../components/AppShell.jsx';
import { Avatar } from '../components/Avatar.jsx';
import { LanguagesEditor } from '../components/LanguagesEditor.jsx';
import { PasswordInput } from '../components/PasswordInput.jsx';
import { useAuthStore } from '../store/authStore.js';
import '../styles/app.css';

const USERNAME_RE = /^[a-z0-9_]{3,24}$/;
const AVATAR_SIZE = 512;
const MAX_BIO = 500;

/** Center-crop to a square and shrink to 512px so avatars stay light. GIFs keep animation. */
async function prepareAvatar(file) {
  if (file.type === 'image/gif') return { blob: file, name: 'avatar.gif' };
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Не удалось прочитать картинку'));
      image.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const size = Math.min(AVATAR_SIZE, side);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    canvas
      .getContext('2d')
      .drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return { blob, name: 'avatar.jpg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Notice({ ok, error }) {
  if (error) return <p className="auth-error">{error}</p>;
  if (ok) return <p className="landing__status--ok">{ok}</p>;
  return null;
}

function DeleteAccount({ user }) {
  const navigate = useNavigate();
  const forgetSession = useAuthStore((s) => s.forgetSession);
  const [open, setOpen] = useState(false);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ready = user.hasPassword ? secret.length > 0 : secret.trim().toLowerCase() === user.email.toLowerCase();

  function close() {
    setOpen(false);
    setSecret('');
    setError('');
  }

  async function onDelete(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await deleteAccount(user.hasPassword ? { password: secret } : { email: secret });
      forgetSession();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Не удалось удалить аккаунт');
      setBusy(false);
    }
  }

  return (
    <section className="settings-card settings-card--danger">
      <h2 className="settings-card__title">Удаление аккаунта</h2>
      <p className="muted">
        Удалятся профиль, словарь, прогресс, результаты тестов, комментарии и ваши личные фильмы. Восстановить их будет
        нельзя.
      </p>
      {open ? (
        <form className="danger-confirm" onSubmit={onDelete}>
          <label className="admin-field">
            <span className="admin-field__label">
              {user.hasPassword ? 'Введите пароль для подтверждения' : `Введите ${user.email} для подтверждения`}
            </span>
            {user.hasPassword ? (
              <PasswordInput
                className="settings-input"
                autoComplete="current-password"
                value={secret}
                autoFocus
                onChange={(e) => setSecret(e.target.value)}
              />
            ) : (
              <input
                className="settings-input"
                type="email"
                autoComplete="off"
                value={secret}
                autoFocus
                onChange={(e) => setSecret(e.target.value)}
              />
            )}
          </label>
          <Notice error={error} />
          <div className="danger-confirm__actions">
            <button className="btn btn--danger" type="submit" disabled={!ready || busy}>
              {busy ? 'Удаление…' : 'Удалить навсегда'}
            </button>
            <button className="btn btn--ghost" type="button" disabled={busy} onClick={close}>
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <button className="btn btn--danger-outline" type="button" onClick={() => setOpen(true)}>
          Удалить аккаунт
        </button>
      )}
    </section>
  );
}

export function ProfileSettingsPage() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const fileRef = useRef(null);

  const [form, setForm] = useState({ displayName: '', username: '', bio: '' });
  const [profileMsg, setProfileMsg] = useState({});
  const [avatarMsg, setAvatarMsg] = useState({});
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', repeat: '' });
  const [pwdMsg, setPwdMsg] = useState({});
  const [pwdBusy, setPwdBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setForm({
      displayName: user.displayName || '',
      username: user.username || '',
      bio: user.bio || '',
    });
  }, [user?.id]);

  if (!user) return null;

  const usernameInvalid = form.username && !USERNAME_RE.test(form.username);

  async function onAvatarChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarMsg({});
    if (!file.type.startsWith('image/')) {
      setAvatarMsg({ error: 'Выберите картинку: JPG, PNG, WEBP или GIF' });
      return;
    }
    setAvatarBusy(true);
    try {
      const { blob, name } = await prepareAvatar(file);
      if (blob.size > 3 * 1024 * 1024) throw new Error('Картинка больше 3 МБ');
      const data = await uploadAvatar(blob, name);
      setUser(data.user);
      setAvatarMsg({ ok: 'Аватар обновлён' });
    } catch (err) {
      setAvatarMsg({ error: err.message || 'Не удалось загрузить аватар' });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onAvatarRemove() {
    setAvatarBusy(true);
    setAvatarMsg({});
    try {
      const data = await removeAvatar();
      setUser(data.user);
      setAvatarMsg({ ok: 'Аватар удалён' });
    } catch (err) {
      setAvatarMsg({ error: err.message });
    } finally {
      setAvatarBusy(false);
    }
  }

  async function onSaveProfile(event) {
    event.preventDefault();
    if (usernameInvalid) return;
    setSaving(true);
    setProfileMsg({});
    try {
      const data = await updateProfile({
        displayName: form.displayName.trim(),
        username: form.username.trim().toLowerCase(),
        bio: form.bio,
      });
      setUser(data.user);
      setProfileMsg({ ok: 'Профиль сохранён' });
    } catch (err) {
      setProfileMsg({ error: err.message || 'Не удалось сохранить профиль' });
    } finally {
      setSaving(false);
    }
  }

  async function onChangePassword(event) {
    event.preventDefault();
    setPwdMsg({});
    if (pwd.newPassword.length < 8) {
      setPwdMsg({ error: 'Новый пароль — минимум 8 символов' });
      return;
    }
    if (pwd.newPassword !== pwd.repeat) {
      setPwdMsg({ error: 'Пароли не совпадают' });
      return;
    }
    setPwdBusy(true);
    try {
      await changePassword({ currentPassword: pwd.currentPassword, newPassword: pwd.newPassword });
      setPwd({ currentPassword: '', newPassword: '', repeat: '' });
      setUser({ ...user, hasPassword: true });
      setPwdMsg({ ok: user.hasPassword ? 'Пароль изменён' : 'Пароль установлен — теперь можно входить и по email' });
    } catch (err) {
      setPwdMsg({ error: err.message || 'Не удалось сменить пароль' });
    } finally {
      setPwdBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="settings-page">
      <BackLink to={`/profile/${user.username}`}>Мой профиль</BackLink>
      <h1 className="page-title">Настройки профиля</h1>

      <div className="settings">
        <section className="settings-card">
          <h2 className="settings-card__title">Аватар</h2>
          <div className="settings-avatar">
            <Avatar user={user} size={96} />
            <div className="settings-avatar__actions">
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={onAvatarChange} />
              <button className="btn btn--primary btn--sm" type="button" disabled={avatarBusy} onClick={() => fileRef.current?.click()}>
                {avatarBusy ? 'Загрузка…' : 'Загрузить фото'}
              </button>
              {user.avatarUrl ? (
                <button className="btn btn--ghost btn--sm" type="button" disabled={avatarBusy} onClick={onAvatarRemove}>
                  Удалить
                </button>
              ) : null}
              <span className="admin-field__hint">JPG, PNG, WEBP или GIF до 3 МБ. Фото обрежется до квадрата.</span>
            </div>
          </div>
          <Notice {...avatarMsg} />
        </section>

        <form className="settings-card" onSubmit={onSaveProfile}>
          <h2 className="settings-card__title">Основное</h2>
          <label className="admin-field">
            <span className="admin-field__label">Имя</span>
            <input
              className="settings-input"
              value={form.displayName}
              maxLength={60}
              required
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">Никнейм</span>
            <div className="settings-input settings-input--prefix">
              <span>@</span>
              <input
                value={form.username}
                maxLength={24}
                required
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '_') }))}
              />
            </div>
            <span className={usernameInvalid ? 'auth-error admin-field__hint' : 'admin-field__hint'}>
              3–24 символа: латинские буквы, цифры и _
            </span>
          </label>
          <label className="admin-field">
            <span className="admin-field__label">О себе</span>
            <textarea
              className="settings-input"
              rows={4}
              value={form.bio}
              maxLength={MAX_BIO}
              placeholder="Какие фильмы любите, зачем учите язык, какой сериал сейчас смотрите…"
              onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
            />
            <span className="admin-field__hint">
              {form.bio.length}/{MAX_BIO}
            </span>
          </label>
          <Notice {...profileMsg} />
          <button className="btn btn--primary" type="submit" disabled={saving || usernameInvalid}>
            {saving ? 'Сохранение…' : 'Сохранить'}
          </button>
        </form>

        <LanguagesEditor />

        <form className="settings-card" onSubmit={onChangePassword}>
          <h2 className="settings-card__title">{user.hasPassword ? 'Смена пароля' : 'Пароль для входа по email'}</h2>
          {user.hasPassword ? (
            <label className="admin-field">
              <span className="admin-field__label">Текущий пароль</span>
              <PasswordInput
                className="settings-input"
                autoComplete="current-password"
                value={pwd.currentPassword}
                required
                onChange={(e) => setPwd((p) => ({ ...p, currentPassword: e.target.value }))}
              />
            </label>
          ) : (
            <p className="muted">Вы входите через Google. Задайте пароль, чтобы входить и по email {user.email}.</p>
          )}
          <label className="admin-field">
            <span className="admin-field__label">Новый пароль</span>
            <PasswordInput
              className="settings-input"
              autoComplete="new-password"
              minLength={8}
              value={pwd.newPassword}
              required
              onChange={(e) => setPwd((p) => ({ ...p, newPassword: e.target.value }))}
            />
          </label>
          <label className="admin-field">
            <span className="admin-field__label">Повторите пароль</span>
            <PasswordInput
              className="settings-input"
              autoComplete="new-password"
              value={pwd.repeat}
              required
              onChange={(e) => setPwd((p) => ({ ...p, repeat: e.target.value }))}
            />
          </label>
          <Notice {...pwdMsg} />
          <button className="btn btn--primary" type="submit" disabled={pwdBusy}>
            {pwdBusy ? 'Сохранение…' : user.hasPassword ? 'Сменить пароль' : 'Установить пароль'}
          </button>
        </form>

        <DeleteAccount user={user} />
      </div>
      </div>
    </AppShell>
  );
}
