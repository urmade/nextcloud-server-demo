---
name: appstore
description: Admin OCS app catalog, enable/disable/uninstall/update, and bundle enable. Use when implementing or testing /apps/appstore/api/v1.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# appstore

## Purpose

Admin OCS for the shipped **App store** app (`OCA\Appstore`): list categories/apps from the store fetcher + local installs, enable (download/install), disable, uninstall, update, enable a named bundle.

Depends on `provisioning_api` (installed-app enable/disable OCS is a **different** surface). Do not start before admin session + OCS + password confirmation exist.

## Scope

- `GET /ocs/v{1,2}.php/apps/appstore/api/v1/apps/categories`
- `GET /ocs/v{1,2}.php/apps/appstore/api/v1/apps`
- `POST .../apps/enable|disable|uninstall|update`
- `POST .../bundles/enable`

## Non-scope

- HTML `/settings/apps/{category}/{id}` (`PageController::viewApps`) — not in the feature map
- `provisioning_api` `/cloud/apps` list/enable/disable/info
- `updatenotification` changelog / channel APIs
- `occ app:*` CLI
- AppAPI ExApp catalog (PageController talks to AppAPI only for HTML initial state)
- Pixel-perfect Vue apps-management UI
- Calling production `https://apps.nextcloud.com` from parity unless `LEGACY_BASE_URL` / explicit network is on — stub `AppFetcher` / `CategoryFetcher`

## Key types / entities

| Name | Notes |
| --- | --- |
| Category | `{ id: string, displayName: string }`. `displayName` from `translations[$lang]['name']` else `translations.en.name`. `$lang = substr(findLanguage(), 0, 2)`. |
| App list row | At least `id`, `name`, `groups` (array), `internal` (always-enabled), `isCompatible`, `missingDependencies` (list). Many more keys from local `OC_App::listAllApps` merge + store (`description`, `summary`, `license`, `author`, `shipped`, `version`, `types`, `documentation`, `website`, `bugs`, `dependencies`, `level`, `screenshot`, ratings, `removable`, `active`, `needsDownload`, `app_api`, `bundleIds`, optional `update`, `appstore`, `category`, `releases`, optional `appstoreData`). |
| `groups` | Local apps: JSON string in appconfig `enabled` decoded to array (scalar JSON → one-element array). Store-only: `enabled` value if not `yes`/`no`. Always array on the way out. |
| `internal` | `in_array(id, AppManager::getAlwaysEnabledApps())` |
| `update` | set only when `Installer::isUpdateAvailable` returns a version string |
| `screenshot` | `https://usercontent.apps.nextcloud.com/` + `base64_encode(url)`; empty string if no url |
| `level` | featured store app → 200 else 100; subscription-supported overlay `OC_App::supportedApp` |
| `app_install_overwrite` | **system** config array of app ids that ignore max-version. Non-array → log warning, treat `[]` |
| Bundle id | PHP class short name: `EnterpriseBundle`, `HubBundle`, `GroupwareBundle`, `SocialSharingBundle`, `EducationBundle`, `PublicSectorBundle` (`Bundle::getIdentifier`) |
| Installed bundles | appconfig `core` / `installed.bundles` JSON array of those identifiers |
| Enable result | `{ update_required: bool }` from `AppManager::isUpgradeRequired` |
| App id cleaning | `AppManager::cleanAppId`: strip via `preg_replace('/(^[0-9_-]+|[^a-z0-9_-]+|[_-]+$)/', '', $app)` |

Shipped apps in `getAlwaysEnabledApps()` are **skipped** when overlaying store records (avoid stale store rows).

System: `appstoreenabled` default true; `appstoreurl` default `https://apps.nextcloud.com/api/v1`. List still runs if store fetch returns empty.

## Endpoints owned

Map rows whose first `feature_ids` is `appstore` (7). `ocs_version: both`. OpenAPI: “requires admin access”.

