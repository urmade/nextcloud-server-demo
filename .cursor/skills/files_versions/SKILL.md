---
name: files_versions
description: File version preview HTTP plus the version store DAV restore/list consume. Use when implementing or testing files_versions, version previews, or version rollback.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# files_versions

## Purpose

Keep per-file historical revisions and serve a thumbnail of a chosen revision. Clients list and restore versions over WebDAV (`dav` slice). This slice owns the HTTP preview of a revision and the version store those DAV nodes call.

Depends on `dav`. Capabilities live under `files` in `/cloud/capabilities` (`core-status` slice).

## Scope

- `GET /apps/files_versions/preview` (pretty URL; `/index.php` prefix also valid)
- Version entities, backends, expiration, rollback used by DAV
- Advertise `files.versioning`, `files.version_labeling`, `files.version_deletion`

## Non-scope

- Sabre route tree `/remote.php/dav/versions/…` — `dav` endpoints
- Core file preview (`core-preview-*`)
- Trashbin preview (`files_trashbin`)
- Workflow “create version” UI (`workflowengine`)
- Pixel-perfect preview bytes; compare status + content-type + size class

## Endpoints owned

Map `feature_ids` contains `files_versions`. **Same PHP action, two scan ids:**

| id | Source | Path |
| --- | --- | --- |
| `files_versions.Preview#getPreview` | `apps/files_versions/appinfo/routes.php` | `/apps/files_versions/preview` |
| `files_versions-preview-get-preview` | `apps/files_versions/openapi.json` `preview-get-preview` | `/index.php/apps/files_versions/preview` |

Implement **one** handler. Both ids need parity.

## Key types / entities

| Name | Role |
| --- | --- |
| `IVersion` | `revisionId`, `timestamp`, `size`, `sourceFileName`, `mimeType`, `versionPath`, `user`, `sourceFile` |
| `IVersionBackend` | `getVersionsForFile`, `createVersion`, `rollback`, `read`, `getVersionFile` |
| `IVersionManager` | Picks backend per storage class (`instanceOfStorage`, most-specific type wins) |
| `VersionEntity` | Table `files_versions`: `id`, `file_id`, `timestamp`, `size`, `mimetype` (id), `metadata` JSON. Unique `(file_id, timestamp)` |
| `LegacyVersionsBackend` | Default for `OCP\Files\Storage\IStorage`. Bytes under user `files_versions/` |
| Shared file | Versions live on the **share owner**. Resolve owner via `ISharedStorage::getOwner` |
| Retention | `versions_retention_obligation` (default `auto`). Max ~50% of free quota (`Storage::DEFAULTMAXSIZE`) |
| System flags | `enable_version_labeling` (default true), `enable_version_deletion` (default true) — **capabilities only**; DAV delete/label does not re-read them |

## Endpoint walkthrough

`GET` query:

| Param | Default | Rule |
| --- | --- | --- |
| `file` | `''` | Path relative to the **current user’s** files folder |
| `x` | `44` | Width; `0` → 400 |
| `y` | `44` | Height; `0` → 400 |
| `version` | `''` | Revision id (legacy: unix timestamp string); empty → 400 |
| `mimeFallback` | `false` | If preview missing **and** the version file was resolved, 303 to mime icon URL |

Flow (`PreviewController::getPreview`):

1. Empty `file` / `version` or `x===0` or `y===0` → **400** `[]`
2. `rootFolder.getUserFolder(uid).get(file)` then `versionManager.getVersionFile(user, file, version)`
3. `previewManager.getPreview(versionFile, x, y, crop=true, MODE_FILL, versionFile.mimetype)`
4. **200** `FileDisplayResponse`, `Content-Type` = preview mime. `cacheFor(86400, public=false, immutable=true)`
5. `NotFoundException`: if `mimeFallback` and `versionFile !== null` and mime icon URL exists → **303**; else **404** `[]`
6. `InvalidArgumentException` → **400** `[]`

`mimeFallback` does **not** fire when the **source** path is missing (`versionFile` still null).

## Auth / tenant rules

