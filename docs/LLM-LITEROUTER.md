# LiteRouter + выбор модели для FilmPrep

## Какую модель брать из твоего списка

Для словаря/переводов субтитров:

| Модель | Вердикт |
|--------|---------|
| **`qwen3.8-27b:free`** | **Лучший выбор** — безлимит, Qwen хорошо тянет EN→RU |
| `qwen3.6-27b:free` | Тоже отлично, запасной вариант |
| `llama-3.3-70b-instruct-turbo:free` | Хороший запасной |
| `deepseek-v3.2:free` / `deepseek-v3:free` | Качественно, но иногда «тяжелее» |
| `deepseek-r1*:free` / `deepseek-reasoner:free` | Не бери для NLP — долгий reasoning |
| `kimi-k2.7-code-cheap:free` | Не бери — под код |
| `gemini-*:free` (лимит 100/день) | Можно, но лимит мал для пачек |

**В проекте по умолчанию: `qwen3.8-27b:free`.**

## Как подключено

В `server/.env`:
```env
LLM_ENABLED=true
LLM_PROVIDER=literouter
LLM_API_KEY=...
LLM_MODEL=qwen3.8-27b:free
LLM_BASE_URL=https://api.literouter.com/v1
LLM_MIN_INTERVAL_MS=7500
```

После обработки субтитров NLP:
1. локально извлекает слова/фразы
2. если LLM включён — LiteRouter обогащает `definitionRu` / `translationRu` (2 запроса: слова + фразы)
3. между запросами пауза ~7.5 с (бесплатный tier LiteRouter)
4. если API упал — материалы всё равно сохраняются без переводов

## Безопасность

Ключ лежит только в `server/.env` (git ignore).  
Если ключ светился в чате — лучше перевыпустить в кабинете LiteRouter.
