# Brief C — Inline Approve/Merge buttons on PR notifications

**Продукт:** `products/telegram-control-bot/` (расширение).
**Зависит от:** Brief B должен быть смержен (используем `prMessages` и поток уведомлений).
**Размер:** ≤2ч.
**Goal:** В уведомлении о новом PR добавить две inline-кнопки `✅ Merge` и `❌ Close`. Нажатие мержит/закрывает PR через GitHub API без открытия браузера.

## Пользовательский сценарий

1. Агент открыл PR #5. Watcher шлёт владельцу уведомление `🆕 PR #5: ...` — теперь с двумя кнопками под сообщением.
2. Владелец тапает `✅ Merge` → бот за 1-2 сек мержит PR squash'ом, удаляет ветку, редактирует сообщение на `✅ PR #5 merged by you at 19:42`.
3. Если вместо этого `❌ Close` → PR закрывается без мержа, сообщение редактируется на `❌ PR #5 closed by you at 19:42`.
4. Если кто-то (не whitelisted chat_id) нажал кнопку → бот игнорирует, логирует `ignored: callback from chat_id=X`.

## Acceptance criteria

- [ ] Модуль `src/inlineKeyboard.ts` — функция `buildPrKeyboard(prNumber: number): InlineKeyboard` возвращает grammY `InlineKeyboard` с двумя кнопками `✅ Merge` (callback_data=`merge:<prNumber>`) и `❌ Close` (callback_data=`close:<prNumber>`).
- [ ] `prWatcher.ts` модифицирован: при отправке `opened` уведомления прикладывает клавиатуру из `buildPrKeyboard`. `merged`/`closed` уведомления — без кнопок (уже поздно).
- [ ] Регистрация обработчиков: `bot.callbackQuery(/^merge:(\d+)$/, ...)` и `bot.callbackQuery(/^close:(\d+)$/, ...)`.
- [ ] Whitelist: callback_query.from.id должно равняться `TELEGRAM_OWNER_CHAT_ID`. Иначе `ctx.answerCallbackQuery('not authorized')` + лог `ignored: callback from chat_id=X`.
- [ ] Merge handler:
  - `ctx.answerCallbackQuery('merging...')` сразу (чтобы Telegram не показывал spinner).
  - `PUT /repos/Sherman05/factory/pulls/<n>/merge` с body `{"merge_method":"squash"}`.
  - При успехе: `DELETE /repos/Sherman05/factory/git/refs/heads/<branch>` (удаляем ветку).
  - `ctx.editMessageText` с новым текстом `✅ PR #<n> merged by you at HH:mm` (без кнопок).
- [ ] Close handler: `PATCH /repos/Sherman05/factory/pulls/<n>` с body `{"state":"closed"}`. `editMessageText` → `❌ PR #<n> closed by you at HH:mm`.
- [ ] Обработка ошибок:
  - Merge упал (конфликт / не ready) → `ctx.answerCallbackQuery('merge failed: <reason>')` (короткий текст, alert), сообщение НЕ редактируется, кнопки остаются.
  - Network error → тот же pattern, владелец может повторить.
- [ ] Тесты: мок GitHub API, отдельно тесты на merge success, на close success, на конфликт merge, на не-whitelisted user, на network error. Покрытие 80%+.

## Технический стек

- `InlineKeyboard` из grammY (встроено, импорт `import { InlineKeyboard } from 'grammy'`).
- Тот же `githubClient.ts` из Brief B — расширяем новыми методами `mergePr(n)`, `closePr(n)`, `deleteBranch(name)`.
- Proxy — тот же паттерн что в Brief B (через `setGlobalDispatcher`, уже настроено в `index.ts`).

## Структура файлов

```
products/telegram-control-bot/src/
├── inlineKeyboard.ts      (новое, ~15 строк)
├── callbackHandlers.ts    (новое, ~80 строк — merge + close handlers)
├── githubClient.ts        (модифицирован — добавлены mergePr/closePr/deleteBranch)
├── bot.ts                 (модифицирован — регистрация callbackQuery)
├── prWatcher.ts           (модифицирован — attach keyboard в opened)
└── ...

products/telegram-control-bot/tests/
├── inlineKeyboard.test.ts     (новое)
├── callbackHandlers.test.ts   (новое)
└── ...
```

## Важные детали

- **callback_data лимит 64 байта.** `merge:999999` — 13 байт, запас огромный.
- **Timing.** Telegram требует ответить на callback_query в течение 15 секунд. Сначала `answerCallbackQuery`, потом работа.
- **editMessageText со своим старым текстом** → Telegram вернёт "message is not modified". Поэтому всегда меняй текст (`... merged by you at HH:mm`).
- **Если PR уже закрыт/смержен** (owner с UI успел раньше) → GitHub API вернёт 405 или 422 на повторном merge. Обрабатывать как "merge failed".

## Что не трогать

- `/ping`, `POST /notify`, `/new` — работают, не менять.
- Watcher логика — только добавить клавиатуру к одному типу сообщений.
- Не делать кнопки на `merged`/`closed` уведомлениях (поздно что-то нажимать).

## Как проверить после merge

1. Перезапусти `npm run dev`.
2. Создай вручную PR в `Sherman05/factory` (правкой README через GitHub UI).
3. Через ≤2 мин — уведомление в Telegram с двумя кнопками.
4. Жми `✅ Merge` — через 1-2 сек сообщение редактируется, PR смержен в main (проверь на GitHub).
5. Повтори для другого PR, жми `❌ Close` — PR закрыт без мержа.
6. Попроси кого-то с другого Telegram-аккаунта нажать кнопку на твоем боте (если бот разрешает видеть) — бот должен написать "not authorized". На практике чужих пока не пустить, так что этот кейс — только через unit-тест.

## После Day 1 — что владелец умеет

```
→ /new "Сделай мне Wordle-клон"           (в Telegram)
→ [копируешь путь к brief в vibe-kanban, жмёшь Run — единственный ручной шаг]
→ ...ждёшь...
→ 🆕 PR #5: feat: add Wordle — ready  [✅ Merge] [❌ Close]   (прилетело на телефон)
→ тап [✅ Merge]
→ ✅ PR #5 merged by you at 19:42                            (обновилось)
```

**Всё.** Петля замкнулась.
