#!/usr/bin/env bash
# register-agent.sh — Register the github-monitor agent with Genie
#
# Usage:
#   ./scripts/register-agent.sh
#
# This script is idempotent: safe to run multiple times.
# Run this from the project root directory.

set -euo pipefail

AGENT_NAME="github-monitor"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Registering agent: ${AGENT_NAME}"
echo "    Project root: ${PROJECT_ROOT}"

# ── Step 1: Initialize the agent with Genie ──────────────────────────────────
# genie init agent registers the agent in the Genie workspace.
# If the agent is already registered, this command is a no-op or will report
# it already exists — both outcomes are fine (idempotent).
if command -v genie &>/dev/null; then
  echo "==> Running: genie init agent ${AGENT_NAME}"
  genie init agent "${AGENT_NAME}" || {
    echo "    (agent may already be registered — continuing)"
  }
else
  echo "    WARNING: 'genie' CLI not found in PATH."
  echo "    Install Genie and re-run this script, or register the agent manually:"
  echo "      genie init agent ${AGENT_NAME}"
fi

# ── Step 2: Load environment variables ───────────────────────────────────────
if [ -f "${PROJECT_ROOT}/.env" ]; then
  echo "==> Loading environment from .env"
  # shellcheck disable=SC1090
  set -a
  source "${PROJECT_ROOT}/.env"
  set +a
else
  echo "    WARNING: .env file not found. Copy .env.example and fill in values:"
  echo "      cp .env.example .env"
fi

# ── Step 3: Post-registration instructions ───────────────────────────────────
echo ""
echo "==> Registration complete (or agent already registered)."
echo ""
echo "Next steps:"
echo ""
echo "  1. Ensure your .env contains valid values for:"
echo "       GITHUB_TOKEN, OMNI_API_URL, OMNI_API_KEY, NOTIFY_PHONE"
echo ""
echo "  2. Start the Omni WhatsApp bridge (if not already running):"
echo "       docker-compose up -d omni"
echo "       # Then scan the QR code: omni qr"
echo ""
echo "  3. Connect the github-monitor agent to your Omni WhatsApp instance:"
echo "       omni connect github-monitor"
echo "     Or, if using Genie's omni skill:"
echo "       genie skill add omni --agent ${AGENT_NAME}"
echo ""
echo "  4. Verify the agent is registered:"
echo "       genie agent ls | grep ${AGENT_NAME}"
echo ""
echo "  5. Verify the Omni connection:"
echo "       omni instances 2>/dev/null || omni routes 2>/dev/null | grep ${AGENT_NAME}"
echo ""
echo "Done."
