---
name: parity-testing
description: Prove Next.js behavior matches legacy Nextcloud APIs. Use when writing, running, or waiving parity tests, judging a slice done, or comparing OCS/DAV/HTTP responses.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Parity testing

Read this before writing or judging any parity test. Use with `endpoint-mapping`.

## Coverage law

Every mapped endpoint in `.cursor/maps/endpoint-map.yaml` must have **either**:

1. a contract test at `parity_test`, `parity: tested`, or
2. `parity: waived` with **both** `waiver_reason` and `waiver_owner`.

No third state. `pending` is only legal while `status` is `discovered` \| `mapped` \| `implemented` and the slice that owns the endpoint is not being checked in as done.

Missing test + missing waiver = slice not done. Empty reason, owner `TBD`, or reason `later` = invalid waiver. Reject it.

## What to compare

Compare **observable client behavior**, not PHP internals.

Assert:

- HTTP status
- auth success vs failure (same status the legacy server returns)
- public request/response shapes recorded on the map (`request`, `response`)
- contract headers (OCS, DAV, WWW-Authenticate, CSRF when part of the API)
- side-effect visible through another mapped API (create → get)

Do not assert:

- PHP class names, exception types, stack traces
- internal request IDs unless the public API documents them
- Nextcloud source file paths, container IDs, log lines
- pixel-perfect HTML unless the slice's contract is that UI

Conceptual equivalent is enough. Same client-visible result; different internals are expected.

If live legacy disagrees with map `request`/`response`, update the map from observation first, then implement. Do not silently diverge.

## Normalize before diff

Strip or canonicalize before equality checks:

| Kind | Rule |
| --- | --- |
| Timestamps | Parse; compare with configured delta **or** replace with placeholder. Do not raw-string compare. |
| Generated IDs | Assert presence + shape unless the API documents a stable ID. |
| List ordering | Sort unless order is the contract (explicit sort param, DAV depth listing if documented). |
| XML | Compare infoset (local names, namespaces, text), not prefix or attribute order. |
| JSON object key order | Ignore. |
| Host/URL prefixes | Rewrite to a canonical origin before compare. |
| Binary bodies | Status + content-type + size class — see `bp-binary-parity`. |
| Redirect `Location` | Compare pathname + search only; ignore `127.0.0.1` vs `localhost` host drift — see `bp-binary-parity`. |

Put normalizers in the shared harness. Do not copy ad-hoc regex into each test.

## Minimum cases per endpoint

1. **Happy path** — valid auth, valid input, representative successful body.
2. **Auth failure** — unauthenticated and/or wrong credential as legacy does (`401` vs `403` must match).
3. **Representative validation** — one invalid input legacy rejects (type, missing field, illegal name). Match status + public error envelope, not the PHP message wording unless that wording is documented API.

Add more cases only when the feature skill names extra contract (share permissions, DAV lock, pagination). Do not explode into PHP-unit clones.

## Test style

- Prefer **HTTP contract tests** against legacy Nextcloud and Next.js, same request, normalized response.
- Use the skeleton's parity harness. Do not create a second harness or a parallel assertion library.
- UI E2E is last resort: only when the slice contract cannot be expressed as HTTP (and still record the mapped endpoints the UI hits).
- Do not substitute unit tests of TS helpers for endpoint parity.
- Fixtures: no real user PII, no production secrets.

`parity_test` path must be runnable in CI.

## Waivers

Set on the endpoint-map entry (both YAML copies):

```yaml
status: waived
parity: waived
parity_test: null
waiver_reason: "WebDAV chunked upload deferred; no Next.js storage backend in this slice"
waiver_owner: "tobias"
```

Waiver is for out-of-slice or impossible-in-current-stack contracts. Not for "test was hard".

## Failures

- First failure: fix Next.js (or the test if the test asserts internals).
- Do not "fix" by loosening normalizers until the assertion is vacuous.
- Do not change legacy PHP to make parity pass.
- After one failed fix, escalate per project model policy; do not keep mutating at random.

## Self-check

- [ ] Every endpoint this slice maps is `tested` or `waived` with reason + owner
- [ ] Each new test includes happy path, auth failure, representative validation
- [ ] Assertions hit public behavior only and match map `request`/`response`; timestamps/IDs/order normalized
- [ ] Contract tests, not UI E2E, unless HTTP cannot express the contract
- [ ] Map `parity_test` paths point at real files
