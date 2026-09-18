---
name: provisioning_api
description: OCS users/groups/apps/config plus mail-verify HTML. Use when implementing or testing provisioning_api, /cloud/users, /cloud/groups, /cloud/apps, or provisioning config/preferences.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# provisioning_api

## Purpose

OCS admin/subadmin/self-service surface for users, groups, installed apps, appconfig, and current-user preferences. Clients (desktop, occ wrappers, user-management UI) call `/ocs/v{1,2}.php/cloud/*` and `/ocs/v{1,2}.php/apps/provisioning_api/api/v1/config/*`. Mail verification is HTML, not OCS.

Depends on `core-login`. Do not start this slice before session + Basic/Bearer auth exist.

## Scope

- OCS users CRUD, enable/disable, wipe devices, welcome mail, group membership, subadmin assignment
- OCS groups CRUD + membership listing
- OCS installed-app list/enable/disable/info (`/cloud/apps`)
- OCS appconfig get/set/delete
- OCS current-user preferences get/set/delete
- HTTP mail verification GET/POST

## Non-scope

- `provisioning_api-users-search-by-phone-numbers` — map owns this under `core`
- App store catalog/install/uninstall (`appstore`)
- Settings HTML user-management pages (`settings.Users#*`)
- Profile OCS (`profile`)
- LDAP wizard (`user_ldap`)
- Inventing extra account fields not on `Provisioning_APIUserDetails`

## Key types / entities

From `apps/provisioning_api/lib/ResponseDefinitions.php` and `AUserDataOCSController`:

| Name | Shape / values |
| --- | --- |
| `Provisioning_APIUserDetails` | `id`, `displayname` + `display-name` (same value), `email`, `additional_mail[]`, `groups[]`, `subadmin[]`, `quota` object, `enabled?`, `backend`, `backendCapabilities.{setDisplayName,setPassword}`, account properties (`phone`, `address`, `website`, `twitter`, `bluesky`, `fediverse`, `organisation`, `role`, `headline`, `biography`, `profile_enabled`, `pronouns`), `language`, `locale`, `timezone`, `manager`, `notify_email`, `firstLoginTimestamp`, `lastLoginTimestamp`, `lastLogin` (ms), optional `storageLocation` (admin/delegated only), optional `*Scope` when caller is self |
| `Provisioning_APIUserDetailsQuota` | `free?`, `quota?`, `relative?`, `total?`, `used?` |
| `Provisioning_APIUserDetailsScope` | `v2-private` \| `v2-local` \| `v2-federated` \| `v2-published` |
| `Provisioning_APIGroupDetails` | `id`, `displayname`, `usercount`, `disabled`, `canAdd`, `canRemove` |
| Edit field keys (`AUserDataOCSController`) | `display`, `language`, `locale`, `timezone`, `first_day_of_week`, `password`, `quota`, `manager`, `notify_email`; plus `IAccountManager` property ids and `{property}Scope` |
| Multi-value collections | PUT `/users/{userId}/{collectionName}` where `collectionName` is `^(?!enable$|disable$)[a-zA-Z0-9_]*$` (must not collide with enable/disable) |

Capability document (`apps/provisioning_api/lib/Capabilities.php`) — authenticated capabilities only:

```
provisioning_api: {
  version: <app version>,
  AccountPropertyScopesVersion: 2,
  AccountPropertyScopesFederatedEnabled: federation app enabled,
  AccountPropertyScopesPublishedEnabled: federatedfilesharing lookup-server upload
}
```

Do not emit this from `core-status`; it is an app capability provider.

## Endpoints owned

All map ids where `feature_ids` contains `provisioning_api` (50). v2 path is canonical; v1 is the same route (`ocs_version: both`).

### Mail verification (HTTP, not OCS)

| id | method | path |
| --- | --- | --- |
| `provisioning_api.Verification#showVerifyMail` | GET | `/apps/provisioning_api/mailVerification/{key}/{token}/{userId}` |
| `provisioning_api.Verification#verifyMail.post` | POST | same |

### App config (`/ocs/v2.php/apps/provisioning_api/api/v1/config/apps`)

