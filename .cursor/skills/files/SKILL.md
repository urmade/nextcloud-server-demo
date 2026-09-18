---
name: files
description: Files app UI, JSON config API, templates, direct editing, conversion, transfer ownership. Use when implementing /apps/files or files OCS. File bytes live on DAV.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# files

## Purpose

Files **app** surface: HTML shell, user/view config JSON, thumbnails, templates, direct-editing tokens, open-local-editor tokens, conversion, transfer-ownership. **Does not** serve file bytes — that is `dav` (`/remote.php/dav/files/{uid}`). Depends on `dav`.

## Key types / entities

| Entity | Notes |
| --- | --- |
| UserConfig | app `files` per-key: `crop_image_previews`, `default_view` (`files`\|`personal`), `folder_tree`, `grid_view`, `show_dialog_deletion`, `show_dialog_file_extension`, `show_files_extensions`, `show_hidden`, `show_mime_column`, `sort_favorites_first`, `sort_folders_first` |
| ViewConfig | JSON blob `files` / `files_views_configs`; per-view `sorting_mode`, `sorting_direction` (`asc`\|`desc`), `expanded` |
| Legacy prefs | `show_hidden`, `crop_image_previews`, **`show_grid`** (string `'1'`/`'0'`). `showGridView` writes `show_grid`, **not** UserConfig `grid_view` |
| Direct-edit token | table `direct_edit`; 64 human-readable chars; cleanup **12h**; GET editor page is public + single-use access mark |
| Open-local token | 128 alnum; `pathHash=sha1(path)`; **TTL 600s**; validate is one-shot delete |
| Transfer row | `user_transfer_owner.id` (not file id); accept/reject only `targetUser`; accept enqueues job |
| FolderTree node | `{id, basename, children, displayName?}` directories only (`httpd/unix-directory`) |
| Conversion | `{path, fileId}` HTTP **201**; dest extension must match provider; default dest = same parent + provider extension; max size `max_file_conversion_filesize` default 100 MiB |

Capabilities `files` (other slice `core-status` providers): `bigfilechunking`, `chunked_upload.{max_size,max_parallel_count}`, `forbidden_filenames*`, `file_conversions[{from,to,extension,displayName}]`. Do not re-implement capabilities here; keep conversion MIME list consistent.

`formatFileInfo` (recent files): `id,parentId,mtime`(ms),`name,permissions,mimetype,size,type,etag` + `hasPreview,path` + optional tags/share fields.

## Endpoints owned

39 map ids. Frontpage JSON is **not** OCS. OCS uses `bp-ocs-envelope`.

### UI

| id | Method | Path |
| --- | --- | --- |
| `files.view#index` | GET | `/apps/files/` |
| `files.view#indexView` | GET | `/apps/files/{view}` |
| `files.view#indexViewFileid` | GET | `/apps/files/{view}/{fileid}` |
| `files.View#showFile` | GET | `/f/{fileid}` |
| `files.DirectEditingView#edit` | GET | `/apps/files/directEditing/{token}` |

### App JSON (`ApiController`, session)

| id | Method | Path |
| --- | --- | --- |
| `files.Api#getThumbnail` | GET | `/apps/files/api/v1/thumbnail/{x}/{y}/{file}` |
| `files-api-get-thumbnail` | GET | `/index.php/apps/files/api/v1/thumbnail/{x}/{y}/{file}` — **same handler** |
| `files.Api#updateFileTags.post` | POST | `/apps/files/api/v1/files/{path}` |
| `files.Api#getRecentFiles` | GET | `/apps/files/api/v1/recent/` |
| `files.Api#getStorageStats` | GET | `/apps/files/api/v1/stats` |
| `files.Api#setViewConfig.put` | PUT | `/apps/files/api/v1/views/{view}/{key}` |
| `files.Api#setViewConfig.put.2` | PUT | `/apps/files/api/v1/views` |
| `files.Api#getViewConfigs` | GET | `/apps/files/api/v1/views` |
| `files.Api#setConfig.put` | PUT | `/apps/files/api/v1/config/{key}` |
| `files.Api#getConfigs` | GET | `/apps/files/api/v1/configs` |
| `files.Api#showHiddenFiles.post` | POST | `/apps/files/api/v1/showhidden` |
| `files.Api#cropImagePreviews.post` | POST | `/apps/files/api/v1/cropimagepreviews` |
| `files.Api#showGridView.post` | POST | `/apps/files/api/v1/showgridview` |
| `files.Api#getGridView` | GET | `/apps/files/api/v1/showgridview` |
| `files.Api#serviceWorker` | GET | `/apps/files/preview-service-worker.js` |

