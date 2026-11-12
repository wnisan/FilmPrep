# Вход через Google (OAuth 2.0) для FilmPrep

Кнопка **«Войти через Google»** на `/login` и `/register`.  
После успеха создаётся (или находится) аккаунт learner и выдаются те же JWT, что и при обычном входе.

---

## Что тебе нужно получить в Google

Два значения:

| Переменная | Что это |
|------------|---------|
| `GOOGLE_CLIENT_ID` | Client ID приложения |
| `GOOGLE_CLIENT_SECRET` | Client Secret |
| `GOOGLE_REDIRECT_URI` | Точный URL callback (см. ниже) |

---

## Пошагово: где нажать и что написать

### 1. Открой Google Cloud Console

https://console.cloud.google.com/

Войди своим Google-аккаунтом.

### 2. Создай проект (если нет)

1. Сверху: **Select a project** → **New Project**
2. **Project name:** например `FilmPrep`
3. **Create**

### 3. Включи OAuth consent screen (экран согласия)

1. Меню **APIs & Services** → **OAuth consent screen**
2. User Type: **External** → **Create**
3. Заполни минимум:
   - **App name:** `FilmPrep`
   - **User support email:** свой email
   - **Developer contact information:** свой email
4. **Save and Continue**
5. Scopes: можно ничего не добавлять вручную (openid/email/profile запросит приложение) → **Save and Continue**
6. Test users (пока приложение в статусе Testing):
   - **Add users** → добавь **свой** Gmail (и email друзей, кто будет тестировать)
7. **Save and Continue** → **Back to Dashboard**

> Пока статус **Testing**, входить могут только test users. Хватает для локальной разработки и демо.

### 4. Создай OAuth Client ID (это и есть «ключи»)

1. **APIs & Services** → **Credentials**
2. **+ Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: `FilmPrep Web`
5. **Authorized JavaScript origins** → **Add URI**:
   ```
   http://localhost:5173
   ```
6. **Authorized redirect URIs** → **Add URI** — **скопируй точно**:
   ```
   http://localhost:5173/api/v1/auth/google/callback
   ```
7. **Create**
8. Скопируй:
   - **Client ID** (длинная строка `….apps.googleusercontent.com`)
   - **Client secret** (кнопка Copy)

### 5. Вставь в `server/.env`

```env
GOOGLE_CLIENT_ID=вставь-сюда-Client-ID
GOOGLE_CLIENT_SECRET=вставь-сюда-Client-Secret
GOOGLE_REDIRECT_URI=http://localhost:5173/api/v1/auth/google/callback
CLIENT_ORIGIN=http://localhost:5173
```

### 6. Миграция БД + перезапуск

```bash
cd filmprep/server
npm run migrate
npm run dev
```

В другом терминале клиент:

```bash
cd filmprep/client
npm run dev
```

Открой http://localhost:5173/login → **Войти через Google**.

---

## Как это работает (для защиты)

1. Пользователь жмёт кнопку → сервер редиректит на Google.
2. Google спрашивает разрешение (email, профиль).
3. Google возвращает `code` на `GOOGLE_REDIRECT_URI`.
4. Сервер меняет `code` на токены Google, читает email.
5. В БД: новый learner **или** привязка Google к уже существующему email.
6. Выдаём свои JWT (access + refresh cookie) → редирект в `/auth/callback`.

---

## Частые ошибки

| Симптом | Что проверить |
|---------|----------------|
| Кнопка пишет «не настроен» | Пустые `GOOGLE_CLIENT_ID` / `SECRET` в `.env`, сервер не перезапущен |
| `redirect_uri_mismatch` | URI в Console **байт в байт** как в `.env` |
| `access_denied` / нельзя войти | Email не в **Test users** на consent screen |
| Cookie / сессия слетает | Callback должен идти через `localhost:5173/.../callback` (прокси Vite), не напрямую `:4000` |

---

## Продакшен (если будешь деплоить)

Добавь в Console origins/redirect с боевым доменом, например:

```
https://твой-домен.ru
https://твой-домен.ru/api/v1/auth/google/callback
```

и обнови `.env` соответственно.
