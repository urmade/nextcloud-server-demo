---
name: files_sharing
description: Legacy Share OCS API and sharee search. Use when implementing /ocs/v2.php/apps/files_sharing/api/v1.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# files_sharing

## Purpose

Logged-in legacy Share OCS (`ShareAPIController`, `ShareesAPIController`) under `/ocs/v2.php/apps/files_sharing/api/v1`. Public `/s/{token}` routes are a separate slice.

## Auth

- All slice-1 methods are `NoAdminRequired`. Map `auth: mixed` is wrong — **session required**.
- Unauthenticated v2: HTTP **401**, `meta.statuscode` **997** (`bp-ocs-envelope`).
- `OCS-APIRequest: true` + `?format=json`. Header bypasses CSRF.
- `OCSShareAPIMiddleware` only wraps ShareAPI: `shareApiEnabled() === false` → **404** `"Share API is disabled"`.

## Share types

| Const | Value |
| --- | ---: |
| TYPE_USER | 0 |
| TYPE_GROUP | 1 |
| TYPE_LINK | 3 |
| TYPE_EMAIL | 4 |

## Endpoints (slice 1)

| id | Method | Path |
| --- | --- | --- |
| `files_sharing-shareapi-get-shares` | GET | `/shares` |
| `files_sharing-shareapi-create-share` | POST | `/shares` |
| `files_sharing-shareapi-get-inherited-shares` | GET | `/shares/inherited` |
| `files_sharing-shareapi-pending-shares` | GET | `/shares/pending` |
| `files_sharing-shareapi-accept-share` | POST | `/shares/pending/{id}` |
| `files_sharing-shareapi-get-share` | GET | `/shares/{id}` |
| `files_sharing-shareapi-update-share` | PUT | `/shares/{id}` |
| `files_sharing-shareapi-delete-share` | DELETE | `/shares/{id}` |
| `files_sharing-shareapi-send-share-email` | POST | `/shares/{id}/send-email` |
| `files_sharing-shareapi-generate-token` | GET | `/token` |
| `files_sharing-shareesapi-search` | GET | `/sharees` |
| `files_sharing-shareesapi-find-recommended` | GET | `/sharees_recommended` |

## Traps

- Create missing `path` → **404** `Please specify a file or folder path` (not 400).
- Unknown `shareType` (default -1) → **400** `Unknown share type`.
- Invalid user `shareWith` → **404** `Please specify a valid account to share with`.
- `getShares` query flags are strings `'true'|'false'`.
- `canEditShare`: owner/sharer only; group recipients cannot PUT.
- send-email: LINK shares must be `sharedBy`; password-protected needs matching body `password`.
- Sharees `search`: `itemType` required; empty search → **200** empty sets; missing itemType → **400**.
- `findRecommended`: missing `itemType` → **400** (not search's OCSBadRequest message).
- generate-token success `{token: string}`; charset `a-z0-9-`, max 32.

## Implementation layout

```
src/server/files_sharing/
  constants.ts
  types.ts
  store.ts
  nodes.ts
  format.ts
  share-api.ts
  sharees-api.ts
app/ocs/v2.php/apps/files_sharing/api/v1/
  shares/route.ts
  shares/inherited/route.ts
  shares/pending/route.ts
  shares/pending/[id]/route.ts
  shares/[id]/route.ts
  shares/[id]/send-email/route.ts
  token/route.ts
  sharees/route.ts
  sharees_recommended/route.ts
parity/legacy-mock/files-sharing-ocs.ts
parity/tests/files-sharing-share-ocs.parity.test.ts
```

## Parity notes

| Case | Expect |
| --- | --- |
| Unauth GET shares | 401/997 |
| Create without path | 404 |
| Create user share | 200, `share_type: 0`, `share_with` |
| Create link share | 200, `token`, `url` |
| GET unknown id | 404 |
| Sharees missing itemType | 400 |
| Sharees empty search | 200 empty arrays |
| generate-token | 200 `{token}` |

Depends on `dav` for file nodes. Use `bp-ocs-envelope`, `bp-observe-php-contract`, `bp-feature-map-edit`.
