---
name: bp-php-mixed-shapes
description: Parity for loosely typed PHP JSON (mixed, wizard probes, catalog rows). Use when a controller returns mixed/array-shaped bodies that OpenAPI does not freeze.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# bp-php-mixed-shapes

Cross-cutting. Applies when PHP types a success body as `mixed`, `array`, or probe-specific keys (LDAP wizard `changes`, appstore list rows, TaskProcessing `types` catalog).

## Do

- Freeze **verbs, auth, HTTP status, OCS meta, and error strings** from PHP + tests.
- Record **fixtures** from legacy (or the mock that mirrors recorded legacy) for body equality. Do not invent field lists.
- Compare body **semantics** (present keys the client uses, types, enum values). Drop unstable keys via `includeBodyPaths` / `unstableIdPaths`.
- If OpenAPI says `mixed`, treat the map `response.shape` as a pointer to the fixture, not as a schema you guessed.

## Do not

- Invent a TypeScript interface and call that the contract.
- Assert full deep equality on catalog/wizard payloads without a recorded fixture.
- "Tighten" PHP `mixed` into a stricter Next.js-only shape unless Tobias approves a contract delta.

## TaskProcessing catalog (core slice 6)

- `getTaskTypesInternal` converts empty PHP arrays to **`{}`** (`stdClass`) for `inputShape`, `optionalInputShape`, enum maps, and defaults — never `[]`.
- Parity compares representative paths per task type id (name, one shape slot type) — not the full provider-registered catalog.
- Task payloads (`CoreTaskProcessingTask`) have unstable `id` and unix timestamps; auth/validation errors are stable.

## TaskProcessing Ex-App (core slice 7)

- Consumer schedule sets `userId: null`; file-shaped inputs without user → **401** with stable `data.message`.
- Provider batch success shape: `{ tasks: [{ task, provider: string }], has_more: boolean }` — compare paths, not full task bodies.
- Uploaded result files get generated `fileId` values — treat as unstable in parity except auth/validation cases.
- `getNextScheduledTask` empty → HTTP **204** empty body; do not expect OCS JSON.

## Deprecated TextProcessing / TextToImage (core slice 8)

- TextProcessing `tasktypes` returns `types` as a **list** of `{ id, name, description }` with PHP FQCN ids — not TaskProcessing `types` map.
- Task payloads use numeric `status`, plain string `input`, and `identifier` — compare fixture paths; unstable `id` / `completionExpectedAt`.
- TextToImage `numberOfImages` defaults to **8** in PHP when omitted.
- Provider toggles: `NC_PARITY_TEXT_PROCESSING_PROVIDER`, `NC_PARITY_TEXT_TO_IMAGE_PROVIDER` (default on).

## Translation API (core slice 9)

- `languages` catalog is provider-registered `{ from, fromLabel, to, toLabel }[]` — parity fixture mirrors `FakeTranslationProvider` (`de`↔`en`).
- `languageDetection` is **false** when no `IDetectLanguageProvider` is registered.
- Provider toggle: `NC_PARITY_TRANSLATION_PROVIDER` (default on). Compare representative catalog paths, not full provider union.
- Translate success `{ text, from }` — `from` may be `null` in OpenAPI but is set on success when provided or detected.

## Two-factor admin API (core slice 10)

- Success `ocs.data` is `{ [providerId: string]: boolean }` from registry — compare representative provider keys only.
- Unknown target user → HTTP **404** with `data: null`.
- Admin auth failure → **403** with stable `meta.message`; password confirm failures add `x-nc-auth-notconfirmed` on non-strict enable.
- Provider toggle: `NC_PARITY_TWO_FACTOR_PROVIDER` (default on). Fixture id `parity-totp`.

## Parity

- Happy path: fixture-backed partial paths.
- Auth failure + one representative validation error: still required; those are usually typed (`ocs.meta`, `data.message`).
- Gap: if no fixture yet, leave `parity: pending` — never silent skip, never fake green.
