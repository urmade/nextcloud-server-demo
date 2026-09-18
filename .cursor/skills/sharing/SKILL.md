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
| `SharingState` | `active` \| `draft` \| `deleted` (`lib/unstable/Sharing/ShareState.php`) |
| `SharingUserStatus` | `pending` \| `accepted` \| `rejected` |
| `SharingSource` | `class` (IShareSourceType FQCN), `value`, `display_name`, `icon` |
| `SharingRecipient` | `class`, `value`, `instance` nullable, `display_name`, `icon`, `secret: {updatable, value?, url?}`, `initiator`, `permissions[]` |
| `SharingPermission` | `class`, `source_class?`, `display_name`, `hint?`, `priority` 1–100, `presets[]`, `enabled` |
| `SharingProperty*` | `type`: `boolean` \| `date` \| `enum` \| `password` \| `string` plus constraints |
| `SharingUser` | `user_id`, `instance?`, `display_name`, `icon` |
| `ShareAccessContext` | `currentUser`, optional `secret`, `arguments` map, `overrideChecks` (admin/occ only) |
| Exceptions | `ShareNotFoundException` → 404 hint string; `ShareOperationForbiddenException` → 403; `ShareInvalidException` → 400 |

Type `class` fields are **PHP class-strings** of registered `IShareSourceType` / `IShareRecipientType` / `ISharePermissionType` / `ISharePermissionPreset` / `ISharePropertyType`. Next.js must use **stable public identifiers** that serialize to the same strings clients already store. Do not invent parallel enums unless they round-trip to those FQCNs.

Capability when enabled (`apps/sharing/lib/Capabilities.php`):

```
sharing: {
  api_versions: ['v1'],
  source_types: [{class}],
  permission_presets: [{class, display_name, hint}]
}
```

Empty object if API disabled (capability omitted).

## Endpoints owned

Canonical prefix `/ocs/v2.php/apps/sharing/api/v1`. `ocs_version: both`.

| id | method | path | notes |
| --- | --- | --- | --- |
| `sharing-api_v1-search-recipients` | GET | `/recipients` | query `filterRecipientTypeClasses[]`, `query`, `limit` (default 10, 1–100), `offset`, `id?` |
| `sharing-api_v1-generate-secret` | GET | `/secret` | **PublicPage** |
| `sharing-api_v1-create-share` | POST | `/share` | 201 share (draft, no body) |
| `sharing-api_v1-get-shares` | GET | `/shares` | filters + cursor `lastShareID`, `limit` default 100 max 100 |
| `sharing-api_v1-get-share` | **POST** | `/share/{id}` | PublicPage; body `secret?`, `arguments?` — GET forbidden (body required) |
| `sharing-api_v1-delete-share` | DELETE | `/share/{id}` | **204** empty |
| `sharing-api_v1-update-share-state` | PUT | `/share/{id}/state` | `state` |
| `sharing-api_v1-update-share-user-status` | PUT | `/share/{id}/user-status` | `userStatus` |
| `sharing-api_v1-add-share-source` | POST | `/share/{id}/source` | `class`, `value` |
| `sharing-api_v1-remove-share-source` | DELETE | `/share/{id}/source` | `class`, `value` |
| `sharing-api_v1-add-share-recipient` | POST | `/share/{id}/recipient` | `class`, `value`, `instance?` |
| `sharing-api_v1-remove-share-recipient` | DELETE | `/share/{id}/recipient` | |
| `sharing-api_v1-update-share-recipient-secret` | PUT | `/share/{id}/recipient/secret` | + `secret` |
| `sharing-api_v1-update-share-recipient-permission` | PUT | `/share/{id}/recipient/permission` | `recipientClass`, `recipientValue`, `recipientInstance?`, `permissionClass`, `enabled` |
| `sharing-api_v1-update-share-property` | PUT | `/share/{id}/property` | `class`, `value?` |
| `sharing-api_v1-update-share-permission` | PUT | `/share/{id}/permission` | `class`, `enabled` |
| `sharing-api_v1-select-share-permission-preset` | PUT | `/share/{id}/permission/preset` | `permissionPresetClass` |

## Endpoint walkthrough

1. `ShareApiEnabledMiddleware` (`apps/sharing/lib/Middleware/ShareApiEnabledMiddleware.php`): if `!isApiEnabled()` → `OCSException` **501** `"The Unified Sharing API is not enabled."`
2. Build `ShareAccessContext` from session user (constructor). Public `getShare` rebuilds context with `secret` + `arguments`.
3. Every mutating path: **DB transaction**; rollback on exception.
4. `getShare` / `searchRecipients` / mutations call `ISharingManager`; format via `Share::format` / `ShareRecipient::formatMultiple`.
5. Error `data` is a **plain string hint**, not `{message}`.

`createShare`: empty share for current user, 201. Requires user in context (`RuntimeException` if missing — should not happen on `NoAdminRequired`).

`getShare`: POST; brute-force `getShare`; anon 1/5s; user 120/60s. Wrong secret/args → 404 + **throttle**.

`searchRecipients`: optional `id` excludes existing recipients of that share; unknown share → 404. `Link` next-page header when more results.

