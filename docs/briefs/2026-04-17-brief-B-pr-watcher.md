# Brief B — GitHub PR watcher → Telegram notifications

**Продукт:** `products/telegram-control-bot/` (расширение).
**Размер:** ≤2ч.
**Goal:** Бот раз в 2 минуты опрашивает GitHub `pulls` endpoint у `Sherman05/factory`, при появлении нового (или изменении статуса на merged) PR шлёт уведомление владельцу в Telegram.

## Пользовательский сценарий

1. Агент фабрики открыл PR #5.
2. Через ≤2 минуты на телефон владельца прилетает: `🆕 PR #5: feat: add Wordle game — ready for review. https://github.com/Sherman05/factory/pull/5`.
3. Когда PR #5 мержится (Brief C добавит inline-кнопку, но пока — через UI GitHub): прилетает `✅ PR #5 merged into main`.

## Acceptance criteria

- [ ] Новый модуль `src/prWatcher.ts` — класс/фабрика, которая раз в `POLL_INTERVAL_MS` (env var, default 120000) вызывает GitHub API.
- [ ] Использует **GitHub Personal Access Token** (новая env var `GITHUB_TOKEN`), валидируется через zod в `config.ts`, добавляется в `.env.example`.
- [ ] Endpoint: `GET https://api.github.com/repos/Sherman05/factory/pulls?state=all&per_page=20&sort=updated&direction=desc`.
- [ ] Локальное in-memory состояние: `Map<prNumber, lastKnownState>`. lastKnownState ∈ `'open' | 'merged' | 'closed'`.
- [ ] На первый запуск: загружает текущий список, запоминает состояния, **не шлёт уведомления** (чтобы не спамить сразу после старта).
- [ ] На последующие запуски:
  - Новый PR (нет в Map) → `🆕 PR #<n>: <title> — ready for review. <url>`
  - PR был open, стал merged → `✅ PR #<n> merged into main`
  - PR был open, стал closed (не merged) → `❌ PR #<n> closed without merge`
  - Other transitions → не шлём.
- [ ] Уведомления идут через тот же `sendNotification` / `notifier.ts`, что используется для `POST /notify` — переиспользовать, не дублировать.
- [ ] Watcher стартует в `index.ts` параллельно с bot и server. На SIGINT/SIGTERM — корректно останавливается.
- [ ] Если GitHub API возвращает 4xx/5xx → логируем ошибку, пропускаем цикл, не падаем. 429 (rate limit) → логируем + ждём retry-after секунд.
- [ ] Тесты: мок GitHub API через `undici` `MockAgent` или nock-альтернативу. Покрытие 80%+. Отдельные тесты на каждый state transition, на error handling, на первый запуск (не спамит).

## Технический стек

- Встроенный `fetch` + `ProxyAgent` (как в `src/index.ts` уже есть) — для вызовов GitHub.
- Для тестов: **не** моки HTTP через jest/vitest — используем `undici.MockAgent`, он работает с Node'овским fetch через setGlobalDispatcher.
- Типы GitHub API — написать минимальный `interface GitHubPR { number, title, state, merged, html_url, updated_at }`, не тащить `@octokit/types`.

## Важные решения

- **Почему polling а не webhooks:** бот живёт на localhost, публичного URL нет. Polling проще, работает отовсюду. Trade-off — до 2 мин задержка. Приемлемо для личного использования.
- **Почему GitHub token с минимальными правами:** `repo` scope достаточно (у Sherman05/factory он приватный). Токен можно сгенерировать на https://github.com/settings/tokens → Personal access tokens (classic) → `repo` scope.
- **Rate limit:** 5000 req/hour authorised, polling 30/hour — запас 166x, хватит.

## Структура файлов

```
products/telegram-control-bot/src/
├── prWatcher.ts           (новое, ~80 строк)
├── githubClient.ts        (новое, ~40 строк — тонкая обёртка над fetch)
├── index.ts               (модифицирован — запуск watcher)
├── config.ts              (модифицирован — GITHUB_TOKEN в zod schema)
└── ...

products/telegram-control-bot/tests/
├── prWatcher.test.ts      (новое)
├── githubClient.test.ts   (новое)
└── ...
```

## Шаблоны сообщений

Сохрани их в отдельном модуле `src/messages.ts` — пригодится для Brief C:

```typescript
export const prMessages = {
  opened: (pr: GitHubPR) => `🆕 PR #${pr.number}: ${pr.title} — ready for review.\n${pr.html_url}`,
  merged: (pr: GitHubPR) => `✅ PR #${pr.number} merged into main`,
  closed: (pr: GitHubPR) => `❌ PR #${pr.number} closed without merge`
};
```

## Что не трогать

- Существующий `/ping`, `POST /notify` — работают, не менять.
- `/new` из Brief A — если он уже смержен; если нет, координация не требуется (разные файлы).
- **НЕ добавлять inline-кнопки** — это Brief C.

## Как проверить после merge

1. Добавь `GITHUB_TOKEN` в `.env`, токен сгенерируй на github.com.
2. Перезапусти `npm run dev`.
3. В логе: `pr watcher started, polling every 120s`.
4. Первый цикл — тишина (просто инициализирует state).
5. Открой в браузере любой PR в `Sherman05/factory` (например, новый PR вручную) — через ≤2 мин в Telegram прилетит `🆕 PR #N...`.
6. Смержь этот PR через GitHub UI — через ≤2 мин прилетит `✅ PR #N merged into main`.
