# Task Brief — Telegram Control Bot (MVP slice)

**Продукт:** Telegram Control Bot (первый продукт фабрики, см. `docs/specs/2026-04-17-agent-factory-design.md` §6).
**Это задача:** минимальный срез — доказать, что фабрика способна собрать рабочий бот end-to-end. НЕ полный бот.
**Целевой размер:** ≤2 часа работы агента. Если Planner видит, что не влезает — пусть разобьёт.

---

## 1. Goal (одна фраза)

Развернуть локально Telegram-бот на Node.js+TypeScript, у которого есть:
- команда `/ping` (отвечает `pong` только в whitelisted chat_id),
- HTTP endpoint `POST /notify` (принимает JSON `{title, url}`, шлёт сообщение владельцу в Telegram).

Покрыть тестами (Vitest), замокав Telegram API.

## 2. Зачем именно это (MVP-критерий из спека)

Минимальный срез Telegram Control Bot по §9 спека:
> владелец бросает задачу "сделай бот, который шлёт уведомление мне в Telegram" → через ≤2 часа готовый PR, тесты прошли, после апрува уведомление приходит в реальный чат.

Эта задача — контрольный выстрел. Если она проходит пайплайн Planner→Coder→Tester→Reviewer→PR за разумное время, фабрика работает. Если нет — чиним процесс до того, как брать реальные фичи.

## 3. Acceptance criteria

- [ ] Репозиторий `products/telegram-control-bot/` создан внутри factory (или отдельный репо — решает Planner; по умолчанию — подпапка).
- [ ] `npm test` проходит зелёным, ≥80% покрытие по `src/`.
- [ ] `npm run dev` запускает бот локально, `/ping` в Telegram отвечает `pong`.
- [ ] `curl -X POST http://localhost:8080/notify -H "Content-Type: application/json" -d '{"title":"PR #1 ready","url":"https://github.com/Sherman05/factory/pull/1"}'` → в Telegram приходит сообщение с title и clickable url.
- [ ] Non-whitelisted `chat_id` → бот молча игнорирует (лог: `ignored: chat_id=X`).
- [ ] `.env.example` есть и документирует все переменные; реальный `.env` в `.gitignore`.
- [ ] README с 5-строчной инструкцией запуска.
- [ ] TDD-порядок коммитов: `test:` коммит падает → `feat:` коммит его чинит. История в `git log` это показывает.

## 4. Технический стек (пред-решено, Coder не переизобретает)

| Слой | Выбор | Примечание |
|---|---|---|
| Runtime | Node.js 24 | уже стоит |
| Язык | TypeScript (strict) | — |
| Telegram SDK | **grammY** | легче Telegraf, лучше TS-типы в 2026 |
| HTTP-сервер | Fastify | маленький, быстрый, TS-friendly |
| Тесты | Vitest | соответствует CLAUDE.md |
| Линт/формат | ESLint + Prettier | наследуется из factory/.claude/settings |
| Конфиг | `.env` через `dotenv`, валидируется через `zod` на старте |

Если Coder по веской причине хочет отклониться — пишет обоснование в PR description, Reviewer решает.

## 5. Переменные окружения (`.env`)

```
TELEGRAM_BOT_TOKEN=<от @BotFather>
TELEGRAM_OWNER_CHAT_ID=<твой user_id, число>
HTTP_PORT=8080
```

Whitelist пока = один chat_id. Массив/множество — в следующей задаче.

## 6. Структура файлов (ориентир, не догма)

```
products/telegram-control-bot/
├── src/
│   ├── bot.ts          # grammY-бот, /ping
│   ├── server.ts       # Fastify, POST /notify
│   ├── config.ts       # zod-валидация .env
│   ├── notifier.ts     # функция sendNotification(title, url) — отделена от HTTP, легко мокается
│   └── index.ts        # orchestration: параллельно бот + сервер
├── tests/
│   ├── notifier.test.ts   # мок Telegram API, проверка формата сообщения
│   ├── server.test.ts     # supertest: 200 на валидный POST, 400 на невалидный
│   └── bot.test.ts        # /ping → pong ТОЛЬКО для whitelisted chat_id
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

Файлы ≤300 строк — правило из CLAUDE.md.

## 7. Test plan (подсказки Tester'у)

Кроме happy-path тестов Coder'а, Tester должен добавить:
- POST /notify с пустым body → 400
- POST /notify с `title` без `url` → 400
- POST /notify когда Telegram API падает (мок кидает ошибку) → 502, сообщение в логе
- `/ping` от user_id ≠ whitelist → бот НЕ отвечает, НЕ падает
- Старт приложения без `TELEGRAM_BOT_TOKEN` → процесс падает на `config.ts` с понятной ошибкой (не тихо)

## 8. Out of scope (явно НЕ делаем в этой задаче)

- Inline-кнопки `✅ Approve & Merge` / `❌ Reject` — отдельная задача.
- Команды `/new`, `/status` — отдельная задача.
- Интеграция с vibe-kanban MCP — отдельная задача (и сначала исследование).
- Деплой на Cloudflare Workers / Vercel — отдельная задача.
- Несколько пользователей в whitelist — отдельная задача.
- Persistence (KV-store) — отдельная задача.

Если агент тратит время на эти пункты — Reviewer реджектит за scope creep.

## 9. Заметки Planner'у

- Это задача размера "одного агента", разбиение вероятно не нужно. Если Planner всё же решит разбить — максимум на 2 подзадачи: (а) notifier + server + тесты, (б) bot + integration. В любом случае каждая подзадача должна иметь работающий `npm test`.
- Ветка: `feat/telegram-bot-mvp` (или под-ветки `feat/telegram-bot-mvp-<slug>` если разбивалось).
- Один PR в конце (если одна задача) или один финальный PR с rebase (если несколько).

## 10. Как проверить после merge

1. `cd products/telegram-control-bot && npm ci && cp .env.example .env`
2. Заполнить `.env` реальными значениями.
3. `npm run dev`
4. В Telegram: `/ping` → `pong`.
5. В другом терминале: `curl -X POST http://localhost:8080/notify -H "Content-Type: application/json" -d '{"title":"test","url":"https://example.com"}'` → уведомление пришло.
6. Если оба шага зелёные — MVP считается работающим, следующая задача открывается.

## 11. Следующие задачи (после этой)

В порядке приоритета:
1. Inline-кнопка `✅ Approve & Merge` в уведомлении → при нажатии бот дёргает `gh pr merge`.
2. Команда `/status` → список открытых PR в `Sherman05/factory`.
3. Интеграция с vibe-kanban: автоматический вызов `POST /notify` при готовности задачи.
4. Деплой на Cloudflare Workers (чтобы бот работал, когда ПК владельца выключен).

Каждая — отдельный brief в `docs/briefs/`.
