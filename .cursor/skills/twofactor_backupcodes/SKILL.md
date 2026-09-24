---
name: twofactor_backupcodes
description: 2FA backup-code domain (storage, provider, generate). Mapped HTTP createCodes is owned by settings — do not invent endpoint ids here.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# twofactor_backupcodes

## Purpose

Second-factor **backup codes**: generate, hash-store, consume once, expose as 2FA provider `backup_codes`. Personal settings POST generates codes; login challenge verifies one unused code.

Feature map `endpoint_ids: (0)`. **Do not invent map ids.** The only AppFramework route is owned by **`settings`** (`twofactor_backupcodes.settings#createCodes.post`).

Depends on `core-login` for 2FA challenge UI.

## Scope

PHP surface for this app:

- Table `twofactor_backupcodes`
- `BackupCodeStorage` generate/validate/state/delete
- Provider `backup_codes` (challenge + personal settings + admin disable)
- Events: `CodesGenerated` → activity, registry enable, clear notify
- Jobs: remind user to generate codes; post-migration scan
- Challenge template (rendered by **core-login** TwoFactorChallenge, not a map id here)

## Non-scope

- **HTTP POST `/apps/twofactor_backupcodes/settings/create`** — implement in **`settings`** (map owner). This skill is the domain contract that settings must call.
- Core 2FA challenge/select/solve routes — `core-login`
- Other 2FA providers (TOTP, WebAuthn)
- Admin two-factor policy OCS — `settings` `TwoFactorSettings`
- Inventing OCS/REST that PHP does not have

## Endpoints owned

**None.** `docs/feature-map.mdc` → `twofactor_backupcodes` lists zero ids.

Adjacent mapped route (do not claim; do not add a new id):

| Map id (settings) | Method | Path | PHP |
| --- | --- | --- | --- |
| `twofactor_backupcodes.settings#createCodes.post` | POST | `/apps/twofactor_backupcodes/settings/create` | `SettingsController::createCodes` |

Path is `/settings/create` in `appinfo/routes.php` (not `/settings/createCodes`). Settings skill path is stale; **PHP wins**.

Unmapped HTML: personal settings section + `templates/challenge.php` (POST field `challenge`).

## Key types / entities

Table `twofactor_backupcodes` (`BackupCode`):

| Column | Type |
| --- | --- |
| `id` | int PK |
| `user_id` | string 64 |
| `code` | string 128 **hashed** (`IHasher::hash`) |
| `used` | smallint default 0 (`0` unused, `1` used) |

Provider id: **`backup_codes`**. Display name l10n `Backup code`.

`createCodes(user, number = 10)`:

1. `deleteByUser` (regenerate wipes previous)
2. Loop `range(1, min(number, 20))` — **cap 20**
3. Each code: `ISecureRandom::generate(16, CHAR_HUMAN_READABLE)`  
   Alphabet: `abcdefgijkmnopqrstwxyzABCDEFGHJKLMNPQRSTWXYZ23456789` (no `h l i o 0 1`)
4. Store hash, `used=0`. Return **plaintext** list
5. Dispatch `CodesGenerated($user)`

HTTP controller always uses default **10** (does not pass `$number`).

`getBackupCodesState`: `{ enabled: total>0, total: int, used: int }` (`used` count of rows with `used===1`).

`validateCode`: first unused row whose hash verifies; `markUsedIfUnused` CAS (`used=0` → `1`). Success only if **1 row** updated. Concurrent double-use fails.

`hasBackupCodes`: `findOneByUser !== null` (includes already-used rows — leftover used codes still “enable” 2FA for this provider).

`disableFor(user)` / `deleteCodes`: delete all rows. Does not itself unregister; admin 2FA disable uses this.

`isActive($user)` on provider: true if **any other enabled app** for that user declares `two-factor-providers` in info.xml. Backup codes settings UI hidden if no other 2FA app.

## PHP HTTP surface (settings-owned)

`SettingsController::createCodes`:

- `#[NoAdminRequired]` `#[PasswordConfirmationRequired]`
- Session user → `createCodes($user)` → JSON **200** (not OCS):

```
{ "codes": string[], "state": { "enabled": bool, "total": int, "used": int } }
```

Anonymous → 401. Unconfirmed password → 403. CSRF unless token.

After generate: `RegistryUpdater` `enableProviderFor(backup_codes)`; `ActivityPublisher` subject `codes_generated` type `security`; `ClearNotifications` marks `app=twofactor_backupcodes` `object=create/codes` processed.

## Challenge (core-login-owned)

`BackupCodesProvider::verifyChallenge($user, $challenge)` → `validateCode`. Template `twofactor_backupcodes/challenge` POST `challenge`.

Provider `isTwoFactorAuthEnabledForUser` = `hasBackupCodes`.

## Jobs / listeners (not HTTP)

`ProviderEnabled` (`TwoFactorProviderForUserRegistered`): if `backup_codes` state is not already true, queue `RememberBackupCodesJob` `{uid}`.

