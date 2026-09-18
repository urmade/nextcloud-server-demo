---
name: files_sharing
description: Share OCS, sharees, public /s/{token}, public DAV, remote/federated incoming, deleted shares. Use when implementing sharing APIs or public.php DAV.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# files_sharing

## Purpose

Share CRUD (OCS v1 API), sharee search, incoming federated/remote shares, deleted-share restore, public link UI `/s/{token}`, public preview/shareinfo, **public DAV** (`/public.php/dav`, `/public.php/webdav`). Depends on `dav` (authenticated tree + XML). New registry OCS is feature **`sharing`** — not this slice.

Public-share auth is a **second session**, not the owner cookie. Incognito mode on `public.php`.

## Key types / entities

Share types (`OCP\Share\IShare`):

| Const | Int | createShare? |
| --- | --- | --- |
| `TYPE_USER` | 0 | yes |
| `TYPE_GROUP` | 1 | yes |
| `TYPE_USERGROUP` | 2 | no (internal) |
| `TYPE_LINK` | 3 | yes |
| `TYPE_EMAIL` | 4 | yes |
| `TYPE_REMOTE` | 6 | yes |
| `TYPE_CIRCLE` | 7 | yes if circles app |
| `TYPE_GUEST` | 8 | no in controller |
| `TYPE_REMOTE_GROUP` | 9 | yes |
| `TYPE_ROOM` | 10 | yes |
| `TYPE_DECK` | 12 | yes |
| `TYPE_SCIENCEMESH` | 15 | no in createShare |

Status: `PENDING=0`, `ACCEPTED=1`, `REJECTED=2`.

Permissions (`OCP\Constants`): READ 1, UPDATE 2, CREATE 4, DELETE 8, SHARE 16, ALL 31.

Link defaults: READ. Legacy `publicUpload=true` → READ|CREATE|UPDATE|DELETE. If READ + outgoing S2S + `shareapi_allow_federation_on_public_shares` → OR SHARE. Must have READ or CREATE; UPDATE/DELETE require READ. File shares strip CREATE|DELETE. Non-link null perms → `shareapi_default_permissions` or ALL, always OR READ.

Custom token: max 32, regex `^[a-z0-9-]+$`.

Formatted share: `Files_SharingShare` in `apps/files_sharing/lib/ResponseDefinitions.php` (`id,share_type,permissions,stime,uid_owner,path,token,url,…`).

Public sessions:

- Frontend password map: `public_link_authenticated_frontend`
- DAV authenticated share ids: `public_link_authenticated`

## Endpoints owned

39 map ids. Settings PUT/DELETE `/apps/files_sharing/settings/*` are feature **`settings`**.

### Public HTTP

| id | Method | Path |
| --- | --- | --- |
| `files_sharing.Share#showShare` | GET | `/s/{token}` |
| `files_sharing.Share#showAuthenticate` | GET | `/s/{token}/authenticate/{redirect}` |
| `files_sharing.Share#authenticate.post` | POST | same |
| `files_sharing.Share#downloadShare` | GET | `/s/{token}/download/{filename}` |
| `files_sharing.PublicPreview#directLink` | GET | `/s/{token}/preview` |
| `files_sharing-public_preview-direct-link` | GET | `/index.php/s/{token}/preview` — same `directLink` |
| `files_sharing.PublicPreview#getPreview` | GET | `/apps/files_sharing/publicpreview/{token}` |
| `files_sharing-public_preview-get-preview` | GET | `/index.php/apps/files_sharing/publicpreview/{token}` — same |
| `files_sharing.ShareInfo#info.post` | POST | `/apps/files_sharing/shareinfo` |
| `files_sharing-share_info-info` | POST | `/index.php/apps/files_sharing/shareinfo` — same |

### Logged-in HTTP

| id | Method | Path |
| --- | --- | --- |
| `files_sharing.Accept#showAccept` | GET | `/apps/files_sharing/accept/{shareId}` |
| `files_sharing.Accept#accept.post` | POST | same (CSRF required) |
| `files_sharing.ExternalShares#index` | GET | `/apps/files_sharing/api/externalShares` |
| `files_sharing.ExternalShares#create.post` | POST | same |
| `files_sharing.ExternalShares#destroy.delete` | DELETE | `/apps/files_sharing/api/externalShares/{id}` |
| `files_sharing.ExternalShares#show` | GET | `…/{id}` |
| `files_sharing.ExternalShares#update.put` | PUT | `…/{id}` |