`#[NoAdminRequired]` + `#[NoCSRFRequired]`. Login required (session, Basic, or Bearer). Not `PublicPage`.

- Unauthenticated → **401** (AppFramework), not a public preview
- Scope: **current user** files folder only. No cross-user path
- Shared files: preview path is still the caller’s path; version bytes come from owner storage
- Admin is not required; no CSRF on GET

Map `auth: session` (routes scan) vs `mixed` (OpenAPI) are the same handler — treat as **login required**.

## Failure modes

| Condition | Status | Body |
| --- | --- | --- |
| Missing/empty `file` or `version`; `x` or `y` is 0 | 400 | `[]` |
| Source path or revision missing | 404 | `[]` |
| Preview engine `InvalidArgumentException` | 400 | `[]` |
| Preview missing + `mimeFallback=true` + version file exists + icon URL | 303 | Location = mime icon |
| Preview missing otherwise | 404 | `[]` |
| Unauthenticated | 401 | `{ message }` (OpenAPI) |
| Wrong method | 405 | |

DAV (adjacent, `dav` slice): listing `/versions/{uid}` for another user → **403**. Restore = `MOVE` a `VersionFile` onto `…/restore/{any}`. Delete revision requires `PERMISSION_DELETE` on the source file else Sabre 403.

## Conceptual Next.js shape

```
src/server/files-versions/
  types.ts            # Version, VersionBackend
  store.ts            # list / getRevisionFile / rollback / expire
  preview.ts          # GET handler
app/apps/files_versions/preview/route.ts
```

Rewrite `/index.php/apps/files_versions/preview` → same handler.

## Traps

- Dual map ids, one handler
- Defaults **44×44**, crop on (`MODE_FILL`)
- Cache: private + immutable 24h — not the trashbin cache tuple
- Binary parity: status + content-type + size class, not pixels (`core` preview skill)
- Do not clone PHP `files_versions/` layout; keep revision id + source file + readable bytes
- Capabilities are under `files.*`, not a top-level `files_versions` key

## Do not

- Implement `/remote.php/dav/versions/…` in this slice (`dav`)
- Invent a second preview query (`fileId` belongs to trashbin/core)
- Return OCS envelope (plain JSON `[]` / binary)
- Cross-user previews
- Gate HTTP preview on `enable_version_deletion` / labeling flags
- Transcribe `Storage::MAX_VERSIONS_PER_INTERVAL` unless a client-visible expire contract is asserted
- Edit `endpoint-map.yaml` from this planning skill

## Parity notes

Minimum per id: happy, unauthenticated 401, validation 400 (`file` empty or `x=0`).

Extras:

| Case | Expect |
| --- | --- |
| Happy | auth + existing `file`+`version` → 200 image, `Content-Type` image/*, cache-control present |
| Missing revision | 404 `[]` |
| `mimeFallback=true` and no preview but version exists | 303 or 404 if no icon URL |
| `mimeFallback=true` and missing source path | 404, not 303 |
| `PUT` | 405 |
| `/index.php` prefix | same as pretty URL |

Fixture: one file with one named revision. Do not assert pixel bytes.

## Repo links

- Routes: `apps/files_versions/appinfo/routes.php`
- Preview: `apps/files_versions/lib/Controller/PreviewController.php`
- Tests: `apps/files_versions/tests/Controller/PreviewControllerTest.php`
- OpenAPI: `apps/files_versions/openapi.json`
- Capabilities: `apps/files_versions/lib/Capabilities.php`
- Manager/backend: `apps/files_versions/lib/Versions/VersionManager.php`, `IVersionBackend.php`, `LegacyVersionsBackend.php`
- Entity: `apps/files_versions/lib/Db/VersionEntity.php` — table `files_versions`
- Bytes/expire: `apps/files_versions/lib/Storage.php`, `Expiration.php`
- DAV (adjacent): `apps/files_versions/lib/Sabre/{RootCollection,VersionHome,VersionRoot,VersionCollection,VersionFile,RestoreFolder,Plugin}.php`
- App: `apps/files_versions/appinfo/info.xml`
- Map: `docs/feature-map.mdc` → `files_versions`
