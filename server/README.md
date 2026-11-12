# FilmPrep API

## База данных

PostgreSQL поднимается **только через Docker** — отдельно ставить не нужно:

```bash
# из корня filmprep
docker compose up -d
npm run migrate   # или: npm run db:migrate из корня
```

Схема описана в `docs/diagrams/ER.md`, SQL — в `migrations/`.

## Запуск API

```bash
cd server
cp .env.example .env   # уже есть .env для локальной разработки
npm run dev
```

Проверка: http://localhost:4000/api/v1/health

## Слои

```
routes → controllers → services → repositories → db/pool
```

Сейчас: `GET /api/v1/health` + миграции схемы.