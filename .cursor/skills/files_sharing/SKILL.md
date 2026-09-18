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

## Remote shares (slice 4)

`RemoteController` + `External\Manager`. Map `auth: mixed` is wrong — **session required**. Not gated by incoming/outgoing S2S flags.

| id | Method | Path |
| --- | --- | --- |
| `files_sharing-remote-get-open-shares` | GET | `/remote_shares/pending` |
| `files_sharing-remote-accept-share` | POST | `/remote_shares/pending/{id}` |
| `files_sharing-remote-decline-share` | DELETE | `/remote_shares/pending/{id}` |
| `files_sharing-remote-get-shares` | GET | `/remote_shares` |
| `files_sharing-remote-get-share` | GET | `/remote_shares/{id}` |
| `files_sharing-remote-unshare` | DELETE | `/remote_shares/{id}` |

### Traps

- Open vs accepted: `STATUS_PENDING` vs `STATUS_ACCEPTED`. Mapper miss → empty list, not 500.
- `extendShareInfo`: `parent === '-1'` → **null**; filecache fields only when mount exists, else nulls. Pending shares are usually unmounted.
- Accept/decline missing or manager false → same **404** `"Wrong share ID, share does not exist."`
- GET one missing → **404** `"share does not exist"` (different string). Success is an **object**, not a list.
- Unshare missing → **404** `"Share does not exist"`; `removeShare` false → **403** `"Could not unshare"`.
- Unshare mount path: `'/' . $userId . '/files' . $mountpoint`.

## Accept HTML (slice 5)

`AcceptController`. Logged-in HTML accept for pending **TYPE_USER / TYPE_GROUP** shares. Not remote OCS, not `shares/pending`.

| id | Method | Path |
| --- | --- | --- |
| `files_sharing.Accept#showAccept` | GET | `/apps/files_sharing/accept/{shareId}` |
| `files_sharing.Accept#accept.post` | POST | same |

### Auth / status

- `#[NoAdminRequired]`. Map `auth: session` is correct. Map success **200 html-or-json** and **401 login-or-json** are wrong.
- Unauth HTML → **303** login (`redirect_url`); JSON → **401** `{message}`.
- `showAccept`: `#[NoCSRFRequired]`. Missing share, missing node, or non-recipient (including link/remote types) → **404 HTML** guest (`core/404`), not JSON.
- `accept` POST: CSRF required → **412**. Does not re-check recipient; `acceptShare` failure → **404 HTML**. Success → **303** to `files.viewcontroller.showFile` `fileid` (`/index.php/f/{fileid}`), not map 200.
- Share id is full id (`ocinternal:{numericId}`).

## External shares JSON (slice 6)

Frontpage JSON over the same `External\Manager` as remote OCS. Soft-dep: use remote OCS for the same pending rows; different envelope and S2S gate.

| id | Method | Path |
| --- | --- | --- |
| `files_sharing.ExternalShares#index` | GET | `/apps/files_sharing/api/externalShares` |
| `files_sharing.ExternalShares#create.post` | POST | same (body `{id}`) |
| `files_sharing.ExternalShares#destroy.delete` | DELETE | `/apps/files_sharing/api/externalShares/{id}` |
| `files_sharing.ExternalShares#show` | GET | `/apps/files_sharing/api/externalShares/{id}` |
| `files_sharing.ExternalShares#update.put` | PUT | same |

### Auth / status

- `#[NoAdminRequired]`, **no** `NoCSRFRequired`. Map `auth: session` is correct. Map success **200 html-or-json** and **401/404** are wrong.
- CSRF on GET+POST+DELETE unless `requesttoken` or non-empty `OCS-APIRequest` header (request-level bypass, not OCS-only). Fail → **412** `{message}`. Unauth JSON → **401** `{message}`.
- `@NoOutgoingFederatedSharingRequired` only: incoming S2S **must** be on; outgoing may be off. Else **405** JSON string `"Federated sharing not allowed"`.
- Index: `JSONResponse(getOpenShares())` — `ExternalShare::jsonSerialize` (`parent` is string `'-1'`, not remote-OCS null). **200** JSON array.
- Create: if found → `acceptShare`; **always** **200** `[]` even if missing. Missing `id` → **400** empty body.
- Destroy: if found → `declineShare`; **always** **200** `[]`. Map **404** on create/destroy is wrong.
- `show` / `update`: routes exist but no controller methods → **500**, not 200 share JSON.

## Public preview (slice 7)

`PublicPreviewController#getPreview` on `/apps/files_sharing/publicpreview/{token}` — **not** `/s/{token}/preview` (that is `directLink`, slice 2). Extends `PublicShareController` (no authenticate redirect).