`ExternalShares#show` / `#update.put`: AppFramework **resource stubs**. Controller implements only `index`/`create`/`destroy`. Match PHP: no show/update methods → default 405/not-implemented, do not invent CRUD bodies.

### OCS

| id | Method | Path |
| --- | --- | --- |
| `files_sharing-shareapi-get-shares` | GET | `/ocs/v2.php/apps/files_sharing/api/v1/shares` |
| `files_sharing-shareapi-create-share` | POST | same |
| `files_sharing-shareapi-get-inherited-shares` | GET | `…/shares/inherited` |
| `files_sharing-shareapi-pending-shares` | GET | `…/shares/pending` |
| `files_sharing-shareapi-accept-share` | POST | `…/shares/pending/{id}` |
| `files_sharing-shareapi-get-share` | GET | `…/shares/{id}` |
| `files_sharing-shareapi-update-share` | PUT | `…/shares/{id}` |
| `files_sharing-shareapi-delete-share` | DELETE | `…/shares/{id}` |
| `files_sharing-shareapi-send-share-email` | POST | `…/shares/{id}/send-email` |
| `files_sharing-shareapi-generate-token` | GET | `…/token` (`#[ApiRoute]`, not `routes.php`) |
| `files_sharing-shareesapi-search` | GET | `…/sharees` |
| `files_sharing-shareesapi-find-recommended` | GET | `…/sharees_recommended` |
| `files_sharing-deleted_shareapi-index` | GET | `…/deletedshares` |
| `files_sharing-deleted_shareapi-undelete` | POST | `…/deletedshares/{id}` |
| `files_sharing-remote-get-shares` | GET | `…/remote_shares` |
| `files_sharing-remote-get-share` | GET | `…/remote_shares/{id}` |
| `files_sharing-remote-unshare` | DELETE | `…/remote_shares/{id}` |
| `files_sharing-remote-get-open-shares` | GET | `…/remote_shares/pending` |
| `files_sharing-remote-accept-share` | POST | `…/remote_shares/pending/{id}` |
| `files_sharing-remote-decline-share` | DELETE | `…/remote_shares/pending/{id}` |

### Public DAV (this feature)

| id | Path | PHP |
| --- | --- | --- |
| `dav.Public#tree` | `/public.php/dav/{path}` | `apps/dav/appinfo/v2/publicremote.php` |
| `dav.Public#legacy-webdav` | `/public.php/webdav/{path}` | `apps/dav/appinfo/v1/publicwebdav.php` |

## Endpoint walkthrough

### Share OCS — `ShareAPIController`

All `NoAdminRequired`. createShare: `UserRateLimit(20/600s)`. `path` required. `shareType` default **-1** (unknown → 400). `expireDate` null = default expiry; `''` = no expiration. EMAIL + mailSend → validate email. `sendPasswordByTalk=true` needs Talk. CIRCLE needs circles app.

getShares query: `shared_with_me`, `reshares`, `subfiles`, `path`, `include_tags` as **`'true'|'false'` strings**. Without reshare rights, reshares filter returns only shares **created by current user**.

getInheritedShares: requires node `PERMISSION_SHARE`; adds `via_fileid`, `via_path`.

updateShare: `canEditShare` = owner/sharer (group members **cannot** edit). At least one field. Link/email-only: hideDownload, publicUpload/permissions, password (`''` clears), label, sendPasswordByTalk, custom token if `allowCustomTokens`. expireDate `''` clears.

deleteShare: `canDeleteShareFromSelf` (GROUP/ROOM/DECK recipient, not owner) → `deleteFromSelf` only. Else `canDeleteShare`. Locked → OCSNotFound “Could not delete share”.

pendingShares: USER+GROUP with PENDING or REJECTED; formatted `permissions: 0`.

acceptShare pending `{id}`: `canAccessShare`; HintException → OCSException.

sendShareEmail: rate 10/600s; LINK/EMAIL must be `sharedBy` (not merely file owner); password-protected requires matching body `password`.

generateToken: GET `{token: string}`; ShareTokenException → OCSException.

Access helpers: `canAccessShare` (perms≠0; owner/sharer; user recipient; reshare rights; group if checkGroups; circle level≥1; room/deck helpers). Reshare rights: SHARE perm; circle member level≥4. Child cannot loosen parent hideDownload.

