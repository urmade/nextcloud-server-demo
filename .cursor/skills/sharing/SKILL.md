---
name: sharing
description: Unified sharing OCS v1 (sources/recipients/presets). Use when implementing or testing /apps/sharing/api/v1, not files_sharing ShareAPI.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# sharing

## Purpose

New **unified sharing registry** OCS (`apps/sharing`), experimental since 35. Shares are `{id, owner, sources[], recipients[], properties[], permissions[], permission_preset, state, user_status}` — not the legacy `files_sharing` share table row.

Depends on `files_sharing` (legacy API + `shareApiEnabled()`). Gated by **both** `IManager::shareApiEnabled()` **and** system `sharing.unified_api_enable` (`SharingManager::isApiEnabled`). Default PHP is **off** (`TODO: Enable Unified Sharing API by default`).

Do not implement this slice before legacy share OCS exists unless parity mocks the gate.

## Scope

OCS `/ocs/v{1,2}.php/apps/sharing/api/v1/*` — 17 map ids. Capability `sharing` when enabled.

**Slice `sharing-v1-gate-lifecycle` (tested):** generate-secret, create-share, get-shares, get-share (POST), delete-share, search-recipients.

**Slice `sharing-v1-sources-recipients` (tested):** add-share-source, remove-share-source, add-share-recipient, remove-share-recipient, update-share-recipient-secret, update-share-recipient-permission.

## Non-scope

- Legacy ShareAPI / sharees / remote / public `/s/{token}` / public DAV (`files_sharing`)
- Federated request handler (`federatedfilesharing`)
- OCM (`cloud_federation_api`)
- DAV share properties
- Recipient-suggestions endpoint (PHP TODO; not mapped)

## Key types / entities

From `apps/sharing/lib/ResponseDefinitions.php` and `NCU\Sharing`:

| Name | Values / fields |
| --- | --- |
| `SharingShare` | `id` (snowflake string), `owner` (`SharingUser`), `last_updated` (unix **ms** numeric string), `state`, `user_status` nullable, `sources[]`, `recipients[]`, `properties[]`, `permissions[]`, `permission_preset` nullable class-string |
| `SharingState` | `active` \| `draft` \| `deleted` |
| `SharingUserStatus` | `pending` \| `accepted` \| `rejected` |
| `SharingSource` | `class` (IShareSourceType FQCN), `value`, `display_name`, `icon` |
| `SharingRecipient` | `class`, `value`, `instance` nullable, `display_name`, `icon`, `secret: {updatable, value?, url?}`, `initiator`, `permissions[]` |
| `SharingPermission` | `class`, `source_class?`, `display_name`, `hint?`, `priority` 1–100, `presets[]`, `enabled` |
| `SharingProperty*` | `type`: `boolean` \| `date` \| `enum` \| `password` \| `string` plus constraints |
| `SharingUser` | `user_id`, `instance?`, `display_name`, `icon` |
| `ShareAccessContext` | `currentUser`, optional `secret`, `arguments` map, `overrideChecks` (admin/occ only) |
| Exceptions | `ShareNotFoundException` → 404 hint string; `ShareOperationForbiddenException` → 403; `ShareInvalidException` → 400 |

Type `class` fields are **PHP class-strings**. Next.js must round-trip the same strings clients store.

## Gate order (PHP)

`SecurityMiddleware` runs **before** `ShareApiEnabledMiddleware`:

| Route class | Unauth, API off | Logged-in, API off | Unauth, API on |
| --- | --- | --- | --- |
| `NoAdminRequired` (15 routes) | **401/997** | **501** | **401/997** |
| `PublicPage` (`generate-secret`, `get-share`) | **501** | **501** | controller |

False gate → OCS **501** `"The Unified Sharing API is not enabled."` with `data: {}`.

## Endpoints owned

Canonical prefix `/ocs/v2.php/apps/sharing/api/v1`. `ocs_version: both`.

