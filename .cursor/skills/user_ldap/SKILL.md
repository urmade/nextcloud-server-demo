---
name: user_ldap
description: LDAP config OCS, wizard actions, and renew-password HTML. Use when implementing or testing user_ldap config/wizard/renewpassword.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# user_ldap

## Purpose

Admin OCS for LDAP/AD **server configuration prefixes**, wizard probes, mapping wipe; plus public **renew-password** HTML when LDAP ppolicy demands a reset.

Depends on `core-login`. Do not start before session + OCS envelope + CSRF exist.

## Scope

- OCS `/ocs/v{1,2}.php/apps/user_ldap/api/v1/config` CRUD + copy + test
- OCS wizard `POST .../wizard/{configID}/{wizardAction}` and `POST .../wizard/clearMappings`
- HTTP renew-password GET/POST under `/apps/user_ldap/renewpassword*`

## Non-scope

- Live bind to a real LDAP server in parity (stub `Connection::bind` / wizard results)
- `occ ldap:*` (`ShowConfig`, `SetConfig`, `TestConfig`, `CreateEmptyConfig`, `Search`, …)
- Settings HTML (`Settings\Admin` form) except as a client of the OCS APIs
- User/group backends (`User_LDAP`, `Group_LDAP`) beyond what config/wizard/renew need
- Provisioning user CRUD (`provisioning_api`)
- `files_external` LDAP home-attribute handler

## Key types / entities

| Name | Notes |
| --- | --- |
| Config prefix / `configID` | String. Historical first server may be `''`. New prefixes from `Helper::getNextServerConfigurationPrefix`: if none, `'s01'`; else `'s' + padded (lastNumber+1)` (`s01`, `s02`, …). Stored in appconfig `user_ldap` / `configuration_prefixes`. |
| Config keys | CamelCase `Configuration` properties. `modify` only writes keys present in `getConfigTranslationArray()` **values** (e.g. `ldapHost`, not `ldap_host`). Unknown body keys ignored. |
| Array fields | `show` implodes arrays with `;`. Examples: `ldapBase`, filter objectclass lists, search attributes. |
| `ldapAgentPassword` | `showPassword=false` (default) → `'***'`. `showPassword=true` → stored secret. |
| `ldapConfigurationActive` | create() forces **false**. test() temporarily treats inactive as active (`'1'`) for bind. |
| Wizard result | `{ changes: { [key]: int\|string\|list }, options?: { [key]: string[] } }` from `WizardResult::getResultArray`. `options` omitted when empty. |
| Wizard actions (allowlist) | `guessPortAndTLS`, `guessBaseDN`, `detectEmailAttribute`, `detectUserDisplayNameAttribute`, `determineGroupMemberAssoc`, `determineUserObjectClasses`, `determineGroupObjectClasses`, `determineGroupsForUsers`, `determineGroupsForGroups`, `determineAttributes`, `getUserListFilter`, `getUserLoginFilter`, `getGroupFilter`, `countUsers`, `countGroups`, `countInBaseDN`, `testLoginName` |
| Mapping subject | `'user'` or `'group'` only |
| Renew flag | userconfig `{uid}` / `user_ldap` / `needsPasswordReset` bool. Set by `LoginListener` when ppolicy grace/pwdReset and `turnOnPasswordChange === 1`. |
| Session flashes | `renewPasswordMessages` = `[errors[], messages[]]`; `loginMessages` same shape for core login |

`AuthorizedAdminSetting(settings: OCA\User_LDAP\Settings\Admin::class)`: full admin **or** delegated LDAP settings admin.

## Endpoints owned

Map rows whose first `feature_ids` is `user_ldap` (12). OCS `ocs_version: both`; v2 path canonical.

### Renew password (HTTP, not OCS) — `#[PublicPage]`

| id | method | path |
| --- | --- | --- |
| `user_ldap.renewPassword#tryRenewPassword.post` | POST | `/apps/user_ldap/renewpassword` |
| `user_ldap.renewPassword#showRenewPasswordForm` | GET | `/apps/user_ldap/renewpassword/{user}` |
| `user_ldap.renewPassword#cancel` | GET | `/apps/user_ldap/renewpassword/cancel` |
| `user_ldap.renewPassword#showLoginFormInvalidPassword` | GET | `/apps/user_ldap/renewpassword/invalidlogin/{user}` |

### Config OCS — `/ocs/v2.php/apps/user_ldap/api/v1/config`

| id | method | path |
| --- | --- | --- |
| `user_ldap-configapi-create` | POST | `.../config` |
| `user_ldap-configapi-show` | GET | `.../config/{configID}` query `showPassword` |
| `user_ldap-configapi-modify` | PUT | `.../config/{configID}` body `{configData}` |
| `user_ldap-configapi-delete` | DELETE | `.../config/{configID}` |
| `user_ldap-configapi-test-configuration` | POST | `.../config/{configID}/test` |
| `user_ldap-configapi-copy-configuration` | POST | `.../config/{configID}/copy` |

`configID` requirement `.*`, default `''` (empty prefix is a valid id).

### Wizard OCS

