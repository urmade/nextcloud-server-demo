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
- Call it from `beforeEach` of the suite that reads the store, and `afterEach` of the suite that mutates it (order in the full run matters).
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

## Related

- `parity-testing` — process isolation
- Task-processing isolation on `cursor/fix-task-processing-on-dav-e1af`
- Auth isolation on `cursor/core-auth-login-redirect-flakes-e1af` (`0b4d9b0085b`)