| id | method | path | body |
| --- | --- | --- | --- |
| `appstore-api-list-categories` | GET | `/ocs/v2.php/apps/appstore/api/v1/apps/categories` | — |
| `appstore-api-list-apps` | GET | `/ocs/v2.php/apps/appstore/api/v1/apps` | query `details` bool |
| `appstore-api-enable-app` | POST | `.../apps/enable` | `{ appId, groups?: string[], force?: bool }` |
| `appstore-api-disable-app` | POST | `.../apps/disable` | `{ appId }` |
| `appstore-api-uninstall-app` | POST | `.../apps/uninstall` | `{ appId }` |
| `appstore-api-update-app` | POST | `.../apps/update` | `{ appId }` |
| `appstore-api-enable-bundle` | POST | `.../bundles/enable` | `{ bundleId }` |

No `NoAdminRequired` → **admin only** (not delegated appstore settings). `#[OpenAPI(scope: ADMINISTRATION)]`.

Password confirmation:

| Route | `PasswordConfirmationRequired` |
| --- | --- |
| enable, uninstall, update, enableBundle | `strict: true` — Basic password on **this** request |
| disable | `strict: false` — confirmation within ~30 minutes |

## Endpoint walkthrough

### Categories — `appstore-api-list-categories`

`CategoryFetcher::get()`, map id + translated name. 200 list. No store → empty list, still 200.

### List apps — `appstore-api-list-apps`

1. Local `OC_App::listAllApps()` → `installed: true`, screenshot proxied if present.
2. Store apps for category `''` (all). Skip ids in always-enabled. Set `appstore: true`. Merge store into local by id (`array_merge(store, local)` so local wins on conflicts).
3. Subscription `delegateGetSupportedApps` may set `level`.
4. Bundles: each matching app gets `bundleIds[]`.
5. Per app: if `appstoreData` present, set `screenshot` / `category` / `releases`; **unset `appstoreData` unless `details=true`**.
6. `update` from installer; normalize `groups`; `missingDependencies` + `isCompatible` via `DependencyAnalyzer` (`ignoreMax` from `app_install_overwrite`); `internal`.
7. `usort` by `name` (`<=>`).

`details` query/body bool default false.

### Enable — `appstore-api-enable-app`

`cleanAppId`. `force` → `overwriteNextcloudRequirement`. If not `isDownloaded`, `downloadApp`. `installApp`. If `groups !== []`, resolve existing groups via `IGroupManager::get` (skip missing) and `enableAppForGroups`; else `enableApp`. 200 `{update_required}`. Any `Throwable` → log, `OCSException('could not enable app', 500)`.

### Disable — `appstore-api-disable-app`

`cleanAppId`, `removeOverwriteNextcloudRequirement`, `disableApp`. Always-enabled throws `"$appId can't be disabled."` → 500 `could not disable app`. 200 `{}`.

### Uninstall — `appstore-api-uninstall-app`

If `isEnabledForAnyone`, call `disableApp` (same as disable endpoint). `Installer::removeApp`: false for shipped or not downloaded → 500 `could not remove app`. Success: remove overwrite, `clearAppsCache`, 200 `{}`.

### Update — `appstore-api-update-app`

Sets system `maintenance` **true**, `updateAppstoreApp`, then `maintenance` false. Failure (false or exception): still clears maintenance, 500 `could not update app`. Do not leave maintenance on.

### Enable bundle — `appstore-api-enable-bundle`

`getBundleByIdentifier` throws `BadMethodCallException` → `OCSNotFoundException('Bundle not found')` (404). Else `maintenance` true, `installAppBundle` (download/install/enable each app id, append identifier to `core`/`installed.bundles`), `finally` maintenance false. Other exceptions → 500 `could not enable bundle`.

## Auth / tenant

| Who | Access |
| --- | --- |
| Anonymous | 401 / 997 |
| Logged-in non-admin | 403 (“must be an admin”) |
| Admin | all seven routes |
| Strict password confirm | enable / uninstall / update / enableBundle |
| Non-strict confirm | disable |

Single-instance app list. Group-restricted enable uses real group ids; unknown group ids are skipped (not an error).

## Failure modes

| HTTP/OCS | Cause |
| --- | --- |
| 401 / 997 | anonymous |
| 403 | non-admin; missing/expired password confirmation |
| 404 | unknown `bundleId` |
| 500 | enable/disable/uninstall/update/bundle install failures; disable always-enabled; uninstall shipped |

Success enable is 200 with `{update_required}`, not 201. Disable/uninstall/update/bundle success data is `[]`/`{}`.

## Conceptual Next.js shape

