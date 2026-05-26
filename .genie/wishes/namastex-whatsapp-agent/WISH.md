# Wish: GitHub Monitor Agent — WhatsApp via Genie + Omni

| Field | Value |
|-------|-------|
| **Status** | DRAFT |
| **Slug** | `namastex-whatsapp-agent` |
| **Date** | 2026-05-26 |
| **Author** | caio.rod18@gmail.com |
| **Appetite** | 3 days |
| **Branch** | `wish/namastex-whatsapp-agent` |
| **Design** | [DESIGN.md](../../brainstorms/namastex-whatsapp-agent/DESIGN.md) |

## Summary

Build a WhatsApp conversational agent that monitors GitHub Pull Requests and Issues, delivering real-time proactive notifications via GitHub webhooks and answering natural-language queries via the official GitHub MCP server. The agent uses Genie as orchestrator, Omni as the WhatsApp bridge, and SQLite for subscription and dedup persistence.

## Scope

### IN

- WhatsApp as input/output channel via Omni (Baileys)
- Genie (Claude Code native) as agent orchestrator
- Reactive queries: list open PRs, show issue details, count open issues
- Proactive notifications: PR opened/closed/merged, Issue opened/closed
- Repo subscription management via chat commands
- SQLite persistence (monitored_repos, notified_events with dedup key event_type+github_event_id)
- Express webhook server with HMAC-SHA256 signature validation
- MCP server @modelcontextprotocol/server-github for reactive queries
- ngrok for local webhook URL exposure in dev
- docker-compose for reproducible setup
- README with full setup instructions

### OUT

- GitHub Actions / CI/CD pipeline events
- Release and push/commit notifications
- Multi-user / multi-phone subscribers (single NOTIFY_PHONE env var)
- review_requested / assigned sub-events
- Web dashboard or admin UI

## Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | MCP @modelcontextprotocol/server-github | Native Claude tool use; satisfies test MCP criteria |
| 2 | GitHub Webhooks + Express for proactive events | Real-time delivery; no polling lag |
| 3 | SQLite (better-sqlite3) in WAL mode | Zero infra; file-based; WAL handles concurrent access |
| 4 | Single phone via NOTIFY_PHONE env var | Eliminates per-user table; matches test scope |
| 5 | TypeScript/Node for webhook server | Matches Omni CLI ecosystem |
| 6 | ngrok fixed domain in dev | Avoids webhook re-registration on restart |
| 7 | AGENTS.md at project root | Genie convention for agent persona and MCP config |

## Success Criteria

- [ ] Sending a WhatsApp message returns an intelligent response from the Genie agent
- [ ] "listar PRs abertos de owner/repo" returns real current data from GitHub via MCP
- [ ] Opening a PR on a monitored repo triggers a WhatsApp notification within 30 seconds
- [ ] Creating an issue on a monitored repo triggers a WhatsApp notification within 30 seconds
- [ ] The same (event_type, github_event_id) pair is never notified twice (dedup via SQLite)
- [ ] "monitorar owner/repo" persists the repo in monitored_repos across restarts
- [ ] "parar de monitorar owner/repo" removes it from monitored_repos
- [ ] docker-compose up starts all services; only manual step is WhatsApp QR scan
- [ ] README is sufficient for a new developer to reproduce the full setup from scratch

## Execution Strategy

| Group | Agent | Description |
|-------|-------|-------------|
| 1 | engineer | Infra base: repo structure, Genie workspace init, SQLite schema |
| 2 | engineer | Webhook server: Express + HMAC validation + PR/Issue handlers + tests |
| 3 | engineer | Genie agent: AGENTS.md persona, MCP config, subscription commands, Omni wiring |
| 4 | engineer | Delivery: docker-compose, README, end-to-end smoke test |

Wave 1 (parallel): Group 1  
Wave 2 (parallel): Group 2, Group 3 (both depend on Group 1)  
Wave 3 (sequential): Group 4 (depends on Group 2 + Group 3)

---

## Execution Groups

### Group 1: Infra Base
**Goal:** Establish project skeleton, initialize Genie workspace, and create the SQLite schema that Groups 2 and 3 both depend on.

**Deliverables:**
1. `.gitignore` covering `data/db.sqlite`, `node_modules/`, `.env`, ngrok binaries
2. `.env.example` with all required vars: `GITHUB_TOKEN`, `GITHUB_WEBHOOK_SECRET`, `NOTIFY_PHONE`, `NGROK_DOMAIN`, `OMNI_API_URL`, `OMNI_API_KEY`
3. `data/` directory (gitignored) with SQLite DB initialized on import
4. `db/schema.ts` — SQLite schema at repo root: `monitored_repos(id, owner, repo, created_at)` and `notified_events(id, event_type, github_event_id, notified_at, UNIQUE(event_type, github_event_id))` with WAL mode; dedup uses `INSERT OR IGNORE` on the composite constraint
5. `db/client.ts` — better-sqlite3 client at repo root, exported as singleton; initializes schema on first import; shared by webhook-server (via relative import) and agent subscription commands

**Acceptance Criteria:**
- [ ] `.env.example` documents all required environment variables
- [ ] `sqlite3 data/db.sqlite ".schema"` shows both tables including `UNIQUE` constraint on `notified_events`
- [ ] WAL mode is ON: `sqlite3 data/db.sqlite "PRAGMA journal_mode;"` returns `wal`
- [ ] Inserting the same `(event_type, github_event_id)` twice leaves only one row (dedup via `INSERT OR IGNORE`)

