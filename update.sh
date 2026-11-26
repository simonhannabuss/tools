#!/usr/bin/env bash
# Get the latest code from GitHub, rebuild and restart Simon's Tools.
# Usage (in WHM Terminal):  /opt/tools/update.sh
set -e
cd "$(dirname "$0")"
export PODMAN_COMPOSE_WARNING_LOGS=false

echo "1/3  Getting the latest code..."
git pull

echo "2/3  Rebuilding and restarting (takes a few minutes)..."
docker compose down >/dev/null 2>&1 || true
docker compose up -d --build

echo "3/3  Checking it's running..."
for i in $(seq 1 45); do
  if curl -fs http://127.0.0.1:3000/tools/health >/dev/null 2>&1; then
    echo ""
    echo "✓ Simon's Tools is up: https://simonhannabuss.co.uk/tools"
    exit 0
  fi
  sleep 2
done
echo ""
echo "✗ It isn't responding. Show the error with:  docker compose logs --tail 40 web"
exit 1