### OCS

| id | Method | Path |
| --- | --- | --- |
| `files-api-get-folder-tree` | GET | `/ocs/v2.php/apps/files/api/v1/folder-tree` |
| `files-conversion_api-convert` | POST | `/ocs/v2.php/apps/files/api/v1/convert` |
| `files-direct_editing-info` | GET | `…/directEditing` |
| `files-direct_editing-templates` | GET | `…/directEditing/templates/{editorId}/{creatorId}` |
| `files-direct_editing-open` | POST | `…/directEditing/open` |
| `files-direct_editing-create` | POST | `…/directEditing/create` |
| `files-template-list` | GET | `…/templates` |
| `files-template-list-template-fields` | GET | `…/templates/fields/{fileId}` |
| `files-template-create` | POST | `…/templates/create` |
| `files-template-path` | POST | `…/templates/path` |
| `files-open_local_editor-create` | POST | `…/openlocaleditor` |
| `files-open_local_editor-validate` | POST | `…/openlocaleditor/{token}` |
| `files-transfer_ownership-transfer` | POST | `…/transferownership` |
| `files-transfer_ownership-accept` | POST | `…/transferownership/{id}` |
| `files-transfer_ownership-reject` | DELETE | `…/transferownership/{id}` |
| `files.Filenames#getStatus` | GET | `/ocs/v2.php/apps/files/api/v1/filenames/sanitization` |
| `files.Filenames#sanitizeFilenames.post` | POST | same sanitization path |
| `files.Filenames#stopSanitization.delete` | DELETE | same sanitization path |
| `files.Filenames#toggleWindowFilenameSupport.post` | POST | `/ocs/v2.php/apps/files/api/v1/filenames/windows-compatibility` |

## Endpoint walkthrough

### UI shell (implemented)

`ViewController::index` (`NoAdminRequired`, `NoCSRFRequired`): Template `files/index`. Query `dir`, `view`, `fileid`. `indexView` / `indexViewFileid` delegate to `index`. `showFile` (`GET /f/{fileid}`): **always 303** redirect into files view with `dir`/`fileid`/`openfile`/`opendetails`; missing file still redirects keeping `fileid`; empty fileid → files index.

**Auth (view routes):** session required; strict-cookie check **skipped** (`NoCSRFRequired`). Unauth + `Accept: html` → **303** `/login?redirect_url=…`; unauth + JSON → **401** `{message:'Current user is not logged in'}`. Map `html-or-json` / `401 login-or-json` / `404 not-found` on view rows were Phase-0 lies.

**DirectEditingView** (`PublicPage`): token is credential — map `auth: session` was wrong. Unknown/spent token → **404** guest HTML, not 401. First successful GET marks token accessed (one-shot).

Parity compares status + `Location` + `content-type` only; pixel-perfect Vue is **not** required. `/index.php` twins via `next.config.ts` rewrites.

Initial state (storageStats, UserConfig, ViewConfig, templates, sorting, 2FA) is **not** embedded in parity HTML shell yet.

### Config JSON (implemented: read cluster)

`SecurityMiddleware` on Api JSON GET (no `NoCSRFRequired`): requires strict same-site cookies when session cookies present — missing → **303 `/`** (`StrictCookieMissingException`), not 401. Unauthenticated with `Accept: application/json` → **401 `{message:'Current user is not logged in'}`**.

`getConfigs` / `getViewConfigs`: `{message:'ok', data}` where `data` is UserConfig map or view→config map (empty `{}` when unset).

`getStorageStats?dir=/`: `{message:'ok', data:{free,used,quota,total,relative,owner,ownerDisplayName,mountType,mountPoint}}`. `cacheFor(5*60)` → `Cache-Control: private, max-age=300`. Parity stack derives `used` from DAV home tree; unlimited quota uses `quota:-3`, `free/total:-1`.

`getGridView`: **`{gridview:bool}` only** — reads legacy `show_grid`, not UserConfig `grid_view`.

### Config JSON writes (implemented)

Mutating Api routes require session + strict cookies + CSRF (`requesttoken` header/body). CSRF failure → **412 `{message:'CSRF check failed'}`**.

