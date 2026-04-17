# Telegram Control Bot

The factory's Telegram Control Bot — owner-only commands and a
`POST /notify` HTTP endpoint.

- `/ping` → `pong` (liveness)
- `/new <description>` → writes a draft brief to `docs/briefs/` and pushes a
  commit to `main` (see
  [brief A](../../docs/briefs/2026-04-17-brief-A-telegram-new-command.md))
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
