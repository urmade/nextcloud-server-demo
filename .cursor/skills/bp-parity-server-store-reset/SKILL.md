---
name: bp-parity-server-store-reset
description: Reset Next.js process-local stores via parity-only HTTP so full-suite tests do not leak session, 2FA, tasks, or credentials into later files. Use when a suite is green in isolation and flakes after other files.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# bp-parity-server-store-reset

The Next.js app under test is a **separate process** from Vitest. Clearing an in-process Map in `beforeEach` does not clear the server.

## Do

- Add `POST /api/parity/reset-<store>` guarded by `NC_PARITY_EXAPP === 'true'` (else **404**). Not a product endpoint. Do not map it.
- Helper must reset **all three**: Vitest-side module state, legacy mock, Next.js server via HTTP.
- **Every full-suite-sensitive auth test file** must call `resetParityAuthStores()` in `beforeEach` — not only in `afterEach`. Isolation-only green is not enough; the next file in the run must start from a clean server.
- Also call `resetParityAuthStores()` in `afterEach` when the suite mutates auth state (2FA enable, login, confirm-password).
- Keep independent HTTP sequences and cookie jars per side.

Existing resets:

| Store | Route | Helper |
| --- | --- | --- |
| Task processing | `/api/parity/reset-task-store` | `resetParityTaskStores()` |
| Auth/session/2FA/credentials | `/api/parity/reset-auth-store` | `resetParityAuthStores()` |

## Do not

- Treat isolation-only green as full-suite green.
- Reset only the mock.
- Leave 2FA/session mutations in a file that runs immediately before `core-auth`.
- Document the reset route on the product endpoint map.

## Suites that must reset auth

| Suite | Hook | Why |
| --- | --- | --- |
| `core-two-factor-api` | `afterEach` | Enables/disables 2FA via OCS |
| `core-login-2fa-challenge` | `beforeEach` + `afterEach` | Enables 2FA for `admin` on server |
| `core-login-confirm-password` | `beforeEach` + `afterEach` | Creates authenticated sessions |
| `core-auth` | `beforeEach` | Reads login redirect state |
| `core-platform` | `beforeEach` | `loginParitySession` + ETag probes need clean `admin` |

## Related

- `parity-testing` — process isolation
- Task-processing isolation on `cursor/fix-task-processing-on-dav-e1af`
- Auth isolation on `cursor/core-auth-login-redirect-flakes-e1af` (`0b4d9b0085b`)