| id | Method | Path |
| --- | --- | --- |
| `files_sharing.PublicPreview#getPreview` | GET | `/apps/files_sharing/publicpreview/{token}` |
| `files_sharing-public_preview-get-preview` | GET | `/index.php/apps/files_sharing/publicpreview/{token}` |

### Auth / status

- `#[PublicPage]` `#[NoCSRFRequired]`. Map `auth: session` / `auth: mixed` and 401 login-or-json are **lies**.
- `PublicShareMiddleware`: missing/invalid token → **404 HTML** `sharenotfound`. Password share **without** `public_link_authenticated_frontend` → **404 HTML** (not 401, not controller 403). Owner cookie does **not** count.
- If the method runs (`DataResponse` `[]` unless noted):
  - empty token / `x===0` / `y===0` → **400**
  - share missing (controller path) → **404**
  - no READ → **403**
  - `!canSeeContent()` (hideDownload): allow only `x-nc-preview: true` (else **403**); cache 15m vs 24h
  - folder + empty `file` or `file` is folder → **400**
  - no preview: `mimeFallback` + File → **303** mime icon; else **404**
- Success: `FileDisplayResponse` 200 binary (`bp-binary-parity`). Query: `file` default `''`, `x=32`, `y=32`, `a` **untyped** (truthy = no-crop), `mimeFallback=false`.

## Public DAV (slice 9)

`/public.php/dav` and `/public.php/webdav`. Password DAV session is `public_link_authenticated` (share **id** list, set in `authSucceeded`). Owner cookie does **not** authenticate. See **dav** skill for method/status/XML contracts.

| id | Path |
| --- | --- |
| `dav.Public#tree` | `/public.php/dav/files/{token}/…` |
| `dav.Public#legacy-webdav` | `/public.php/webdav/…` (Basic username = token) |

## ShareInfo (slice 8)

POST `/apps/files_sharing/shareinfo`. `ShareInfoController` extends `ApiController` — **not** `PublicShareController`; `PublicShareMiddleware` does not run. Password goes in the **body**, not `public_link_authenticated_frontend`.

| id | Method | Path |
| --- | --- | --- |
| `files_sharing.ShareInfo#info.post` | POST | `/apps/files_sharing/shareinfo` |
| `files_sharing-share_info-info` | POST | `/index.php/apps/files_sharing/shareinfo` |

### Auth / status

- `#[PublicPage]` `#[NoCSRFRequired]`. Map `auth: session` / `auth: mixed` and 401 login-or-json are **lies**.
- `ShareInfoMiddleware`: `outgoingServer2ServerSharesAllowed()===false` → **404** `[]`, then wrapped (below). Toggle via `outgoingServer2ServerShareEnabled` in parity config.
- Every JSON body is wrapped `{data, status:'success'|'error'}`. OpenAPI bare ShareInfo success shape is a **lie**. 403/404 still wrapped with `status: error`.
- Params: `t` required; `password`; `dir`; `depth` default `-1`. Missing `t` TypeError → raw **400** (not wrapped).
- Unknown token → **404** `[]` + throttle. Bad password / no READ → **403** `[]` + throttle.
- Invalid `dir`: `NotFoundException` swallowed — stays at share root (not 404).
- `depth===0` → no `children`. Else `children[]` recursive.
- Node fields: `id,parentId,mtime,name,permissions` (node perms **&** share mask), `mimetype,size,type,etag`.

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
  external-share-store.ts
  remote-share-api.ts
  external-shares-api.ts
  accept.ts
  public-link.ts
  public-preview.ts
  public-session.ts
  share-info.ts
parity/legacy-mock/files-sharing-public-dav.ts
parity/tests/files-sharing-public-dav.parity.test.ts
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
  remote_shares/route.ts
  remote_shares/pending/route.ts
  remote_shares/pending/[id]/route.ts
  remote_shares/[id]/route.ts
app/apps/files_sharing/accept/[shareId]/route.ts
app/apps/files_sharing/api/externalShares/route.ts
app/apps/files_sharing/api/externalShares/[id]/route.ts
app/s/[token]/
  route.ts
  authenticate/[redirect]/route.ts
  download/[[...filename]]/route.ts
  preview/route.ts
