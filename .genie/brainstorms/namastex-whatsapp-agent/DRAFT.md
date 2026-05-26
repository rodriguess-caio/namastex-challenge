# Brainstorm Draft: GitHub Monitor Agent — WhatsApp via Genie + Omni

**Date:** 2026-05-26
**Status:** Ready → Crystallizing

## Problem

DevOps teams need real-time GitHub event visibility (PRs, Issues) delivered to WhatsApp, without leaving their phones. The agent bridges GitHub and WhatsApp via Genie + Omni, enabling both proactive alerts and reactive Q&A.

## Domain

DevOps / GitHub Monitor

## Stack Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Orchestrator | Genie (Claude Code native) | Required by test |
| Channel bridge | Omni (Baileys) | Required by test |
| GitHub queries (reactive) | MCP @modelcontextprotocol/server-github | Native Claude tool use, elegant, aligns with test criteria |
| GitHub events (proactive) | GitHub Webhooks → Express server | Real-time, no polling lag |
| Persistence | SQLite | Zero infra, file-based, sufficient for scope |
| ngrok | For local webhook exposure in dev | Required for GitHub to reach localhost |

## Events in Scope

- Pull Requests: opened, closed, merged, review_requested
- Issues: opened, closed, assigned

## Events OUT of Scope

- GitHub Actions / CI/CD pipelines (excluded by user)
- Releases
- Push events

## Architecture

```
WhatsApp User
    ↕ (Baileys)
Omni API  ←→  Genie Agent (Claude Code)
                  ├── MCP: @modelcontextprotocol/server-github
                  └── SQLite (subscriptions, notified events)

GitHub  →  POST /webhook/github  →  Express Server  →  omni.send()  →  WhatsApp
```

## Components to Build

1. Genie workspace init + agent definition (AGENTS.md, MCP config in .claude/settings.json)
2. `webhook-server/` — Express app receiving GitHub webhook events
3. `db/` — SQLite schema: monitored_repos, notified_events, subscribers
4. Agent SYSTEM_PROMPT defining persona + capabilities
5. Omni↔Genie wiring via `genie:omni` skill
6. `docker-compose.yml` + `README.md`

## Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Omni server offline | High | `omni start` before integration |
| WhatsApp QR scan needed | Medium | One-time setup, documented in README |
| ngrok URL changes on restart | Low | Use ngrok fixed domain or re-register webhook on start |
| GitHub token scope | Medium | Requires `repo` + `admin:repo_hook` scopes |

## Success Criteria

- [ ] WhatsApp message received → Genie processes → response sent back
- [ ] "listar PRs abertos do owner/repo" returns real data via MCP
- [ ] Opening a PR on monitored repo triggers WhatsApp notification
- [ ] Creating an issue triggers WhatsApp notification
- [ ] User can subscribe/unsubscribe repos via chat
- [ ] SQLite persists subscriptions across restarts
- [ ] README is sufficient to reproduce the setup from scratch