| id | method | path |
| --- | --- | --- |
| `provisioning_api-app_config-get-apps` | GET | `.../config/apps` |
| `provisioning_api-app_config-get-keys` | GET | `.../config/apps/{app}` |
| `provisioning_api-app_config-get-value` | GET | `.../config/apps/{app}/{key}` (`defaultValue` query) |
| `provisioning_api-app_config-set-value` | POST | `.../config/apps/{app}/{key}` body `{value}` |
| `provisioning_api-app_config-delete-key` | DELETE | `.../config/apps/{app}/{key}` |

### Preferences (`.../config/users`)

| id | method | path |
| --- | --- | --- |
| `provisioning_api-preferences-set-preference` | POST | `.../users/{appId}/{configKey}` body `{configValue}` |
| `provisioning_api-preferences-delete-preference` | DELETE | `.../users/{appId}/{configKey}` |
| `provisioning_api-preferences-set-multiple-preferences` | POST | `.../users/{appId}` body `{configs: object}` |
| `provisioning_api-preferences-delete-multiple-preference` | DELETE | `.../users/{appId}` query `configKeys[]` |

### Apps (`/ocs/v2.php/cloud/apps`)

| id | method | path |
| --- | --- | --- |
| `provisioning_api-apps-get-apps` | GET | `/cloud/apps?filter=enabled\|disabled` |
| `provisioning_api-apps-get-app-info` | GET | `/cloud/apps/{app}` |
| `provisioning_api-apps-enable` | POST | `/cloud/apps/{app}` |
| `provisioning_api-apps-disable` | DELETE | `/cloud/apps/{app}` |

### Groups (`/ocs/v2.php/cloud/groups`)

| id | method | path |
| --- | --- | --- |
| `provisioning_api-groups-get-groups` | GET | `/cloud/groups` |
| `provisioning_api-groups-add-group` | POST | `/cloud/groups` body `{groupid, displayname?}` |
| `provisioning_api-groups-get-groups-details` | GET | `/cloud/groups/details` |
| `provisioning_api-groups-get-group` | GET | `/cloud/groups/{groupId}` (alias of users list; deprecated) |
| `provisioning_api-groups-update-group` | PUT | `/cloud/groups/{groupId}` body `{key,value}` (`key` must be `displayname`) |
| `provisioning_api-groups-delete-group` | DELETE | `/cloud/groups/{groupId}` |
| `provisioning_api-groups-get-group-users` | GET | `/cloud/groups/{groupId}/users` |
| `provisioning_api-groups-get-group-users-details` | GET | `/cloud/groups/{groupId}/users/details` |
| `provisioning_api-groups-get-sub-admins-of-group` | GET | `/cloud/groups/{groupId}/subadmins` |

`groupId` regex is `.+` (slashes allowed). Decode with `urldecode`.

### Users (`/ocs/v2.php/cloud/users` and `/cloud/user`)

| id | method | path |
| --- | --- | --- |
| `provisioning_api-users-get-users` | GET | `/cloud/users` |
| `provisioning_api-users-add-user` | POST | `/cloud/users` |
| `provisioning_api-users-get-users-details` | GET | `/cloud/users/details` |
| `provisioning_api-users-get-disabled-users-details` | GET | `/cloud/users/disabled` |
| `provisioning_api-users-get-last-logged-in-users` | GET | `/cloud/users/recent` |
| `provisioning_api-users-get-user` | GET | `/cloud/users/{userId}` |
| `provisioning_api-users-edit-user` | PUT | `/cloud/users/{userId}` `{key,value}` |
| `provisioning_api-users-edit-user-multi-field` | PATCH | `/cloud/users/{userId}` |
| `provisioning_api-users-delete-user` | DELETE | `/cloud/users/{userId}` |
| `provisioning_api-users-enable-user` | PUT | `/cloud/users/{userId}/enable` |
| `provisioning_api-users-disable-user` | PUT | `/cloud/users/{userId}/disable` |
| `provisioning_api-users-wipe-user-devices` | POST | `/cloud/users/{userId}/wipe` |
| `provisioning_api-users-resend-welcome-message` | POST | `/cloud/users/{userId}/welcome` |
| `provisioning_api-users-get-users-groups` | GET | `/cloud/users/{userId}/groups` |
| `provisioning_api-users-add-to-group` | POST | `/cloud/users/{userId}/groups` `{groupid}` |
| `provisioning_api-users-remove-from-group` | DELETE | `/cloud/users/{userId}/groups?groupid=` |
| `provisioning_api-users-get-users-groups-details` | GET | `/cloud/users/{userId}/groups/details` |
| `provisioning_api-users-get-user-sub-admin-groups` | GET | `/cloud/users/{userId}/subadmins` |
| `provisioning_api-users-add-sub-admin` | POST | `/cloud/users/{userId}/subadmins` `{groupid}` |
| `provisioning_api-users-remove-sub-admin` | DELETE | `/cloud/users/{userId}/subadmins?groupid=` |
| `provisioning_api-users-get-user-sub-admin-groups-details` | GET | `/cloud/users/{userId}/subadmins/details` |
| `provisioning_api-users-edit-user-multi-value` | PUT | `/cloud/users/{userId}/{collectionName}` |
| `provisioning_api-users-get-current-user` | GET | `/cloud/user` |
| `provisioning_api-users-get-editable-fields` | GET | `/cloud/user/fields` |
| `provisioning_api-users-get-editable-fields-for-user` | GET | `/cloud/user/fields/{userId}` |
| `provisioning_api-users-get-enabled-apps` | GET | `/cloud/user/apps` |

