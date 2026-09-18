#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
# SPDX-License-Identifier: AGPL-3.0-or-later

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ -f "$SCRIPT_DIR/.env" ]]; then
	set -a
	# shellcheck source=/dev/null
	source "$SCRIPT_DIR/.env"
	set +a
fi

LEGACY_BASE_URL="${LEGACY_BASE_URL:-http://localhost:19080}"
LEGACY_ADMIN_USER="${LEGACY_ADMIN_USER:-admin}"
LEGACY_ADMIN_PASSWORD="${LEGACY_ADMIN_PASSWORD:-parity-test-password}"
MAX_WAIT_SECONDS="${SMOKE_MAX_WAIT_SECONDS:-180}"

fail() {
	echo "SMOKE CHECK FAILED: $*" >&2
	exit 1
}

wait_for_status() {
	local deadline=$((SECONDS + MAX_WAIT_SECONDS))
	while (( SECONDS < deadline )); do
		if curl -sfS "${LEGACY_BASE_URL}/status.php" >/tmp/nc-parity-status.json 2>/dev/null; then
			if grep -q '"installed":true' /tmp/nc-parity-status.json; then
				return 0
			fi
		fi
		sleep 3
	done
	fail "status.php did not report installed=true within ${MAX_WAIT_SECONDS}s at ${LEGACY_BASE_URL}"
}

echo "Waiting for ${LEGACY_BASE_URL}/status.php ..."
wait_for_status

echo "Checking OCS capabilities with admin credentials ..."
caps_json="$(curl -sfS \
	-u "${LEGACY_ADMIN_USER}:${LEGACY_ADMIN_PASSWORD}" \
	-H "OCS-APIRequest: true" \
	"${LEGACY_BASE_URL}/ocs/v2.php/cloud/capabilities?format=json" \
	|| fail "OCS capabilities request failed (is admin password correct?)")"

echo "$caps_json" | grep -q '"statuscode":100' || fail "OCS capabilities did not return statuscode 100"
echo "$caps_json" | grep -q '"capabilities"' || fail "OCS capabilities payload missing capabilities block"

echo "Checking login page is served ..."
login_body="$(curl -sfS "${LEGACY_BASE_URL}/login" || fail "login page unreachable")"
echo "$login_body" | grep -qi 'login' || fail "login page response unexpected"

rm -f /tmp/nc-parity-status.json
echo "SMOKE CHECK PASSED: ${LEGACY_BASE_URL}"
