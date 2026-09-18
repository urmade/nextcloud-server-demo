---
name: files_external
description: External storage mount CRUD (admin/personal/user-global) and OCS user mounts. Use when implementing or testing files_external.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# files_external

## Purpose

Configure mounts to remote/local backends (FTP, S3, WebDAV, SFTP, SMB, Swift, Nextcloud, local). Admin mounts apply to users/groups/everyone; users may add personal mounts when allowed. Files bytes are served through **`dav`/`files`**, not these HTTP routes.

Depends on `dav`. Settings HTML (`Settings\Admin` / `Personal`) is chrome, not a mapped endpoint.

## Scope

- HTTP resource CRUD: `/apps/files_external/{globalstorages,userstorages,userglobalstorages}`
- Ajax: applicable picker, SSH keygen, global credentials
- OCS `GET /ocs/v{1,2}.php/apps/files_external/api/v1/mounts`

## Non-scope

- WebDAV I/O on mounted folders (`dav` / `files`)
- CLI (`occ files_external:*`)
- Extra backends from `OCA\Files_External::loadAdditionalBackends` unless a fixture registers one
- Real remote servers in parity — stub backend status
- Settings pages HTML

## Endpoints owned

All `feature_ids: [files_external]`.

### Ajax (JSON, not OCS)

| id | Method | Path |
| --- | --- | --- |
| `files_external.Ajax#getApplicableEntities` | GET | `/apps/files_external/ajax/applicable` |
| `files_external.Ajax#getSshKeys.post` | POST | `/apps/files_external/ajax/public_key.php` |
| `files_external.Ajax#saveGlobalCredentials.post` | POST | `/apps/files_external/globalcredentials` |

### Global (admin) storages

| id | Method | Path |
| --- | --- | --- |
| `files_external.global_storages#index` | GET | `/apps/files_external/globalstorages` |
| `files_external.global_storages#create.post` | POST | same |
| `files_external.global_storages#show` | GET | `/apps/files_external/globalstorages/{id}` |
| `files_external.global_storages#update.put` | PUT | same |
| `files_external.global_storages#destroy.delete` | DELETE | same |

### Personal storages

| id | Method | Path |
| --- | --- | --- |
| `files_external.user_storages#index` | GET | `/apps/files_external/userstorages` |
| `files_external.user_storages#create.post` | POST | same |
| `files_external.user_storages#show` | GET | `/apps/files_external/userstorages/{id}` |
| `files_external.user_storages#update.put` | PUT | same |
| `files_external.user_storages#destroy.delete` | DELETE | same |

### User-visible admin mounts

| id | Method | Path |
| --- | --- | --- |
| `files_external.user_global_storages#index` | GET | `/apps/files_external/userglobalstorages` |
| `files_external.user_global_storages#show` | GET | `/apps/files_external/userglobalstorages/{id}` |
| `files_external.user_global_storages#update.put` | PUT | same |
| `files_external.user_global_storages#create.post` | POST | `/apps/files_external/userglobalstorages` |
| `files_external.user_global_storages#destroy.delete` | DELETE | `/apps/files_external/userglobalstorages/{id}` |

`UserGlobalStoragesController` implements **index / show / update only**. Service `addStorage` / `updateStorage` / `removeStorage` throw `DomainException`. Resource routes still exist — do **not** invent successful create/destroy. Match legacy error (typically 500 / uncaught), do not return 201/204.

### OCS

| id | Method | Path |
| --- | --- | --- |
| `files_external-api-get-user-mounts` | GET | `/ocs/v2.php/apps/files_external/api/v1/mounts` (`ocs_version: both`) |

## Key types / entities

`StorageConfig` JSON (`jsonSerialize(true)` obfuscates password params to `__unmodified__`):

```
id, mountPoint, backend, authMechanism, backendOptions,
priority?, applicableUsers?, applicableGroups?, mountOptions?,
status?, statusMessage?, userProvided, type: 'personal'|'system'
```

OCS mount (`Files_ExternalMount`):

```
id, type: 'dir', name, path, permissions, scope: 'system'|'personal',
backend, class, config: StorageConfig
```

| Constant | Value |
| --- | --- |
| `MOUNT_TYPE_ADMIN` / `system` | 1 |
| `MOUNT_TYPE_PERSONAL` / `personal` | 2 |
| Default `priority` | 100 |
| Default `mountOptions.enable_sharing` | false |
| `PERMISSION_READ` | 1 |
| `PERMISSION_DELETE` | 8 |
| Password placeholder (UI serialize) | `__unmodified__` |
| Global-auth password mask | `************************` |