List queries: `search`, `limit`, `offset`. Success lists may send `Link` next-page header (`PaginationTrait`).

## Endpoint walkthrough

1. Authenticate (session cookie or Basic/Bearer). OCS without user → v2 HTTP 401 / meta 997.
2. `ProvisioningApiMiddleware` (`apps/provisioning_api/lib/Middleware/ProvisioningApiMiddleware.php`): if caller is **not** admin **and** method lacks `NoSubAdminRequired` **and** caller is **not** subadmin **and** method lacks `AuthorizedAdminSetting` → `OCSException` HTTP 403.
3. Controller then applies per-method role checks (self vs target, delegated admin, subadmin-of-group). Insufficient access to **another** user is often **404 / OCS 998**, not 403 — do not leak existence.
4. Mutations with `PasswordConfirmationRequired` need a confirmed password (same as `core-login` confirm-password). `enable` uses `strict: true`.
5. Respond with OCS envelope (`bp-ocs-envelope`). Empty success `data` is `[]` or omitted per envelope helper; PHP `DataResponse()` is empty array.

### Users

- **List** (`getUsers` / `getUsersDetails`): admin or delegated admin searches all users; subadmin searches only groups they sub-admin; ordinary user with `NoAdminRequired` still hits middleware — they must be subadmin unless method also has `NoSubAdminRequired`.
- **Self** (`getCurrentUser`, `getEditableFields`, `getEnabledApps`): `NoSubAdminRequired`. `getCurrentUser` includes scopes. `getUser(self)` includes scopes; `getUser(other)` omits scopes.
- **Details payload**: if caller cannot manage the target, `getUserData` returns `null` → 998. If they can see the user id but not details, list endpoints return `{id}` only.
- **Create** (`addUser`): password confirmation. Empty userid + `core.newUser.generateUserID=yes` generates an id. Empty password requires email (code 108) and sends a reset/welcome path. `core.newUser.requireEmail=yes` → 110. Subadmin **must** specify at least one group they sub-admin (106). Cannot promote subadmin of `admin` group (103). Existing user → 102.
- **Edit** (`editUser`): permitted-field set differs for self vs admin/subadmin; unknown/forbidden key → **113**. Password policy failures → **107**. Invalid language/locale/timezone/first_day_of_week → **101**. Looking up inaccessible user → 998.
- **PATCH** (`editUserMultiField`): batch; 422 `{errors}` on partial failure.
- **Enable/disable/delete/wipe**: password confirmation; cannot disable/delete self in ways PHP forbids (check `UsersController` before inventing extra blocks). Wipe uses `RemoteWipe`.
- **Welcome**: target must have an email (101) and send must succeed (102).
- **Groups on user**: add/remove require group existence; last-subadmin-group and self-remove-from-admin have code **105**.
- **Subadmin assign**: admin-setting Users; cannot assign `admin` group (103); user/group missing 101/102.

### Groups

