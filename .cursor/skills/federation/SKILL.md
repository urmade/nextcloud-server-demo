---
name: federation
description: Trusted-server list and shared-secret OCS. Use when implementing or testing federation OCSAuthAPI or trusted-servers settings.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# federation

## Purpose

**Trusted Nextcloud servers**: admin CRUD of the allow-list, and unauthenticated OCS to **exchange a shared secret** used later as CardDAV “system” basic-auth (`username=system`, password=secret).

This is **not** OCM (`cloud_federation_api`) and **not** file S2S (`federatedfilesharing`). File auto-accept consults this list; do not duplicate share HTTP here.

Isolate remotes. `addServer` probes `{url}/status.php` — stub it in tests.

## Scope

7 map ids: 4 shared-secret OCS (legacy app root + `/cloud` aliases) + 3 trusted-servers settings OCS.

Side effects: background jobs `RequestSharedSecret` / `GetSharedSecret`; DAV `FedAuth` backend; address-book sync job (not mapped HTTP).

## Non-scope

- OCM discovery / shares / notifications / JWKS — `cloud_federation_api`
- `/ocs/v2.php/cloud/shares*` file S2S — `federatedfilesharing`
- Admin settings HTML page (`Settings\Admin::getForm`) — chrome only; JSON is the mapped API
- Calendar federation invites — `dav`
- System address-book DAV tree — `dav` (this feature only supplies FedAuth credentials)

## Endpoints owned

`ocs_version: both`. Legacy handlers **delegate** to the `/cloud` methods — one implementation.

| id | method | path | PHP |
| --- | --- | --- | --- |
| `federation-ocs_authapi-request-shared-secret-legacy` | POST | `/ocs/v2.php/apps/federation/api/v1/request-shared-secret` | `OCSAuthAPIController::requestSharedSecretLegacy` |
| `federation-ocs_authapi-get-shared-secret-legacy` | GET | `/ocs/v2.php/apps/federation/api/v1/shared-secret` | `getSharedSecretLegacy` |
| `federation-ocs_authapi-request-shared-secret` | POST | `/ocs/v2.php/cloud/shared-secret` | `requestSharedSecret` |
| `federation-ocs_authapi-get-shared-secret` | GET | `/ocs/v2.php/cloud/shared-secret` | `getSharedSecret` |
| `federation-settings-get-servers` | GET | `/ocs/v2.php/apps/federation/trusted-servers` | `SettingsController::getServers` |
| `federation-settings-add-server` | POST | `/ocs/v2.php/apps/federation/trusted-servers` | `addServer` |
| `federation-settings-remove-server` | DELETE | `/ocs/v2.php/apps/federation/trusted-servers/{id}` | `removeServer` (`id` `\d+`) |

Settings routes come from `#[ApiRoute]` (not `routes.php`). OpenAPI: `apps/federation/openapi.json` + `openapi-administration.json`.

## Key types / entities

Table `trusted_servers`:

| Column | Notes |
| --- | --- |
| `id` | int PK |
| `url` | rtrimmed; `https://` prepended if no scheme (`updateProtocol`) |
| `url_hash` | sha1 of **normalized** URL: strip `http(s)://`, `Filesystem::normalizePath`, trim `/` |
| `token` | 16-char secret used **during** handshake; not listed in GET servers |
| `shared_secret` | 32-char secret after handshake; **never** returned by GET servers |
| `status` | `1` OK, `2` PENDING (default insert), `3` FAILURE, `4` ACCESS_REVOKED |
| `sync_token` | CardDAV sync cursor |

GET servers payload: `{id, status, url}[]` only.

Add success: `{id, message, url}` — `url` is the **request string** (not necessarily protocol-normalized).

Identity: `isTrustedServer($url)` = row exists for that hash. HTTP vs HTTPS of the same host **collide**.

FedAuth: `username === 'system'` AND `password` equals some row’s `shared_secret`. Principal prefix `principals/system/`. Empty challenge body.

