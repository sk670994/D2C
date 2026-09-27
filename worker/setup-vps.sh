#!/usr/bin/env bash
# One-time setup of the Zooptrack worker on a fresh Ubuntu 22.04/24.04 server
# (2 vCPU / 4 GB RAM is plenty). Run as a user with sudo, from the D2C folder:
#
#   git clone https://github.com/sk670994/D2C.git && cd D2C
#   bash worker/setup-vps.sh
#
# After it finishes: edit worker/.env (service key, Gemini key, proxy), then
#   docker compose -f worker/docker-compose.yml up -d --build
# The container restarts itself after crashes and reboots. Daily at 04:00 UTC
# it pulls the latest code and rebuilds (worker/update-worker.sh).
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi

# 2 GB swap: Chromium spikes can exceed RAM on small servers.
if ! swapon --show | grep -q '/swapfile'; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

if [ ! -f worker/.env ]; then
  cp worker/env.example worker/.env
  chmod 600 worker/.env
  echo "Created worker/.env - fill in SUPABASE_SERVICE_ROLE_KEY, GEMINI_API_KEY and ADSPY_PROXY_URL."
fi

# Daily self-update (keeps the server on the latest merged code).
chmod +x worker/update-worker.sh
( crontab -l 2>/dev/null | grep -v update-worker.sh ; echo "0 4 * * * cd $(pwd) && bash worker/update-worker.sh >> $HOME/zooptrack-update.log 2>&1" ) | crontab -

echo
echo "Done. Next:"
echo "  1) nano worker/.env      (paste the keys, no quotes)"
echo "  2) sudo docker compose -f worker/docker-compose.yml up -d --build"
echo "  3) curl -s localhost:8787/healthz"
