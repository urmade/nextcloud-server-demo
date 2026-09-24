---
name: encryption
description: Server-side encryption status, recovery key, and home-storage settings AJAX. Use when implementing or testing encryption ajax endpoints.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# encryption

## Purpose

JSON AJAX for the default SSE module (`apps/encryption`, module id `OC_DEFAULT_MODULE`). Clients (settings Vue + `encryption.ts` banner) call `/apps/encryption/ajax/*`. Not OCS. Not WebDAV bytes.

Depends on `dav` (file ciphertext lives on DAV). Do not start this slice before session login + CSRF exist (`core-login`).

## Scope

- `GET /apps/encryption/ajax/getStatus`
- `POST /apps/encryption/ajax/adminRecovery`
- `POST /apps/encryption/ajax/changeRecoveryPassword`
- `POST /apps/encryption/ajax/userSetRecovery`
- `POST /apps/encryption/ajax/updatePrivateKeyPassword`
- `POST /apps/encryption/ajax/setEncryptHomeStorage`

## Non-scope

- Encrypting/decrypting file bytes (`OCA\Encryption\Crypto\Encryption` on DAV)
- `occ encryption:*` (`EnableMasterKey`, `DisableMasterKey`, `RecoverUser`, `FixEncryptedVersion`, `FixKeyLocation`, `DropLegacyFileKey`, `CleanOrphanedKeys`, `ScanLegacyFormat`)
- Settings HTML chrome (`Settings\Admin`, `Settings\Personal`) except as consumers of these AJAX routes
- Master-key vs user-key crypto internals beyond what these six routes mutate
- Inventing extra recovery/status fields

## Key types / entities

| Name | Source | Values / notes |
| --- | --- | --- |
| Session init status | `OCA\Encryption\Session` session key `encryptionInitialized` | `'0'` `NOT_INITIALIZED`, `'1'` `INIT_EXECUTED`, `'2'` `INIT_SUCCESSFUL`. Null → `'0'`. |
| Status `status` string | `StatusController::getStatus` | `'success'` if `'2'`; `'interactionNeeded'` if `'0'` or `'1'`; `'error'` otherwise |
| `initStatus` | same | raw session string, always returned |
| Admin recovery flag | appconfig `encryption` / `recoveryAdminEnabled` bool | set by enable/disable admin recovery |
| User recovery flag | userconfig `encryption` / `recoveryEnabled` bool | per uid; `setRecoveryForUser` also re-wraps file share keys under `/ {uid}/files/` |
| Home storage flag | appconfig `encryption` / `encryptHomeStorage` bool | default **true** (`Util::shouldEncryptHomeStorage`) |
| Master key flag | appconfig `encryption` / `useMasterKey` bool | default **true**; not written by these routes |
| Private key in session | session `privateKey` | plaintext key after successful password update |
| Recovery key pair | `KeyManager` system key | created on first successful `enableAdminRecovery` if missing |

`GenericEncryptionException` from crypto → HTTP 500 with `{data:{message}}` on recovery routes. Other `\Exception` → HTTP 500 empty body `[]`.

## Endpoints owned

Map rows whose first `feature_ids` is `encryption` (6).

| id | method | path | PHP |
| --- | --- | --- | --- |
| `encryption.Status#getStatus` | GET | `/apps/encryption/ajax/getStatus` | `StatusController::getStatus` |
| `encryption.Recovery#adminRecovery.post` | POST | `/apps/encryption/ajax/adminRecovery` | `RecoveryController::adminRecovery` |
| `encryption.Recovery#changeRecoveryPassword.post` | POST | `/apps/encryption/ajax/changeRecoveryPassword` | `RecoveryController::changeRecoveryPassword` |
| `encryption.Recovery#userSetRecovery.post` | POST | `/apps/encryption/ajax/userSetRecovery` | `RecoveryController::userSetRecovery` |
| `encryption.Settings#updatePrivateKeyPassword.post` | POST | `/apps/encryption/ajax/updatePrivateKeyPassword` | `SettingsController::updatePrivateKeyPassword` |
| `encryption.Settings#setEncryptHomeStorage.post` | POST | `/apps/encryption/ajax/setEncryptHomeStorage` | `SettingsController::setEncryptHomeStorage` |

Not OCS. Default AppFramework JSON `DataResponse`. CSRF on POSTs (no `NoCSRFRequired`). `UseSession` on both Settings methods.

## Endpoint walkthrough

### Status — `encryption.Status#getStatus`

`GET /apps/encryption/ajax/getStatus` — `#[NoAdminRequired]`, logged-in user.

Switch on `Session::getStatus()`:

