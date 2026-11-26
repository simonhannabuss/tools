#!/usr/bin/env bash
# Restart Simon's Tools so it picks up changes to .env (no rebuild).
# Usage (in WHM Terminal):  /opt/tools/restart.sh
set -e
cd "$(dirname "$0")"
echo "Restarting..."
docker compose down >/dev/null 2>&1 || true
docker compose up -d
for i in $(seq 1 30); do
  if curl -fs http://127.0.0.1:3000/tools/health >/dev/null 2>&1; then
    echo "✓ Simon's Tools is up: https://simonhannabuss.co.uk/tools"
    exit 0
  fi
  sleep 2
done
echo "✗ It isn't responding. Show the error with:  docker compose logs --tail 40 web"
exit 1