Tables: `external_mounts`, `external_applicable` (global=1, group=2, user=3), `external_config`, `external_options`. Secrets encrypted at rest (`ICrypto` / `EncryptionService`).

Backends (identifiers): `local`, `ftp`, `dav`, `owncloud`, `sftp`, `amazons3`, `swift`, `smb`, plus legacy `\OC\Files\Storage\SFTP_Key`, `\OC\Files\Storage\SMB_OC`.

Auth identifiers: `null::null`, `builtin::builtin`, `password::password`, `password::sessioncredentials`, `password::logincredentials`, `password::userprovided`, `password::global`, `password::global::user`, `publickey::rsa`, `publickey::rsa_private`, `openstack::openstack`, `openstack::openstackv3`, `openstack::rackspace`, `amazons3::accesskey`, `smb::kerberos`, `smb::kerberosapache`.

App config: `allow_user_mounting` (bool, default **false**), `user_mounting_backends` (csv). Empty backends list forces user mounting off. System `files_external_allow_create_new_local` (default true) — if false, backend `local` create/update → **403** `{ message }`.

## Endpoint walkthrough

### Ajax

**GET applicable** — admin / delegated admin (`AuthorizedAdminSetting` → `Settings\Admin`). Query `pattern`, `limit`, `offset`. Body `{ groups: { gid: displayName }, users: { uid: displayName } }`. Groups via `IGroupManager.search`; users via `IUserManager.searchDisplayName`.

**POST SSH keys** — any logged-in user. Body `keyLength` (default 1024). `{ status: 'success', data: { private_key, public_key } }`. Public key comment replaces `phpseclib-generated-key` with `gethostname()`. CSRF required.

**POST global credentials** — `uid`, `user`, `password`. `PasswordConfirmationRequired(strict)`.  
- `uid === currentUid` → save personal global-auth  
- `uid === ''` → admin **or** delegated admin only  
- else → **403** `{ status: 'success', message: 'Permission denied' }` (status string is `success` even on 403)  
- no session → **401** `{ status: 'error', message }`  
Password `************************` means keep previous.

### Storage CRUD body (create/update)

`mountPoint`, `backend`, `authMechanism`, `backendOptions[]`, optional `mountOptions`, `applicableUsers`, `applicableGroups`, `priority`.

User storages: **no** applicable users/groups in the controller — service forces `applicableUsers = [currentUid]`.

Validation (`StoragesController::validate`) → **422** `{ message }`: empty mount point; client-sent `backendOptions.objectstore`; backend/auth not visible for this visibility; unsatisfied params; `checkRequiredDependencies()` truthy → invalid backend.

Create → **201** + serialized config (status probed). Update → **200**. Destroy → **204** `[]`. Missing id → **404** `{ message }`. Invalid backend class → **422**.

`show` probes backend status (can be slow / 3rd party). `can_edit` = personal type **or** caller is admin.

User-global **update**: only if auth is `IUserProvided` or `UserGlobalAuth`; else **403**. Response sanitizes `backendOptions` and `mountOptions` to `[]` then re-fills user-provided fields.

User-global **index**: `getUniqueStorages()` — same mountPoint keeps highest: user-applicable (2) > group (1) > all (0), then numeric `priority`. Config stripped.

### OCS mounts

Merge user-global then personal; **personal overwrites** the same `mountPoint`.  
`scope` system vs personal from mount type.  
`permissions`: system = `1` (read); personal = `1|8` (read+delete).  
`path` = dirname(mountPoint) or `''` if `.` or `/`.  
`name` = basename(mountPoint).  
`config` = `jsonSerialize(true)` (passwords obfuscated).

## Auth / tenant rules

HTTP: session (+ CSRF on POST/PUT/DELETE unless GET). Mutating storage + save credentials + destroy: **strict password confirmation**.

| Surface | Who |
| --- | --- |
| `globalstorages` * | Admin or delegated `files_external` admin setting |
| `userstorages` * | Logged-in user; only **their** personal mounts (`isApplicable`) |
| `userglobalstorages` GET/PUT | Logged-in user; admin mounts **applicable** to them (user / group / empty=all) |
| Ajax applicable | Admin / delegated admin |
| Ajax SSH keys | Logged-in |
| Ajax credentials | Self, or admin/delegated for `uid=''` |
| OCS mounts | Logged-in (`NoAdminRequired`). Map says `mixed`; controller is not `PublicPage` → **401** if anonymous |

Personal backends must be `VISIBILITY_PERSONAL` and in `user_mounting_backends` when `allow_user_mounting` is on.

Never return decrypted passwords to the client. Updates send `__unmodified__` to leave secrets unchanged.

## Failure modes

