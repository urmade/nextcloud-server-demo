---
name: settings
description: Admin/personal settings HTTP+OCS — tokens, mail, declarative forms, setup checks, WebAuthn, passwords, presets. Use when implementing or testing settings, files_sharing settings prefs, or twofactor_backupcodes createCodes.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# settings

## Purpose

Admin and personal **settings surface**: HTML shells, JSON token/mail/AI/2FA/preset APIs, OCS declarative forms, integrity/setup checks, WebAuthn registration, password change, plus three **files_sharing** user prefs and **twofactor_backupcodes** code generation that the feature map assigns here (first `feature_ids` owner).

Depends on `core-login`. CSRF applies to state-changing HTTP unless `NoCSRFRequired`. Password confirmation is strict on several token/2FA/delegation routes.

## Scope

- Personal + admin settings HTML (`/settings/user/{section}`, `/settings/admin/{section}`)
- App-password / device-token CRUD + remote wipe
- Personal + admin password change
- Admin mail settings + test mail
- Declarative settings OCS
- Setup checks + integrity failed-files/rescan
- Admin 2FA enforcement state
- Admin AI provider prefs
- Config lexicon presets
- Personal WebAuthn register/delete
- Help HTML, reasons PDF, log download
- Delegation authorized-groups save
- `files_sharing` default-accept + share-folder prefs
- `twofactor_backupcodes` `createCodes`

## Non-scope

- Provisioning OCS `/cloud/users|groups|apps` (`provisioning_api`)
- Core well-known `change-password` / `security.txt` (`core`)
- Login-time WebAuthn (`core-login`)
- OAuth client CRUD (`oauth2`)
- App store (`appstore`)
- Pixel-perfect Vue settings UI unless a mapped HTML route is the contract
- Inventing setup-check ids; run the registered check set

## Key types / entities

| Name | Notes |
| --- | --- |
| Settings section | Admin default `overview`; personal default `profile-contact`. HTML via `CommonSettingsTrait`. |
| Device token | `authtoken` row. Create returns `{token, loginName, deviceToken}`. Token string is 25 chars in 5 groups (`AbCdE-fGhJk-...`). Name truncated to 128 (ellipsis after 120). |
| Token types | `PERMANENT_TOKEN`, `ONETIME_TOKEN` (QR when `login_qrcode_onetime`), `WIPE_TOKEN` (pending wipe — `destroyOthers` skips these) |
| Token scope | `SCOPE_FILESYSTEM` boolean is the only scope `update` writes |
| Declarative form | `IDeclarativeManager` schemas + values; sensitive fields use the password-confirm route |
| Mail system keys | `mail_domain`, `mail_from_address`, `mail_smtpmode`, `mail_smtpsecure`, `mail_smtphost`, `mail_smtpauth`, `mail_smtpport`, `mail_sendmailmode`, `mail_smtpname`, `mail_smtppassword`, `mail_smtpstreamoptions` |
| AI keys (appconfig `core`) | `ai.stt_provider`, `ai.textprocessing_provider_preferences`, `ai.taskprocessing_provider_preferences`, `ai.taskprocessing_type_preferences`, `ai.translation_provider_preferences`, `ai.text2image_provider`, `ai.taskprocessing_guests` — values JSON-encoded strings |
| 2FA enforcement | `{enforced: bool, enforcedGroups: string[], excludedGroups: string[]}` (`MandatoryTwoFactor`) |
| Preset | `OCP\Config\Lexicon\Preset` case **name** string |
| User-list prefs | `UsersController::ALLOWED_USER_PREFERENCES` (show storage path, backend, first/last login, new-user form, languages) plus admin keys `newUser.sendEmail`, `group.sortBy` |
| Account scopes | same `v2-*` as provisioning; personal `setUserSettings` writes properties + scopes |
| Share folder prefs | user config `files_sharing` / `default_accept` (`yes`/`no`), `share_folder` |
| Backup codes | `{codes: string[], state: {enabled, total, used}}` |

## Endpoints owned

44 map ids. HTTP unless noted. Several OpenAPI + `routes.php` duplicates (same handler).

### Cross-app (map owner = settings)

| id | method | path |
| --- | --- | --- |
| `files_sharing.Settings#setDefaultAccept.put` | PUT | `/apps/files_sharing/settings/defaultAccept` body `accept: bool` |
| `files_sharing.Settings#setUserShareFolder.put` | PUT | `/apps/files_sharing/settings/shareFolder` body `shareFolder` |
| `files_sharing.Settings#resetUserShareFolder.delete` | DELETE | `/apps/files_sharing/settings/shareFolder` |
| `twofactor_backupcodes.settings#createCodes.post` | POST | `/apps/twofactor_backupcodes/settings/createCodes` (see `apps/twofactor_backupcodes/appinfo/routes.php`) |

