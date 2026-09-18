---
name: files_sharing
description: Legacy Share OCS API, sharee search, and public link /s/{token} pages. Use when implementing /ocs/v2.php/apps/files_sharing/api/v1 or the public share, authenticate, download and preview routes.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# files_sharing

## Purpose

Logged-in legacy Share OCS (`ShareAPIController`, `ShareesAPIController`) under `/ocs/v2.php/apps/files_sharing/api/v1`, and the public link pages under `/s/{token}` (`ShareController`, `PublicPreviewController`).

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

## Public links (slice 2)

`ShareController` extends `AuthPublicShareController` (password gate). `PublicPreviewController` extends `PublicShareController` (no auth page).

| id | Method | Path |
| --- | --- | --- |
| `files_sharing.Share#showShare` | GET | `/s/{token}` |
| `files_sharing.Share#showAuthenticate` | GET | `/s/{token}/authenticate/{redirect}` |
| `files_sharing.Share#authenticate.post` | POST | `/s/{token}/authenticate/{redirect}` |
| `files_sharing.Share#downloadShare` | GET | `/s/{token}/download/{filename}` |
| `files_sharing.PublicPreview#directLink` | GET | `/s/{token}/preview` |
| `files_sharing-public_preview-direct-link` | GET | `/index.php/s/{token}/preview` |

The last two are the same handler; the OpenAPI twin's `auth: mixed` is wrong (`#[PublicPage]`).

### Auth is a second session, not the owner's

These routes run incognito (`OC_User::setIncognitoMode(true)`). **The owner's login cookie never authenticates `/s/{token}`** — an owner hitting their own password-protected link still gets the 303 to the password form. Public state lives in two session keys:

- `public_link_authenticated_frontend` — token → password hash, for the HTML pages.
- `public_link_authenticated` — list of share **ids** (not tokens), set in `authSucceeded`, for public DAV.

A successful `authenticate` POST regenerates the session id and must persist both keys onto the regenerated session, then send the new session cookie. The retired session id must stop working.

### Status traps

- Missing or invalid token is guest **404 HTML** from `PublicShareMiddleware`, never JSON 401. Same for `shareapi_enabled` / `shareapi_allow_links` off.
- Password required on an `AuthPublicShareController` route is **303** to `showAuthenticate`, never 401.
- `authenticate` POST is `#[PublicPage]` + `#[UseSession]` **without** `NoCSRFRequired`: no request token is **412**. Wrong password is **200** `wrongpw` HTML plus throttling (`publicLinkAuth`), not 401. Success is **303**.
- `passwordRequest === ''` is the TYPE_EMAIL identity flow, not a boolean.
- `downloadShare` success is **303** to `/public.php/dav/files/{token}{davPath}`; folders add `accept=zip`. No READ or `permissions.download === false` is a **403** plain string; `hideDownload` raises `NotFoundException` and surfaces as middleware **404 HTML**.
- `directLink` has no authenticate redirect. Password-protected without a public session is middleware **404 HTML** (it must not leak). If the method runs: password / no READ / `!canSeeContent()` is **403** `[]`, a folder share is **400** `[]`, an empty token is **400**. Success caches 24h (`bp-binary-parity`).
- `NoSameSiteCookieRequired` on `downloadShare` and `directLink`.
- `showShare` on a file share with an extra `path` is **404**.

## Deleted shares (slice 3)

`DeletedShareAPIController`. Map `auth: mixed` is wrong — **session required** (Basic auth works in parity).

| id | Method | Path |
| --- | --- | --- |
| `files_sharing-deleted_shareapi-index` | GET | `/deletedshares` |
| `files_sharing-deleted_shareapi-undelete` | POST | `/deletedshares/{id}` |

### Traps

- Index lists GROUP/CIRCLE/ROOM/DECK shares the recipient removed from self (`permissions===0` in PHP; `deletedFromSelf` in parity). USER shares are not listed.
- Formatted `permissions` is always **0**. `id` is `ocinternal:{numericId}`.
- Group delete-from-self: recipient must be in the group and not the owner/sharer. `DELETE /shares/{id}` records the removal; `GET /deletedshares` lists it.
- Undelete missing id → **404** `"Share not found"`. Active share → **404** `"No deleted share found"`.
- Success undelete → **200** `data: []`.
- Parity fixture group: `parity-users` (`admin`, `alice`). Use Basic auth for `alice` on recipient-only calls.

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
  deleted-share-api.ts
  public-link.ts
  public-session.ts
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
  deletedshares/route.ts
  deletedshares/[id]/route.ts
app/s/[token]/
  route.ts
  authenticate/[redirect]/route.ts
  download/[[...filename]]/route.ts
  preview/route.ts
app/index.php/s/[token]/preview/route.ts
parity/legacy-mock/files-sharing-ocs.ts
parity/legacy-mock/files-sharing-public-link.ts
parity/tests/files-sharing-share-ocs.parity.test.ts
parity/tests/files-sharing-public-link.parity.test.ts
parity/tests/files-sharing-deleted-ocs.parity.test.ts
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
| `GET /s/{token}` good token | 200 HTML |
| `GET /s/{token}` unknown token | 404 guest HTML |
| `GET /s/{token}` password share | 303 to `/authenticate/showShare` |
| Same, with the owner cookie | still 303 |
| authenticate POST no CSRF | 412 |
| authenticate POST wrong password | 200 `wrongpw` HTML |
| authenticate POST correct password | 303, new session cookie, then `GET /s/{token}` is 200 and the old cookie is 303 |
| `GET /s/{token}/download/` | 303 to `/public.php/dav/files/{token}` |
| `directLink` password, no session | 404 HTML (or 403 `[]` if the method runs) |
| `directLink` folder share | 400 `[]` |
| `GET /deletedshares` unauth | 401/997 |
| `GET /deletedshares` empty | 200 `[]` |
| Group share delete-from-self then index | 200, `permissions: 0`, `id: ocinternal:1` |
| `POST /deletedshares/ocinternal:1` after restore | 200 `[]` |
| Undelete unknown id | 404 |
| Undelete active share | 404 `"No deleted share found"` |

Reset `resetDavFileStore()` with files + sharing stores in deleted-ocs parity `beforeEach` so file-id counters do not leak across suites.

Seeding a link share for a public-link test needs slice 1: `POST /shares` with `shareType: 3`, then read the token back. `GET /shares/{id}` returns `ocs.data` as a **one-element array**, so the token is `ocs.data[0].token`. Create the share through the parity case so the mock and the Next.js server both hold it, and never send the owner cookie on the `/s/{token}` request.

Depends on `dav` for file nodes. Use `bp-ocs-envelope`, `bp-observe-php-contract`, `bp-feature-map-edit`, `bp-binary-parity`, `bp-session-map-serialization`.