```
src/server/appstore/
  catalog.ts          # stub categories + apps; sort by name
  install.ts          # local enabled/disabled/groups; cleanAppId
  bundles.ts          # six identifiers + app id lists from Bundle.php
  maintenance.ts      # system maintenance flag around update/bundle
app/ocs/v2.php/apps/appstore/api/v1/apps/route.ts
app/ocs/v2.php/apps/appstore/api/v1/apps/categories/route.ts
app/ocs/v2.php/apps/appstore/api/v1/apps/enable/route.ts
app/ocs/v2.php/apps/appstore/api/v1/apps/disable/route.ts
app/ocs/v2.php/apps/appstore/api/v1/apps/uninstall/route.ts
app/ocs/v2.php/apps/appstore/api/v1/apps/update/route.ts
app/ocs/v2.php/apps/appstore/api/v1/bundles/enable/route.ts
```

Stub store JSON; do not require network. Do not clone `Installer` download/zip logic — mark downloaded/enabled in the compatibility store.

`HubBundle` app list is architecture-dependent (`richdocuments` / `richdocumentscode` on Linux x86_64/aarch64). Match PHP `php_uname('m')` when claiming bundle contents; parity can fixture one arch.

## Traps

- This is **not** `/ocs/.../cloud/apps` (`provisioning_api`).
- List sort is by **name**, not id.
- `details=false` drops `appstoreData` but keeps `releases`/`category`/`screenshot`.
- Screenshot host is `usercontent.apps.nextcloud.com` + base64 of the **original** url (no extra decode).
- `cleanAppId` is AppManager’s regex, not `OC_App::cleanAppId` (which only strips `<>"'/\`).
- Update/bundle **always** clear `maintenance`, including failure (`finally` / catch).
- Enable with `groups: []` is global enable, not “enable for nobody”.
- Disable always-enabled → 500, not 403.
- Uninstall of shipped `removeApp` → false → 500 `could not remove app`.
- CSRF + `OCS-APIRequest` + admin middleware + password confirm.

## Do-not

- Do not implement `/settings/apps` HTML in this slice.
- Do not proxy `/cloud/apps` here.
- Do not hit the live app store from unit/parity unless explicitly configured.
- Do not skip strict password confirmation on enable/uninstall/update/bundle.
- Do not leave `maintenance=true` after update/bundle errors.
- Do not allow non-admins.
- Do not disable always-enabled apps “successfully”.
- Do not invent bundle ids; use the six class short names.

## Parity notes

Minimum: happy, 401/997, 403.

| Case | Expectation |
| --- | --- |
| GET categories as admin | 200 array of `{id,displayName}` |
| GET apps `details=false` | no `appstoreData`; `groups` is array; sorted by name |
| GET apps `details=true` | `appstoreData` present for store-backed apps |
| GET as user | 403 |
| POST enable missing password confirm | 403 |
| POST enable stubbed app | 200 `{update_required: bool}` |
| POST disable always-enabled (e.g. `files` if always-enabled in fixture) | 500 could not disable app |
| POST uninstall shipped | 500 could not remove app |
| POST update exception | maintenance false after; 500 could not update app |
| POST bundle unknown | 404 Bundle not found |
| POST bundle `HubBundle` | 200; apps from that bundle enabled in stub |
| GET `/cloud/apps` | **not this feature** |

Store ratings, screenshots, and `missingDependencies` strings: shape only unless using recorded fixtures.

## Repo paths

- Controller: `apps/appstore/lib/Controller/ApiController.php`
- HTML (out of scope): `apps/appstore/lib/Controller/PageController.php`
- Bootstrap: `apps/appstore/lib/AppInfo/Application.php`
- OpenAPI: `apps/appstore/openapi.json`
- Installer: `lib/private/Installer.php`
- Bundles: `lib/private/App/AppStore/Bundles/`
- Fetchers: `lib/private/App/AppStore/Fetcher/AppFetcher.php`, `CategoryFetcher.php`
- `cleanAppId` / always-enabled: `lib/private/App/AppManager.php`
- System keys: `config/config.sample.php` (`appstoreenabled`, `appstoreurl`, `app_install_overwrite`)
- Tests: `apps/appstore/tests/Controller/PageControllerTest.php` (page only; API untested — ground in `ApiController.php`)
