# CLAUDE.md — namastex-github-monitor

## Project overview

WhatsApp agent that monitors GitHub repositories. Two execution paths:
- **Proactive**: GitHub sends webhooks → `webhook-server` (Express, port 3001) validates HMAC, deduplicates via SQLite, calls `notify()` → Omni HTTP API → WhatsApp
- **Reactive**: User sends WhatsApp message → Omni → NATS → genie-omni-bridge → Genie agent (this codebase) → GitHub MCP tools → response

## Key architecture decisions

- `db/client.ts` lives at **repo root**, not inside `webhook-server/`. Both the webhook server and the agent import it via relative path (`../../../db/client`). The compiled `db/client.js` is what Node requires at runtime.
- `express.raw({ type: '*/*' })` is intentional — HMAC validation requires the raw body bytes before any parsing. Do not change to `express.json()`.
- SQLite uses **WAL mode** (`PRAGMA journal_mode = WAL`). This allows the webhook server and the agent to read/write concurrently without locking.
- Dedup pattern: `INSERT OR IGNORE INTO notified_events(event_type, github_event_id)`. The composite `UNIQUE(event_type, github_event_id)` constraint makes the dedup atomic. Check `result.changes > 0` to know if this is a new event.

## Running locally

```bash
# 1. Copy and fill env vars
cp .env.example .env

# 2. Install root deps (better-sqlite3)
npm install

# 3. Compile db layer
npm run build:db

# 4. Start webhook server (dev mode)
npm run dev --prefix webhook-server

# 5. Run tests
npm test --prefix webhook-server
```

## Environment variables

All documented in `.env.example`. Critical ones:
- `GITHUB_WEBHOOK_SECRET` — must match the secret registered on GitHub. Used by `hmac.ts`.
- `OMNI_API_KEY` — if set, `notify.ts` uses the HTTP API (Docker mode). If absent, falls back to `omni` CLI (local dev mode).
- `NOTIFY_PHONE` — destination phone in E.164 format (e.g. `+5511999999999`).

## Agent configuration

The deployed agent lives in `agent/`. Its Claude Code settings are at `agent/.claude/settings.json`:
- MCP: `@github/mcp-server` with `GITHUB_TOKEN` from env
- `permissions.allow` whitelists only GitHub MCP tools and `sqlite3` Bash calls
- `permissions.deny` blocks `rm`, `curl`, `wget`, `npm`, `npx` from Bash

The agent persona and system prompt are in `AGENTS.md` (Genie format).

## Security invariants

- Never use `shell: true` or template strings in `spawnSync` calls — always use argument arrays to prevent command injection.
- In `AGENTS.md` subscription commands, the agent must validate `owner` and `repo` match `^[a-zA-Z0-9_.-]+$` before running any SQL. This guards against prompt-injection-driven SQL injection.
- HMAC validation uses `crypto.timingSafeEqual` — do not replace with `===`.

## Test coverage

`webhook-server/src/__tests__/handlers.test.ts` covers:
1. Valid HMAC → 200
2. Invalid HMAC → 401
3. PR opened → `notify()` called with correct message
4. Issue opened → `notify()` called with correct message
5. Duplicate event → `notify()` called exactly once (dedup)

Fixtures in `webhook-server/fixtures/`.

## What is NOT in scope

- Multi-user / multi-phone (single `NOTIFY_PHONE` env var by design)
- GitHub Actions / CI events
- Web dashboard
