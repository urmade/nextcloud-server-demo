---
name: federatedfilesharing
description: Legacy S2S federated file share OCS + public-link-to-federation mount. Use when implementing or testing federatedfilesharing request_handler or MountPublicLink.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# federatedfilesharing

## Purpose

Incoming/outgoing **legacy OCS** server-to-server file shares (`POST /ocs/v{1,2}.php/cloud/shares…`) and converting a **public link** into a federated share (`/apps/federatedfilesharing/createFederatedShare` + `askForFederatedShare`).

Depends on `cloud_federation_api` (OCM HTTP + signatures). This feature owns the **file provider** (`CloudFederationProviderFiles`) that OCM `POST /ocm/shares` and `POST /ocm/notifications` dispatch into. Do not reimplement OCM HTTP here.

Outgoing user-initiated shares also enter via `files_sharing` ShareAPI (`TYPE_REMOTE`) → `FederatedShareProvider::create`. Recipient accept/decline UI is `files_sharing` remote-share OCS.

Isolate remotes in parity. Do not call the public internet.

## Scope

11 map ids: 8 legacy OCS request-handler routes, 3 public-link mount HTTP routes (pretty + OpenAPI duplicate).

File-provider persistence: `share` rows (`TYPE_REMOTE` / `TYPE_REMOTE_GROUP`) and `share_external` incoming mounts.

## Non-scope

- OCM discovery, JWKS, `POST /ocm/shares`, `POST /ocm/notifications`, `/ocm/{path}` — `cloud_federation_api`
- Trusted-server shared-secret OCS + admin CRUD — `federation`
- Recipient remote-share OCS (`files_sharing-remote-*`) and public `/s/{token}` — `files_sharing`
- Public WebDAV `/public.php/webdav/` — `dav` / `files_sharing`
- Calendar federation (`dav-federated_calendar-*`) — `dav`
- ShareAPI create of local/user/link shares — `files_sharing`

## Endpoints owned

`ocs_version: both`. Duplicate OpenAPI vs `routes.php` rows share one handler.

| id | method | path | PHP |
| --- | --- | --- | --- |
| `federatedfilesharing.MountPublicLink#createFederatedShare.post` | POST | `/apps/federatedfilesharing/createFederatedShare` | `MountPublicLinkController::createFederatedShare` |
| `federatedfilesharing-mount_public_link-create-federated-share` | POST | `/index.php/apps/federatedfilesharing/createFederatedShare` | same |
| `federatedfilesharing.MountPublicLink#askForFederatedShare.post` | POST | `/apps/federatedfilesharing/askForFederatedShare` | `askForFederatedShare` |
| `federatedfilesharing-request_handler-create-share` | POST | `/ocs/v2.php/cloud/shares` | `RequestHandlerController::createShare` |
| `federatedfilesharing-request_handler-re-share` | POST | `/ocs/v2.php/cloud/shares/{id}/reshare` | `reShare` |
| `federatedfilesharing-request_handler-update-permissions` | POST | `/ocs/v2.php/cloud/shares/{id}/permissions` | `updatePermissions` |
| `federatedfilesharing-request_handler-accept-share` | POST | `/ocs/v2.php/cloud/shares/{id}/accept` | `acceptShare` |
| `federatedfilesharing-request_handler-decline-share` | POST | `/ocs/v2.php/cloud/shares/{id}/decline` | `declineShare` |
| `federatedfilesharing-request_handler-unshare` | POST | `/ocs/v2.php/cloud/shares/{id}/unshare` | `unshare` |
| `federatedfilesharing-request_handler-revoke` | POST | `/ocs/v2.php/cloud/shares/{id}/revoke` | `revoke` |
| `federatedfilesharing-request_handler-move` | POST | `/ocs/v2.php/cloud/shares/{id}/move` | `move` (`id` is **int**) |

Also `/ocs/v1.php/…` (v1 envelope — `bp-ocs-envelope`).

OCS `root` is `/cloud`, **not** `/apps/federatedfilesharing`.

## Key types / entities

