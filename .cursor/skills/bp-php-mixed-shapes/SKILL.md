---
name: bp-php-mixed-shapes
description: Parity for loosely typed PHP JSON (mixed, wizard probes, catalog rows). Use when a controller returns mixed/array-shaped bodies that OpenAPI does not freeze.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# bp-php-mixed-shapes

Cross-cutting. Applies when PHP types a success body as `mixed`, `array`, or probe-specific keys (LDAP wizard `changes`, appstore list rows, encryption AJAX message blobs).

## Do

- Freeze **verbs, auth, HTTP status, OCS meta, and error strings** from PHP + tests.
- Record **fixtures** from legacy (or the mock that mirrors recorded legacy) for body equality. Do not invent field lists.
- Compare body **semantics** (present keys the client uses, types, enum values). Drop unstable keys via `includeBodyPaths` / omit lists.
- If OpenAPI says `mixed`, treat the map `response.shape` as a pointer to the fixture, not as a schema you guessed.

## Do not

- Invent a TypeScript interface and call that the contract.
- Assert full deep equality on catalog/wizard payloads without a recorded fixture.
- “Tighten” PHP `mixed` into a stricter Next.js-only shape unless Tobias approves a contract delta.

## Parity

- Happy path: fixture-backed.
- Auth failure + one representative validation error: still required; those are usually typed (`ocs.meta`, empty `data`).
- Gap: if no fixture yet, leave `parity: pending` — never silent skip, never fake green.

## Origin

Admin-infra skills (`appstore`, `user_ldap`): list rows and wizard `changes` are loosely typed in PHP. Skills freeze verbs/auth/errors; implementers still need recorded fixtures.
