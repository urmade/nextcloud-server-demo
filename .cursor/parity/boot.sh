#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

usage() {
	cat <<'EOF'
Usage: boot.sh <up|down|logs|status>

  up      Start legacy Nextcloud (creates .env from .env.example if missing)
  down    Stop and remove containers (keeps volume)
  logs    Follow container logs
  status  Show compose service status
EOF
}

require_docker() {
	if ! command -v docker >/dev/null 2>&1; then
		echo "docker is not installed or not on PATH" >&2
		exit 1
	fi
	if ! docker info >/dev/null 2>&1; then
		echo "docker daemon is not reachable (is it running?)" >&2
		exit 1
	fi
}

ensure_env() {
	if [[ ! -f .env ]]; then
		cp .env.example .env
		echo "Created .env from .env.example"
	fi
}

cmd="${1:-}"
case "$cmd" in
	up)
		require_docker
		ensure_env
		docker compose up -d
		echo "Legacy Nextcloud starting. Run ./smoke-check.sh after healthcheck passes."
		;;
	down)
		require_docker
		docker compose down
		;;
	logs)
		require_docker
		docker compose logs -f legacy-nextcloud
		;;
	status)
		require_docker
		docker compose ps
		;;
	*)
		usage
		exit 1
		;;
esac