`setConfig` `PUT /config/{key}` body `{value}` → **200 `{message:'ok', data:{key,value}}`**. Unknown key / invalid value → **400 `{message}`**.

`setViewConfig` dual PUT:
- `PUT /views` body `{view,key,value}`
- `PUT /views/{view}/{key}` body `{value}`

Both return **200 `{message:'ok', data:ViewConfigEntry}`** for the updated view. Unknown view config key → **400**.

`showHiddenFiles` `POST /showhidden` body `{value:bool}` → **200 empty**; writes `show_hidden` user config (same store as UserConfig key).

`showGridView` `POST /showgridview` body `{show:bool}` → **200 empty**; writes legacy **`show_grid`** (`'1'`/`'0'`), not UserConfig `grid_view`.

`cropImagePreviews` `POST /cropimagepreviews` body `{value:bool}` → **200 empty**; writes UserConfig `crop_image_previews` (`'1'`/`'0'`) via `IConfig`, same auth row as other Api mutations.

`updateFileTags` `POST /files/{path}` (`path` `.+`) body `{tags?:string[]}`. Tags omitted → **200 `{}`**. Tags provided → **200 `{tags}`** after replace; missing file → **404 `{message}`**; storage unavailable → **503 `{message}`**. Resolves path against DAV home tree (`welcome.txt`, `Documents/readme.md` in parity seed).

### Thumbnail

`GET …/thumbnail/{x}/{y}/{file}` with `file => '.+'` (URL-encoded relative path). `NoCSRFRequired` + strict cookies. Shared storage: `canSeeContent()` or 404. 400 bad size; 404 `{message:'File not found.'}`. Deprecated vs core preview; still implement — mapped.

`serviceWorker`: `PublicPage`; JS stream; `Service-Worker-Allowed: /`; CSP worker/script/connect `'self'`.

### Folder tree — `files-api-get-folder-tree`

`ApiController::getFolderTree` via `#[ApiRoute]` — **returns raw `JSONResponse` array**, not `OCSController` envelope (OpenAPI has no OCS wrapper). Query `path` default `/`, `depth` default 1, `withParents` default false. Path must be a Folder under the user folder. Throwable → log + `[]` 200. 401/400/404 `{message}`.

### Direct editing

OCS `info` → `{editors, creators}` + ETag (empty maps if disabled). `templates` → `{templates:{id→{id,title,preview,extension,mimetype}}}`. `open(path, editorId?, fileId?)` / `create(path, editorId, creatorId, templateId?)` → `{url}` absolute `files.DirectEditingView.edit?token=`. Disabled (encryption without master key) → 500 `{message:'Direct editing is not enabled'}`. Open/create failure → 403.

Frontpage `GET /directEditing/{token}`: **`PublicPage`**, `NoCSRFRequired`, `UseSession`. Map `auth: session` is wrong — token is the credential. Unknown/spent token → `NotFoundResponse`.

### Templates OCS (distinct from direct-editing templates)

`list` creators+templates. `listTemplateFields` by `fileId`. `create`: `filePath`, optional `templatePath`, `templateType` default `'user'`, `templateFields` → `FilesTemplateFile`; `GenericFileException` → OCS 403. `path`: **initialize** template dir (`templatePath`, `copySystemTemplates`) → `{template_path, templates}`.

### Open local editor

`create(path)`: UserRateLimit 10/120s → `{userId,pathHash,expirationTime,token}`. `validate(token, path)`: bruteforce `openLocalEditor`; mismatch/expired/missing → 404 + throttle. 500 if 50 token collisions.

### Conversion

`POST` `{fileId, targetMimeType, destination?}`. Rate 25/120s. 201 `{path,fileId}`. 404 unreadable; 403 parent not creatable; 400 size/extension; 500 convert fail. Existing dest → `getNonExistingName` rename. Null dest is **not** a temp file (OpenAPI text is wrong; PHP writes beside source).

### Transfer ownership

`transfer(recipient, path)`: owner UID + `IHomeStorage` else 403; bad user/path 400. `accept`/`reject` `{id}` = transfer row; only targetUser else 403; missing 404. Accept schedules job; reject deletes row.

### Filenames OCS (implemented)