| init | `status` | `data.message` |
| --- | --- | --- |
| `'1'` | `interactionNeeded` | l10n: invalid private key; update private key password in personal settings |
| `'0'` and encryption manager **enabled** | `interactionNeeded` | l10n: keys not initialized; log out and in |
| `'0'` and encryption manager **disabled** | `interactionNeeded` | l10n: enable SSE in admin settings |
| `'2'` | `success` | l10n: Encryption app is enabled and ready |
| anything else | `error` | **hardcoded** `'no valid init status'` (not l10n) |

Body:

```json
{
  "status": "success|interactionNeeded|error",
  "initStatus": "0|1|2|…",
  "data": { "message": "<string>" }
}
```

`encryption.ts` warns when `status === 'interactionNeeded'` using `data.data.message`. Always 200.

### Admin recovery — `encryption.Recovery#adminRecovery.post`

`POST /apps/encryption/ajax/adminRecovery` — **admin** (no `NoAdminRequired`).

Body: `{ recoveryPassword, confirmPassword, adminEnableRecovery: bool }`.

Validation (400 `{data:{message}}`, l10n):

1. empty `recoveryPassword` → `Missing recovery key password`
2. empty `confirmPassword` → `Please repeat the recovery key password`
3. mismatch → `Repeated recovery key password does not match the provided recovery key password`

Then:

- `adminEnableRecovery === true` → `Recovery::enableAdminRecovery`. If no recovery key exists, create key pair and `setRecoveryKey`. Then `checkRecoveryPassword`; on success set `recoveryAdminEnabled` true. 200 `Recovery key successfully enabled`. Failure 400 `Could not enable recovery key. Please check your recovery key password!`
- else → `disableAdminRecovery`: `checkRecoveryPassword` then `recoveryAdminEnabled` false. 200 `Recovery key successfully disabled` or 400 `Could not disable recovery key. Please check your recovery key password!`

`GenericEncryptionException` → 500 `{data:{message: e.message}}`. Other exceptions → 500 `[]`.

### Change recovery password — `encryption.Recovery#changeRecoveryPassword.post`

`POST /apps/encryption/ajax/changeRecoveryPassword` — **admin**.

Body: `{ newPassword, oldPassword, confirmPassword }`.

400 `{data:{message}}`:

1. empty `oldPassword` → `Please provide the old recovery password`
2. empty `newPassword` → `Please provide a new recovery password`
3. empty `confirmPassword` → `Please repeat the new recovery password`
4. `newPassword !== confirmPassword` → same mismatch string as adminRecovery

Then `changeRecoveryKeyPassword(new, old)`: decrypt system private recovery key with old; re-encrypt with new + header. Success 200 `Password successfully changed.` Failure 400 `Could not change the password. Maybe the old password was not correct.` Same 500 rules as adminRecovery.

Order of empty checks: **old, then new, then confirm** (tests assert empty confirm is not reached if new is empty).

### User recovery — `encryption.Recovery#userSetRecovery.post`

`POST /apps/encryption/ajax/userSetRecovery` — `#[NoAdminRequired]`.

Body: `{ userEnableRecovery: bool }`.

`Recovery::setRecoveryForUser`: writes userconfig `recoveryEnabled`; if true, walk `/ {uid}/files/` and add recovery share keys; if false, remove them. `PreConditionNotMetException` → false.

- success + false → 200 `Recovery Key disabled`
- success + true → 200 `Recovery Key enabled`
- failure → **always** 400 `Could not enable the recovery key, please try again or contact your administrator` (even when the caller was disabling)

### Update private key password — `encryption.Settings#updatePrivateKeyPassword.post`

`POST /apps/encryption/ajax/updatePrivateKeyPassword` — `#[NoAdminRequired]` + `#[UseSession]`.

Body: `{ oldPassword, newPassword }`.

`newPassword` must be the **current login password**: `IUserManager::checkPassword(uid, newPassword)`; if false, retry with session `loginname` (LDAP case).

If login check fails → 400 `{message: The current log-in password was not correct, please try again.}` (top-level `message`, **not** nested under `data`).

If login ok: decrypt stored private key with `oldPassword`. Wrong passphrase / `GenericEncryptionException` → treat as decrypt false → 400 `{message: The old password was not correct, please try again.}`.

Success: re-encrypt with `newPassword`, prepend `Crypt::generateHeader()`, `setPrivateKey`, session private key + `INIT_SUCCESSFUL`. 200 `{message: Private key password successfully updated.}`.

Default failure string if encrypt returns empty: `Could not update the private key password.`

### Encrypt home storage — `encryption.Settings#setEncryptHomeStorage.post`

`POST /apps/encryption/ajax/setEncryptHomeStorage` — **admin** + `#[UseSession]`.

Body: `{ encryptHomeStorage: bool }`. Writes appconfig; returns **empty** `DataResponse` (200, `{}` / empty data). Vue posts `{ encryptHomeStorage }`.

