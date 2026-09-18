#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

npm ci
npm run lint
npm run test

npm run build

PORT="${PORT:-3100}"
export LEGACY_BASE_URL="${LEGACY_BASE_URL:-http://127.0.0.1:${PORT}}"
export NEW_BASE_URL="${NEW_BASE_URL:-http://127.0.0.1:${PORT}}"

npm run start -- --port "$PORT" &
SERVER_PID=$!

cleanup() {
	if kill -0 "$SERVER_PID" 2>/dev/null; then
		kill "$SERVER_PID"
		wait "$SERVER_PID" 2>/dev/null || true
	fi
}

trap cleanup EXIT

for _ in $(seq 1 30); do
	if curl --silent --fail "http://127.0.0.1:${PORT}/api/health" >/dev/null; then
		break
	fi
	sleep 1
done

npm run test:parity
