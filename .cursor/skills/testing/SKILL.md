---
name: testing
description: Dev-only testing app routes (rate limit, appconfig, file locks, routes.php dump). Not product. Use only for harness parity against apps/testing.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# testing

## Purpose

Bundled **QA testing** app (`apps/testing`). Dangerous if enabled on a live instance (`info.xml`). **Not product.** Do not ship these routes in a Next.js product surface. Implement only if the parity harness needs the same testing app.

`depends_on: []`. Map notes: “Bundled testing app; not a product endpoint.”

## Scope

Mapped HTTP/OCS only (11 ids):

- Rate-limit probes
- App config set/delete (any app id)
- DB file-lock provisioning
- Dump another app’s `appinfo/routes.php`

## Non-scope (do not implement as product)

Unmapped but present in PHP — leave out unless a later map says otherwise:

- Fake translation / text / image / task-processing / OCR providers
- Fake file conversion provider
- Declarative settings form + listeners
- `AlternativeHomeUserBackend` / `HiddenGroupBackend`
- OCC `StaticHunt`
- `ajax/endpoint.php` (empty stub for URL generator tests)
- `clean_apcu_cache.php` / `clean_opcode_cache.php`

## Endpoints owned

Map ids where `feature_ids` contains `testing` (11).

| id | Method | Path | PHP |
| --- | --- | --- | --- |
| `testing.RateLimitTest#userAndAnonProtected` | GET | `/apps/testing/userAndAnonProtected` | `RateLimitTestController::userAndAnonProtected` |
| `testing.RateLimitTest#onlyAnonProtected` | GET | `/apps/testing/anonProtected` | `onlyAnonProtected` |
| `testing.Config#setAppValue.post` | POST | `/ocs/v2.php/apps/testing/api/v1/app/{appid}/{configkey}` | `ConfigController::setAppValue` |
| `testing.Config#deleteAppValue.delete` | DELETE | same | `deleteAppValue` |
| `testing.Locking#isLockingEnabled` | GET | `/ocs/v2.php/apps/testing/api/v1/lockprovisioning` | `isLockingEnabled` |
| `testing.Locking#isLocked` | GET | `/ocs/v2.php/apps/testing/api/v1/lockprovisioning/{type}/{user}` | `isLocked` |
| `testing.Locking#acquireLock.post` | POST | same | `acquireLock` |
| `testing.Locking#changeLock.put` | PUT | same | `changeLock` |
| `testing.Locking#releaseLock.delete` | DELETE | same | `releaseLock` |
| `testing.Locking#releaseAll.delete` | DELETE | `/ocs/v2.php/apps/testing/api/v1/lockprovisioning/{type}` (`type` default **null**) | `releaseAll` |
| `testing.Routes#getRoutesInRoutesPhp` | GET | `/ocs/v2.php/apps/testing/api/v1/routes/routesphp/{app}` | `getRoutesInRoutesPhp` |

OCS: v2 path canonical; `ocs_version: both`. Envelope: `bp-ocs-envelope`. Map `auth: mixed` / HTTP `session` is scanner noise — see auth below.

## Key types / entities

`ILockingProvider::LOCK_SHARED = 1`, `LOCK_EXCLUSIVE = 2`. URL `{type}` is that int.

Lock key: `'files/' + md5(storageId + '::' + trim(internalPath, '/'))` from `$rootFolder->getUserFolder($user)->get($path)`.

`path` is a **request param** (query/body), not a path segment.

Locking provider: only if the real provider **is** `OC\Lock\DBLockingProvider`. Then use `FakeDBLockingProvider` (TTL 36000s, shared locks released immediately, destructor does **not** cleanup). Else `RuntimeException` → OCS **501** `Lock provisioning is only possible using the DBLockingProvider`.

Testing appconfig keys `locking_{lockKey}` store the type string while held.

Rate limits (attributes):

| Method | User | Anon |
| --- | --- | --- |
| `userAndAnonProtected` | 5 / 100s | 1 / 100s |
| `onlyAnonProtected` | (none) | 1 / 10s |

Both `#[PublicPage]` `#[NoCSRFRequired]`. Success: `JSONResponse()` → **200 `[]`/`{}` empty JSON**.

Config: `IConfig::setAppValue(appid, configkey, value)` / `deleteAppValue`. Body `value` string on POST. **No allow-list.** Admin OCS.

## Endpoint walkthrough

### GET rate-limit pair

Public. 200 empty JSON until limiter returns **429**.

`onlyAnonProtected` has **no** `UserRateLimit` — logged-in users are not user-bucket limited; anon bucket still applies to anonymous.

Map 401 is **wrong** (PublicPage).

### POST `testing.Config#setAppValue.post`

`setAppValue($appid, $configkey, $value)`. **200** empty OCS data.

No `NoAdminRequired` → **admin**. CSRF unless `OCS-APIRequest`.

### DELETE `testing.Config#deleteAppValue.delete`

Same admin OCS. **200** even if key missing (PHP `deleteAppValue` does not 404).