### Settings app HTTP

| id | method | path |
| --- | --- | --- |
| `settings.AuthorizedGroup#saveSettings.post` | POST | `/settings/authorizedgroups/saveSettings` `{newGroups, class}` |
| `settings.LogSettings#download` / `settings-log_settings-download` | GET | `/settings/admin/log/download` |
| `settings.MailSettings#setMailSettings.post` | POST | `/settings/admin/mailsettings` |
| `settings.MailSettings#storeCredentials.post` | POST | `/settings/admin/mailsettings/credentials` |
| `settings.MailSettings#sendTestMail.post` | POST | `/settings/admin/mailtest` |
| `settings.AdminSettings#index` | GET | `/settings/admin/{section}` default `overview` |
| `settings.PersonalSettings#index` | GET | `/settings/user/{section}` default `profile-contact` |
| `settings.CheckSetup#check` | GET | `/settings/ajax/checksetup` |
| `settings.CheckSetup#setupCheckManager` | GET | `/settings/setupcheck` |
| `settings.CheckSetup#getFailedIntegrityCheckFiles` | GET | `/settings/integrity/failed` |
| `settings.CheckSetup#rescanFailedIntegrityCheck` | GET | `/settings/integrity/rescan` |
| `settings.AISettings#update.put` | PUT | `/settings/api/admin/ai` `{settings}` |
| `settings.TwoFactorSettings#index` | GET | `/settings/api/admin/twofactorauth` |
| `settings.TwoFactorSettings#update.put` | PUT | `/settings/api/admin/twofactorauth` |
| `settings.WebAuthn#startRegistration` | GET | `/settings/api/personal/webauthn/registration` |
| `settings.WebAuthn#finishRegistration.post` | POST | same |
| `settings.WebAuthn#deleteRegistration.delete` | DELETE | `.../registration/{id}` |
| `settings.Reasons#getPdf` | GET | `/settings/download/reasons` |
| `settings.Help#help` | GET | `/settings/help/{mode}` `user`\|`admin` |
| `settings.AuthSettings#create.post` | POST | `/settings/personal/authtokens` |
| `settings.AuthSettings#update.put` | PUT | `/settings/personal/authtokens/{id}` |
| `settings.AuthSettings#destroy.delete` | DELETE | `/settings/personal/authtokens/{id}` |
| `settings.AuthSettings#destroyOthers.delete` | DELETE | `/settings/personal/authtokens` |
| `settings.AuthSettings#wipe.post` | POST | `/settings/personal/authtokens/wipe/{id}` |
| `settings.ChangePassword#changePersonalPassword.post` | POST | `/settings/personal/changepassword` |
| `settings.ChangePassword#changeUserPassword.post` | POST | `/settings/users/changepassword` |
| `settings.Preset#getPreset` | GET | `/settings/preset` |
| `settings.Preset#getCurrentPreset` | GET | `/settings/preset/current` |
| `settings.Preset#setCurrentPreset.post` | POST | `/settings/preset/current` |
| `settings.Users#usersList` | GET | `/settings/users` |
| `settings.Users#usersListByGroup` | GET | `/settings/users/{group}` |
| `settings.Users#setPreference.post` | POST | `/settings/users/preferences/{key}` |
| `settings.Users#getVerificationCode` | GET | `/settings/users/{account}/verify` |
| `settings.Users#setEMailAddress.put` | PUT | `/settings/users/{id}/mailAddress` |
| `settings.Users#setDisplayName.post` | POST | `/settings/users/{username}/displayName` |
| `settings.Users#setUserSettings.put` | PUT | `/settings/users/{username}/settings` |

### Declarative OCS (`ocs_version: both`)

| id | method | path |
| --- | --- | --- |
| `settings-declarative_settings-get-forms` | GET | `/ocs/v2.php/settings/api/declarative/forms` |
| `settings-declarative_settings-set-value` | POST | `/ocs/v2.php/settings/api/declarative/value` |
| `settings-declarative_settings-set-sensitive-value` | POST | `.../value-sensitive` |

## Endpoint walkthrough

### HTML shells

`PersonalSettings#index` / `AdminSettings#index`: session required, `NoCSRFRequired`. Personal is any user. Admin uses `getIndexResponse('admin', section)` — empty allowed-settings set → error template, not a blank 200. Users list pages inject Vue initial state (`usersSettings`) then empty template.