- List/search: any admin or subadmin (`NoAdminRequired`).
- `getGroupsDetails`: also `AuthorizedAdminSetting` for Users **or** Sharing.
- `getGroupUsers`: `NoSubAdminRequired` but then forbids unless admin, delegated admin, subadmin **of that group**, or **member**. Non-member non-admin → 403. Missing group → 404.
- `getGroupUsersDetails`: missing or inaccessible group both surface as 998 (PHP throws not-found even for no permission).
- Create: empty `groupid` → 101; exists → 102; backend refuses → 103.
- Delete: missing → 101; `admin` group or backend fail → 102.
- Update: only `key=displayname`; other keys → 996 unknown error.

### Apps / appconfig / preferences

- Apps list `filter` must be null, `enabled`, or `disabled`; else 101. Always-enabled core apps are excluded from unfiltered and disabled lists.
- Enable may download+install if not present; invalid app id → 997; missing app → 998.
- Appconfig: `verifyAppId` (cleaned id must equal given). Forbidden keys: `installed_version`, `enabled`, `types`; `core.encryption_enabled` unless value `yes`; `core.public_*` / `core.remote_*`; `files.default_quota=none` when unlimited quota is disabled. Set requires admin **or** delegated `IDelegatedSettings::getAuthorizedAppConfig` regex match.
- Preferences: **current user only**. `BeforePreferenceSetEvent` / `BeforePreferenceDeletedEvent` must mark valid; otherwise HTTP 400 empty data. No listener → 400.

### Mail verification

- Session user must equal `{userId}` or guest error template.
- `{key}` is encrypted email. Token checked via `IVerificationToken` action `verifyMail` + first 8 hex of sha256(email).
- Invalid token throttles (`emailVerification`); expired token does not. Success marks `COLLECTION_EMAIL` locally verified.

## Auth / tenant rules

| Layer | Rule |
| --- | --- |
| Transport | Session **or** Basic **or** Bearer. Map `auth: mixed` is scanner default; PHP still requires a user except where noted. |
| Default (no `NoAdminRequired`) | Admin **or** subadmin (middleware). |
| `NoAdminRequired` without `NoSubAdminRequired` | Admin **or** subadmin. |
| `NoSubAdminRequired` | Any logged-in user; then controller narrows. |
| `AuthorizedAdminSetting` | Delegated setting class (`Users` / `Sharing`) bypasses middleware subadmin gate; SecurityMiddleware enforces the setting. |
| Self vs other | Other-user lookup without manage rights → **404/998**, not 403. |
| Delegated admin | Treated like admin for most user/group list/edit, except cannot manage the `admin` group. |
| Subadmin | Only groups they sub-admin; cannot create users without those groups. |
| Password confirmation | Required on create/edit/delete/enable/disable/wipe/welcome/group mutations/app enable. |
| Rate limits | `editUser` 50/600s; `editUserMultiField` 50/600s; `editUserMultiValue` 5/60s. |

Single-tenant instance. User ids and group ids are strings; do not coerce numeric ids.

## Failure modes

Preserve OCS **numeric** codes; do not remap to HTTP-only.

| Code | Typical cause |
| --- | --- |
| 101 | Invalid input (empty group, bad quota, bad email, invalid language/locale/timezone/first_day_of_week, missing welcome email) |
| 102 | Already exists / cannot delete admin group / welcome send fail |
| 103 | Subadmin of admin group / backend cannot create group |
| 104 | Group does not exist (addUser groups) |
| 105 | Insufficient group privileges / self-remove last subadmin group |
| 106 | Subadmin omitted groups |
| 107 | Password policy `HintException` |
| 108 | Empty password without email |
| 109 | Subadmin target group missing |
| 110 | `newUser.requireEmail` and email empty |
| 111 | User id create failed |
| 113 | Field not in permitted set |
| 996 | Unknown group update key |
| 997 | Unauthenticated / invalid app id |
| 998 | Not found **or** hidden by ACL |

HTTP 403: middleware NotSubAdmin; `OCSForbiddenException`; appconfig forbidden app/key.

HTTP 400: invalid preference (no validating listener); invalid list limit/offset (`InvalidArgumentException` on disabled-users).

HTTP 422: PATCH multi-field `{errors}`.

Mail verify: guest error/success **templates**, not JSON. Throttle invalid token.

## Conceptual Next.js shape