| Name | Shape |
| --- | --- |
| Incoming external share | Table `share_external`: `id`, `parent`, `share_type`, `remote` (trailing `/` stored), `remote_id`, `refresh_token` (sharedSecret), `access_token` / `access_token_expires` (OCM exchange), `name`, `owner`, `user` (local uid **or group id**), `mountpoint`, `accepted` (`IShare::STATUS_PENDING` until accept) |
| Outgoing federated share | Table `share`, `share_type` remote / remote-group; `token` 32 `[A-Za-z0-9]`; also a permanent authtoken via `PublicKeyTokenProvider` |
| Cloud id | `user@host` via `ICloudIdManager`. `AddressHandler::splitUserRemote` → `[user, remoteURL]` or HintException `Invalid Federated Cloud ID` |
| Legacy create-share body | `remote`, `token`, `name`, `owner`, `sharedBy`, `shareWith`, `remoteId`, `sharedByFederatedId?`, `ownerFederatedId?` |
| Re-share OCS success | `{token, remoteId}` — `remoteId` is **local** share id (`providerId`) |
| Move OCS success | `{remote, owner}` from resolved cloud id |
| Public-link success | `{remoteUrl: string}` — remote **host** from `shareWith` cloud id |
| Public-link / ask error | `{message: string}` HTTP 400 JSON (not OCS) |
| OCM file protocol | `{name: webdav, options: {sharedSecret}}` **or** `{name: webdav, webdav: {sharedSecret, uri?, requirements?}}` **or** `{name: multi, webdav: {…}}` |
| Notification types | `SHARE_ACCEPTED`, `SHARE_DECLINED`, `SHARE_UNSHARED`, `REQUEST_RESHARE`, `RESHARE_UNDO`, `RESHARE_CHANGE_PERMISSION` |
| Permission map (legacy → OCM) | `PERMISSION_SHARE`→`share`; `READ`→`read`; `CREATE` or `UPDATE`→`write` |

Config (`files_sharing` appconfig unless noted):

| Key | Default | Effect |
| --- | --- | --- |
| `outgoing_server2server_share_enabled` | `yes` | Outgoing S2S + public-link convert |
| `incoming_server2server_share_enabled` | `yes` | Incoming mounts + `unshare`/`move` S2S check |
| `outgoing_server2server_group_share_enabled` | `no` | Outgoing remote-group |
| `incoming_server2server_group_share_enabled` | `no` | Incoming group |
| `federatedTrustedShareAutoAccept` | `yes` | Auto-accept incoming if remote is a **trusted server** (`federation`) |
| GS `onlyInternalFederation` | — | Forces incoming/outgoing **off** |
| `core.shareapi_default_permissions` | `PERMISSION_ALL` | Mask applied on re-share |

`files_sharing` app must be enabled for S2S. Incoming `shareReceived` 503 if disabled.

## Endpoint walkthrough

### POST createFederatedShare (`MountPublicLink#createFederatedShare.post` + OpenAPI twin)

`PublicPage`, `NoCSRFRequired`, brute-force `publicLink2FederatedShare`. Map `auth: session`/`mixed` is **wrong**.

1. Outgoing S2S off → 400 `{message: "This server doesn't support outgoing federated shares"}`.
2. `splitUserRemote($shareWith)` + `getShareByToken($token)`. HintException → 400 `{message: hint}` + throttle.
3. Password-protected link: session `PublicAuth::DAV_AUTHENTICATED` share ids **or** `checkPassword($share, $password)`. Else 400 `No permission to access the share` + throttle.
4. `!$share->canDownload()` → 400 `Mounting download restricted share is not allowed` + throttle.
5. Set `sharedWith` + `shareType TYPE_REMOTE`. `FederatedShareProvider::create`. Exception → 400 `{message: exception message}` (no throttle).
6. 200 `{remoteUrl: $server}` (remote host from cloud id).

### POST askForFederatedShare (`MountPublicLink#askForFederatedShare.post`)

`NoAdminRequired` — **logged-in user required**. CSRF applies (no `NoCSRFRequired`).

1. Incoming S2S off → 400 `{message: l10n "Server to server sharing is not enabled on this server"}`.
2. Local cloud id = current user + `generateRemoteURL()`.
3. HTTP POST `{remote}/index.php/apps/federatedfilesharing/createFederatedShare` body `token`, `shareWith` (cloud id, trailing `/` stripped), `password`. Timeout 10s.
4. Transport exception → 400; empty password message vs “maybe the password was wrong”.
5. JSON body has `remoteUrl` → 200 `{message: l10n invitation / check notifications}` (**not** `{remoteUrl}`).
6. Else 400 “server to federate with is too old (Nextcloud <= 9)”.

Do not implement the NC≤9 fallback beyond this 400.

### POST `/cloud/shares` create-share

`PublicPage`, `NoCSRFRequired`, `FederationRateLimit(5 / 1200s)`.

