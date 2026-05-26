#!/usr/bin/env bash
# setup.sh — One-shot setup for namastex-github-monitor
#
# Usage:
#   ./scripts/setup.sh
#
# This script validates environment variables, prints setup instructions,
# and registers the GitHub webhook for your repository.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# jq is required for safe JSON construction (prevents secret injection)
if ! command -v jq &>/dev/null; then
  echo "ERROR: 'jq' is required but not installed."
  echo "  macOS:  brew install jq"
  echo "  Debian: apt-get install -y jq"
  exit 1
fi

# ── Load .env if present ──────────────────────────────────────────────────────
if [ -f "${PROJECT_ROOT}/.env" ]; then
  echo "==> Loading environment from .env"
  set -a
  # shellcheck disable=SC1090
  source "${PROJECT_ROOT}/.env"
  set +a
else
  echo "WARNING: .env file not found. Copy .env.example and fill in values:"
  echo "  cp ${PROJECT_ROOT}/.env.example ${PROJECT_ROOT}/.env"
  echo ""
fi

# ── Validate required env vars ────────────────────────────────────────────────
REQUIRED_VARS=(GITHUB_TOKEN GITHUB_WEBHOOK_SECRET NOTIFY_PHONE NGROK_DOMAIN NGROK_AUTHTOKEN GITHUB_OWNER GITHUB_REPO)
MISSING=()

for VAR in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!VAR:-}" ]; then
    MISSING+=("$VAR")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "ERROR: The following required environment variables are not set:"
  for VAR in "${MISSING[@]}"; do
    echo "  - $VAR"
  done
  echo ""
  echo "Please set them in ${PROJECT_ROOT}/.env (copy from .env.example) and re-run."
  exit 1
fi

echo "==> All required environment variables are set."
echo ""

# ── Validate format of GITHUB_OWNER and GITHUB_REPO ──────────────────────────
if ! [[ "${GITHUB_OWNER}" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
  echo "ERROR: GITHUB_OWNER contains invalid characters: ${GITHUB_OWNER}"
  exit 1
fi
if ! [[ "${GITHUB_REPO}" =~ ^[a-zA-Z0-9_.-]+$ ]]; then
  echo "ERROR: GITHUB_REPO contains invalid characters: ${GITHUB_REPO}"
  exit 1
fi

# ── Print setup instructions ──────────────────────────────────────────────────

echo "============================================================"
echo " namastex-github-monitor — Setup Instructions"
echo "============================================================"
echo ""
echo "Step 1: Start Omni (WhatsApp bridge — runs locally, NOT in Docker)"
echo "  omni start"
echo ""
echo "Step 2: Scan WhatsApp QR code"
echo "  omni instances          # Find your instance name"
echo "  omni qr <instance>      # Display QR code to scan with WhatsApp"
echo ""
echo "Step 3: Register the Genie agent"
echo "  ${PROJECT_ROOT}/scripts/register-agent.sh"
echo ""
echo "Step 4: Start the webhook server"
echo "  # With Docker (recommended):"
echo "  docker-compose -f ${PROJECT_ROOT}/docker-compose.yml up -d webhook-server"
echo ""
echo "  # Or locally (dev mode):"
echo "  npm run dev --prefix ${PROJECT_ROOT}/webhook-server"
echo ""
echo "Step 5: Start ngrok tunnel"
echo "  # With Docker:"
echo "  docker-compose -f ${PROJECT_ROOT}/docker-compose.yml up -d ngrok"
echo ""
echo "  # Or locally:"
echo "  ngrok http --domain=${NGROK_DOMAIN} 3001"
echo ""
echo "Step 6: Register GitHub webhook (this script will do it below)"
echo "  Webhook URL: https://${NGROK_DOMAIN}/webhook/github"
echo ""
echo "============================================================"
echo ""

# ── Register GitHub webhook ───────────────────────────────────────────────────
echo "==> Registering GitHub webhook for ${GITHUB_OWNER}/${GITHUB_REPO}..."
echo "    Webhook URL: https://${NGROK_DOMAIN}/webhook/github"
echo ""

# Build JSON with jq to safely handle special characters in secret/domain values
PAYLOAD=$(jq -n \
  --arg url "https://${NGROK_DOMAIN}/webhook/github" \
  --arg secret "${GITHUB_WEBHOOK_SECRET}" \
  '{
    name: "web",
    active: true,
    events: ["pull_request", "issues"],
    config: { url: $url, content_type: "json", secret: $secret }
  }')

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Content-Type: application/json" \
  "https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/hooks" \
  -d "${PAYLOAD}")

HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_STATUS" = "201" ]; then
  echo "==> Webhook registered successfully!"
  echo "    Response: $BODY"
elif [ "$HTTP_STATUS" = "422" ]; then
  echo "WARNING: Webhook may already exist (HTTP 422 Unprocessable Entity)."
  echo "    Response: $BODY"
  echo "    This is likely a duplicate webhook — you can verify in GitHub repository settings."
else
  echo "ERROR: Failed to register webhook (HTTP ${HTTP_STATUS})."
  echo "    Response: $BODY"
  echo ""
  echo "Check that GITHUB_TOKEN has 'admin:repo_hook' scope and the repo exists."
  exit 1
fi

echo ""
echo "==> Setup complete!"
echo ""
echo "To verify everything is working, send a WhatsApp message to your agent:"
echo "  'listar PRs abertos de ${GITHUB_OWNER}/${GITHUB_REPO}'"
echo ""
