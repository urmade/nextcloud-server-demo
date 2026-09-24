---
name: files_trashbin
description: Deleted-file preview HTTP plus the trash store DAV list/restore/purge consume. Use when implementing or testing files_trashbin or trash previews.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# files_trashbin

## Purpose

Hold deleted files for restore/purge. Clients list and restore over WebDAV (`dav` slice). This slice owns HTTP preview of a trashed **file** (not folder) and the trash store DAV nodes call.

Depends on `dav`. Capabilities under `files.undelete` and `files.delete_from_trash`.

## Scope

- `GET /apps/files_trashbin/preview`
- Trash items, backends, expiration, restore used by DAV
- Advertise `files.undelete: true` and `files.delete_from_trash` from `files.trash.delete` (default true)

## Non-scope

- Sabre tree `/remote.php/dav/trashbin/…` — `dav`
- Version preview (`files_versions`); core preview (`core-preview-*`)
- Live-photo restore pairing (`SyncLivePhotosListener`) as HTTP
- Pixel-perfect preview bytes

## Endpoints owned

**Same PHP action, two scan ids:**

| id | Source | Path |
| --- | --- | --- |
| `files_trashbin.Preview#getPreview` | `apps/files_trashbin/appinfo/routes.php` | `/apps/files_trashbin/preview` |
| `files_trashbin-preview-get-preview` | `apps/files_trashbin/openapi.json` `preview-get-preview` | `/index.php/apps/files_trashbin/preview` |

One handler. Both ids need parity.

## Key types / entities

| Name | Role |
| --- | --- |
| `ITrashItem` | `originalLocation`, `deletedTime`, `trashPath`, `isRootItem`, `user`, `deletedBy`, `title` + `FileInfo` |
| `ITrashBackend` | `listTrashRoot`, `listTrashFolder`, `restoreItem`, `removeItem`, `moveToTrash`, `getTrashNodeById` |
| `ITrashManager` | Backend registry; `pauseTrash` / `resumeTrash`; `getTrashRootItem(user, name)` |
| `LegacyTrashBackend` | Default for `IStorage`. Bytes under user `files_trashbin/files` |
| Root trash name | `{filename}.d{unixTimestamp}`; if >250 chars, middle-truncate with `_` (`Trashbin::getTrashFilename`) |
| Retention | `trashbin_retention_obligation` (default `auto`, 30 days). Cap ~50% free quota |
| Purge gate | System `files.trash.delete` (bool, default true). When false, DAV DELETE on trash → 403 |

## Endpoint walkthrough

`GET` query:

| Param | Default | Rule |
| --- | --- | --- |
| `fileId` | `-1` | Numeric filecache id of the **trashed** node; `-1` → 400 |
| `x` | `32` | Width; `0` → 400 |
| `y` | `32` | Height; `0` → 400 |
| `a` | `false` | `true` = do **not** crop (`crop = !$a`) |

Flow (`PreviewController::getPreview`):

1. `fileId === -1` or `x===0` or `y===0` → **400** `[]`
2. `trashManager.getTrashNodeById(currentUser, fileId)` — null → **404** `[]`
3. Node is `Folder` → **400** `[]` (no folder previews)
4. Mime from path: if extension matches `/d\d+/` (root-level timestamp suffix), detect mime from **filename without** `.d{n}`; else detect from full name
5. `previewManager.getPreview(file, x, y, !$a, MODE_FILL, mimeType)`
6. **200** binary, `Content-Type` = preview mime. `cacheFor(86400)` — private, **not** immutable
7. `NotFoundException` → **404** `[]`; `InvalidArgumentException` → **400** `[]`

No `mimeFallback` (unlike versions).

## Auth / tenant rules

`#[NoAdminRequired]` + `#[NoCSRFRequired]`. Login required. Not public.

- Lookup is **current user** + file id via trash manager — no raw path into another user’s trash
- Map `session` vs `mixed` = same handler → **login required**, 401 if missing
- `files.trash.delete` does **not** affect preview GET

## Failure modes

| Condition | Status | Body |
| --- | --- | --- |
| `fileId` omitted/`-1`; `x` or `y` is 0 | 400 | `[]` |
| Id is a folder | 400 | `[]` |
| Unknown id / not in this user’s trash | 404 | `[]` |
| Preview engine reject | 400 | `[]` |
| Preview missing | 404 | `[]` |
| Unauthenticated | 401 | `{ message }` |
| Wrong method | 405 | |

DAV (adjacent): `MOVE` trash node → `…/restore/{any}`. If restore target free space − size < **65536** bytes → **507** and move aborted. Listing another user’s `/trashbin/{uid}` → **403**. `DELETE` collection or item when `files.trash.delete=false` → 403.

## Conceptual Next.js shape

```
src/server/files-trashbin/
  types.ts
  store.ts              # list / getById / restore / purge / expire
  preview.ts
app/apps/files_trashbin/preview/route.ts
```

## Traps

- Dual map ids, one handler
- Defaults **32×32** (versions uses 44)
- Crop flag inverted: `a=true` means no crop
- Root names end in `.d{timestamp}` — strip only when the **extension** matches `/d\d+/` before mime sniff
- Cache 24h private, not immutable
- Binary parity: status + type + size class
- Do not clone `files_trashbin/files` on disk; keep fileId + original path + deletedTime + bytes

## Do not

- Implement `/remote.php/dav/trashbin/…` here (`dav`)
- Accept `file` path query (that is versions/core, not this controller)
- Preview folders
- Return OCS envelope
- Skip the 507 restore quota check if implementing restore in the store
- Invent mime-icon fallback
- Edit `endpoint-map.yaml` from this skill

## Parity notes

Minimum per id: happy file preview, unauthenticated 401, validation 400 (`fileId` missing or folder).

Extras:

| Case | Expect |
| --- | --- |
| Happy | auth + trashed file id → 200 image |
| Folder id | 400 `[]` |
| Unknown id | 404 `[]` |
| Root file named `photo.png.d1234` | mime sniffed as png |
| `a=true` | still 200; crop off (do not assert pixels) |
| `PUT` | 405 |
| `/index.php` prefix | same handler |

Fixture: one trashed file with known fileId; one trashed folder.

## Repo links

- Routes: `apps/files_trashbin/appinfo/routes.php`
- Preview: `apps/files_trashbin/lib/Controller/PreviewController.php`
- Tests: `apps/files_trashbin/tests/Controller/PreviewControllerTest.php`
- OpenAPI: `apps/files_trashbin/openapi.json`
- Capabilities: `apps/files_trashbin/lib/Capabilities.php`
- Config: `apps/files_trashbin/lib/Service/ConfigService.php` (`files.trash.delete`)
- Manager: `apps/files_trashbin/lib/Trash/{ITrashManager,ITrashBackend,ITrashItem,TrashManager,LegacyTrashBackend}.php`
- Names/expire: `apps/files_trashbin/lib/Trashbin.php` (`getTrashFilename`), `Expiration.php`
- DAV (adjacent): `apps/files_trashbin/lib/Sabre/{RootCollection,TrashHome,TrashRoot,RestoreFolder,TrashbinPlugin,AbstractTrash,TrashFile}.php`
- App: `apps/files_trashbin/appinfo/info.xml`
- Map: `docs/feature-map.mdc` → `files_trashbin`