app/index.php/s/[token]/preview/route.ts
app/apps/files_sharing/publicpreview/[token]/route.ts
app/index.php/apps/files_sharing/publicpreview/[token]/route.ts
app/apps/files_sharing/shareinfo/route.ts
app/index.php/apps/files_sharing/shareinfo/route.ts
parity/legacy-mock/files-sharing-ocs.ts
parity/legacy-mock/files-sharing-public-link.ts
parity/legacy-mock/files-sharing-accept.ts
parity/legacy-mock/files-sharing-external-shares.ts
parity/legacy-mock/files-sharing-public-preview.ts
parity/legacy-mock/files-sharing-shareinfo.ts
parity/tests/files-sharing-share-ocs.parity.test.ts
parity/tests/files-sharing-public-link.parity.test.ts
parity/tests/files-sharing-deleted-ocs.parity.test.ts
parity/tests/files-sharing-remote-ocs.parity.test.ts
parity/tests/files-sharing-accept.parity.test.ts
parity/tests/files-sharing-external-shares.parity.test.ts
parity/tests/files-sharing-public-preview.parity.test.ts
parity/tests/files-sharing-shareinfo.parity.test.ts
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
| `GET /remote_shares/pending` unauth | 401/997 |
| `GET /remote_shares/pending` empty | 200 `[]` |
| Pending remote share list + accept | 200, `parent: null`, then accepted list |
| Accept unknown id | 404 `"Wrong share ID, share does not exist."` |
| GET unknown remote share | 404 `"share does not exist"` |
| GET one remote share | 200 object in `ocs.data`, not array |
| Unshare unknown id | 404 `"Share does not exist"` |
| Unshare accepted share, no mount | 403 `"Could not unshare"` |
| `GET /accept/{id}` unauth JSON | 401 `{message}` |
| `GET /accept/{id}` unauth HTML | 303 login |
| `GET /accept/ocinternal:999999` logged-in alice | 404 HTML |
| `GET /accept/ocinternal:1` pending user share as alice | 200 HTML guest |
| `POST /accept/{id}` no CSRF | 412 |
| `POST /accept/ocinternal:1` success | 303 to `/index.php/f/{fileid}` |
| `GET /externalShares` unauth JSON | 401 `{message}` |
| `GET /externalShares` no CSRF | 412 `{message}` |
| `GET /externalShares` incoming S2S off | 405 `"Federated sharing not allowed"` |
| `GET /externalShares` pending share | 200 array, `parent: '-1'` string |
| `POST /externalShares` unknown id | 200 `[]` |
| `DELETE /externalShares/{id}` unknown id | 200 `[]` |
| `GET /externalShares/{id}` missing method | 500 |
| `PUT /externalShares/{id}` missing method | 500 |
| `GET /publicpreview/{token}` open link | 200 binary (`bp-binary-parity`) |
| `GET /publicpreview/{token}` unknown token | 404 guest HTML |
| `GET /publicpreview/{token}` password, no session | 404 HTML |
| `GET /publicpreview/{token}` folder, no `file` | 400 `[]` |
| `GET /publicpreview/{token}` hideDownload, no header | 403 `[]` |
| `GET /index.php/.../publicpreview/{token}` | same handler as app route |
| `POST /shareinfo` outgoing S2S off | 404 `{data:[],status:error}` |
| `POST /shareinfo` good token | 200 `{status:success,data:{name,…}}` |
| `POST /shareinfo` bad password | 403 `{data:[],status:error}` |
| `POST /shareinfo` unknown token | 404 `{data:[],status:error}` |
| `POST /shareinfo` missing `t` | 400 raw empty body |
| `POST /index.php/.../shareinfo` | same handler as app route |
| `PROPFIND /public.php/dav/files/{token}/` open link | 207 multistatus |
| `GET /public.php/dav/files/{token}/welcome.txt` | 200 binary |
| `PROPFIND` unknown token | 401 or 404 Sabre XML |
| `PROPFIND` password share, no creds | 401 |
| `PUT` v2 without AJAX, S2S off | 401 |
| `GET` legacy without AJAX, S2S off | 401 |
| Owner cookie on password share DAV | still 401 |

Reset files + sharing stores (and file-node id counters) in accept parity `beforeEach` via `resetParityFilesStores()` + `resetParityShareStores()`. Seed a pending user share with admin `POST /shares` (`shareType: 0`, `shareWith: alice`), then exercise accept as `alice`.

Seeding a link share for a public-link test needs slice 1: `POST /shares` with `shareType: 3`, then read the token back. `GET /shares/{id}` returns `ocs.data` as a **one-element array**, so the token is `ocs.data[0].token`. Create the share through the parity case so the mock and the Next.js server both hold it, and never send the owner cookie on the `/s/{token}` request.

Depends on `dav` for file nodes. Use `bp-ocs-envelope`, `bp-observe-php-contract`, `bp-feature-map-edit`, `bp-binary-parity`, `bp-session-map-serialization`.
