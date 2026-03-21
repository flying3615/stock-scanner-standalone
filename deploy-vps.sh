#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Pull latest code if repository exists
if [ -d .git ]; then
  git pull
fi

# Load GHCR credentials from .env if not already set
if [ -z "${GHCR_USER:-}" ] || [ -z "${GHCR_TOKEN:-}" ]; then
  if [ -f .env ]; then
    # shellcheck disable=SC1091
    set -a
    . ./.env
    set +a
  fi
fi

# Optional GHCR login (for private images)
if [ -n "${GHCR_USER:-}" ] && [ -n "${GHCR_TOKEN:-}" ]; then
  echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USER" --password-stdin
else
  echo "GHCR_USER/GHCR_TOKEN not set; skipping GHCR login"
fi

# Ensure shared proxy network exists
if ! docker network inspect proxy-net >/dev/null 2>&1; then
  docker network create proxy-net
fi

# Check if Tiger Adapter is configured
TIGER_ENABLED=false
if [ -n "${TIGER_OPEN_API_KEY:-}" ] && [ -n "${TIGER_OPEN_API_SECRET:-}" ] && [ -n "${TIGER_ADAPTER_TOKEN:-}" ]; then
  TIGER_ENABLED=true
  echo "Tiger Adapter configuration detected, will start tiger-adapter service"
else
  echo "Tiger Adapter not configured (missing TIGER_OPEN_API_KEY, TIGER_OPEN_API_SECRET, or TIGER_ADAPTER_TOKEN)"
  echo "Stock scanner will run without auto-trading capabilities"
fi

# Pull & start
if [ -f docker-compose.yml ]; then
  docker compose pull
  
  if [ "$TIGER_ENABLED" = true ]; then
    # Start both services
    docker compose up -d --no-build
    echo ""
    echo "=== Deployment Summary ==="
    echo "stock-scanner: running"
    echo "tiger-adapter: running"
    echo ""
    echo "Check health status:"
    echo "  docker compose ps"
    echo "  docker compose logs -f tiger-adapter"
  else
    # Start only stock-scanner (tiger-adapter will fail health checks gracefully)
    docker compose up -d --no-build stock-scanner || {
      echo "Note: tiger-adapter service not started due to missing configuration"
      echo "To enable auto-trading, add Tiger credentials to .env and re-run deploy"
    }
    echo ""
    echo "=== Deployment Summary ==="
    echo "stock-scanner: running"
    echo "tiger-adapter: skipped (not configured)"
  fi
  
  # Show final status
  echo ""
  docker compose ps
else
  echo "Missing docker-compose.yml" >&2
  exit 1
fi
