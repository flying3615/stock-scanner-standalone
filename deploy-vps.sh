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

# Pull & start
if [ -f docker-compose.yml ]; then
  docker compose pull
  exec docker compose up -d --no-build
else
  echo "Missing docker-compose.yml" >&2
  exit 1
fi
