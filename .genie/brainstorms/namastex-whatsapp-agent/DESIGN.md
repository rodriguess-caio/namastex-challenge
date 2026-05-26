# Design: GitHub Monitor Agent — WhatsApp via Genie + Omni

| Field | Value |
|-------|-------|
| **Slug** | `namastex-whatsapp-agent` |
| **Date** | 2026-05-26 |
| **WRS** | 100/100 |

## Problem

Build a WhatsApp agent that monitors GitHub PRs and Issues for a subscribed repository, notifying a single configured phone number of events in real-time and answering natural-language queries about repository state.

## Scope

### IN

- WhatsApp as input/output channel via Omni (Baileys)
- Genie (Claude Code native) as agent orchestrator
- Reactive queries: "list open PRs", "show issue #42", "how many open issues?"
- Proactive notifications for: PR opened/closed/merged, Issue opened/closed
- Repo subscription management via chat: "monitorar owner/repo", "parar de monitorar owner/repo"
- SQLite persistence for subscriptions and dedup of notified events (dedup key: `event_type + github_event_id`)
- Express webhook server for GitHub event ingestion (validates HMAC-SHA256 signature)
- MCP server (@modelcontextprotocol/server-github) for reactive GitHub queries
- ngrok for local webhook URL exposure in dev
- docker-compose for reproducible setup
- README with full setup instructions

### OUT

- GitHub Actions / CI/CD pipeline events
- Release notifications
- Push/commit events
- Multi-user / multi-phone subscribers (single configured phone number only)
- Web dashboard or admin UI
- Billing or rate-limit management
- `review_requested` / `assigned` sub-events (too granular; noise > signal)

## Approach

Two independent surfaces handled by separate units:

**Surface 1 — Reactive (User → Agent):**
User messages arrive at Omni → routed to Genie agent → Claude uses MCP `@modelcontextprotocol/server-github` tools (`list_pull_requests`, `get_issue`, `search_issues`, etc.) to query GitHub → formats response → Omni delivers back to WhatsApp.

**Surface 2 — Proactive (GitHub → User):**
GitHub sends webhook events to `POST /webhook/github` on an Express server → server validates HMAC-SHA256 signature → queries SQLite to check if repo is monitored → if yes and `(event_type, github_event_id)` not in `notified_events` → calls `omni send` to push notification to configured phone.

**Subscription management** is handled via agent chat commands (SQLite writes); the webhook server reads the same SQLite file to decide what to notify. Both processes share the file in WAL mode.

Single configured phone number (from `NOTIFY_PHONE` env var) keeps the architecture simple and eliminates the need for a per-subscriber lookup at notification time.

This separation keeps the Genie agent stateless (no polling loop) and the webhook server lightweight (no LLM calls needed for notifications).

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| GitHub integration | MCP @modelcontextprotocol/server-github | Native Claude tool use, aligns with test MCP criteria |
| Proactive events | GitHub Webhooks + Express | Real-time vs polling; more impressive architecture |
| Persistence | SQLite (better-sqlite3) | Zero infra, sufficient for scope, easy to version |
| Channel bridge | Omni CLI / SDK | Required by test |
| Orchestrator | Genie native agent | Required by test |
| Webhook exposure | ngrok in dev | Pragmatic; fixed ngrok domain avoids re-registration |
| Language | TypeScript/Node | Matches Omni CLI ecosystem |
| Subscriber model | Single phone (env var) | Eliminates per-user table complexity; matches test scope |
| Agent config file | AGENTS.md (project root) | Genie convention — not CLAUDE.md |

## Risks & Assumptions

| Risk | Severity | Mitigation |
|------|----------|------------|
| Omni server offline at test time | High | `omni start` documented as step 1 in README |
| WhatsApp QR scan required | Medium | One-time setup; documented with screenshot instructions |
| ngrok URL changes on restart | Low | Use ngrok `--domain` flag for fixed subdomain; or re-run setup script |
| GitHub token missing `admin:repo_hook` scope | Medium | README lists exact required scopes; setup script validates |
| MCP server cold start latency | Low | Claude handles gracefully; first query may be slower |
| SQLite concurrent access (webhook server + agent) | Low | WAL mode enabled; both processes are low-throughput |