`FilenamesController` — **admin OCS** (`filenames-auth`), not `auth: mixed`. CSRF on all methods unless `OCS-APIRequest: true`, Bearer, or `requesttoken` → **412** `{message}`. Unauth v2 **401/997** `data:[]` message `Current user is not logged in`; non-admin **403** `data:[]`. Process-local job flag + status fields; no real filesystem sanitization in parity.

`toggleWindowFilenameSupport` `POST …/windows-compatibility` body `{enabled}` → OCS `{enabled}`. Side effect: merge/remove Windows forbidden basenames/characters/extensions; clears sanitization status/index/errors.

`sanitizeFilenames` `POST …/sanitization` body `{limit?}` default 10, `{charReplacement?}` → OCS `[]`. 400 meta.message when `limit < 1`, empty/`>1` char replacement, or job already running.

`getStatus` `GET …/sanitization` → `{status, processed, total, errors}`. `processed` default **-1**. `total` = seen-user count. `errors` uid→path **lists**; empty store → JSON `[]`. Status **1** when job queued and stored status is 0. Enum: 0 unknown, 1 scheduled, 2 running, 3 done, 4 error.

`stopSanitization` `DELETE …/sanitization` → OCS `[]` or 400 when no job. Removes job only — does **not** clear status/index/errors.

## Auth / tenant rules

| Surface | Auth |
| --- | --- |
| View HTML | logged-in session (`NoAdminRequired`) |
| Api JSON (except SW) | logged-in; strict cookies when session present; CSRF on mutating unless `NoCSRFRequired` (thumbnail GET only) |
| serviceWorker | public |
| DirectEditingView | public token |
| OCS | mixed on map → anonymous **401 / 997**; valid session or Basic/Bearer |
| All file paths | **caller’s** user folder; no cross-user |

CSRF: cookie POSTs need `requesttoken` unless `OCS-APIRequest: true`.

## Failure modes

- Unknown UserConfig key → 400 `{message}` not 500.
- `show_grid` vs `grid_view` mismatch if UI reads UserConfig but API wrote legacy key — preserve both as PHP does.
- Thumbnail `file` not decoded → 404.
- Folder-tree on a file path → 400/404, not a file listing.
- Direct editing when encryption on → 500 message above.
- Open-local reuse of token → 404 (one-shot).
- Transfer `{id}` treated as fileid → 404.
- Conversion dest `.png` vs provider `.jpg` → 400.
- Unauthenticated OCS → envelope failure, not empty 200.
- Api JSON strict-cookie fail → 303 `/`, not 403 `[]` (csrftoken differs).

## Do-not list

- Do not implement WebDAV PUT/GET bytes (`dav`).
- Do not implement share OCS / `/s/{token}` (`files_sharing`).
- Do not implement versions/trash/external/reminders features.
- Do not implement core preview (`core-preview-*`) — thumbnail here is the deprecated files route only.
- Do not wrap folder-tree in OCS meta if PHP returns a bare array (match OpenAPI / controller).
- Do not invent extra UserConfig keys.
- Do not start `workflowengine` (depends on files later).
- Do not pixel-match the Vue files app unless asked; keep routes + JSON contracts.
- Dual thumbnail ids are one handler (`files.Api#getThumbnail` + `files-api-get-thumbnail`).

## Conceptual Next.js shape

```
src/server/files/
  types.ts
  user-config-store.ts
  view-config-store.ts
  user-config.ts
  view-config.ts
  stats.ts
  grid-view.ts
  filenames-store.ts
  filenames-auth.ts
  filenames.ts
  direct-editing-store.ts
  view.ts                  # HTML shell + showFile redirect + DirectEditingView
  api.ts                   # requireFilesApiUser + JSON handlers
app/apps/files/route.ts
app/apps/files/[view]/route.ts
app/apps/files/[view]/[fileid]/route.ts
app/apps/files/directEditing/[token]/route.ts
app/f/route.ts
app/f/[fileid]/route.ts
app/apps/files/api/v1/config/[key]/route.ts
app/apps/files/api/v1/configs/route.ts
app/apps/files/api/v1/views/route.ts
app/apps/files/api/v1/views/[view]/[key]/route.ts
app/apps/files/api/v1/stats/route.ts
app/apps/files/api/v1/showhidden/route.ts
app/apps/files/api/v1/showgridview/route.ts
app/apps/files/api/v1/cropimagepreviews/route.ts
app/apps/files/api/v1/files/[...path]/route.ts
app/ocs/v2.php/apps/files/api/v1/filenames/sanitization/route.ts
app/ocs/v2.php/apps/files/api/v1/filenames/windows-compatibility/route.ts
src/server/files/tags.ts
parity/legacy-mock/files.ts
parity/legacy-mock/files-view.ts
parity/legacy-mock/files-filenames.ts
parity/helpers/files.ts
app/api/parity/reset-files-store/route.ts
parity/tests/files-json-config.parity.test.ts
parity/tests/files-json-writes.parity.test.ts
parity/tests/files-json-crop-tags.parity.test.ts
parity/tests/files-json-filenames.parity.test.ts
parity/tests/files-html-shell.parity.test.ts
```

