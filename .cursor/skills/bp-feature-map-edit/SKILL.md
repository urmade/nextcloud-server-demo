---
name: bp-feature-map-edit
description: Safely edit feature-map endpoint_ids lists without corrupting depends_on or counts. Use when attaching endpoint ids to .cursor/rules/feature-map.mdc or store docs/feature-map.mdc.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# bp-feature-map-edit

## Parse only the endpoint list

Each feature section has `- endpoint_ids: (N)` followed by `  - \`id\`` lines until the next top-level `-` field or `##` heading.

- Read ids **only** from lines after `- endpoint_ids:`.
- **Never** treat `depends_on:` bullets (`  - \`core-login\``) as endpoint ids — they use the same indentation.

## Counts must match

- Update `(N)` to equal the number of listed ids.
- After edits, every section: declared `(N)` == list length.

## Coverage invariant

- Each endpoint-map row id appears on **exactly one** feature `endpoint_ids` list (first `feature_ids[0]` owns the row).
- Union of all listed ids should equal endpoint-map unique id count (548 in Phase 0).
- Do not duplicate an id across features or within one list.

## Map-only edits

- Attach or reorder `endpoint_ids` only unless the slice explicitly changes endpoint-map structured fields.
- Do not add or remove endpoint-map rows when fixing feature-map gaps.