`getShares`: `filterSourceTypeValue` empty string → 400; unknown source class → 400 `"The filter source type is not registered: …"`; invalid state/userStatus enum → 400 (`ValueError` message). Cursor is **id > lastShareID**, not offset.

`generateSecret`: no login; returns string.

Rate limits (`UserRateLimit`, per 60s): recipients search 60; create 30; add/remove recipient 120; recipient secret 20; property 120; permission 240; recipient permission 240; others 60.

## Auth / tenant rules

| Route | Auth |
| --- | --- |
| Almost all | Logged-in (`NoAdminRequired`). Unauthenticated → OCS 401/997. |
| `generateSecret` | `PublicPage` — no user. Map `auth: mixed` is a scan artifact. |
| `getShare` | `PublicPage`. Optional session **or** recipient `secret` **or** `arguments`. Failure is 404, not 401. |

Owner vs recipient: manager throws `ShareOperationForbiddenException` when the context cannot mutate. Do not implement extra owner checks in the route layer.

`overrideChecks` is not an HTTP feature.

Single instance; `instance` on recipients is the **remote** cloud hostname for federated recipients, nullable for local.

## Failure modes

| HTTP (v2) | When |
| --- | --- |
| 501 | Unified API disabled (middleware), **before** auth nuances |
| 401 / 997 | Logged-out on `NoAdminRequired` routes |
| 201 | createShare |
| 204 | deleteShare |
| 400 | limit/offset/enum/source-type/ShareInvalidException; data = string |
| 403 | ShareOperationForbiddenException; data = hint |
| 404 | ShareNotFoundException; getShare also throttles |

Do not wrap hints in objects. Delete success has **empty list** body + 204.

## Conceptual Next.js shape

```
src/server/sharing-v1/
  gate.ts              # shareApiEnabled && sharing.unified_api_enable
  registry.ts          # source/recipient/permission/property/preset types
  manager.ts           # CRUD + format
  access-context.ts
app/ocs/v2.php/apps/sharing/api/v1/share/[[...path]]/route.ts
app/ocs/v2.php/apps/sharing/api/v1/shares/route.ts
app/ocs/v2.php/apps/sharing/api/v1/recipients/route.ts
app/ocs/v2.php/apps/sharing/api/v1/secret/route.ts
```

Storage is the new sharing tables (migrations under `apps/sharing/lib/Migration/`), **not** a rewrite of `oc_share`. Legacy backend may be notified on delete via `ISharingLegacyBackend` — keep that side-effect if files_sharing is present.

## Traps

- This is **not** `files_sharing-shareapi-*`. Different URLs, payloads, ids.
- `GET /share/{id}` is not the get handler; get is **POST**.
- `last_updated` is ms numeric **string**.
- API off by default — parity **must** enable `sharing.unified_api_enable` on both legacy and Next.js or every call is 501.
- `class` values are FQCNs; clients send them back on mutations.
- Public getShare 404 on bad secret (no 401) + throttle.
- createShare has **no** request body; sources/recipients added after.
- Middleware 501 is OCS, not a raw JSON `{message}`.

## Do-not

- Do not implement legacy OCS `/apps/files_sharing/api/v1/shares` here.
- Do not treat unified `id` as integer `oc_share.id`.
- Do not enable the API by default unless PHP does.
- Do not skip transactions on mutations.
- Do not return 401 for public getShare with a bad secret.
- Do not add the unmapped recipient-suggestions route.
- Do not invent permission bits (`1/2/4/8/16/31`); this API uses typed permission classes + presets.

## Parity notes

Flag `sharing.unified_api_enable=true` and share API enabled. Extra cases:

| Case | Expectation |
| --- | --- |
| API disabled | all routes 501 OCS |
| POST `/share` logged in | 201 share `state=draft` (confirm against live) |
| GET `/secret` no auth | 200 string |
| POST `/share/{id}` unknown | 404 string + throttle |
| GET `/shares` limit=0 | 400 `"The limit is too low."` |
| GET `/shares` limit=101 | 400 `"The limit is too high."` |
| PUT state `nope` | 400 |
| DELETE own share | 204 |
| GET `/share/{id}` | 405 |
| Recipients `limit=0` | 400 |
| Unauthenticated GET `/shares` | 401/997 |

Share ids and `last_updated`: presence/shape. Recipient search `Link` header when page full.

## Repo paths

- Controller: `apps/sharing/lib/Controller/ApiV1Controller.php`
- Middleware: `apps/sharing/lib/Middleware/ShareApiEnabledMiddleware.php`
- Types: `apps/sharing/lib/ResponseDefinitions.php`
- Capabilities: `apps/sharing/lib/Capabilities.php`
- Bootstrap: `apps/sharing/lib/AppInfo/Application.php`
- Manager: `lib/private/Sharing/SharingManager.php`, `lib/unstable/Sharing/ISharingManager.php`
- Enums: `lib/unstable/Sharing/ShareState.php`, `ShareUserStatus.php`
- Context: `lib/unstable/Sharing/ShareAccessContext.php`
- OCC mirrors (behavior, not HTTP): `apps/sharing/lib/Command/`
- Migrations: `apps/sharing/lib/Migration/`
