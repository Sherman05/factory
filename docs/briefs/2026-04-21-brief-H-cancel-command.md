# Brief H — `/cancel <id>` command

## Цель

Владелец может отменить задачу (в очереди или уже запущенную) одной командой в Telegram. Это страховка от "агент пошёл не туда" и от случайных дубликатов задач.

## Acceptance criteria

- [ ] `/cancel <id>` реагирует только на владельца (whitelist как в `/new`, `/status`).
- [ ] Если задача в состоянии `queued` → сразу `failed` с `error = "canceled by owner"`. Ответ: "🛑 Task #N canceled (was queued)".
- [ ] Если задача в состоянии `running` → воркер прерывает `claude -p` процесс (SIGTERM), помечает задачу `failed` с тем же `error`. Ответ: "🛑 Task #N canceled (was running) — killing claude CLI…". После завершения runner'а владелец получает обычную `❌ Task #N failed — canceled by owner` нотификацию.
- [ ] Если задача уже `done` или `failed` → "ℹ️ Task #N is already in state X, nothing to cancel".
- [ ] Если задачи с таким id нет → "⚠️ no task with id N".
- [ ] Usage без аргумента → "usage: /cancel <id>".
- [ ] `queued → failed` — новый валидный переход в `taskStates.ts` (единственная причина: отмена).

## Плюмбинг AbortSignal

- Runner принимает дополнительный `abortSignal?: AbortSignal` (на уровне `Task` интерфейса runner'а).
- Runner слушает `signal.abort` и шлёт `child.kill('SIGTERM')`. После `child.kill` runner всё равно доводит async generator до `state: failed` — никаких специальных веток.
- Worker для каждой активной задачи создаёт `AbortController`, кладёт в `Map<taskId, AbortController>`, передаёт `signal` в `runner.runTask`, удаляет после finalize.
- Worker при finalize проверяет `controller.signal.aborted` — если true, подменяет reason на "canceled by owner" (перебивает любой пришедший `task_failed: <…>`).

## Изменяемые файлы

- `src/taskStates.ts` — разрешить `queued → failed`
- `src/runner.ts` — `Task.abortSignal?: AbortSignal`, слушатель + kill
- `src/taskWorker.ts` — Map<taskId, AbortController>, getter `isCanceled(id)` для handler'а, поле `cancel(id)` в публичном API
- `src/cancelCommand.ts` — новый
- `src/bot.ts` — регистрация `/cancel`
- `src/index.ts` — прокинуть cancel api
- tests: `tests/cancelCommand.test.ts`, расширить `tests/runner.test.ts` (abort), `tests/taskWorker.test.ts` (cancel running/queued), `tests/taskStates.test.ts` (новый переход)

## TDD

Tests first. Мокать `child.kill` в runner-тесте через интерфейс ChildProcessLike.

## Гонки

- `/cancel` пришёл между claim() и первым событием runner'а: AbortController уже в map'е, сигнал сработает, как только runner его подпишет. Runner должен подписываться **сразу** при получении сигнала, до `spawn`, чтобы abort в окно spawn'а тоже сработал (тогда runner просто сразу отдаёт failed без spawn).
- `/cancel` после того, как runner уже напечатал `PR_URL:` — задача всё ещё running. Cancel сработает, child получит SIGTERM. Задача будет помечена failed. Это допустимо: PR уже существует в GitHub, владелец его сможет закрыть через inline-кнопку.
- Двойной `/cancel` — первый попадает в map, второй — уже нет (finalize очистил). Вернёт "already in state failed".

## Out of scope

- `/cancel all` — массовая отмена (позже)
- Грейсфул-отмена (SIGINT → подождать → SIGKILL) — SIGTERM достаточно, child himself может делать cleanup
- Отмена с reason от владельца (`/cancel 7 not needed anymore`) — пока фиксированный текст
