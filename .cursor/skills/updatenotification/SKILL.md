---
name: updatenotification
description: Available app updates + changelog HTTP/OCS. Use when implementing updatenotification credentials, channel, changelog, or applist.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# updatenotification

## Purpose

Admin updater helpers: list which installed apps have store builds for a **future server version**, read changelog markdown, set the update channel, and mint a short-lived `updater.secret` for the web updater.

Depends on `appstore` for store fetch. This slice does not install/enable apps.

## Scope

- HTTP `GET /apps/updatenotification/changelog/{app}`
- HTTP `POST /apps/updatenotification/channel`
- HTTP `GET /apps/updatenotification/credentials`
- OCS `GET /ocs/v{1,2}.php/apps/updatenotification/api/v1/applist/{newVersion}`
- OCS `GET /ocs/v{1,2}.php/apps/updatenotification/api/v1/changelog/{appId}`
- Changelog file parse (`CHANGELOG.{lang}.md` / `CHANGELOG.en.md`)
- `updater.secret` + `core` `updater.secret.created` / `lastupdatedat`

## Non-scope

- Admin settings HTML (`Settings\Admin`) — unmapped
- Notifications / `UpdateAvailableNotifications` / `AppUpdateNotifier` jobs
- OCC `update:check`
- App store list/enable/disable — `appstore`
- Web updater UI (`updater/`)
- Inventing extra channels in the HTTP handler (controller does **not** validate)

## Endpoints owned

Map ids where `feature_ids` contains `updatenotification` (5).

| id | Method | Path | PHP |
| --- | --- | --- | --- |
| `updatenotification.Changelog#showChangelog` | GET | `/apps/updatenotification/changelog/{app}` | `ChangelogController::showChangelog` |
| `updatenotification.Admin#setChannel.post` | POST | `/apps/updatenotification/channel` | `AdminController::setChannel` |
| `updatenotification.Admin#createCredentials` | GET | `/apps/updatenotification/credentials` | `AdminController::createCredentials` |
| `updatenotification-api-get-app-list` | GET | `/ocs/v2.php/apps/updatenotification/api/{apiVersion}/applist/{newVersion}` | `APIController::getAppList` |
| `updatenotification-api-get-app-changelog-entry` | GET | `/ocs/v2.php/apps/updatenotification/api/{apiVersion}/changelog/{appId}` | `APIController::getAppChangelogEntry` |

OCS `apiVersion` requirement: **`v1` only**. `ocs_version: both` refers to `/ocs/v1.php` vs `/ocs/v2.php` prefixes. Envelope: `bp-ocs-envelope`.

## Key types / entities

`UpdateNotificationApp`: `{ appId: string, appName: string }`

Changelog lookup (`Manager::getChangelog`):

1. Language = current user language (OCS/HTML). File try `CHANGELOG.{lang}.md` then `CHANGELOG.en.md` under the app path.
2. Headings `## ` optional `[` optional `v` then `(\d+\.\d+(\.\d+)?)`.
3. `version_compare(match, requested, '==')`. First matching section through next heading.

OCS changelog strips the first line (version headline) via `explode("\n", $changes, 2)` + `trim(end)`.

HTML changelog does the same; missing file → `''` not 404.

`appsShippedInFutureVersion` (exclude from applist even if not `isShipped`):

```
bruteforcesettings 25, suspicious_login 25, twofactor_totp 25,
files_downloadlimit 29, twofactor_nextcloud_notification 30,
app_api 30, files_lock 34, office 34
```

`updater.secret`: 64-char `ISecureRandom::generate(64)` stored as `password_hash(..., PASSWORD_DEFAULT)` in **system** config. Plain token returned once. `core` `updater.secret.created` = unix time. `ResetToken` job deletes after **172800** s (48h) unless `config_is_read_only`.

Channel POST: `$serverVersion->setChannel($channel)` then `core` `lastupdatedat` = **0**. No allow-list in the controller. Admin UI lists `daily|beta|stable|production` (+ `git` if current is git). PHPDoc on `setChannel` mentions `enterprise` — **do not enforce**; match PHP pass-through.

## Endpoint walkthrough

### GET `updatenotification.Changelog#showChangelog`

`#[NoAdminRequired]` `#[NoCSRFRequired]`. Query `version` optional.

`version ??= getAppVersion(app)`. Initial state `{ appName, appVersion, text }` where `appName` from `getAppInfo` `name` or app id. Template `empty` + changelog JS/CSS.

Always **200 HTML**. Unknown app → empty text, name = id.

### POST `updatenotification.Admin#setChannel.post`

Default Controller → **admin**. CSRF unless exempt. Body `channel` string.

**200 JSON** `{ status: 'success', data: { message: <l10n Channel updated> } }`. Not OCS.

### GET `updatenotification.Admin#createCredentials`

Admin. **200 JSON** = **raw token string** as DataResponse payload (not `{status,data}`).

If `upgrade.disable-web` or `config_is_read_only` → **403** `{ status: 'error', message: <l10n> }`.

Else: enqueue `ResetToken`, set `updater.secret.created`, hash+store secret, log warning `Created new updater.secret`.

### GET `updatenotification-api-get-app-list`

OCS. **No `NoAdminRequired`** → **admin**. `{apiVersion}`=`v1`, `{newVersion}` = target server version string.

