#!/usr/bin/env bash
#
# SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
# SPDX-License-Identifier: AGPL-3.0-or-later
#
# Runs a command with the Rust gateway listening in front of PHP.
#
#   with-gateway.sh <command> [args...]
#
# The gateway listens on NC_GATEWAY_LISTEN_PORT (default 8080, where the
# black-box suites expect Nextcloud) and forwards to PHP on
# NC_GATEWAY_UPSTREAM_PORT (default 8081). The command is responsible for
# starting PHP on the upstream port. Fails when the command passed but no
# request went through the gateway, so a suite cannot go green by bypassing it.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GATEWAY_BIN="${NC_GATEWAY_BIN:-$HERE/../target/release/nc-gateway}"
LISTEN_HOST="${NC_GATEWAY_LISTEN_HOST:-127.0.0.1}"
LISTEN_PORT="${NC_GATEWAY_LISTEN_PORT:-8080}"
UPSTREAM_HOST="${NC_GATEWAY_UPSTREAM_HOST:-localhost}"
UPSTREAM_PORT="${NC_GATEWAY_UPSTREAM_PORT:-8081}"
ADMIN_LISTEN="${NC_GATEWAY_ADMIN_LISTEN:-127.0.0.1:9100}"
GATEWAY_LOG="${NC_GATEWAY_LOG:-$(mktemp -t nc-gateway.XXXXXX.log)}"

if [ "$#" -eq 0 ]; then
	echo "usage: $0 <command> [args...]" >&2
	exit 2
fi
if [ ! -x "$GATEWAY_BIN" ]; then
	echo "gateway binary not found at $GATEWAY_BIN; run 'cargo build --release' in rust/ first" >&2
	exit 2
fi

args=(
	--listen "$LISTEN_HOST:$LISTEN_PORT"
	--admin-listen "$ADMIN_LISTEN"
	--upstream "http://$UPSTREAM_HOST:$UPSTREAM_PORT"
)
if [ -n "${NC_GATEWAY_ROUTE_TABLE:-}" ]; then
	args+=(--route-table "$NC_GATEWAY_ROUTE_TABLE")
fi

"$GATEWAY_BIN" "${args[@]}" >"$GATEWAY_LOG" 2>&1 &
GATEWAY_PID=$!
stop_gateway() {
	kill "$GATEWAY_PID" 2>/dev/null
	wait "$GATEWAY_PID" 2>/dev/null
}
trap stop_gateway EXIT

for _ in $(seq 1 100); do
	if curl --silent --fail "http://$ADMIN_LISTEN/healthz" >/dev/null 2>&1; then
		break
	fi
	if ! kill -0 "$GATEWAY_PID" 2>/dev/null; then
		echo "gateway exited during startup:" >&2
		cat "$GATEWAY_LOG" >&2
		exit 1
	fi
	sleep 0.1
done

"$@"
STATUS=$?

METRICS="$(curl --silent "http://$ADMIN_LISTEN/metrics")"
echo "--- gateway metrics (requests, fallbacks, upstream errors) ---"
echo "$METRICS" | grep -E '^nc_gateway_(requests_total|upstream_errors_total|route_table_reloads_total|kill_switch_active)' || true
PROXIED="$(echo "$METRICS" | awk '/^nc_gateway_requests_total/ { sum += $NF } END { print sum + 0 }')"
echo "proxied requests: $PROXIED"

if [ "$STATUS" -ne 0 ]; then
	echo "--- gateway log ---"
	tail -n 50 "$GATEWAY_LOG"
	exit "$STATUS"
fi
if [ "$PROXIED" -eq 0 ]; then
	echo "the command succeeded but no request went through the gateway" >&2
	exit 1
fi