### Sharees

`itemType` **required**. `page≥1`, `perPage>0` capped by `sharing.maxAutocompleteResults` (default 25). Short search / sharing disabled for user → empty success, not 400. Optional `Link` next header.

### Deleted / remote / external

Deleted index: GROUP/CIRCLE/ROOM/DECK shared-with; formatted permissions **0**. undelete: missing or `permissions !== 0` → OCSNotFound.

Remote OCS: incoming federated. Missing → OCSNotFound; unshare fail → OCSForbidden.

ExternalShares JSON: `index` = open shares; `create(id)` accept + scan job; `destroy` decline. **Always empty 200** even if id missing.

### Accept HTML

GET: recipient (TYPE_USER `sharedWith===uid` or TYPE_GROUP member) else 404 template. POST accept: CSRF; redirect `files.View#showFile`; does **not** re-check `isRecipient` (only null user). Other share types → not recipient on GET.

### Public UI `/s/{token}`

Middleware: `shareapi_enabled` + `shareapi_allow_links`; bad token → 404 template; password needed → redirect authenticate.

`showShare`: `PublicPage`, `NoCSRFRequired`; incognito; node readable+shareable; file share + extra `path` → 404. Template from `IPublicShareTemplateFactory`.

`showAuthenticate`: guest `core/publicshareauth`.

`authenticate` POST: **CSRF required**, bruteforce `publicLinkAuth`, `UseSession`. Body `password`, `passwordRequest` default `'no'`, `identityToken`. Already auth → redirect showShare. `passwordRequest === ''`: TYPE_EMAIL identity flow. Fail → wrongpw template + throttle. Success: regenerate session id; store frontend + DAV session; RedirectResponse.

`downloadShare` (deprecated 31+): redirect to `/public.php/dav/files/{token}{davPath}` (+ `files`, `accept=zip` for folders). Forbidden if no READ, `permissions.download===false`, or `hideDownload`. `NoSameSiteCookieRequired`.

### Public preview / shareinfo

`getPreview`: PublicPage; query `file` default `''`, `x=32`, `y=32`, `a` (truthy = no-crop), `mimeFallback`. empty token / x=0 / y=0 → 400. no READ → 403. `!canSeeContent()`: only if header `x-nc-preview: true` else 403. Folder share needs `file` pointing at a file. Success FileDisplayResponse or 303 mime icon.

`directLink`: **not** for password shares, hide-content, no READ, or **folder** shares (single file only) → 400. Full-size preview, cache 24h. `NoSameSiteCookieRequired`.

`ShareInfo#info`: PublicPage, bruteforce `shareinfo`. Body `t` token, optional `password`, `dir`, `depth` default -1. Need READ + password. 200 node tree `id,parentId,mtime,name,permissions,mimetype,size,type,etag` + optional `children`. 404/403 + throttle.

### Public DAV

`public.php` maps `dav`→v2 publicremote, `webdav`→v1 publicwebdav. Incognito. CSP `default-src 'none'`.

**v2** (`dav.Public#tree`): `PublicAuth` Basic (token as user) + `BearerAuth(allowOcmAccessToken)`. Token path `/dav/files/{token}/…`. Password types LINK/EMAIL/CIRCLE; TYPE_REMOTE password path returns true without check. Cookie-bearing password shares need strict cookie check. **Non-GET** requires `X-Requested-With: XMLHttpRequest` **or** outgoing S2S; else `NotAuthenticated`. Files drop: no READ → FilesDropPlugin. Perm mask = share perms \| SHARE; `/uploads/` also READ|DELETE. Plugins: PublicLinkCheck, FilesDrop, ChunkingV2, Chunking.

**v1** (`dav.Public#legacy-webdav`): `LegacyPublicAuth`. **All methods** need AJAX or S2S (no GET exemption). No chunking plugins. Owner folder: TYPE_REMOTE uses shareOwner else sharedBy.

Do not use the logged-in user session on these trees.

## Auth / tenant rules

| Surface | Auth |
| --- | --- |
| Share/sharees/deleted/remote OCS | logged-in mixed → 401/997 anonymous |
| Accept HTML | logged-in recipient |
| ExternalShares | logged-in |
| `/s/{token}` GET | public-share token; password via extra session |
| authenticate POST | public + CSRF + password/identity |
| public preview / shareinfo | public token (+ password for shareinfo) |
| public DAV | share Basic / Bearer / DAV session ids — **never** owner cookie |
| generate-token | logged-in |