### Device tokens (`AuthSettingsController`)

All `NoAdminRequired` + `NoSubAdminRequired`. Create/update/destroy/destroyOthers: **strict** password confirmation. Wipe: password confirmation (non-strict).

- If session has `app_password` → create 503; other mutations 400.
- Create while impersonating → 503.
- `auth_can_create_app_token` false → 503.
- Create with empty `name` and `qrcodeLogin=false` → 503.
- QR path: one-time token + empty scope if `ConfigLexicon::LOGIN_QRCODE_ONETIME`, else permanent named "QR Code login".
- Destroy missing/other-user token → 404. Destroying a wipe-pending token **cancels wipe** (audit subject differs).
- `destroyOthers` keeps current session token and wipe-pending tokens; returns `{revoked: id[]}`. Impersonation → 503.
- `update` only applies filesystem scope + rename; publishes security activity.
- `wipe` marks token via `RemoteWipe`; failure → 400.

### Passwords

- Personal: check `oldpassword` with `IUserManager::checkPassword(loginName, old)`. Fail → `{status:error, data.message}` + **throttle** `changePersonalPassword`. Then `setPassword`; policy `HintException` → error JSON **without** throttle. Success updates session token password.
- Admin/subadmin changing another user: `PasswordConfirmationRequired`. Target must be accessible (admin or subadmin-of-user). Encryption recovery password required when recovery is enabled for that user.

### Mail / AI / 2FA / presets / logs / integrity

- Mail set/store: `AuthorizedAdminSetting(Mail)` + password confirmation. Empty values stored as `null`. `mail_smtpauth` false clears smtp name/password. Placeholder password `********` on storeCredentials → **400**. Sets `core.emailTestSuccessful=0`. Test mail uses current user's settings email; missing address → error DataResponse.
- AI update: `AuthorizedAdminSetting(ArtificialIntelligence)`. Unknown keys ignored; present keys JSON-encoded; invalid JSON → 400 `{error}`. Writes `core` appconfig (some lazy).
- 2FA GET: admin (default). PUT: strict password confirmation; body `enforced`, `enforcedGroups`, `excludedGroups`.
- Presets: GET current returns preset **name**; POST `{presetName}` must match `Preset` enum else OCS 400; GET `/preset` returns lexicon dump + apps.
- Log download: admin, `NoCSRFRequired`, `application/octet-stream` attachment `nextcloud.log`.
- Integrity failed: admin Overview, plaintext. Disabled checker / not-run have distinct plain bodies. Rescan runs checker then **redirects** to admin overview.

### Declarative OCS

Any logged-in user for GET (`NoSubAdminRequired`). SET: `NoAdminRequired` (admin/subadmin middleware unless personal schema). Sensitive SET adds password confirmation. Manager enforces admin vs personal per schema; `NotAdminException` bubbles. Other errors → OCS 400.

### Personal account JSON (`settings.Users`)

`setUserSettings`: self only, password confirmation, 5/60s. Invalid email → **422**. Unknown account → 401. Skips properties the user cannot edit. Success `{status:success, data:{...fields, message}}`.

`setPreference`: `AuthorizedAdminSetting(Users)`. Unknown key → 403.

Share-folder routes: current user config; JSON 200 empty.

Backup codes: current user, password confirmation; regenerates codes.

WebAuthn: session required; start stores options in session (`webauthn_registration`); finish without session → 400; start is `NoCSRFRequired` + `UseSession`.

## Auth / tenant rules

| Route class | Auth |
| --- | --- |
| Personal HTML, help, reasons PDF, setupCheckManager | Logged-in user (`NoAdminRequired` + `NoSubAdminRequired`) |
| Admin HTML | Logged-in; section visibility from settings manager / subadmin / delegated |
| Tokens, WebAuthn, personal password, setUserSettings, share prefs, backup codes | Logged-in self |
| Mail, AI, 2FA, log, integrity, authorized groups, user-list preference keys | Admin or `AuthorizedAdminSetting` for that class |
| changeUserPassword, setDisplayName, setEMailAddress | Admin or subadmin **of the target user** |
| Declarative GET | Logged-in |
| CSRF | Required on POST/PUT/DELETE HTTP unless `NoCSRFRequired` (HTML GET, log, integrity, WebAuthn start, users list) |

`SubadminMiddleware`: methods without `NoSubAdminRequired` and without `AuthorizedAdminSetting` require subadmin; else guest 403 template.

Do not use an app-password session to mint more app passwords (503/400).

