# Day 2 Sequence — Agent pipeline: /new → planner → coder → PR

**Цель дня:** команда `/new <описание>` в Telegram не просто создаёт бриф-файл, а **запускает агентный конвейер**: planner раскладывает задачу, coder пишет код, tester проверяет, reviewer ревьюит, бот присылает готовый PR с кнопкой Merge (уже есть из Day 1).

## Архитектурное решение: свой runner вместо vibe-kanban

Спек фабрики (`docs/specs/2026-04-17-agent-factory-design.md`, секция 3.1) предлагает vibe-kanban как оркестратор. Но его HTTP API не документирован (Day 1 это подтвердил), и сам vibe-kanban не запущен.

Вместо ожидания пишем **свой минимальный runner** (`src/runner.ts` в telegram-control-bot):

- Spawns `claude -p "<orchestration prompt>"` в отдельном git worktree
- Промпт инструктирует Claude использовать subagents (`planner`, `coder`, `tester`, `reviewer` из `.claude/agents/`)
- Runner читает stdout/stderr, детектит смену роли (по паттерну в выводе), шлёт нотификации в Telegram

**Преимущество:** полный контроль, без зависимости от внешнего UI, легко дебажить. Если позже vibe-kanban откроет API — подменим backend.

## Авторизация Claude Code

На этом этапе (локальный запуск) runner использует уже авторизованную сессию Claude Code владельца (`~/.claude/` credentials). Для серверного деплоя потом перенесём этот каталог на сервер (подтверждено владельцем 2026-04-18).

**Не** используем Anthropic API-ключ. Максимум экономики подписки Claude Max 20x.

## Порядок Brief'ов

1. **Brief D — базовый runner** (`brief-D-runner.md`)
   `src/runner.ts`: spawn `claude -p`, стрим вывода, простой state machine (queued → running → done/failed). Git worktree per task. Тесты с mock спавна.
   → Independent, не зависит от E/F.

2. **Brief E — task queue с SQLite** (`brief-E-task-queue.md`)
   `src/taskQueue.ts`: persistent store через better-sqlite3. `enqueue(desc)`, `next()`, `update(id, state)`. Переживает рестарт бота.
   → Independent.

3. **Brief F — бот ↔ runner wiring** (`brief-F-bot-runner.md`)
   Зависит от D+E. `/new <desc>` → enqueue → runner подхватывает. `/status` показывает очередь и активные задачи. Нотификации на каждой смене состояния.

## Почему такой порядок

- D и E независимы — можно писать параллельно, но в одном PR не мешать
- F связывает всё — ставим последним
- Каждый brief даёт отдельную, проверяемую ценность

## Как запускать каждый brief

Пока runner не готов — по-старому:
1. Брифы пишу я (Claude Code) вручную после этого документа
2. Реализую каждый в отдельной feature-ветке
3. Открываю PR на main (не стыкуем ветки — Day 1 показал, что squash-merge базы осиротеет стек)
4. Владелец ревьюит и мерджит

Когда Brief F смерджен — можем протестировать петлю на самом себе: `/new "добавь /version команду"` → бот сам это реализует.

## Вне scope Day 2

- vibe-kanban интеграция → Day 3 (если решим, что нужна)
- Деплой на сервер → Day 3-4 (сначала локально работаем)
- Параллельные задачи (>1 worktree одновременно) → Day 3
- Tester/Reviewer как отдельные spawns — в Day 2 используем subagents внутри одного `claude -p` вызова
- Уведомления в Telegram о каждом tool-call агента — слишком шумно; шлём только смену роли и финальный PR

## Технические ограничения

- `claude -p` требует авторизованной сессии — runner работает только на машине владельца (или сервере после копирования credentials)
- Git worktree per task — место на диске растёт. Чистим worktree после успешного PR
- SQLite в репозитории? Нет — в `$FACTORY_REPO_ROOT/.agent-factory/tasks.db`, путь в `.gitignore`

## Acceptance criteria дня

- [ ] В main есть `src/runner.ts` с тестами и простым CLI для ручного старта задачи
- [ ] В main есть `src/taskQueue.ts` с persistent SQLite хранением
- [ ] `/new <desc>` в Telegram кладёт задачу в очередь И триггерит runner
- [ ] `/status` показывает хотя бы активную задачу и её текущую роль
- [ ] Успешный dogfood-тест: задача проходит через весь пайплайн и создаёт PR