**Validation:**
```bash
node -e "const {db}=require('./db/client'); console.log(db.pragma('journal_mode',{simple:true}))" | grep wal
sqlite3 data/db.sqlite ".schema" | grep -E "monitored_repos|notified_events|UNIQUE"
sqlite3 data/db.sqlite "INSERT OR IGNORE INTO notified_events(event_type,github_event_id) VALUES('pull_request','1'); INSERT OR IGNORE INTO notified_events(event_type,github_event_id) VALUES('pull_request','1'); SELECT COUNT(*) FROM notified_events;" | grep "^1$"
```

**depends-on:** none

---

### Group 2: Webhook Server
**Goal:** Express server that receives GitHub webhook events, validates HMAC signatures, deduplicates via SQLite, and delivers WhatsApp notifications via `omni send`.

**Deliverables:**
1. `webhook-server/src/index.ts` — Express server on configurable port (default 3001)
2. `webhook-server/src/middleware/hmac.ts` — HMAC-SHA256 signature validation middleware
3. `webhook-server/src/handlers/pull-request.ts` — handles `pull_request` events (opened, closed, merged)
4. `webhook-server/src/handlers/issue.ts` — handles `issues` events (opened, closed)
5. `webhook-server/src/notify.ts` — `omni send` wrapper using Omni SDK/CLI
6. `webhook-server/fixtures/pr_opened.json` and `issue_opened.json` — test fixture payloads
7. `webhook-server/src/__tests__/handlers.test.ts` — unit tests for handlers with fixture payloads

**Acceptance Criteria:**
- [ ] `POST /webhook/github` with valid HMAC returns 200 and processes the event
- [ ] `POST /webhook/github` with invalid HMAC returns 401
- [ ] PR opened event triggers `omni send` call with repo + PR number + title
- [ ] Issue opened event triggers `omni send` call with repo + issue number + title
- [ ] Re-sending the same fixture does NOT trigger a second `omni send` (dedup)
- [ ] All unit tests pass

**Validation:**
```bash
npm test --prefix webhook-server
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3001/webhook/github \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=BADSIG" \
  -d '{}' | grep 401
```

**depends-on:** Group 1

---

### Group 3: Genie Agent
**Goal:** Define the GitHub Monitor agent persona, configure the GitHub MCP server, wire subscription commands to SQLite, and connect the agent to Omni.

**Deliverables:**
1. `AGENTS.md` — agent name `github-monitor`, persona, capabilities description, and MCP server config block
2. `agent/.claude/settings.json` — MCP servers entry for `@modelcontextprotocol/server-github` with `GITHUB_TOKEN` from env
3. Subscription commands documented in `AGENTS.md` SYSTEM_PROMPT: `monitorar <owner>/<repo>`, `parar de monitorar <owner>/<repo>`, `listar repos monitorados`
4. Agent registered in Genie and connected to Omni instance via `genie:omni` skill or `omni connect`

**Acceptance Criteria:**
- [ ] `genie agent ls` shows `github-monitor` agent as registered
- [ ] Sending "listar PRs abertos de owner/repo" in WhatsApp returns real PR data from GitHub
- [ ] Sending "monitorar owner/repo" writes a row to `monitored_repos` in SQLite
- [ ] Sending "parar de monitorar owner/repo" removes the row from `monitored_repos`
- [ ] `omni routes` or `omni instances` shows github-monitor connected to the WhatsApp instance

**Validation:**
```bash
genie agent ls | grep github-monitor
omni instances 2>/dev/null || omni routes 2>/dev/null | grep github-monitor
sqlite3 data/db.sqlite "SELECT owner, repo FROM monitored_repos;"
```

**depends-on:** Group 1

---

### Group 4: Delivery
**Goal:** Package everything into a reproducible setup with docker-compose, write the README, and run the end-to-end smoke test.

**Deliverables:**
1. `docker-compose.yml` — services: omni, webhook-server, ngrok (optional sidecar)
2. `scripts/setup.sh` — validates env vars, starts ngrok, registers GitHub webhook, starts services
3. `README.md` — setup steps, architecture diagram (ASCII), env var reference, troubleshooting
4. End-to-end smoke test pass: WhatsApp → Genie → GitHub MCP → response verified manually

**Acceptance Criteria:**
- [ ] `docker-compose up --build -d` starts all services without errors
- [ ] `docker-compose ps` shows all containers healthy
- [ ] README covers: prerequisites, env setup, WhatsApp QR scan, GitHub webhook registration, and how to test
- [ ] Smoke test: WhatsApp message "listar PRs abertos de owner/repo" returns real data

**Validation:**
```bash
docker-compose up --build -d
docker-compose ps | grep -v "Exit"
docker-compose logs webhook-server | grep "listening on"
```

**depends-on:** Group 2, Group 3

## Assumptions & Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Omni server offline | High | `omni start` is step 1 in README and setup.sh |
| WhatsApp QR scan required | Medium | One-time; documented with screenshot instructions |
| ngrok URL changes on restart | Low | Use `--domain` flag for fixed subdomain |
| GitHub token missing admin:repo_hook scope | Medium | setup.sh validates scopes before registering webhook |
| MCP server cold start latency | Low | Claude handles gracefully; first query slower |
| SQLite WAL concurrent access | Low | WAL mode; both processes are low-throughput |
