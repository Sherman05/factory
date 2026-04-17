# Telegram Control Bot (MVP)

Minimal slice of the factory's Telegram Control Bot — one `/ping` command
and a `POST /notify` HTTP endpoint. See
[`docs/briefs/2026-04-17-telegram-control-bot-mvp.md`](../../docs/briefs/2026-04-17-telegram-control-bot-mvp.md)
for scope and acceptance criteria.

## Quick start

```bash
cd products/telegram-control-bot
npm ci
cp .env.example .env   # then fill in TELEGRAM_BOT_TOKEN and TELEGRAM_OWNER_CHAT_ID
npm run dev            # starts bot (long-polling) + HTTP server on :8080
```

Ping the bot in Telegram: `/ping` → `pong` (only for the whitelisted chat id).

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