## Endpoint walkthrough

### POST request-shared-secret (legacy + `/cloud`)

`PublicPage`, `NoCSRFRequired`, brute-force `federationSharedSecret`. Body: `url`, `token`.

1. `isTrustedServer($url)` false → register throttle + **OCS 403** (`OCSForbiddenException`).
2. `strcmp($localToken, $token) > 0` (local token **greater**) → 200 empty, **do not** enqueue GetSharedSecret (this side will initiate).
3. Else enqueue `GetSharedSecret` job `{url, token, created: now}` → 200 empty.

`getToken` throws if no token column — untrusted is 403 first; trusted-without-token can 500.

### GET shared-secret (legacy + `/cloud`)

Query: `url`, `token`. Same public + brute-force attrs.

1. Untrusted URL → throttle + 403.
2. `url` or `token` empty **or** `hash_equals(stored, token)` fails → throttle + 403. (Do not leak expected token to clients; PHP logs it.)
3. Generate 32-char `sharedSecret`, `addSharedSecret($url, …)`.
4. 200 `{sharedSecret}`. **Each successful GET mints a new secret** (overwrites).

### GET trusted-servers

`AuthorizedAdminSetting(Federation\Settings\Admin)`. List rows with secret stripped.

Unauthenticated → OCS 401; logged-in without that setting permission → 403.

### POST trusted-servers

Body `{url}`. `trim($url)` for checks/insert; response `url` is the **raw** parameter.

`checkServer`:

- Already trusted → OCS **409** `Server is already in the list of trusted servers.`
- `isNextcloudServer` false → OCS **404** `No server to federate with found`

`isNextcloudServer`: GET `{url}/status.php` timeout 3s; `verify` TLS unless `sharing.federation.allowSelfSignedCertificates`. Body JSON `version >= 9.0.0`. HTTP errors, invalid JSON, or version too low → **false** (then 404). Too-low version is **not** a distinct status.

Then `TrustedServers::addServer`: normalize protocol, insert, 16-char token, queue `RequestSharedSecret`. 200 `{url, id, message}`.

### DELETE trusted-servers/{id}

Unknown id → 404 `No server found with ID: {id}`. Else delete + `TrustedServerRemovedEvent(url_hash, url)`. Success `{id}`. Unexpected DB error → 500 `Could not remove server`.

## Background jobs (not mapped HTTP; honor if implementing handshake)

Both: skip if URL no longer trusted; drop after **30 days** and set `STATUS_FAILURE`. TLS verify same self-signed flag. Source URL = `rtrim(absoluteURL('/'), '/')`.

OCS discovery service `FEDERATED_SHARING`, key **`shared-secret`** for **both** jobs (PHP uses the same key):

| Job | Method | Fallback path |
| --- | --- | --- |
| `RequestSharedSecret` | POST body `url, token, format=json` | `/ocs/v2.php/apps/federation/api/v1/request-shared-secret` |
| `GetSharedSecret` | GET query `url, token, format=json` | `/ocs/v2.php/apps/federation/api/v1/shared-secret` |

Do not “fix” the shared discovery key unless PHP changes.

## Auth / tenant rules

| Route | Auth |
| --- | --- |
| Shared-secret GET/POST (all 4 ids) | **Public**. CSRF off. Trust = URL on the list + handshake token. Map `mixed` is noise — **do not 401 missing cookies**. |
| trusted-servers * | Admin (or delegated `AuthorizedAdminSetting` for `OCA\Federation\Settings\Admin`). Session/OCS. CSRF via `OCS-APIRequest`. |

No Nextcloud user is the tenant on secret exchange; tenant is the instance allow-list.

## Failure modes