```
src/server/provisioning/
  auth.ts              # admin / delegated / subadmin / self
  users.ts             # list, details, mutations, permitted fields
  groups.ts
  apps.ts              # installed apps enable/disable (not appstore)
  appconfig.ts         # typed set + forbidden keys
  preferences.ts       # current user + validator hooks
  mail-verify.ts
app/ocs/v2.php/cloud/users/[[...path]]/route.ts
app/ocs/v2.php/cloud/user/[[...path]]/route.ts
app/ocs/v2.php/cloud/groups/[[...path]]/route.ts
app/ocs/v2.php/cloud/apps/[[...path]]/route.ts
app/ocs/v2.php/apps/provisioning_api/api/v1/config/...
app/apps/provisioning_api/mailVerification/[key]/[token]/[userId]/route.ts
```

Reuse `ocs/envelope.ts` and login auth. Store users/groups/appconfig/preferences in the compatibility store (`users`, `groups`, `appconfig`, `preferences`, `accounts`) — not a PHP clone of backends.

## Traps

- OCS default XML; tests use `?format=json` + `OCS-APIRequest: true` (`bp-ocs-envelope`).
- v1 success meta 100 vs v2 200; v1 errors stay HTTP 200.
- `display-name` **and** `displayname` both present and equal.
- `lastLogin` is milliseconds; `lastLoginTimestamp` / `firstLoginTimestamp` are seconds.
- Scopes only for self (or explicit include).
- 998 used as ACL hide — parity must not turn that into 403.
- `getGroup` === `getGroupUsers`.
- Enable/disable live on `/users/{id}/enable|disable`, so multi-value `{collectionName}` excludes those tokens.
- Preference writes are **allow-listed by events**, not a free KV dump.
- Do not confuse `/cloud/apps` (this feature) with `/ocs/.../appstore` (`appstore`).

## Do-not

- Do not implement `searchByPhoneNumbers` here (`core`).
- Do not ship settings Vue user-management HTML (`settings`).
- Do not invent LDAP/SAML user fields.
- Do not skip password-confirmation on annotated mutations.
- Do not return another user's `storageLocation` to non-admin.
- Do not allow deleting or renaming group `admin`.
- Do not set appconfig keys `installed_version` / `enabled` / `types`.
- Do not transcribe `UsersController.php` method-by-method; match client-visible codes and payloads.

## Parity notes

Minimum per endpoint: happy, unauthenticated (401/997), one validation (101/400/403). Extra:

| Case | Expectation |
| --- | --- |
| Self GET `/cloud/user` | 200 details + scopes |
| GET other user as peer | 998 |
| Subadmin GET `/cloud/users` | only their groups |
| POST user existing id | 102 |
| POST user empty password, no email | 108 |
| PUT user forbidden field | 113 |
| PUT group `admin` DELETE | 102 |
| GET group users as non-member | 403 |
| Preference with no validator | 400 |
| Appconfig forbidden key | 403 `{data:{message}}` |
| Mail verify wrong session user | guest error HTML |
| Wrong method | 405 |

Generated user ids, quota used/free, and timestamps: shape only. Capability `provisioning_api` is out of this slice unless implementing capabilities expansion.

## Repo paths

- Routes: `apps/provisioning_api/appinfo/routes.php`
- Users: `apps/provisioning_api/lib/Controller/UsersController.php`
- Groups: `apps/provisioning_api/lib/Controller/GroupsController.php`
- Apps: `apps/provisioning_api/lib/Controller/AppsController.php`
- Appconfig: `apps/provisioning_api/lib/Controller/AppConfigController.php`
- Preferences: `apps/provisioning_api/lib/Controller/PreferencesController.php`
- Details builder: `apps/provisioning_api/lib/Controller/AUserDataOCSController.php`
- Mail verify: `apps/provisioning_api/lib/Controller/VerificationController.php`
- Middleware: `apps/provisioning_api/lib/Middleware/ProvisioningApiMiddleware.php`
- Types: `apps/provisioning_api/lib/ResponseDefinitions.php`
- Capabilities: `apps/provisioning_api/lib/Capabilities.php`
- OpenAPI: `apps/provisioning_api/openapi.json`
- Bootstrap: `apps/provisioning_api/lib/AppInfo/Application.php`
- Tests: `apps/provisioning_api/tests/Controller/`