## Auth / tenant

| Route | Who |
| --- | --- |
| `getStatus`, `userSetRecovery`, `updatePrivateKeyPassword` | any logged-in user (`NoAdminRequired`) |
| `adminRecovery`, `changeRecoveryPassword`, `setEncryptHomeStorage` | admin (default AppFramework admin gate) |
| Unauthenticated | 401 |
| Logged-in non-admin on admin routes | 403 |
| CSRF | required on all POSTs |
| Tenant | single-instance; recovery/user flags keyed by uid / appconfig |

Do not allow a user to toggle another user's `recoveryEnabled`. PHP uses the session user only.

## Failure modes

| HTTP | Body | Cause |
| --- | --- | --- |
| 200 | see walkthrough | happy path including status `interactionNeeded` |
| 400 | `{data:{message}}` | recovery validation / enable-disable / change-password failure |
| 400 | `{message}` | private-key password failure (shape differs) |
| 401 | login/JSON | anonymous |
| 403 | | non-admin on admin POSTs |
| 405 | | wrong method |
| 500 | `{data:{message}}` | `GenericEncryptionException` on recovery |
| 500 | `[]` | other recovery exceptions |

Do not wrap these in OCS envelopes.

## Conceptual Next.js shape

```
src/server/encryption/
  session.ts          # init status + optional in-memory private key
  recovery.ts         # admin/user recovery flags; stub key wrap
  settings.ts         # private-key password + encryptHomeStorage
app/apps/encryption/ajax/getStatus/route.ts
app/apps/encryption/ajax/adminRecovery/route.ts
app/apps/encryption/ajax/changeRecoveryPassword/route.ts
app/apps/encryption/ajax/userSetRecovery/route.ts
app/apps/encryption/ajax/updatePrivateKeyPassword/route.ts
app/apps/encryption/ajax/setEncryptHomeStorage/route.ts
```

Stub crypto: do not port `Crypt.php`. Persist flags + a stand-in key blob so decrypt-with-wrong-password fails. File-key rewrap on `userSetRecovery` may be a no-op if no DAV files exist; still persist `recoveryEnabled`.

## Traps

- Not OCS. No `ocs.meta`. JSON `DataResponse` only.
- `updatePrivateKeyPassword` success/error uses `{message}`; recovery routes use `{data:{message}}`.
- Unknown session status message is **not** translated.
- `userSetRecovery` failure copy always talks about **enable**, including disable failures.
- `newPassword` on private-key update is the **current login** password, not a newly chosen one.
- LDAP: second `checkPassword` uses session `loginname`.
- CSRF + admin middleware before controller.
- Default master key on does not remove these routes.

## Do-not

- Do not encrypt DAV payloads in this slice (`dav`).
- Do not implement `occ encryption:*`.
- Do not return OCS envelopes.
- Do not skip CSRF on POSTs.
- Do not let non-admins hit admin recovery / home-storage.
- Do not transcribe `Crypt`/`KeyManager` class-for-class.
- Do not invent a fourth status string.

## Parity notes

Minimum per endpoint: happy, unauthenticated 401, one validation/403.

| Case | Expectation |
| --- | --- |
| GET status, init `'2'` | 200 `status=success`, `initStatus="2"` |
| GET status, init `'0'`, encryption on | `interactionNeeded` + logout/login message |
| GET status, unknown | `status=error`, message `no valid init status` |
| POST adminRecovery empty password | 400 `Missing recovery key password` |
| POST adminRecovery mismatch | 400 repeated-password message |
| POST changeRecoveryPassword empty old | 400 old-password message |
| POST userSetRecovery true (stub ok) | 200 `Recovery Key enabled` |
| POST updatePrivateKeyPassword wrong login | 400 top-level `message` current-login string |
| POST setEncryptHomeStorage as user | 403 |
| POST setEncryptHomeStorage as admin | 200 empty data |
| GET on a POST route | 405 |

l10n: tests may pass through identity translator (PHPUnit `willReturnArgument(0)`). Parity against live PHP uses translated strings for the instance language.

## Repo paths

- Routes: `apps/encryption/appinfo/routes.php`
- Status: `apps/encryption/lib/Controller/StatusController.php`
- Recovery HTTP: `apps/encryption/lib/Controller/RecoveryController.php`
- Settings HTTP: `apps/encryption/lib/Controller/SettingsController.php`
- Recovery domain: `apps/encryption/lib/Recovery.php`
- Session: `apps/encryption/lib/Session.php`
- Util / home storage: `apps/encryption/lib/Util.php`
- Bootstrap: `apps/encryption/lib/AppInfo/Application.php`
- Tests: `apps/encryption/tests/Controller/`
- Vue callers: `apps/encryption/src/components/Settings*.vue`, `apps/encryption/src/encryption.ts`
