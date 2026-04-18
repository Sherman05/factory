# Brief D — Task Runner (spawn claude CLI in worktree)

## Цель

Модуль `products/telegram-control-bot/src/runner.ts`, который принимает задачу (desc + id) и запускает в ней `claude -p` в отдельном git worktree, стримя события наружу.

## Acceptance criteria

- [ ] `src/runner.ts` экспортирует `createRunner(deps)` с методом `runTask(task: Task): AsyncIterable<RunnerEvent>`
- [ ] Runner создаёт worktree: `git worktree add $FACTORY_REPO_ROOT/.worktrees/task-<id> -b run/task-<id>`
- [ ] Запускает `claude -p "<orchestration prompt>"` с `cwd=worktree`
- [ ] Orchestration prompt включает: описание задачи, ссылку на CLAUDE.md, указание использовать subagents planner → coder → tester → reviewer последовательно, финалить задачу `gh pr create`
- [ ] Стримит события: `{type:'state', state:'starting'|'running'|'completed'|'failed'}`, `{type:'stdout', line}`, `{type:'stderr', line}`
- [ ] После `completed` — удаляет worktree (`git worktree remove`)
- [ ] При `failed` — worktree оставляет для дебага, пишет путь в событие
- [ ] Все outbound shell-вызовы изолированы в типизированные зависимости — тесты мокают их без реального git

## Модули

- `src/runner.ts` — основной
- `src/orchestrationPrompt.ts` — генератор промпта (pure function, легко тестируется)
- `src/worktreeManager.ts` — create/remove worktree через simple-git
- `tests/runner.test.ts`
- `tests/orchestrationPrompt.test.ts`
- `tests/worktreeManager.test.ts`

## TDD

1. Tests first — failing: spawn вызван с правильным cwd и промптом
2. Прогон vitest — fail
3. Минимальная реализация
4. Pass
5. Refactor

## Зависимости

- `simple-git` (уже есть)
- `node:child_process.spawn` — нативный, не ставим ничего
- Без реального `claude` CLI в тестах — мокаем `spawn`

## Интеграция с конфигом

Добавить в `config.ts`:
- `CLAUDE_CLI_PATH` (опционально, default `claude`)
- `WORKTREES_ROOT` (default `$FACTORY_REPO_ROOT/.worktrees`)

## Out of scope

- Параллельные runner'ы — сейчас только один активный
- Таймауты и kill long-running агентов (Day 3)
- Ресурсные лимиты (CPU, memory)
- Cleanup старых worktree на старте бота — TODO на Brief G