`ProviderDisabled`: if **all** provider states false, remove that job.

`RememberBackupCodesJob`: interval 14 days. If user missing/disabled or 2FA off or backup_codes already true → remove job. Else markProcessed + notify `subject=create_backupcodes`, `object=create/codes`. Notifier link = `settings.PersonalSettings.index` `section=security`.

`CheckBackupCodes` (post-migration queued): seen enabled users with 2FA on and `backup_codes === false` → same remember job.

`UserDeleted`: delete codes for uid.

## Auth / tenant rules

- Generate: **own** session user only. No admin generate-for-other HTTP.
- Admin may `disableFor` via 2FA registry (core/settings), which deletes codes.
- Codes never leave the generate response in plaintext after that; DB is hashed.
- Tenant = uid. Challenge consumes one code for that user only.
- Password confirmation on generate.

## Failure modes

| Condition | Result |
| --- | --- |
| POST create anonymous | 401 (settings route) |
| POST without password confirm | 403 |
| CSRF missing | 412/403 per core |
| Validate unknown/used code | `false` (challenge fail; core-login retry) |
| Concurrent use of same code | second `markUsedIfUnused` 0 rows → false |
| `createCodes` n>20 | 20 codes |
| No other 2FA app | provider `isActive` false (settings UI hidden); generate still works if called |
| User deleted | rows removed |

No OCS 404/400 in this app. Generate does not 400 on empty user (would error if session null — framework should not call).

## Conceptual Next.js shape

```
src/server/twofactor_backupcodes/
  types.ts
  storage.ts          # hash, cap 20, CAS used
  provider.ts         # id backup_codes; verify; state
# HTTP lives in settings slice:
app/apps/twofactor_backupcodes/settings/create/route.ts
```

Challenge POST is `core-login`. Inject the same `storage.ts` port. Do not add `/ocs/.../backupcodes`.

## Traps

- **0 map ids** on this feature. Do not create `twofactor_backupcodes-*` ids to “fill the gap”
- Settings map path `.../createCodes` ≠ PHP `.../settings/create`
- Response is **JSONResponse**, not OCS envelope
- Default 10 codes, hard cap 20, length 16 human-readable
- `enabled` in state is `total>0`, not registry
- Used codes still satisfy `hasBackupCodes` until deleted/regenerated
- Regenerating deletes **all** previous hashes
- Notification object is (`create`, `codes`) not the code strings
- `CHAR_HUMAN_READABLE` omits ambiguous chars — do not use `[A-Za-z0-9]`

## Do not

- Invent endpoint_ids or OCS CRUD
- Implement createCodes in this slice if the implementer is slicing `twofactor_backupcodes` by the map (0 routes) — wait for **settings** or share `storage.ts` only
- Log plaintext codes
- Return hashes to the client
- Treat backup codes as a standalone 2FA method when `isActive` is false (product UI hides them; storage API still exists)
- Add `Signed-off-by`
- Edit `endpoint-map.yaml` to “fix” the 0 ids from this skill

## Parity notes

This feature has **no mapped endpoints** → no parity ids to mark `tested` here.

When settings implements createCodes, extras:

| Case | Expect |
| --- | --- |
| POST create logged-in + confirm | 200 `{ codes: length 10, state: { enabled: true, total: 10, used: 0 } }` |
| Second POST | new 10 codes; old hashes invalid |
| POST anonymous | 401 |
| POST no confirm | 403 |
| Challenge unused code | success once; second attempt fail |
| Codes alphabet | subset of `CHAR_HUMAN_READABLE`, length 16 |

Do not assert job tables in HTTP parity. Never put plaintext codes in logs/fixtures beyond the generate response comparison.

## Repo links

- Routes: `apps/twofactor_backupcodes/appinfo/routes.php`
- HTTP: `apps/twofactor_backupcodes/lib/Controller/SettingsController.php`
- Storage: `apps/twofactor_backupcodes/lib/Service/BackupCodeStorage.php`
- Entity: `apps/twofactor_backupcodes/lib/Db/{BackupCode,BackupCodeMapper}.php`
- Provider: `apps/twofactor_backupcodes/lib/Provider/BackupCodesProvider.php`
- Event: `apps/twofactor_backupcodes/lib/Event/CodesGenerated.php`
- Listeners: `apps/twofactor_backupcodes/lib/Listener/*.php`
- Jobs: `apps/twofactor_backupcodes/lib/BackgroundJob/{CheckBackupCodes,RememberBackupCodesJob}.php`
- Challenge template: `apps/twofactor_backupcodes/templates/challenge.php`
- Activity: `apps/twofactor_backupcodes/lib/Activity/Provider.php`
- Notifier: `apps/twofactor_backupcodes/lib/Notifications/Notifier.php`
- Tests: `apps/twofactor_backupcodes/tests/`
- Settings owner skill: `.cursor/skills/settings/SKILL.md`
- Map: `docs/feature-map.mdc` → `twofactor_backupcodes` (0 ids)