| Outcome | When |
| --- | --- |
| OCS 200 empty | request-shared-secret accepted (including “we will initiate”) |
| OCS 200 `{sharedSecret}` | get-shared-secret |
| OCS 200 list / `{id,message,url}` / `{id}` | settings |
| OCS 403 | untrusted URL or bad handshake token (throttled) |
| OCS 401/403 | settings without admin |
| OCS 404 | add: remote not a Nextcloud≥9; remove: unknown id |
| OCS 409 | add: already trusted |
| OCS 500 | remove unexpected; getToken throw on request-secret |

v1 vs v2: `bp-ocs-envelope`.

## Conceptual Next.js shape

```
src/server/federation/
  trusted-servers.ts   # CRUD + url hash + status.php probe
  handshake.ts         # request/get shared secret + token compare
  fed-auth.ts          # system / shared_secret
app/ocs/v{1,2}.php/apps/federation/api/v1/shared-secret/route.ts
app/ocs/v{1,2}.php/apps/federation/api/v1/request-shared-secret/route.ts
app/ocs/v{1,2}.php/cloud/shared-secret/route.ts
app/ocs/v{1,2}.php/apps/federation/trusted-servers/route.ts
app/ocs/v{1,2}.php/apps/federation/trusted-servers/[id]/route.ts
```

## Traps

- Legacy and `/cloud` secret routes are **aliases**, not two stores.
- Greater local token → 200 and **no** GetSharedSecret job.
- GET shared-secret **rotates** the secret every success.
- GET servers must **omit** `shared_secret` and `token`.
- URL hash ignores scheme → `http://a` and `https://a` are the same server.
- addServer 404 covers “not Nextcloud”, down, and version < 9.
- Map auth=mixed on public secret routes is wrong.
- FedAuth username is literally `system`.
- `RequestSharedSecret` discovers key `shared-secret` even though it POSTs the request-secret path as fallback.

## Do-not

- Do not implement OCM HTTP (`cloud_federation_api`).
- Do not implement `/cloud/shares` (`federatedfilesharing`).
- Do not 401 public secret exchange for missing session.
- Do not return `shared_secret` on GET trusted-servers.
- Do not skip `hash_equals` on tokens.
- Do not call real `status.php` of the public internet in tests.
- Do not sync address books as part of these 7 endpoints (SyncJob is separate).

## Parity notes

Stub `status.php` JSON `{version: "9.0.0"}` or higher. Extra:

| Case | Expectation |
| --- | --- |
| GET shared-secret unknown url | OCS 403 + throttle |
| GET shared-secret trusted, bad token | OCS 403 + throttle |
| GET shared-secret ok | 200 `{sharedSecret}` length 32 |
| POST request-shared-secret untrusted | 403 |
| POST request-shared-secret local token greater | 200, no job |
| GET trusted-servers anonymous | 401 |
| POST trusted-servers duplicate | 409 |
| POST trusted-servers status.php fail | 404 |
| DELETE unknown id | 404 |
| POST vs GET `/cloud/shared-secret` | POST=request, GET=get |

Host rewrite on stored `url`. v1 success `statuscode` 100.

## Repo paths

- Routes: `apps/federation/appinfo/routes.php` (secret OCS only)
- Secret API: `apps/federation/lib/Controller/OCSAuthAPIController.php`
- Settings API: `apps/federation/lib/Controller/SettingsController.php`
- Domain: `apps/federation/lib/TrustedServers.php`, `apps/federation/lib/DbHandler.php`
- Jobs: `apps/federation/lib/BackgroundJob/RequestSharedSecret.php`, `GetSharedSecret.php`
- FedAuth: `apps/federation/lib/DAV/FedAuth.php` + `Listener/SabrePluginAuthInitListener.php`
- Admin form: `apps/federation/lib/Settings/Admin.php`
- Schema: `apps/federation/lib/Migration/Version1010Date20200630191302.php`
- Tests: `apps/federation/tests/Controller/OCSAuthAPIControllerTest.php`, `SettingsControllerTest.php`, `TrustedServersTest.php`, `DbHandlerTest.php`
