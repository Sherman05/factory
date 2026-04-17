# Brief A — Telegram `/new <description>` command

**Продукт:** `products/telegram-control-bot/` (расширение существующего).
**Размер:** ≤2ч.
**Goal:** Команда `/new <text>` в Telegram создаёт brief-файл в репо и коммитит его в `main`.

## Пользовательский сценарий

1. Владелец с телефона пишет боту: `/new Сделай мне Wordle-клон на React с локальным хранением статистики`.
2. Бот отвечает: `✅ brief saved: docs/briefs/auto-wordle-klon-na-react-s-lokalnym-hraneniem-statistiki.md, commit abc1234 pushed to main`.
3. В репо `main` появляется новый файл — минимальный шаблон brief'а, который владелец дальше скармливает в vibe-kanban.

## Acceptance criteria

- [ ] Новая команда `bot.command('new', ...)` — работает **только** для `TELEGRAM_OWNER_CHAT_ID`, для всех остальных `ignored: chat_id=X`.
- [ ] Парсит аргументы: всё после `/new ` — это описание. Пустое → бот отвечает `usage: /new <description>`.
- [ ] Генерирует slug из описания: lowercase, транслит кириллицы в латиницу (см. §5 ниже), заменить non-alphanumeric на `-`, обрезать до 60 символов, убрать trailing `-`.
- [ ] Имя файла: `auto-<slug>-<YYYY-MM-DD-HHmm>.md` (таймстамп чтобы не коллидировать).
- [ ] Содержимое файла: заголовок + описание от пользователя + TODO-секции acceptance criteria, stack, scope (шаблон в §6).
- [ ] Коммит делается через `simple-git` (пакет), сообщение: `feat(brief): add auto-generated brief <slug>`, push в `main`.
- [ ] Бот отвечает одним сообщением: путь к файлу + short SHA коммита + ссылку на файл на GitHub.
- [ ] Если git push упал (например, конфликт) → бот отвечает `⚠️ git error: <message>`, не падает.
- [ ] Покрытие тестами: 80%+, отдельные тесты на slug-генерацию, на игнор не-владельца, на ошибку git.

## Что не трогать

- Не запускать vibe-kanban программно — это в Day 2.
- Не менять whitelist-логику — используем ту же `TELEGRAM_OWNER_CHAT_ID`.
- Не трогать `/ping` и `POST /notify` — они уже работают.

## Технический стек

- `simple-git` (npm) — для git add/commit/push. Зачем: не ковырять `child_process`, чище API.
- `slugify` (npm) с настройкой `transliterate` — для превращения русских описаний в латинский slug.
- Всё остальное — как раньше (grammY, Vitest, TypeScript strict).

## 5. Slug-генерация — пример

Вход: `Сделай мне Wordle-клон на React`
Выход: `sdelai-mne-wordle-klon-na-react`

Тестовые кейсы (должны быть в тестах):
- `"Hello World"` → `hello-world`
- `"Привет мир!"` → `privet-mir`
- `"   spaces   "` → `spaces`
- `""` → команда отклоняется с usage-сообщением
- 200-символьная строка → slug ≤60 символов
- `"абв"*30` → slug ≤60 символов

## 6. Шаблон генерируемого brief-файла

```markdown
# Auto-brief — <first 80 chars of description>

**Created:** <ISO timestamp>
**Via:** Telegram /new from owner
**Status:** Draft — owner needs to refine before feeding to vibe-kanban

## Description (from Telegram)

<full description from user>

## Acceptance criteria

TODO: owner fills in before running through factory.

## Technical stack

TODO: owner or Planner decides.

## Out of scope

TODO.
```

Это **намеренно** не готовый brief — это заготовка. Владелец потом правит (или Planner доделывает).

## 7. Структура файлов (ориентир)

```
products/telegram-control-bot/src/
├── newCommandHandler.ts   (новое, ~50 строк)
├── slug.ts                (новое, ~20 строк)
├── gitWriter.ts           (новое, ~40 строк)
├── bot.ts                 (модифицирован — регистрация команды)
└── ...                    (остальное не трогать)

products/telegram-control-bot/tests/
├── slug.test.ts           (новое)
├── gitWriter.test.ts      (новое)
├── newCommandHandler.test.ts (новое)
└── ...
```

## 8. Важные edge-cases

- **Путь к репо.** Бот запускается из `products/telegram-control-bot/`, но коммит нужен в корень `factory/`. Ищем корень через `simple-git` или через `process.env.FACTORY_REPO_ROOT`. Добавить переменную в `config.ts` и `.env.example`, валидировать через zod.
- **Race condition:** если владелец шлёт два `/new` одновременно — два файла с разными таймстампами, без конфликта по имени.
- **Proxy:** git push идёт через HTTPS к github.com — должен работать через `HTTPS_PROXY`. `simple-git` наследует env vars автоматически, ничего спец не надо.

## 9. Как проверить после merge

```powershell
# В Telegram боту: /new Тестовое описание
# Ожидаемый ответ за ≤5 сек:
# ✅ brief saved: docs/briefs/auto-testovoe-opisanie-<timestamp>.md
#    commit <sha>: https://github.com/Sherman05/factory/blob/main/...

# В репо:
git pull
ls docs/briefs/auto-testovoe-opisanie-*.md   # файл есть
git log -1                                    # коммит от бота
```