| Condition | Status |
| --- | --- |
| Unauthenticated HTTP | 401 |
| CSRF missing on POST/PUT/DELETE | 412 / 412-style AppFramework CSRF fail — match legacy |
| Password confirmation missing on annotated methods | 403 |
| Not admin on `globalstorages` / applicable picker | 403 |
| Local backend while `files_external_allow_create_new_local=false` | 403 `{ message }` |
| Invalid backend/auth/mount/objectstore/params | 422 `{ message }` |
| Unknown storage id | 404 `{ message }` |
| User-global update on non-user-provided auth | 403 |
| User-global create/destroy | no success path (`DomainException` if destroy runs) |
| Credentials for another user | 403, `status: 'success'` in JSON |
| OCS anonymous | 401 OCS envelope |
| `objectstore` in backendOptions from client | 422 |

## Conceptual Next.js shape

```
src/server/files-external/
  types.ts
  backends.ts           # identifier registry (stub status)
  mounts.ts             # CRUD + applicability + unique-by-mountpoint
  credentials.ts        # global auth store
  serialize.ts          # obfuscate passwords
  ocs-mounts.ts
app/apps/files_external/globalstorages/route.ts
app/apps/files_external/globalstorages/[id]/route.ts
app/apps/files_external/userstorages/route.ts
app/apps/files_external/userstorages/[id]/route.ts
app/apps/files_external/userglobalstorages/route.ts
app/apps/files_external/userglobalstorages/[id]/route.ts
app/apps/files_external/ajax/applicable/route.ts
app/apps/files_external/ajax/public_key.php/route.ts
app/apps/files_external/globalcredentials/route.ts
app/ocs/v2.php/apps/files_external/api/v1/mounts/route.ts
```

Do not implement real FTP/S3/SMB in parity. Stub `status` / connectivity.

## Traps

- HTTP JSON **is not** OCS except `/api/v1/mounts`
- Destroy **204**, create **201**
- 422 not 400 for validation
- Credentials 403 still has `status: 'success'`
- `__unmodified__` vs `************************` are different placeholders
- OCS personal mount wins on duplicate mountPoint
- `show`/`create`/`update` may set `status` via live probe — stub in parity, compare keys not remote latency
- `index.php` prefix on app HTTP routes

## Do not

- Share Tailwind or mount credentials with other apps
- Log or return live secrets
- Implement DAV file I/O here
- Add backends not in PHP `Application::getBackends()` without a fixture
- Make `userglobalstorages` full CRUD
- Allow non-admin to set `uid=''` credentials
- Accept `objectstore` from the client
- Edit `endpoint-map.yaml` from this skill

## Parity notes

Minimum per endpoint: happy, auth failure, one validation/forbidden.

Extras:

| Case | Expect |
| --- | --- |
| OCS mounts | 200 list; anonymous 401; `scope`/`permissions` as above |
| Global create as non-admin | 403 |
| User create local when system forbids | 403 |
| User update other user’s mount id | 404 |
| Destroy | 204 empty |
| Applicable picker as user | 403 |
| SSH keys | 200 `data.public_key` + `private_key` |
| Credentials other uid | 403 + `Permission denied` |
| User-global index | no `backendOptions` secrets |
| Duplicate mountPoint OCS | personal entry only |

v1 vs v2 OCS: same `data`; v1 `meta.statuscode` 100 vs v2 200 (`bp-ocs-envelope`).

## Repo links

- Routes: `apps/files_external/appinfo/routes.php`
- Controllers: `apps/files_external/lib/Controller/{Ajax,Api,Storages,GlobalStorages,UserStorages,UserGlobalStorages}Controller.php`
- Tests: `apps/files_external/tests/Controller/{AjaxController,UserStoragesController,GlobalStoragesController,StoragesControllerTestCase}.php`
- Types: `apps/files_external/lib/ResponseDefinitions.php`, `Lib/StorageConfig.php`, `Lib/DefinitionParameter.php`
- Services: `apps/files_external/lib/Service/{DBConfigService,StoragesService,GlobalStoragesService,UserStoragesService,UserGlobalStoragesService,BackendService,EncryptionService}.php`
- Config: `apps/files_external/lib/ConfigLexicon.php`
- Auth/backends: `apps/files_external/lib/Lib/Auth/`, `Lib/Backend/`, `AppInfo/Application.php`
- Mount into files: `apps/files_external/lib/Config/ConfigAdapter.php` (`dav`/`files`)
- OpenAPI: `apps/files_external/openapi.json`
- App: `apps/files_external/appinfo/info.xml`
- Map: `docs/feature-map.mdc` → `files_external`
