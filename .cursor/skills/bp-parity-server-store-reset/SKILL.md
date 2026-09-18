---
name: bp-parity-server-store-reset
description: Reset Next.js process-local stores via parity-only HTTP so full-suite tests do not leak session, 2FA, tasks, credentials, or file-node ids into later files. Use when a suite is green in isolation and flakes after other files.
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
- Call it from `beforeEach` of the suite that reads the store, and `afterEach` of the suite that mutates it (order in the full run matters).
- Reset a store from **every** route that depends on it, not only from its own domain. The DAV file store owns the file-node id counter and the seeded home tree, so both the files and the files_sharing resets clear it — share records point at node ids, and a suite that resets only shares would still read drifted ids.
- Audit a reset route for completeness before trusting it. `reset-files-store` reset the files API stores but not the node store; `reset-auth-store` reset sessions, 2FA and credential overrides but not the lost-password store, which is what *writes* a credential override.
- Prefer the HTTP-backed helper over a direct `reset*Store()` import in a suite. The helper already does the Vitest-side reset, so importing both duplicates it and hides the fact that the server was never cleared.
- Keep independent HTTP sequences and cookie jars per side.

Existing resets:

| Store | Route | Helper |
| --- | --- | --- |
| Task processing | `/api/parity/reset-task-store` | `resetParityTaskStores()` |
| Auth/session/2FA/credentials/lost-password | `/api/parity/reset-auth-store` | `resetParityAuthStores()` |
| Files API + DAV file nodes | `/api/parity/reset-files-store` | `resetParityFilesStores()` |
| Shares + external shares + DAV file nodes | `/api/parity/reset-files-sharing-store` | `resetParityShareStores()` |

`set-files-sharing-config` parity route toggles `incomingServer2ServerShareEnabled` (ExternalShares) and `outgoingServer2ServerShareEnabled` (ShareInfo) on both sides.

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

## Reproducing an order-dependent failure

Vitest orders test files by their cached duration, so the first run after a
clean checkout and every later run use **different** orders. A suite can be
green in one and red in the other. Delete the cache to switch back:

```
rm -rf next/node_modules/.vite/vitest
```

Run the suite cold and warm and require both to be green. A fix verified in
only one ordering is not verified.

## Reading the symptom

- A number off by exactly the count of nodes earlier suites created (`fileid` `legacy=1100, new=1101`, `used` `45` vs `61`) is a Vitest-side-only reset of a store the server also owns.
- OCS `997` from a suite that authenticates fine in isolation is leaked server credential or session state, not a bug in the suite.
- A seeding helper can pass **vacuously** when both sides fail the same way. Assert the seed produced what the suite needs (a token, an id) before using it, or the real failure surfaces many cases later.

## Related

- `parity-testing` — process isolation
- Task-processing isolation on `cursor/fix-task-processing-on-dav-e1af`
- Auth isolation on `cursor/core-auth-login-redirect-flakes-e1af` (`0b4d9b0085b`)
- File-node id and credential isolation on `cursor/fix-parity-fileid-reset-e1af`