1. If `ownerFederatedId` null: `getCloudId($owner, cleanupRemote($remote))`. `cleanupRemote` strips through `://` then rtrims `/`. **No `://` → `strpos` false; PHP still takes `substr($remote, 3)`.**
2. If `sharedByFederatedId` null **and** `owner === $sharedBy`: copy owner federated id.
3. Factory share: type **`user`**, resource **`file`**, secret=`token`. Group incoming is **OCM-only**.
4. `getCloudFederationProvider('file')->shareReceived`. Map:
   - `ProviderDoesNotExistsException` → OCS **503** `Server does not support federated cloud sharing`
   - `ProviderCouldNotAddShareException` → OCS **400** (exception message; provider may encode 503/501/400 in its own HTTP code — OCS wrapper uses **400**)
   - other → OCS **500** `internal server error, was not able to add share from {remote}`
5. Success: empty OCS data 200/100.

Provider `shareReceived` (also used by OCM — same rules):

- Incoming S2S off → `ProviderCouldNotAddShareException` HTTP 503 text `Server does not support federated cloud sharing`
- Protocol `name` must be `webdav` **or** `multi` with array `webdav`; else 501 `Unsupported protocol for data exchange.`
- Required: remote, token, name, owner, remoteId, shareWith. Else 400 missing parameter.
- Invalid filename → 400.
- User share: LDAP `preLoginNameUsedAsUserName` hook, then user must exist (400 `User does not exists`). Group share: group must exist (400).
- Insert `share_external` pending. Activity + notification `app=files_sharing` object `remote_share/{id}`; accept/decline actions hit **`files_sharing` pending remote OCS**.
- Auto-accept if `federatedTrustedShareAutoAccept` **and** `federation.TrustedServers::isTrustedServer($remote)`.
- Optional token-exchange when protocol `requirements` contains `must-exchange-token` or remote discovery has `exchange-token`.

### POST `…/{id}/reshare`

Required: `token`, `shareWith`, `remoteId` (int, default 0). Any null → 400.

Notification `REQUEST_RESHARE`: `sharedSecret`, `shareWith`, `senderId`=`remoteId`. Provider: verify token; refuse reshare to owner; need `PERMISSION_SHARE`; `create()` then `storeRemoteId`. Return `{token, remoteId: localId}`.

Provider missing → 503. ShareNotFound / other → log + **400** (empty).

### POST `…/{id}/accept` and `…/{id}/decline`

Notification `SHARE_ACCEPTED` / `SHARE_DECLINED`. Provider missing → 503. **ShareNotFound and other exceptions are logged and swallowed → still 200 empty.** Do not 404.

Accept: activity on owner/initiator. If reshare (`shareOwner !== sharedBy` and initiator not local), forward `SHARE_ACCEPTED` to initiator remote. Decline: `removeShareFromTable` + activity; forward `SHARE_DECLINED` on reshare.

### POST `…/{id}/unshare`

S2S (outgoing flag) off → 503. Else `SHARE_UNSHARED` on **incoming** `share_external` by `remote_id`+token. Exceptions logged; **still 200**.

### POST `…/{id}/revoke`

`RESHARE_UNDO` → delete outgoing share by id+token. Any exception → **400**. Success empty 200.

### POST `…/{id}/permissions`

Translate NC bitmask → OCM `permission` list; send `RESHARE_CHANGE_PERMISSION`. **Current PHP `updateResharePermissions` always throws `HintException('Updating reshares not allowed')` → this endpoint is always OCS 400.** Match that; do not invent a working update.

### POST `…/{id}/move`

S2S off → 503. Resolve `$remote` as cloud id. Update `share_external` set `remote`, `owner`, `remote_id` where `remote_id = $id` **and** `refresh_token = $token`. `remote_id` body defaults to `$id`. Affected 0 → 400 `Share not found or token invalid`. Else `{remote, owner}`.

## Auth / tenant rules

| Route | Auth |
| --- | --- |
| createFederatedShare | **Public**. Password/session for protected links. CSRF off. |
| askForFederatedShare | **Session user**. CSRF on. |
| All `request_handler-*` | **Public**. CSRF off. Authenticate with share `token` / `refresh_token`, not a Nextcloud user session. Map `mixed` is scanner noise — **do not 401 missing cookies**. |
| Integrity | Token must match share (`verifyShare`) or `share_external.refresh_token`. |

Tenant = this instance. `shareWith` on create-share is a **local** user (legacy always user). Incoming remote URL is the owner’s server.

Rate limit create-share 5/1200s. Throttle public-link failures (invalid token/id, bad password, download-restricted).

## Failure modes

