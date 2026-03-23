#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# Pull latest code if repository exists
if [ -d .git ]; then
  git pull
fi

# Load deployment env from .env if present.
if [ -f .env ]; then
  # shellcheck disable=SC1091
  set -a
  . ./.env
  set +a
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
TIGER_ADAPTER_CONFIG_FILE="${TIGER_ADAPTER_CONFIG_FILE:-./tiger_adapter/config/api.properties}"
TIGER_ENABLED=false
if [ -n "${TIGER_ADAPTER_API_KEY:-}" ] && [ -f "$TIGER_ADAPTER_CONFIG_FILE" ]; then
  TIGER_ENABLED=true
  echo "Tiger Adapter configuration detected at $TIGER_ADAPTER_CONFIG_FILE, will start tiger-adapter service"
else
  if [ -z "${TIGER_ADAPTER_API_KEY:-}" ]; then
    echo "Tiger Adapter not configured (missing TIGER_ADAPTER_API_KEY)"
  fi
  if [ ! -f "$TIGER_ADAPTER_CONFIG_FILE" ]; then
    echo "Tiger Adapter config file not found at $TIGER_ADAPTER_CONFIG_FILE"
  fi
  echo "Stock scanner will run without auto-trading capabilities"
fi

# Pull & start
if [ -f docker-compose.yml ]; then
  if [ "$TIGER_ENABLED" = true ]; then
    docker compose pull stock-scanner tiger-adapter

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
    docker compose pull stock-scanner

    # Start only stock-scanner
    docker compose up -d --no-build --no-deps stock-scanner || {
      echo "Note: tiger-adapter service not started due to missing configuration"
      echo "To enable auto-trading, set TIGER_ADAPTER_API_KEY and add $TIGER_ADAPTER_CONFIG_FILE before re-running deploy"
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
