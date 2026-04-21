# Telegram Control Bot

The factory's Telegram Control Bot — owner-only commands and a
`POST /notify` HTTP endpoint.

- `/ping` → `pong` (liveness)
- `/new <description>` → enqueues a task (persistent SQLite queue), writes a
  draft brief to `docs/briefs/`, and replies with the task id. A background
  worker picks the task up, runs the Claude CLI in a per-task git worktree,
  and notifies on PR-ready / failure (see
  [brief F](../../docs/briefs/2026-04-18-brief-F-bot-runner-wiring.md)).
- `/status` → shows active tasks plus the five most recent done/failed
- `/cancel <id>` → cancels a queued task or kills the running `claude` CLI and
  marks the task failed with reason "canceled by owner"
- `POST /notify` → sends a formatted message to the owner

## Quick start

```bash
cd products/telegram-control-bot
npm ci
cp .env.example .env   # fill in all required variables
npm run dev            # starts bot (long-polling) + HTTP server on :8080
```

Ping the bot: `/ping` → `pong`.

Create a brief from the phone:

```
/new Сделай мне Wordle-клон на React с локальным хранением статистики
```

Trigger a notification:

```bash
curl -X POST http://localhost:8080/notify \
  -H "Content-Type: application/json" \
  -d '{"title":"PR #1 ready","url":"https://github.com/Sherman05/factory/pull/1"}'
```

## Environment

See [`.env.example`](.env.example). All three variables are validated on
start; the process exits if any is missing or malformed.

## Tests

```bash
npm test
```

Runs Vitest with V8 coverage; thresholds are 80% on every axis.