| id | method | path | auth | notes |
| --- | --- | --- | --- | --- |
| `sharing-api_v1-search-recipients` | GET | `/recipients` | session | limit default 10, 1–100 |
| `sharing-api_v1-generate-secret` | GET | `/secret` | public | 200 string |
| `sharing-api_v1-create-share` | POST | `/share` | session | 201 draft, no body |
| `sharing-api_v1-get-shares` | GET | `/shares` | session | cursor `lastShareID`, limit default 100 |
| `sharing-api_v1-get-share` | **POST** | `/share/{id}` | public | body `secret?`, `arguments?`; GET → **405** |
| `sharing-api_v1-delete-share` | DELETE | `/share/{id}` | session | **204** empty body |
| `sharing-api_v1-update-share-state` | PUT | `/share/{id}/state` | session | pending |
| `sharing-api_v1-update-share-user-status` | PUT | `/share/{id}/user-status` | session | pending |
| `sharing-api_v1-add-share-source` | POST | `/share/{id}/source` | session | body `class`, `value` |
| `sharing-api_v1-remove-share-source` | DELETE | `/share/{id}/source` | session | query `class`, `value` (not body) |
| `sharing-api_v1-add-share-recipient` | POST | `/share/{id}/recipient` | session | body `class`, `value`, `instance?` |
| `sharing-api_v1-remove-share-recipient` | DELETE | `/share/{id}/recipient` | session | query `class`, `value`, `instance?` |
| `sharing-api_v1-update-share-recipient-secret` | PUT | `/share/{id}/recipient/secret` | session | body `class`, `value`, `instance?`, `secret` |
| `sharing-api_v1-update-share-recipient-permission` | PUT | `/share/{id}/recipient/permission` | session | body `recipientClass`, `recipientValue`, `recipientInstance?`, `permissionClass`, `enabled` |
| `sharing-api_v1-update-share-property` | PUT | `/share/{id}/property` | session | pending |
| `sharing-api_v1-update-share-permission` | PUT | `/share/{id}/permission` | session | pending |
| `sharing-api_v1-select-share-permission-preset` | PUT | `/share/{id}/permission/preset` | session | pending |

## Failure modes

| HTTP (v2) | When |
| --- | --- |
| 401 / 997 | Logged-out on `NoAdminRequired` routes (even when API off) |
| 501 | Unified API disabled after auth (`NoAdminRequired` logged-in, or `PublicPage`) |
| 201 | createShare |
| 204 | deleteShare — **empty body**, not OCS envelope |
| 400 | limit/offset/enum/source-type; `data` = plain string |
| 400 empty | missing required controller arg (Dispatcher TypeError) — **no OCS envelope** |
| 403 | ShareOperationForbiddenException; `data` = hint string |
| 404 | ShareNotFoundException; `data` = hint string |
| 405 | GET `/share/{id}` |

## Conceptual Next.js shape

```
src/server/sharing/
  config.ts            # shareApiEnabled && sharing.unified_api_enable
  store.ts             # in-memory shares (snowflake ids)
  api-v1.ts            # gate + handlers
app/ocs/v2.php/apps/sharing/api/v1/secret/route.ts
app/ocs/v2.php/apps/sharing/api/v1/share/route.ts
app/ocs/v2.php/apps/sharing/api/v1/share/[id]/route.ts
app/ocs/v2.php/apps/sharing/api/v1/shares/route.ts
app/ocs/v2.php/apps/sharing/api/v1/share/[id]/source/route.ts
app/ocs/v2.php/apps/sharing/api/v1/share/[id]/recipient/route.ts
app/ocs/v2.php/apps/sharing/api/v1/share/[id]/recipient/secret/route.ts
app/ocs/v2.php/apps/sharing/api/v1/share/[id]/recipient/permission/route.ts
```

Parity: `next/parity/tests/sharing-v1-gate-lifecycle.parity.test.ts`, `next/parity/tests/sharing-v1-sources-recipients.parity.test.ts`. Enable flag via `/api/parity/set-sharing-v1-config`.

## Traps

- Not `files_sharing-shareapi-*`. Different URLs, payloads, snowflake ids.
- `GET /share/{id}` is **not** get; get is **POST**.
- `last_updated` is unix ms numeric **string**.
- API off by default — parity must enable `sharing.unified_api_enable` for enabled-path cases.
- Map `auth: mixed` was a scan artifact; use session vs public per route.
- **501 is not before auth** on `NoAdminRequired` routes.

## Parity notes (slice 1)

| Case | Expectation |
| --- | --- |
| Unauth GET `/shares`, API off | **401/997** (not 501) |
| Unauth GET `/secret`, API off | **501** |
| Auth POST `/share`, API off | **501** |
| Unauth GET `/shares`, API on | **401/997** |
| GET `/secret` no auth, API on | 200 string |
| POST `/share` logged in | 201 `state=draft` |
| GET `/shares` limit=0 / 101 | 400 string |
| POST `/share/{id}` unknown | 404 string |
| GET `/share/{id}` | 405 |
| DELETE own share | 204 empty |
| Recipients `limit=0` | 400 |

Do not mark `parity: tested` on vacuous 501-vs-501; seed shares where needed.

## Parity notes (slice 2)

| Case | Expectation |
| --- | --- |
| Unauth POST `/share/{id}/source`, API off | **401/997** |
| Auth POST `/share/{id}/source`, API off | **501** |
| Unauth POST `/share/{id}/recipient`, API on | **401/997** |
| Unknown `{id}` on any mutation | **404** `"Share not found."` |
| Missing required body/query params | raw **400** empty body |
| DELETE source/recipient | query `class`/`value`/`instance?`, not JSON body |

## Repo paths

- Controller: `apps/sharing/lib/Controller/ApiV1Controller.php`
- Middleware: `apps/sharing/lib/Middleware/ShareApiEnabledMiddleware.php`
- Manager: `lib/private/Sharing/SharingManager.php`
- Next handlers: `next/src/server/sharing/api-v1.ts`