### GET `testing.Locking#isLockingEnabled`

Admin OCS. Fake provider available → **200** empty. Else **501**.

### POST/PUT/DELETE/GET lock by user

Params: `{type}` int, `{user}` uid, request `path` (file path inside that user’s folder).

Resolve node → lock key.

| Verb | Behavior | LockedException |
| --- | --- | --- |
| POST acquire | `acquireLock` + store appconfig type | **423** |
| PUT change | `changeLock` + store type | **423** |
| DELETE release | `releaseLock` + delete appconfig key | **423** |
| GET isLocked | if locked → **200**; if **not** locked → **423** empty message | n/a |

User/path missing: **404** OCS `User not found` / `Path not found`.

Trap: **isLocked 423 means “not locked”**, not “is locked”.

### DELETE `testing.Locking#releaseAll.delete`

Optional `{type}`. Iterate testing appconfig keys prefix `locking_`. Release matching type, or all if type null. PHP compares stored type to `LOCK_EXCLUSIVE` / `LOCK_SHARED`; else branch also releases. **200**. Still needs DB locking provider (else 501 via `getLockingProvider`).

### GET `testing.Routes#getRoutesInRoutesPhp`

Admin OCS. `include appinfo/routes.php`.

- App path missing → **404** `[]`
- No `routes.php` → **200** empty data
- Else **200** the PHP return array (`routes` / `ocs` keys)

## Auth / tenant rules

| Group | Auth |
| --- | --- |
| RateLimitTest | **public**. No session. |
| Config, Locking, Routes | **admin** OCS (no `NoAdminRequired`, no `PublicPage`). Anonymous 401. User 403. |

Locks target **another user’s** file path by uid in the URL (admin harness). Config writes **global** appconfig.

Never enable this app in production product config.

## Failure modes

| HTTP (v2) | When |
| --- | --- |
| 200 empty | rate-limit OK; config OK; lock op OK; isLocked true; isLockingEnabled OK; routes.php missing file |
| 401 | anonymous on admin OCS |
| 403 | non-admin OCS |
| 404 | unknown user/path; unknown app for routes |
| 423 | lock conflict **or** isLocked false |
| 429 | rate limit exceeded |
| 501 | locking provider is not DBLockingProvider |
| 405 | wrong method |

Map listed 401/403/404 on rate-limit GET does not match PHP (200/429).

## Conceptual Next.js shape

**Product tree: omit.** If a test double is required:

```
src/server/testing/           # behind NC_ENABLE_TESTING_APP
  rate-limit.ts
  appconfig.ts
  locking.ts
  routesphp.ts
app/apps/testing/...
app/ocs/v2.php/apps/testing/api/v1/...
```

Gate with env. Default off.

## Traps

- Not product; `info.xml` says so
- isLocked inverted 423
- `{type}` on releaseAll may be omitted (`defaults type=null`)
- `path` is not in the URL
- Config can clobber `core` appconfig — tests must use throwaway keys
- Rate-limit map auth/errors are wrong
- `include routes.php` executes PHP — do not eval untrusted apps; only installed app path
- FakeDBLockingProvider skips destructor cleanup — locks persist across requests on purpose

## Do not

- Ship these routes in production Next.js
- Implement fake AI/task providers as part of this slice
- Document this as a customer API
- Invent extra testing endpoints
- Use real user PII in lock paths
- Edit `endpoint-map.yaml` from this skill
- Treat 423 on GET isLocked as “file is locked” without checking PHP (it means **unlocked**)

## Parity notes

Prefer **`parity:waived`** for product slices (`reason`: dev-only testing app, `owner`: harness). If implemented for CI against a legacy instance with `testing` enabled:

Minimum per id: happy, auth (401 admin OCS / 200 public GET), one validation (isLocked unlocked → 423; routes unknown app → 404; setAppValue then delete).

Extras:

| Case | Expect |
| --- | --- |
| GET anonProtected | 200; burst >1 in 10s → 429 |
| GET userAndAnonProtected anon | 200 then 429 on 2nd in 100s |
| POST config as admin | 200; value stored |
| POST config as user | 403 |
| GET lockprovisioning memcache lock | 501 |
| GET isLocked not held | 423 |
| GET routesphp missing app | 404 |
| GET routesphp app without routes.php | 200 empty |

Do not run against production. No secrets in fixtures.

## Repo links

- Routes: `apps/testing/appinfo/routes.php`
- Rate limit: `apps/testing/lib/Controller/RateLimitTestController.php`
- Config: `apps/testing/lib/Controller/ConfigController.php`
- Locking: `apps/testing/lib/Controller/LockingController.php`
- Fake lock: `apps/testing/lib/Locking/FakeDBLockingProvider.php`
- Routes dump: `apps/testing/lib/Controller/RoutesController.php`
- App: `apps/testing/appinfo/info.xml` (warning text)
- Bootstrap extras: `apps/testing/lib/AppInfo/Application.php`
- Map: `docs/feature-map.mdc` → `testing`
