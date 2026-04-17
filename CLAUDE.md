# Agent Factory — Rules for All Roles

This repository is a **factory of AI agents**. Every subagent (Planner, Designer, Coder, Tester, Reviewer) runs under these shared rules.

## Universal rules

- **Small units.** Files with one clear responsibility. If a file grows past ~300 lines, split.
- **YAGNI ruthlessly.** No speculative features, no "might need later", no config flags for hypotheticals.
- **TDD for code changes.** Coder writes the failing test first, then implementation.
- **Frequent commits.** Each logical step is a commit with a clear message.
- **No secrets in code.** Use environment variables. `.env` is always in `.gitignore`.
- **No useless comments.** Don't describe WHAT code does — identifiers should. Only comment WHY when non-obvious.
- **Human-in-the-loop for main.** Never merge into `main` without the owner's approval. Feature branches only.

## Language conventions

- Default stack for new products: **TypeScript** (backend + frontend).
- Tests: Vitest or Jest.
- Formatter: Prettier (auto via pre-commit hook).
- Linter: ESLint.

## Commits

- Conventional Commits format: `feat:`, `fix:`, `test:`, `docs:`, `refactor:`, `chore:`.
- Message in English, imperative mood.
- Reference the task ID from vibe-kanban in the body if applicable.

## Branch naming

- `feat/<task-slug>` — новая фича
- `fix/<task-slug>` — фикс бага
- `chore/<task-slug>` — не-код (docs, config)

## Forbidden

- `--no-verify` / skipping pre-commit hooks (unless owner explicitly says so)
- Force push to `main`
- Committing `.env`, credentials, API tokens
- Changing this file without a PR

## Pointer to the factory design

Full spec: `docs/specs/2026-04-17-agent-factory-design.md`. Read it if you're a new agent joining this repo.
