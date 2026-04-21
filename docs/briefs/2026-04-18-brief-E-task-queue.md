# Brief E — Task Queue with SQLite persistence

## Цель

Модуль `products/telegram-control-bot/src/taskQueue.ts`, который хранит очередь задач в SQLite и переживает рестарт бота.

## Acceptance criteria

- [ ] `src/taskQueue.ts` экспортирует `createTaskQueue(dbPath)` с методами:
  - `enqueue(desc: string, createdBy: number): Task` — добавляет со статусом `queued`
  - `claim(): Task | null` — помечает следующую `queued` как `running`, возвращает её
  - `update(id: number, patch: {state?, error?, prUrl?}): void`
  - `getActive(): Task[]` — все не-`done`/не-`failed` задачи
  - `getRecent(limit = 10): Task[]` — последние по createdAt
- [ ] `Task` тип: `{id, desc, state: 'queued'|'running'|'done'|'failed', createdBy, createdAt, prUrl?, error?}`
- [ ] State transitions: `queued → running → done|failed`. Любые другие переходы — throw.
- [ ] Тесты с `:memory:` базой — создать очередь, прогнать полный цикл, проверить персистентность (close → reopen)
- [ ] Путь БД через конфиг: `TASK_DB_PATH` (default `$FACTORY_REPO_ROOT/.agent-factory/tasks.db`)
- [ ] Директория БД создаётся автоматически, если не существует

## Модули

- `src/taskQueue.ts` — core
- `src/taskStates.ts` — `type TaskState`, `validTransition(from, to)`
- `tests/taskQueue.test.ts`
- `tests/taskStates.test.ts`

## TDD

Стандартный цикл. Tests first.

## Зависимости

- `better-sqlite3` — synchronous, простой API, прекрасно работает с vitest
- Windows: обычно ставится без проблем; если упадёт на `node-gyp` — fallback на `sql.js` (WASM)

## Схема БД

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  desc TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('queued','running','done','failed')),
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  pr_url TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
```

## Gotchas

- SQLite default journal mode блокирует readers при writer — для single-process бота не проблема, но включить WAL на всякий случай
- `createdAt` — unix timestamp (ms), не строка — легче сортировать
- `.agent-factory/` — добавить в `.gitignore`

## Out of scope

- Приоритеты задач (все FIFO)
- Retry logic — если задача failed, owner делает `/new` заново
- Несколько бэкендов хранения (Redis, Postgres) — SQLite достаточно