| HTTP / OCS | When |
| --- | --- |
| JSON 200 `{remoteUrl}` | createFederatedShare ok |
| JSON 200 `{message}` | askForFederatedShare queued |
| JSON 400 `{message}` | public-link / ask failures |
| OCS 200 empty | create/accept/decline/unshare/revoke success; accept/decline/unshare also on missing share |
| OCS 200 `{token, remoteId}` | reshare |
| OCS 200 `{remote, owner}` | move |
| OCS 400 | provider could not add; reshare/revoke/permissions/move invalid |
| OCS 503 | no file provider, or S2S disabled (unshare/move); incoming disabled surfaces as 400 via `ProviderCouldNotAddShareException` on create |
| OCS 500 | create-share unexpected |
| 429 / throttle | public-link brute force; federation rate limit on create-share |

Follow `bp-ocs-envelope` for v1 vs v2 HTTP vs `meta.statuscode`.

## Conceptual Next.js shape

```
src/server/federatedfilesharing/
  provider.ts          # shareReceived + notificationReceived (file)
  address.ts           # cloud-id split / compare
  flags.ts             # incoming/outgoing/group/auto-accept
  public-link.ts       # createFederatedShare / askForFederatedShare
app/apps/federatedfilesharing/createFederatedShare/route.ts
app/apps/federatedfilesharing/askForFederatedShare/route.ts
app/ocs/v1.php/cloud/shares/[[...path]]/route.ts
app/ocs/v2.php/cloud/shares/[[...path]]/route.ts
```

OCM slice calls `provider.ts`; do not duplicate OCM routes.

## Traps

- OCS lives under `/cloud/shares`, not `/apps/federatedfilesharing`.
- Map auth=session on createFederatedShare is false.
- accept/decline/unshare: missing share still **200**.
- `updatePermissions` currently **always 400**.
- Legacy create-share is **user-only**; groups via OCM.
- Incoming `remote` stored **with trailing slash**.
- `move` matches `refresh_token`, not `share_token` (column renamed).
- askForFederatedShare success body is a **message**, not `remoteUrl`.
- Provider 503 incoming-disabled is wrapped as OCS **400** on create-share.
- `cleanupRemote` without `://` strips 3 chars.
- Do not auto-accept unless trusted-server list says so **and** the flag is on.

## Do-not

- Do not implement `/ocm/*` or discovery (`cloud_federation_api`).
- Do not implement trusted-server secret exchange (`federation`).
- Do not implement `files_sharing-remote-*` accept/decline for the recipient UI.
- Do not 401 public S2S POSTs for missing session.
- Do not 404 accept/decline/unshare when the share is missing.
- Do not “fix” permission-update to succeed.
- Do not POST real remotes in tests; stub `createFederatedShare` / OCM send.
- Do not add group shareType on the legacy create-share OCS.

## Parity notes

Mock remotes. Extra beyond default three:

| Case | Expectation |
| --- | --- |
| POST createFederatedShare outgoing off | 400 message |
| POST createFederatedShare bad token | 400 + throttle |
| POST createFederatedShare password fail | 400 + throttle |
| POST askForFederatedShare anonymous | login/401 (session required) |
| POST `/cloud/shares` unknown local user | OCS 400 |
| POST `/cloud/shares` no file provider | OCS 503 |
| POST accept unknown id | OCS 200 empty |
| POST permissions any token | OCS 400 |
| POST move bad token | OCS 400 |
| POST unshare S2S off | OCS 503 |
| GET `/cloud/shares` | 405 |

Rewrite hosts in `remoteUrl` / cloud ids. OCS v1 success `statuscode` 100.

## Repo paths

- Routes: `apps/federatedfilesharing/appinfo/routes.php`
- OCS handler: `apps/federatedfilesharing/lib/Controller/RequestHandlerController.php`
- Public link: `apps/federatedfilesharing/lib/Controller/MountPublicLinkController.php`
- Provider: `apps/federatedfilesharing/lib/OCM/CloudFederationProviderFiles.php`
- Outgoing create: `apps/federatedfilesharing/lib/FederatedShareProvider.php`
- Notify remote: `apps/federatedfilesharing/lib/Notifications.php` (OCM first, then `/ocs/v2.php/cloud/shares`)
- Cloud ids: `apps/federatedfilesharing/lib/AddressHandler.php`
- Retry: `apps/federatedfilesharing/lib/BackgroundJob/RetryJob.php`
- Register provider `file`+`folder`: `apps/federatedfilesharing/lib/AppInfo/Application.php`
- Incoming entity: `apps/files_sharing/lib/External/ExternalShare.php` (+ Mapper/Manager)
- OpenAPI: `apps/federatedfilesharing/openapi.json`
- Tests: `apps/federatedfilesharing/tests/Controller/`
