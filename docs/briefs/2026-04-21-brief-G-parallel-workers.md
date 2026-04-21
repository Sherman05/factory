# Brief G — Parallel task workers

## Цель

Снять сериальное ограничение Brief F: воркер должен крутить до N задач параллельно, по умолчанию N = 3 (из `docs/specs/2026-04-17-agent-factory-design.md` §5.4 — "3–4 Claude Code параллельно под Max 20x").

## Acceptance criteria

- [ ] `createTaskWorker` принимает `maxParallel: number` (deps) и использует его как верхнюю границу одновременных задач. Если не передан — default 1 (обратная совместимость).
- [ ] Когда maxParallel=3 и в очереди ≥3 задач — все три стартуют на одном тике (или подряд, без ожидания завершения).
- [ ] Когда слот освобождается — следующий `claim()` вызывается в ближайшем тике.
- [ ] `stop(timeoutMs)` ждёт завершения **всех** активных задач (не первой попавшейся).
- [ ] maxParallel = 1 полностью сохраняет старое сериальное поведение — все существующие тесты Brief F должны проходить без изменений.
- [ ] Конфиг: `MAX_PARALLEL_TASKS`, default 3. Валидация: int ≥ 1 и ≤ 10 (верхняя граница — sanity, Max 20x всё равно не потянет больше).

## Изменяемые файлы

- `src/taskWorker.ts` — заменить `active: Promise<void> | null` на `active: Set<Promise<void>>`; изменить `tick()`, `stop()`.
- `src/config.ts` + `.env.example` — новая переменная `MAX_PARALLEL_TASKS`.
- `src/index.ts` — пробросить `maxParallel` в воркер.
- `tests/taskWorker.test.ts` — новые кейсы для параллелизма.
- `tests/config.test.ts` — default + override + валидация границ.

## TDD

Tests first. Параллельность проверяется через runner, который ставит задачу "в полёт" (await timer), а тест — что количество одновременно запущенных runTask вызовов > 1.

## Worktree safety

Каждая задача всё ещё в своём `task-${id}` worktree — коллизий нет. Git worktree ограничивает одну ветку на worktree, но ветки тоже уникальны (`run/task-${id}`).

## SQLite safety

WAL уже включён (`journal_mode = WAL` в `taskQueue.ts`). Несколько параллельных `claim()` из одного процесса — синхронные sqlite-транзакции внутри `better-sqlite3`, сериализуются на уровне JS event loop, гонок нет.

## Гонка claim → run

Возможна ситуация: тик #1 claim'ит task A, тик #2 (через 2с) claim'ит task B, оба бегут. Третий тик будет иметь `active.size === 2 < 3` → claim'ит C. ОК. Единственный риск: если несколько claim'ов происходят в одном микротаске — `claim()` синхронный, всё равно атомарно.

## Out of scope

- Отмена активной задачи (`/cancel`) → Brief H
- Приоритеты задач — все FIFO
- Адаптивный maxParallel (например, по времени дня) — позже
- Ресурсные лимиты (CPU, memory) — позже