| id | method | path |
| --- | --- | --- |
| `user_ldap-wizard-action` | POST | `.../wizard/{configID}/{wizardAction}` body `{loginName?}` |
| `user_ldap-wizard-clear-mappings` | POST | `.../wizard/clearMappings` body `{subject}` |

## Endpoint walkthrough

### Create — `user_ldap-configapi-create`

`POST .../config`. Next prefix, `Configuration` with `ldapConfigurationActive = false`, save. 200 `{configID}`. Unexpected error → `OCSException` `'An issue occurred when creating the new config.'` (code 0 → OCS **999**, HTTP 500 on v2).

### Show — `user_ldap-configapi-show`

Missing prefix → `OCSNotFoundException` `'Config ID not found'` (HTTP 404 / OCS 404). Else configuration object; arrays joined by `;`; password masked unless `showPassword` true. Unexpected → same 999 string as modify (`'An issue occurred when modifying the config.'` — copy-paste in PHP).

### Modify — `user_ldap-configapi-modify`

`configData` not array → `OCSBadRequestException` `'configData is not properly set'` (400). Then assign known camelCase keys, `saveConfiguration`, `connectionFactory->get($configID)->clearCache()`, return **show(configID, false)** (password always `***` after write).

### Delete — `user_ldap-configapi-delete`

Unknown id → 404. `deleteServerConfiguration` false → `OCSException` `'Could not delete configuration'` (999). Empty prefix delete must not drop keys starting with `s`. Never delete appconfig keys `enabled`, `installed_version`, `types`, `bgjUpdateGroupsLastRun`.

### Test — `user_ldap-configapi-test-configuration`

Always HTTP 200 on handled outcomes (do **not** map bind failure to 4xx):

| Result | `success` | `message` (l10n) |
| --- | --- | --- |
| `ConfigurationIssueException` | false | `Invalid configuration: %s` + hint |
| `bind()` false | false | Valid configuration, but binding failed. Please check the server settings and credentials. |
| AD anonymous-bind probe LDAP error code 1 | false | Invalid configuration: Anonymous binding is not allowed. |
| else | true | Valid configuration, connection established! |

Forces `ldap_configuration_active = '1'` in the in-memory conf for the test even if stored inactive. Unknown id → 404. Unexpected → `'An issue occurred when testing the config.'` (999).

### Copy — `user_ldap-configapi-copy-configuration`

New prefix via `Configuration($newPrefix, false)` (do not auto-read empty), `setConfiguration(original.getConfiguration())`, save. 200 `{configID}` new prefix. 404 if source missing.

### Wizard action — `user_ldap-wizard-action`

Allowlisted method on `Wizard`. `false` return → `OCSException` empty message (999). Thrown exceptions → `OCSException` with `$e->getMessage()`.

`testLoginName`: `loginName` null or `''` → `'No login name passed'`.

Unknown action → `'Action ' . $wizardAction . 'does not exist'` (**no space** before `does`).

Success 200 `WizardResult` array (`changes` required; `options` optional).

### Clear mappings — `user_ldap-wizard-clear-mappings`

- `subject=user`: `UserMapping::clearCb` with `BeforeUserIdUnassignedEvent` + `UserIdUnassignedEvent` and legacy `\OC\User` pre/post `UnassignedUserId` hooks
- `subject=group`: `GroupMapping::clear()`
- else: `'Unsupported subject ' . $subject`

`clear`/`clearCb` false → l10n `Failed to clear the mappings.` Outer catch logs and returns generic `'An issue occurred.'` (999) — **including** the unsupported-subject `OCSException` (it is not rethrown; it is swallowed). Match PHP: unsupported subject currently surfaces as `'An issue occurred.'`.

### Renew password HTML

All `#[PublicPage]`. `OpenAPI::SCOPE_IGNORE`.

**cancel** (`NoCSRFRequired`): 302/303 to absolute `core.login.showLoginForm`.

**showRenewPasswordForm** (`NoCSRFRequired`, `UseSession`): if `needsPasswordReset` false → redirect login. Else pull/clear `renewPasswordMessages`, initial state:

```
renewPasswordParameters: {
  user, errors, messages,
  cancelRenewUrl: absolute login,
  tryRenewPasswordUrl: absolute user_ldap.renewPassword.tryRenewPassword
}
```

Guest template `user_ldap` / `renewpassword` (`renderAs: guest`). Assets `renewPassword` style+script.

**tryRenewPassword** (`UseSession`, CSRF **required**, `BruteForceProtection(action: login)`): if no reset flag → login redirect. `checkPassword(user, oldPassword)` false → session `renewPasswordMessages = [['invalidpassword'], []]`, throttle `{user}`, redirect show form. Else `OC_User::setPassword(user, newPassword)`: success → `loginMessages = [[], [l10n Please login with the new password]]`, clear flag, redirect login with `user`. `newPassword` null or setPassword false → `[['internalexception'], []]` back to form. `HintException` → `[[], [hint]]` back to form.

**showLoginFormInvalidPassword** (`NoCSRFRequired`, `UseSession`): `loginMessages = [['invalidpassword'], []]`, redirect login (`user` query if provided).