Owner of a share is not automatically authenticated to `/s/{token}` without the token.

## Failure modes

- Unknown `shareType` on create → OCSBadRequest.
- Missing `path` → 400.
- Missing sharees `itemType` → 400; short search → **200 empty**.
- Inherited without SHARE perm → SharingRightsException / 403.
- Group recipient PUT share → 403 (cannot edit).
- send-email as file owner but not `sharedBy` on link → 403/400.
- Public preview x=0 → 400 `[]`.
- Password link + directLink → 400.
- downloadShare hideDownload → 403.
- Public DAV non-AJAX PUT when S2S off → 401.
- ExternalShares unknown id → still 200 `[]`.
- Resource GET/PUT externalShares/{id} → no controller method (do not 200 fake share).
- Mixing user session into public.php → data leak; PHP sets incognito.

## Do-not list

- Do not implement `sharing-api_v1-*` (feature `sharing`).
- Do not implement federated **outgoing** request_handler / OCM (`federatedfilesharing`, `cloud_federation_api`).
- Do not implement `files_sharing.Settings#*` (feature `settings`).
- Do not implement authenticated `/remote.php/dav` (feature `dav`) — public.php only here.
- Do not invent ExternalShares show/update bodies.
- Do not allow SCIENCEMESH/GUEST in createShare.
- Do not skip password on TYPE_LINK when share has password.
- Do not use OCS envelope on `/s/{token}` HTML or public DAV XML.
- Do not treat map `auth: session` on PublicPreview routes.php rows as requiring login — PHP is `PublicPage`.
- Do not loosen hideDownload on child shares.

## Conceptual Next.js shape

```
src/server/sharing/
  types.ts              # shareType + permission bits
  share-api.ts          # OCS CRUD
  sharees.ts
  remote.ts
  deleted.ts
  public-session.ts     # token + password session, isolated from user session
  public-page.ts        # /s/{token}
  public-preview.ts
  shareinfo.ts
  public-dav.ts         # wrap dav xml with share view + perm mask
app/s/[token]/...
app/public.php/[...path]/route.ts
app/ocs/v2.php/apps/files_sharing/api/v1/...
```

## Parity notes

| Case | Endpoint | Expect |
| --- | --- | --- |
| Happy create user share | create-share | 200 formatted share, `share_type: 0` |
| Create link | create-share | `share_type: 3`, `token`, `url` |
| Auth | get-shares | 401/997 anonymous |
| Validation | create without path | 400 |
| Sharees | missing itemType | 400 |
| Sharees | empty search | 200 empty sets |
| Get unknown id | get-share | OCS 404 |
| Public page | showShare | 200 HTML; bad token 404 |
| Password | authenticate POST no CSRF | fail (redirect/403), not 200 |
| Shareinfo | bad password | 403 + throttle header/behavior |
| Preview | x=0 | 400 |
| Public PROPFIND | `dav.Public#tree` | 207 within share; path outside → 404 |
| Public PUT no AJAX | v2 tree, S2S off | 401 |
| generate-token | GET token | `{token}` charset `a-z0-9-` / unique |
| External stub | GET `…/externalShares/{id}` | not a successful share JSON |

XML: reuse `bp-dav-xml-normalize` from dav slice. Public DAV tokens in path, not `{uid}`.

Federation accept/decline here is **incoming remote_shares**, not OCM `/ocm`.

## Repo links

- `apps/files_sharing/appinfo/routes.php`
- `apps/files_sharing/lib/Controller/ShareAPIController.php`
- `ShareesAPIController.php`, `RemoteController.php`, `DeletedShareAPIController.php`
- `ShareController.php`, `PublicPreviewController.php`, `ShareInfoController.php`
- `AcceptController.php`, `ExternalSharesController.php`
- `apps/files_sharing/lib/ResponseDefinitions.php`
- `lib/public/Share/IShare.php`, `lib/public/Constants.php`
- `public.php`
- `apps/dav/appinfo/v2/publicremote.php`, `v1/publicwebdav.php`
- `lib/public/AppFramework/Http/Attribute/PublicPage.php` (PublicShare middleware)
- Cross: `dav` (authenticated XML); `sharing`; `federatedfilesharing`; `settings` share-folder prefs; `bp-ocs-envelope`