## Task Breakdown

**Group A — Infrastructure (no deps)**
- A1: Initialize git repo + project structure + .env.example + .gitignore
- A2: Initialize Genie workspace (`genie init`)
- A3: Set up SQLite schema (`monitored_repos`, `notified_events` tables)

**Group B — Webhook Server (depends-on: A3)**
- B1: Express server with `POST /webhook/github` endpoint + HMAC validation
- B2: PR event handler (opened/closed/merged → `omni send`)
- B3: Issue event handler (opened/closed → `omni send`)
- B4: Integration test: send HMAC-signed fixture event, verify `omni send` called

**Group C — Genie Agent (depends-on: A2)**
- C1: AGENTS.md with agent persona + MCP config (@modelcontextprotocol/server-github)
- C2: Subscription commands wired to SQLite (monitorar / parar de monitorar)
- C3: Omni↔Genie wiring via `genie:omni` skill

**Group D — Integration + Delivery (depends-on: B, C)**
- D1: docker-compose.yml covering all services
- D2: README with step-by-step setup
- D3: End-to-end smoke test: WhatsApp message → Genie → GitHub MCP → response

**Dependencies:** A3 → B; A2 → C; (B + C) → D

## Validation Commands (per group)

| Group | Command | Pass condition |
|-------|---------|----------------|
| A3 | `sqlite3 data/db.sqlite ".schema"` | Tables `monitored_repos` and `notified_events` present |
| B1 | `curl -X POST localhost:3001/webhook/github -H 'X-Hub-Signature-256: sha256=...' -d @fixtures/pr_opened.json` | HTTP 200, no crash |
| B4 | `npm test --prefix webhook-server` | All tests pass |
| C1 | `genie agent show github-monitor` | Agent registered, MCP server listed |
| C3 | `omni connect list` | github-monitor agent appears as connected |
| D1 | `docker-compose up --build -d && docker-compose ps` | All containers healthy |
| D3 | Manual: send "listar PRs abertos de owner/repo" on WhatsApp | Agent replies with real PR data |

## Success Criteria

- [ ] Sending a WhatsApp message returns an intelligent response from the agent
- [ ] "listar PRs abertos de owner/repo" returns real, current data from GitHub via MCP
- [ ] Opening a PR on a monitored repo triggers a WhatsApp notification within 30 seconds
- [ ] Creating an issue on a monitored repo triggers a WhatsApp notification within 30 seconds
- [ ] The same `(event_type, github_event_id)` is never notified twice (dedup via SQLite)
- [ ] "monitorar owner/repo" adds the repo to `monitored_repos` table, persisted across restarts
- [ ] "parar de monitorar owner/repo" removes it from `monitored_repos`
- [ ] Restarting the webhook server preserves all subscriptions
- [ ] `docker-compose up` starts all services without manual steps beyond WhatsApp QR scan
- [ ] README is sufficient for a new developer to reproduce the full setup from scratch

## File Structure (target)

```
namastex-challenge/
├── .genie/                         # Genie workspace
│   ├── brainstorms/namastex-whatsapp-agent/
│   │   ├── DRAFT.md
│   │   └── DESIGN.md
│   └── brainstorm.md
├── agent/                          # Genie agent definition
│   └── .claude/settings.json       # MCP servers config (github MCP)
├── db/                             # Shared SQLite client (used by webhook-server + agent)
│   ├── schema.ts
│   └── client.ts
├── webhook-server/                 # Express webhook ingestion
│   ├── src/
│   │   ├── index.ts
│   │   ├── handlers/
│   │   │   ├── pull-request.ts
│   │   │   └── issue.ts
│   │   └── notify.ts               # omni send wrapper
│   ├── fixtures/                   # JSON fixture events for testing
│   │   ├── pr_opened.json
│   │   └── issue_opened.json
│   ├── package.json
│   └── tsconfig.json
├── AGENTS.md                       # Genie agent persona + instructions
├── data/
│   └── db.sqlite                   # SQLite file (gitignored)
├── docker-compose.yml
├── .env.example
└── README.md
```