Register static `/renewpassword/cancel` and `/renewpassword/invalidlogin/{user}` **before** `/renewpassword/{user}` so `cancel` is not a uid.

## Auth / tenant

| Surface | Auth |
| --- | --- |
| Config + wizard OCS | logged-in **admin or delegated LDAP settings** (`AuthorizedAdminSetting`). 401 unauth, 403 logged-in without that setting |
| Renew HTTP | public; no login. CSRF on POST tryRenewPassword only |
| Tenant | prefixes are instance-global appconfig, not per-user |

OCS: `OCS-APIRequest: true`, `?format=json`. v1 success meta 100 / HTTP 200; v2 success meta 200 / HTTP 200. v1 errors stay HTTP 200 with OCS code; v2 maps 400/403/404/500.

## Failure modes

| OCS/HTTP | Cause |
| --- | --- |
| 200 `{success:false}` | test() bind/config failure (not 4xx) |
| 400 | `configData` not array |
| 401 / 997 | anonymous OCS |
| 403 | non-admin OCS |
| 404 | unknown `configID` |
| 999 / HTTP 500 v2 | generic `OCSException` (code 0), wizard false, unexpected |
| 302 | renew-password redirects |
| throttle | wrong old password on renew POST |

Do not invent extra OCS codes.

## Conceptual Next.js shape

```
src/server/ldap/
  prefixes.ts         # s01… registry + appconfig-shaped records
  config.ts           # show/modify/mask password
  test.ts             # stub bind outcomes
  wizard.ts           # allowlist → canned WizardResult
  mappings.ts         # user/group mapping tables
  renew-password.ts   # needsPasswordReset + session flashes
app/ocs/v2.php/apps/user_ldap/api/v1/config/[[...path]]/route.ts
app/ocs/v2.php/apps/user_ldap/api/v1/wizard/[[...path]]/route.ts
app/apps/user_ldap/renewpassword/[[...path]]/route.ts
```

Stub LDAP: do not open sockets. Wizard happy path returns a `changes` object; do not scrape a directory.

## Traps

- `modify` keys are **camelCase property names**, not `ldap_host` db keys.
- `show` after `modify` always masks password.
- Empty `configID` is legal.
- test() 200 + `success:false` is the contract.
- Unknown wizard action string lacks a space: `Action {name}does not exist`.
- `clearMappings` catch-all turns `OCSException` into generic 999 (including bad subject).
- Renew POST is public but **CSRF-protected**.
- `LoginListener` is not a mapped endpoint; it only sets `needsPasswordReset` and redirects. Parity can seed the flag.

## Do-not

- Do not call a real LDAP server.
- Do not implement `occ ldap:*` or the settings Vue as this slice's contract.
- Do not expose `ldapAgentPassword` unless `showPassword` is true.
- Do not treat test bind failure as HTTP 400.
- Do not start this before `core-login`.
- Do not mix with `provisioning_api` user create.

## Parity notes

Minimum: happy, unauthenticated 401/997, one 403 or validation.

| Case | Expectation |
| --- | --- |
| POST create | 200 `{configID}` like `s01` / next |
| GET unknown id | 404 Config ID not found |
| GET show default | `ldapAgentPassword` === `***` |
| GET show `showPassword=true` | password not `***` |
| PUT `configData` string | 400 |
| PUT `ldapHost` | show reflects host; password still `***` |
| POST test stub fail bind | 200 `{success:false, message}` |
| POST wizard unknown action | 999, message contains `does not exist` glued to action |
| POST wizard `testLoginName` without body | `No login name passed` |
| POST clearMappings `subject=nope` | 999 `An issue occurred.` |
| GET renew form without flag | redirect login |
| POST renew wrong password | redirect form + throttle |
| GET `/renewpassword/cancel` | redirect login, not a form for user `cancel` |
| logged-in non-admin OCS | 403 |
| missing `format=json` | still routable; tests use json |

Prefix strings and wizard `changes` contents: shape + allowlist; do not freeze probe payloads unless matching a recorded fixture.

## Repo paths

- HTTP routes: `apps/user_ldap/appinfo/routes.php`
- Config OCS: `apps/user_ldap/lib/Controller/ConfigAPIController.php`
- Wizard OCS: `apps/user_ldap/lib/Controller/WizardController.php`
- Renew: `apps/user_ldap/lib/Controller/RenewPasswordController.php`
- Config model: `apps/user_ldap/lib/Configuration.php` (`getConfigTranslationArray`)
- Prefix helper: `apps/user_ldap/lib/Helper.php`
- Wizard: `apps/user_ldap/lib/Wizard.php`, `WizardResult.php`
- Ppolicy redirect: `apps/user_ldap/lib/LoginListener.php`
- Settings gate: `apps/user_ldap/lib/Settings/Admin.php`
- OpenAPI: `apps/user_ldap/openapi.json`
- Template: `apps/user_ldap/templates/renewpassword.php`
- Tests: `apps/user_ldap/tests/` (no Controller tests; LoginListener + Configuration)
