#!/usr/bin/env bash
# Pull the latest main and rebuild the worker only when the code changed.
set -euo pipefail
cd "$(dirname "$0")/.."
before=$(git rev-parse HEAD)
git pull --ff-only --quiet
after=$(git rev-parse HEAD)
if [ "$before" != "$after" ]; then
  echo "$(date -u) updating $before -> $after"
  sudo docker compose -f worker/docker-compose.yml up -d --build
else
  echo "$(date -u) up to date ($after)"
fi