1. `appstoreenabled` system false (default true) → **404** `{ appstore_disabled: true }`
2. Enabled apps with a path, **not shipped**, **not** in `appsShippedInFutureVersion`
3. If that set empty → **200** `{ missing: [], available: [] }`
4. `AppFetcher->setVersion(newVersion, 'future-apps.json', false)` then `get()` ids
5. If store list empty → **404** `{ appstore_disabled: false, already_on_latest: false }`
6. Drop apps whose path contains `/.git`
7. `missing` = installed − store; `available` = intersection
8. Map each id → `{ appId, appName }` via `getAppInfo($id, lang: 'en')` — **`getLanguage()` is never called from this method; names are English**
9. `sort()` both lists. **200** `{ missing, available }`

### GET `updatenotification-api-get-app-changelog-entry`

OCS admin. Query `version` optional (else installed app version).

1. `preg_match('/^(\d+\.\d+(\.\d+)?)/', $version)` fail → **400** `[]`
2. Lookup changelog with **short** version (`1.2.0-alpha.1` → `1.2.0`)
3. Miss → **404** `[]`
4. Strip headline. **200** `{ appName, content, version }` where `version` is the **original** request/installed string (pre-release kept)

## Auth / tenant rules

| Route | Auth |
| --- | --- |
| Changelog HTML | logged-in any user (`NoAdminRequired`). Anonymous → login/401 per middleware (map 401). |
| channel, credentials | **admin** + CSRF on POST |
| OCS applist/changelog | **admin** OCS. Map `auth: mixed` is wrong for anonymous → 401. Non-admin → 403. |

`updater.secret` is instance-global. Changelog language is the **caller**.

## Failure modes

| Condition | Result |
| --- | --- |
| Anonymous OCS / admin HTTP | 401 |
| Non-admin OCS / channel / credentials | 403 |
| App store disabled | 404 `{ appstore_disabled: true }` |
| Store fetch empty | 404 `{ appstore_disabled: false, already_on_latest: false }` |
| No custom apps | 200 empty lists (not 404) |
| Bad changelog version | 400 `[]` |
| No changelog entry (OCS) | 404 `[]` |
| No changelog (HTML) | 200 empty `text` |
| Web updater disabled / config RO | 403 credentials |
| `apiVersion` not v1 | 404 route miss |
| Wrong method | 405 |

## Conceptual Next.js shape

```
src/server/updatenotification/
  types.ts
  changelog.ts        # file parse + headline strip
  applist.ts          # filters + store port
  channel.ts
  updater-secret.ts   # hash, ttl 48h
app/apps/updatenotification/changelog/[app]/route.ts
app/apps/updatenotification/channel/route.ts
app/apps/updatenotification/credentials/route.ts
app/ocs/v2.php/apps/updatenotification/api/v1/applist/[newVersion]/route.ts
app/ocs/v2.php/apps/updatenotification/api/v1/changelog/[appId]/route.ts
```

Stub store fetcher. Do not talk to updates.nextcloud.com in parity.

## Traps

- Credentials success body is a **JSON string**, not `{token}`
- Channel success is `{status,data.message}` JSON, not OCS
- HTML changelog never 404s; OCS changelog does
- Applist names forced `en`
- 404 applist has two shapes (store off vs empty fetch)
- Empty custom apps is **200**
- `.git` apps excluded only after store fetch succeeds
- OCS `version` query is full string; lookup uses short numeric prefix
- `already_on_latest` is **always false** in the empty-fetch 404 (PHP does not detect “already latest”)
- Map 403 on OCS changelog: admin gate, not “no changelog” (that is 404)

## Do not

- Implement appstore enable/install here
- Call live updater_server from this slice
- Validate channel names
- 404 HTML changelog
- Return hashed secret to the client
- Put credentials JSON in OCS envelope
- Edit `endpoint-map.yaml` from this skill

## Parity notes

Minimum per id: happy, 401 anonymous, one validation (OCS changelog `version=nope` → 400; or credentials with `upgrade.disable-web` → 403).

Extras:

| Case | Expect |
| --- | --- |
| GET changelog HTML unknown app | 200 HTML; initial state `text` `''` |
| POST channel as admin | 200 `{ status: 'success', ... }` |
| GET credentials as admin | 200 JSON string length 64 |
| GET credentials web updater off | 403 |
| GET applist store off | 404 `appstore_disabled: true` |
| GET applist no custom apps | 200 empty arrays |
| GET OCS changelog pre-release version | 200 `version` preserves suffix; content from short version |
| GET OCS changelog missing | 404 `[]` |
| v1 vs v2 OCS | same data |

No PII. Do not assert notification jobs.

## Repo links

- OCS: `apps/updatenotification/lib/Controller/APIController.php`
- Admin HTTP: `apps/updatenotification/lib/Controller/AdminController.php`
- HTML changelog: `apps/updatenotification/lib/Controller/ChangelogController.php`
- Parse: `apps/updatenotification/lib/Manager.php`
- Types: `apps/updatenotification/lib/ResponseDefinitions.php`
- Routes: `apps/updatenotification/appinfo/routes.php`
- Secret TTL: `apps/updatenotification/lib/BackgroundJob/ResetToken.php`
- Tests: `apps/updatenotification/tests/Controller/{APIController,AdminController}Test.php`
- OpenAPI: `apps/updatenotification/openapi.json`
- Adjacent settings: `apps/updatenotification/lib/Settings/Admin.php`
- Map: `docs/feature-map.mdc` → `updatenotification`
