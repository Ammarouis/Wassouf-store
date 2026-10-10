#!/usr/bin/env bash
#
# Runs the API and the web app together in a SINGLE Render service.
#
# Render injects PORT for the public interface. `next start` picks that up,
# so the web app owns the public port while the API is pinned to an internal
# loopback port that only the web app talks to.
#
# Layout inside the instance:
#   public  $PORT            -> Next.js (apps/web)
#   loopback 127.0.0.1:4000  -> NestJS  (apps/api)  <- reached via API_BASE_URL
set -uo pipefail

API_PORT="${API_PORT:-4000}"

echo "[start-all] API  -> 127.0.0.1:${API_PORT}"
PORT="${API_PORT}" node apps/api/dist/main.js &
API_PID=$!

# If the web process exits, stop the API so the container restarts cleanly.
trap 'kill "${API_PID}" 2>/dev/null || true' EXIT INT TERM

# Wait (bounded) for the API so the first server-rendered requests succeed.
for _ in $(seq 1 25); do
  if node -e "fetch('http://127.0.0.1:${API_PORT}/api/products').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; then
    echo "[start-all] API is up."
    break
  fi
  sleep 1
done

echo "[start-all] web  -> public port ${PORT:-<unset>}"
npm start -w @wassouf/web -- -H 0.0.0.0
