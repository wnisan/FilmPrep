# FilmPrep

Веб-приложение для языковой подготовки к просмотру фильмов в оригинале.

FilmPrep помогает изучать иностранный язык через кино: пользователь выбирает фильм, получает разбор субтитров (лексика, фразы, грамматика), проходит тесты и смотрит видео с синхронизированными субтитрами. Материалы генерируются автоматически на основе субтитров с подключением LLM API.

## Возможности

- Каталог фильмов с фильтрами по уровню CEFR, жанрам и языку
- Просмотр видео (HLS) с оригинальными и переводными субтитрами
- Автоматический NLP-разбор субтитров: словарь, устойчивые фразы, грамматические конструкции
- Генерация и прохождение тестов по фильму
- Перевод субтитров и обогащение материалов через LLM
- Личный словарь, прогресс обучения, избранное, оценки и комментарии
- Загрузка собственных фильмов и субтитров («Мои фильмы»)
- Роли: пользователь и администратор
- Вход по email/паролю и через Google OAuth

## Стек

| Слой | Технологии |
|------|------------|
| Клиент | React 18, Vite, Zustand, React Router, hls.js |
| Сервер | Node.js 20, Express 4, Zod, JWT |
| БД | PostgreSQL 16 |
| NLP | локальный модуль `ml-module` + LLM API (LiteRouter / OpenAI-compatible) |
| Медиа | FFmpeg → HLS, локальный кэш, Backblaze B2 (S3) |
| Инфра | Docker Compose, Nginx 1.27 |

## Архитектура

```
Браузер (React SPA)
        │  HTTP
        ▼
Nginx (статика + reverse proxy /api)
        │  HTTP
        ▼
Node.js / Express API
  routes → controllers → services → repositories
        │
        ├─ PostgreSQL
        ├─ ml-module (анализ субтитров)
        ├─ FFmpeg (нарезка HLS)
        ├─ файловое хранилище / S3 (B2)
        ├─ LiteRouter LLM
        └─ Google OAuth
```

Слои API разделены явно: маршруты, контроллеры с валидацией Zod, сервисы с бизнес-логикой, репозитории с SQL. Клиент — SPA на Vite; в production отдаётся через Nginx, который проксирует API и HLS-потоки.

## Структура репозитория

```
filmprep/
  client/          # React SPA
  server/          # REST API, миграции, пайплайн видео
  ml-module/       # NLP-обработка субтитров
  shared/          # общие контракты
  docs/            # настройка LLM, OAuth, хранилища видео
  docker-compose.yml
```

## Быстрый старт (Docker)

Нужен Docker Desktop.

```bash
# 1. Скопируйте переменные окружения
cp server/.env.example server/.env

# 2. Запуск
docker compose up -d --build
# Windows: start.bat
```

Сайт: http://localhost:8080

При первом запуске применяются миграции, создаются демо-данные; демо-фильмы при необходимости скачиваются и нарезаются в HLS в фоне.

Остановка: `docker compose down` или `stop.bat`.

## Режим разработки

```bash
# PostgreSQL
docker compose up -d postgres

# Миграции и сиды
npm run db:migrate
npm run db:seed

# API — http://localhost:4000
cd server && npm run dev

# Client — http://localhost:5173
cd client && npm run dev
```

## Конфигурация

Секреты и ключи — только в `server/.env` (файл в git не попадает). Пример: `server/.env.example`.

Опционально:
- LLM — переводы, обогащение лексики, чат по фильму
- Google OAuth — вход через Google
- Backblaze B2 / S3 — облачное хранение HLS
- Яндекс.Диск — импорт видео

Подробности: [docs/AUTH-GOOGLE.md](docs/AUTH-GOOGLE.md), [docs/VIDEO-STORAGE.md](docs/VIDEO-STORAGE.md), [docs/LLM-LITEROUTER.md](docs/LLM-LITEROUTER.md).

## Демо-доступ

После сида:

| Роль | Email | Пароль |
|------|-------|--------|
| Admin | `admin@filmprep.local` | `admin12345` |

Нового пользователя можно зарегистрировать на `/register`.

## API

Базовый префикс: `/api/v1`

Основные группы маршрутов: `/auth`, `/media`, `/me`, `/admin`, `/users`, `/comments`, `/stream`.

Проверка здоровья: `GET /api/v1/health`.