## Failure modes

| Status | Where |
| --- | --- |
| 401 | OCS unauthenticated; `setUserSettings` invalid account |
| 403 | Subadmin middleware; unknown user-list preference; declarative not-admin |
| 400 | Token ops on app-password session; WebAuthn finish missing session; wipe fail; SMTP `********`; AI JSON; declarative save; preset name |
| 404 | Token id not owned |
| 422 | Invalid email on `setUserSettings` |
| 503 | Token create unavailable (no session id, impersonation, disabled, empty name) |
| JSON `{status:error}` | Password change / account save — **HTTP often still 200** except noted |
| Redirect | Integrity rescan |
| Throttle | Wrong personal old password |

## Conceptual Next.js shape

```
src/server/settings/
  sections.ts          # admin/personal section registry
  tokens.ts            # device tokens + wipe
  mail.ts
  declarative.ts
  setup-checks.ts
  webauthn.ts
  password.ts
  presets.ts
  account.ts           # setUserSettings / displayName / email
app/settings/.../route.ts
app/ocs/v2.php/settings/api/declarative/.../route.ts
app/apps/files_sharing/settings/.../route.ts
app/apps/twofactor_backupcodes/settings/createCodes/route.ts
```

HTML can be a thin shell with JSON APIs behind it. Setup-check payloads: names + severity + description from a TS registry matching PHP `registerSetupCheck` list in `apps/settings/lib/AppInfo/Application.php` — do not invent checks.

## Traps

- Feature map includes `files_sharing.Settings#*` and `twofactor_backupcodes.settings#createCodes.post` **here**, not in those apps' feature skills.
- Duplicate map ids (`settings-log_settings-download` vs `settings.LogSettings#download`) are one handler.
- Password-change JSON uses `{status, data.message}`, not OCS.
- `setupCheckManager` is `NoAdminRequired` (any user); `check` is Overview admin setting — **different auth**.
- Mail password `********` is a sentinel, not a real secret.
- Token create returns the **plaintext token once**.
- WebAuthn start/finish share session key; do not persist options in a cookie clients can forge.
- CSRF on JSON PUT/POST (tokens, mail, AI) — session cookie without token fails.

## Do-not

- Do not implement `/cloud/users` here.
- Do not implement well-known change-password / security.txt (`core`).
- Do not allow app-password sessions to create tokens.
- Do not revoke wipe-pending tokens in `destroyOthers`.
- Do not skip encryption recovery password when recovery is on for `changeUserPassword`.
- Do not treat settings HTML as pixel-parity unless that endpoint is the contract.
- Do not log smtp passwords or returned device tokens.

## Parity notes

Default three cases per JSON/OCS endpoint. Extra:

| Case | Expectation |
| --- | --- |
| Token create happy | 200 `{token, loginName, deviceToken}` |
| Token create via app-password | 503 |
| Token destroy unknown id | 404 |
| Personal password wrong old | error JSON + throttle |
| Declarative GET no auth | OCS 401/997 |
| Declarative sensitive SET no confirm | confirm-password failure (same as core-login) |
| Mail store `********` | 400 |
| AI update bad JSON | 400 |
| Preset unknown name | 400 |
| Share defaultAccept | 200 empty JSON, preference persisted |
| Backup codes | 200 `{codes, state}` |
| Reasons PDF | `Content-Type: application/pdf` |
| Integrity rescan | redirect to admin overview |
| Users list unauthenticated | login redirect / 401 |

HTML page bodies: status + logged-in gate, not DOM snapshots.

## Repo paths

- Routes: `apps/settings/appinfo/routes.php`
- Bootstrap + setup-check list: `apps/settings/lib/AppInfo/Application.php`
- Subadmin gate: `apps/settings/lib/Middleware/SubadminMiddleware.php`
- Controllers: `apps/settings/lib/Controller/{AuthSettings,MailSettings,DeclarativeSettings,CheckSetup,AISettings,TwoFactorSettings,WebAuthn,ChangePassword,Preset,Users,AdminSettings,PersonalSettings,Help,LogSettings,Reasons,AuthorizedGroup}Controller.php`
- Admin/personal sections: `apps/settings/lib/Settings/`, `apps/settings/lib/Sections/`
- Share prefs: `apps/files_sharing/lib/Controller/SettingsController.php`
- Backup codes: `apps/twofactor_backupcodes/lib/Controller/SettingsController.php`
- Types: `apps/settings/lib/ResponseDefinitions.php`
- Config lexicon: `apps/settings/lib/ConfigLexicon.php`
