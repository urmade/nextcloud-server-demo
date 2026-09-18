---
name: endpoint-mapping
description: Maintain the Nextcloud→Next.js endpoint map. Use when discovering, adding, updating, validating, or waiving API routes (OCS, DAV, HTTP, OCM, well-known) or editing endpoint-map.yaml.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Endpoint mapping

Read this before creating or editing an endpoint-map entry.

## Locations

Keep both copies identical. Repo file is branch source of truth.

- Repo: `.cursor/maps/endpoint-map.yaml`
- Store: `/cursor/stores/bc-75e21725-444f-4887-9769-754552a1e1af/docs/endpoint-map.yaml`

Missing file: create it (`endpoints: []` plus `version: 1`). Do not invent a second schema.

## Required fields

Every entry must include all of:

| Field | Rule |
| --- | --- |
| `id` | Stable. Prefer `{routeName}` (`files_sharing.Share#showShare`). Else `{feature_ids[0]}.{METHOD}.{path-slug}`. Never reuse. Never rename after merge to map. |
| `feature_ids` | Non-empty list of feature-map ids. Every id exists in `.cursor/rules/feature-map.mdc` and has `.cursor/skills/<id>/SKILL.md`. First id is the owning feature. |
| `protocol` | `ocs` \| `dav` \| `http` \| `ocm` \| `well-known` \| `ocs-provider` \| `other` |
| `method` | HTTP/WebDAV verb. `*` only if legacy truly accepts any. |
| `legacy_path` | Full public path including prefix (`/ocs/v2.php/...`, `/remote.php/dav/...`, `/s/{token}`). |
| `legacy_source` | `path/to/routes.php` and/or `Controller#method` and/or OpenAPI `operationId`. |
| `auth` | `none` \| `session` \| `basic` \| `bearer` \| `app-password` \| `public-share` \| `signed` \| `mixed` |
| `request` | Public request shape summary. What the client sends: path params, query, contract headers, body. No PHP types, no internals. Mapping or non-empty string. |
| `response` | Public response shape summary. Success status + envelope; notable error statuses + envelopes. No PHP types, no internals. Mapping or non-empty string. |
| `status` | `discovered` \| `mapped` \| `implemented` \| `parity` \| `waived` |
| `parity` | `pending` \| `tested` \| `waived` |

Conditionally required:

- `status` in `implemented` \| `parity` → `next_path` (App Router path) and `next_handler` (TS module)
- `parity: tested` → `parity_test` (file path in the Next.js parity harness)
- `parity: waived` → `waiver_reason` (concrete, one line) and `waiver_owner` (person). `status` must be `waived`.
- `protocol: ocs` → `ocs_version` (`v1` \| `v2` \| `both`)

Optional: `csrf`, `content_type`, `dav_ns`, `notes`.

Reject the edit if any required field is missing, empty, `TODO`, or `feature_ids: []`.

## Canonical entry

```yaml
- id: files_sharing.Share#showShare
  feature_ids: [files_sharing]
  protocol: http
  method: GET
  legacy_path: /s/{token}
  legacy_source: apps/files_sharing/appinfo/routes.php Share#showShare
  auth: public-share
  request:
    params: { token: string }
    query: {}
    headers: {}
    body: null
  response:
    success: { status: 200, content_type: text/html, shape: share-landing }
    errors:
      - { status: 404, shape: unknown-token }
      - { status: 401, shape: password-required }
  status: discovered
  parity: pending
  next_path: null
  next_handler: null
  parity_test: null
  waiver_reason: null
  waiver_owner: null
```

## Discovery sources (scan all)

1. `openapi.json`
2. `core/routes.php`, `apps/*/appinfo/routes.php`
3. DAV plugins / Sabre registrations
4. `ocs-provider/`, `.well-known`, `status.php`, `index.php` entrypoints
5. `remote.php`, `public.php`, `cron.php` only as protocol gates — map the APIs they front, not the PHP files as endpoints

One entry per `protocol + method + legacy_path`. Do not collapse versions (`/ocs/v1.php` vs `/ocs/v2.php`) unless they are proven identical; if identical, set `ocs_version: both` and note it.

## Mapping rules

- Record observed public contract, not PHP internals.
- `next_path` may differ from `legacy_path`. That is expected. Keep both.
- Do not drop a discovered endpoint because the slice will not implement it. Leave `status: discovered`, `parity: pending`.
- New route found mid-slice: add to the map before check-in.
- `feature_ids` name Nextcloud apps/domains that own the contract, not Next.js folder guesses.
- `request` / `response` describe the public client contract only. If OpenAPI and live behavior disagree, record live public behavior and note the conflict in `notes`.
- Do not invent product behavior absent from these sources.

## Status transitions

`discovered` → `mapped` (`feature_ids` + `request` + `response` + auth + source filled) → `implemented` (next_path + handler exist) → `parity` (`parity: tested` and test passes) or `waived`.

Never jump to `parity` without `parity_test`. Never mark `waived` without reason + owner.

## Hygiene

- After every slice: map covers every endpoint touched or newly found.
- Mirror repo YAML to the store copy in the same change.
- Sort entries by `feature_ids[0]`, then `legacy_path`, then `method`.
- Validate YAML before check-in.

## Self-check

- [ ] Both YAML copies exist and match
- [ ] Every new/changed entry has all required fields
- [ ] Every `feature_ids` entry has a feature skill and feature-map row
- [ ] `request` and `response` are public shape summaries (not PHP internals, not empty)
- [ ] Every `parity: tested` has `parity_test`; every `parity: waived` has reason + owner
