#!/usr/bin/env bash
# subscribe.sh — Manually add a repo subscription to the monitored_repos table
#
# Usage:
#   ./scripts/subscribe.sh OWNER REPO
#
# Example:
#   ./scripts/subscribe.sh facebook react
#   ./scripts/subscribe.sh torvalds linux
#
# This is a helper for manual testing. In production, the github-monitor agent
# handles subscriptions via chat commands ("monitorar owner/repo").
#
# The INSERT OR IGNORE means running this script multiple times for the same
# owner/repo pair is safe (idempotent).

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_PATH="${PROJECT_ROOT}/data/db.sqlite"

# ── Validate arguments ────────────────────────────────────────────────────────
if [ $# -ne 2 ]; then
  echo "Usage: $0 OWNER REPO"
  echo ""
  echo "Example:"
  echo "  $0 facebook react"
  exit 1
fi

OWNER="$1"
REPO="$2"

# ── Validate database exists ──────────────────────────────────────────────────
if [ ! -f "${DB_PATH}" ]; then
  echo "ERROR: Database not found at ${DB_PATH}"
  echo "Run 'node -e \"require(\\\"./db/client\\\")\"' from the project root to initialize it."
  exit 1
fi

# ── Insert the subscription ───────────────────────────────────────────────────
echo "==> Adding ${OWNER}/${REPO} to monitored repos..."

# Replace OWNER and REPO below with the actual values you want to monitor.
# The INSERT OR IGNORE ensures no duplicate entries are created.
sqlite3 "${DB_PATH}" "INSERT OR IGNORE INTO monitored_repos(owner, repo) VALUES('${OWNER}', '${REPO}');"

echo "==> Done. Current monitored repos:"
sqlite3 "${DB_PATH}" "SELECT owner || '/' || repo FROM monitored_repos;"
