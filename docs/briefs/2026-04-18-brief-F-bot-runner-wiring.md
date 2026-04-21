# Brief F — Bot ↔ Runner integration: /new enqueues, /status reports

## Зависит от: Brief D (runner) и Brief E (queue)

## Цель

- `/new <desc>` теперь ставит задачу в очередь И триггерит runner (не только коммитит бриф-файл)
- `/status` отображает текущие и недавние задачи владельцу
- Runner events → Telegram нотификации в чат владельца

## Acceptance criteria

- [ ] `/new <desc>` — сохраняет `desc` через `taskQueue.enqueue`, присылает "🆕 Task #N queued: `<desc>`"
- [ ] Background worker (одна `setInterval` или `setImmediate` loop) — claim'ит следующую queued задачу, вызывает `runner.runTask`, форвардит события в notifier
- [ ] `/status` — возвращает активные задачи (`claimed` + `running`) + последние 5 done/failed
- [ ] Runner events mapping:
  - `starting` → "⏳ Task #N starting"
  - `completed` с PR url → "✅ Task #N done — \<PR link\>"
  - `failed` → "❌ Task #N failed — \<short error\>\n(worktree preserved at \<path\>)"
- [ ] Старые задачи из брифа (`/new` сейчас пишет файл) — **поведение сохраняется**: бриф-файл всё ещё создаётся, т.к. это контекст для агента
- [ ] Только один таск выполняется одновременно (serial) — параллельность это Day 3
- [ ] Бот на `SIGINT/SIGTERM` не прерывает активную задачу насильно — ждёт текущий `runTask` до 30s, потом форсит stop
- [ ] Все callbacks (merge/close из Day 1) работают как раньше — не регрессим

## Изменяемые файлы

- `src/newCommandHandler.ts` — добавить enqueue (оставить запись брифа)
- `src/bot.ts` — зарегистрировать `/status`, принять `taskQueue` и `runner` в deps
- `src/index.ts` — сконструировать queue + runner + worker loop, передать в bot
- `src/statusCommand.ts` — новый
- `src/taskWorker.ts` — новый, loop claim → run → emit events

## TDD

Для каждого нового модуля — tests first. Wiring в index.ts можно тестировать опосредованно (integration test с fake bot api + fake runner).

## Out of scope

- Отмена активной задачи командой `/cancel` (Day 3)
- Прогресс-бары / рендер вывода агента в чат (шумно)
- Автоматический мердж по завершении — PR-watcher + inline-кнопки из Day 1 этим занимаются
- Несколько владельцев / whitelist