List/download still go through DAV modules. `computeStorageStats` reads DAV home tree size.

## Parity notes

| Case | Endpoint | Expect |
| --- | --- | --- |
| Happy | getConfigs / getViewConfigs | 200 `{message:'ok', data}` |
| Auth | all four GET config routes | 401 `{message}` with `Accept: application/json` |
| Validation | strict cookie missing | 303 `location:/` |
| Validation | setConfig unknown key | 400 `{message}` |
| Validation | setViewConfig unknown key | 400 `{message}` |
| Validation | CSRF missing on write | 412 `{message}` |
| Dual PUT | setViewConfig both URLs | same envelope; path variant uses `{value}` only |
| Grid split | showGridView then getGridView | `gridview` follows `show_grid` |
| Happy | showHiddenFiles POST | 200 empty; `show_hidden` user config updated |
| Happy | showGridView POST | 200 empty; `show_grid` legacy pref updated |
| Happy | cropImagePreviews POST | 200 empty; `crop_image_previews` user config updated |
| Happy | updateFileTags POST | 200 `{tags}` or `{}` when tags omitted |
| Validation | updateFileTags unknown path | 404 `{message}` |
| Happy | getStorageStats | keys free/used/quota/total + cache-control |
| Happy | getGridView | `{gridview:false}` default |
| Thumbnail | getThumbnail | 200 image or 404 JSON |
| Auth | OCS templates | 401/997 anonymous |
| Happy | folder-tree `path=/` | array of dirs |
| Conversion | convert | 201 `{path,fileId}` or 400 extension |
| Direct edit | open | `{url}` contains `/directEditing/` |
| Token page | DirectEditingView | public GET 200 or 404 |
| Open-local | validate twice | second 404 |
| Transfer | reject as non-target | 403 |
| Auth | Filenames OCS | 401/997 unauth; 403 non-admin |
| Happy | getStatus | `{status,processed:-1,total,errors:{}}` |
| Happy | sanitizeFilenames POST | `[]`; status becomes 1 while job active |
| Validation | sanitize limit 0 / empty replacement / duplicate start | 400 meta.message |
| Happy | stopSanitization DELETE | `[]` after start |
| Validation | stop when idle | 400 meta.message |
| Happy | toggleWindowFilenameSupport | `{enabled}` echo |

| Happy | view index / indexView / indexViewFileid | 200 `text/html` + CSP worker/frame self |
| Auth | view routes unauth HTML | 303 login `redirect_url` |
| Auth | view routes unauth JSON | 401 `{message}` |
| Redirect | showFile existing | 303 Location `/apps/files/files/{id}` + `openfile=` |
| Redirect | showFile missing id | 303 Location keeps `fileid` |
| Redirect | showFile empty fileid | 303 → files index |
| Public | DirectEditingView bad token | 404 guest HTML |
| Token | DirectEditingView second GET | 404 (one-shot) |
| Service worker | preview-service-worker.js | 200 JS without session |

Waive chunked **DAV** upload in `dav`, not here.

## Repo links

- `apps/files/appinfo/routes.php`, `info.xml`
- `apps/files/lib/Controller/ApiController.php`
- `ViewController.php`, `DirectEditingController.php`, `DirectEditingViewController.php`
- `TemplateController.php`, `OpenLocalEditorController.php`
- `ConversionApiController.php`, `TransferOwnershipController.php`, `FilenamesController.php`
- `apps/files/lib/Service/SettingsService.php`
- `apps/files/lib/Capabilities.php`, `ResponseDefinitions.php`
- `lib/private/Files/Conversion/ConversionManager.php`
- Cross: `dav` files tree; `core` preview; `files_sharing`; `bp-ocs-envelope`; `bp-observe-php-contract`
