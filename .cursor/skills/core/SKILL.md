---
name: core
description: Core platform APIs after login — well-known, ocs-provider, navigation, autocomplete, hover card, avatars, previews. Use when implementing or testing this slice or planning later core sub-slices.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# core

## Scope

### Slice 1 — platform probes (done)

High fan-in endpoints used immediately after login:

- `GET /.well-known/change-password` — 303 to personal security settings
- `GET /.well-known/security.txt` — RFC 9116 plaintext
- `GET /ocs-provider/` — OCS service catalog JSON
- `GET /ocs/v2.php/core/navigation/apps` — app menu + ETag/304
- `GET /ocs/v2.php/core/navigation/settings` — settings menu + ETag/304
- `GET /ocs/v2.php/core/autocomplete/get` — collaborator search
- `GET /ocs/v2.php/hovercard/v1/{userId}` — hover card payload

v1 OCS paths mirror v2 routes in legacy; implemented **v2 canonical paths** only.

### Slice 3 — app passwords (done)

OCS endpoints for device/app token lifecycle:

- `GET /ocs/v2.php/core/getapppassword` — create app password (`PasswordConfirmationRequired`)
- `GET /ocs/v2.php/core/getapppassword-onetime` — create after one-time token auth
- `DELETE /ocs/v2.php/core/apppassword` — revoke current app-password session token
- `POST /ocs/v2.php/core/apppassword/rotate` — rotate current app-password session token
- `PUT /ocs/v2.php/core/apppassword/confirm` — confirm account password (`lastLogin` unix timestamp)

### Slice 4 — unified search (done)

OCS endpoints for the header unified-search UI:

- `GET /ocs/v2.php/search/providers` — list search providers (+ ETag)
- `GET /ocs/v2.php/search/providers/{providerId}/search` — run one provider (`term`, `limit`, `cursor`, `from`)

Parity ships one fixture provider `parity-users` (searches `NC_PARITY_USERS`). Real Nextcloud registers app providers dynamically; this slice models the OCS contract only.

### Slice 5 — reference API (done)

OCS endpoints for Smart Picker / link references:

- `POST /ocs/v2.php/references/extract` — extract URLs from text (`text`, `resolve`, `limit`)
- `POST /ocs/v2.php/references/extractPublic` — public share variant (`sharingToken`, limit capped at **15**)
- `GET /ocs/v2.php/references/resolve` — resolve one reference (`reference` query) + `Cache-Control: private, max-age=3600, immutable`
- `POST /ocs/v2.php/references/resolve` — resolve many (`references[]`, `limit`)
- `GET /ocs/v2.php/references/resolvePublic` — public resolve one
- `POST /ocs/v2.php/references/resolvePublic` — public resolve many (limit capped at **15**)
- `GET /ocs/v2.php/references/providers` — discoverable provider list
- `PUT /ocs/v2.php/references/provider/{providerId}` — touch provider last-use timestamp

Parity resolves `https://parity.example.com/page` via fixture provider `parity-link`. Unmatched URLs resolve to `null` in the `references` map. Real Nextcloud registers app reference providers dynamically and fetches OpenGraph over HTTP; this slice models the OCS contract only.

### Slice 2 — avatars + preview (done)

Binary-ish HTTP endpoints with high fan-in after navigation:

- `GET /index.php/avatar/{userId}/{size}` — user avatar (64 or 512)
- `GET /index.php/avatar/{userId}/{size}/dark` — dark theme variant
- `GET /index.php/avatar/guest/{guestName}/{size}` — generated guest avatar (201)
- `GET /index.php/avatar/guest/{guestName}/{size}/dark` — dark guest avatar
- `GET /index.php/core/preview?fileId=…` — preview by file id (auth required)
- `GET /index.php/core/preview.png?file=…` — preview by path (auth required)
- `GET /index.php/core/mimeicon?mime=…` — 303 redirect to mime icon SVG (public)
- `GET /index.php/core/references/preview/{referenceId}` — cached reference image (public)

Legacy paths use `/index.php/…`; Next.js rewrites to `/avatar/…` and `/core/…`.

### Slice 6 — task processing (user session) (done)

User-session TaskProcessing OCS endpoints:

- `GET /ocs/v2.php/taskprocessing/tasktypes` — available task types catalog
- `GET /ocs/v2.php/taskprocessing/queue_stats` — scheduled/running counts (`taskTypeIds[]` filter)
- `POST /ocs/v2.php/taskprocessing/schedule` — schedule task (`input`, `type`, `appId`, …)
- `GET /ocs/v2.php/taskprocessing/task/{id}` — get one task
- `DELETE /ocs/v2.php/taskprocessing/task/{id}` — delete task (idempotent 200 + `data: null`)
- `GET /ocs/v2.php/taskprocessing/tasks` — list by optional `taskType` / `customId`
- `GET /ocs/v2.php/taskprocessing/tasks/app/{appId}` — list by app (+ optional `customId`)
- `POST /ocs/v2.php/taskprocessing/tasks/{taskId}/cancel` — cancel task
- `GET /ocs/v2.php/taskprocessing/tasks/{taskId}/file/{fileId}` — stream referenced file (binary)
- `GET /ocs/v2.php/taskprocessing/tasks/{taskId}/queue_position` — queue index for scheduled task

Parity registers fixture task types `core:text2text` and `parity:file-read`. Real Nextcloud registers providers dynamically; this slice models the OCS contract only.

### Slice 7 — task processing (Ex-App / worker) (done)

Ex-App consumer + provider TaskProcessing OCS endpoints (`#[ExAppRequired]`):

**Consumer (`tasks_consumer/`)** — schedule/read/cancel without user context:

- `GET /ocs/v2.php/taskprocessing/tasks_consumer/tasktypes`
- `POST /ocs/v2.php/taskprocessing/tasks_consumer/schedule` — `userId` null; file inputs → **401**
- `GET /ocs/v2.php/taskprocessing/tasks_consumer/task/{id}`
- `DELETE /ocs/v2.php/taskprocessing/tasks_consumer/task/{id}` — idempotent `data: null`
- `POST /ocs/v2.php/taskprocessing/tasks_consumer/tasks/{taskId}/cancel`

**Provider (`tasks_provider/`)** — claim queue + worker callbacks:

- `GET /ocs/v2.php/taskprocessing/tasks_provider/next` — atomically claims one task; **204** empty body when none
- `GET /ocs/v2.php/taskprocessing/tasks_provider/next_batch` — batch claim + `has_more`
- `POST /ocs/v2.php/taskprocessing/tasks_provider/{taskId}/progress`
- `POST /ocs/v2.php/taskprocessing/tasks_provider/{taskId}/result`
- `POST /ocs/v2.php/taskprocessing/tasks_provider/{taskId}/stream-result`
- `POST /ocs/v2.php/taskprocessing/tasks_provider/{taskId}/file` — multipart field `file`; **201** + `fileId`
- `GET /ocs/v2.php/taskprocessing/tasks_provider/{taskId}/file/{fileId}` — binary stream

Parity uses in-memory store with `claimNextScheduledTask` / provider intersection matching PHP `Manager` semantics. No DB persistence.

### Slice 8 — deprecated TextProcessing + TextToImage (done)

Legacy OCS APIs (distinct from TaskProcessing). User session / mixed auth. In-memory store only.

**TextProcessing** (`/ocs/v2.php/textprocessing/…`):

- `GET /ocs/v2.php/textprocessing/tasktypes` — `@PublicPage`; `types` is an **array** of `{ id, name, description }` with PHP class ids
- `POST /ocs/v2.php/textprocessing/schedule` — schedule task (`input`, `type`, `appId`, `identifier`)
- `GET /ocs/v2.php/textprocessing/task/{id}` — get one task
- `DELETE /ocs/v2.php/textprocessing/task/{id}` — delete task; returns `{ task }` (not `data: null`)
- `GET /ocs/v2.php/textprocessing/tasks/app/{appId}` — list by app (+ optional `identifier`)

**TextToImage** (`/ocs/v2.php/text2image/…`):

- `GET /ocs/v2.php/text2image/is_available` — `{ isAvailable: bool }`
- `POST /ocs/v2.php/text2image/schedule` — schedule task (`input`, `appId`, `identifier`, `numberOfImages` default **8**)
- `GET /ocs/v2.php/text2image/task/{id}` — get one task
- `DELETE /ocs/v2.php/text2image/task/{id}` — delete task; returns `{ task }`
- `GET /ocs/v2.php/text2image/task/{id}/image/{index}` — binary PNG (see `bp-binary-parity`)
- `GET /ocs/v2.php/text2image/tasks/app/{appId}` — list by app (+ optional `identifier`)

Task payloads use numeric `status` (0–4), string `input`, and `identifier` (not TaskProcessing `customId` / shape maps). Parity registers fixture providers via env toggles; no real model execution.

### Slice 9 — translation API (done)

OCS Translation API (`/ocs/v2.php/translation/…`). `@PublicPage` on both routes — unauthenticated **200** (not 401). Fixture language catalog mirrors `FakeTranslationProvider`; no real translator.

- `GET /ocs/v2.php/translation/languages` — `{ languages: [{ from, fromLabel, to, toLabel }], languageDetection: bool }`
- `POST /ocs/v2.php/translation/translate` — translate text (`text`, `fromLanguage?`, `toLanguage`)

### Slice 10 — two-factor admin API (done)

OCS Two-Factor admin/state API (`/ocs/v2.php/twofactor/…`). Admin-only (`mixed` auth — session or Basic). Distinct from `twofactor_backupcodes` settings HTML.

- `GET /ocs/v2.php/twofactor/state?user=` — provider enablement map `{ [providerId]: bool }`
- `POST /ocs/v2.php/twofactor/enable` — enable providers for user (`user`, `providers[]`); `PasswordConfirmationRequired`
- `POST /ocs/v2.php/twofactor/disable` — disable providers for user; `PasswordConfirmationRequired(strict: true)`

Parity registers fixture provider `parity-totp` (admin enable/disable). Real Nextcloud loads app 2FA providers dynamically; this slice models the OCS contract only.

## Non-scope (later core sub-slices)

| Sub-slice | Endpoint ids (prefix / theme) |
| --- | --- |
| **core-wipe** | `core-wipe-*` |
| **core-collaboration** | `core-collaboration_resources-*` |
| **core-teams** | `core-teams_api-*` |
| **core-misc** | `provisioning_api-users-search-by-phone-numbers` (owned by map under `core`) |

Well-known **ocm/caldav/carddav** belong to `cloud_federation_api` / `dav`, not this feature.

## Endpoints owned

Slice 1:

- `core.WellKnown#handle.change-password`
- `core.WellKnown#handle.security-txt`
- `core.ocs-provider#get`
- `core-navigation-get-apps-navigation`
- `core-navigation-get-settings-navigation`
- `core-auto_complete-get`
- `core-hover_card-get-user`

Slice 3:

- `core-app_password-get-app-password`
- `core-app_password-get-app-password-with-one-time-password`
- `core-app_password-delete-app-password`
- `core-app_password-rotate-app-password`
- `core-app_password-confirm-user-password`

Slice 4:

- `core-unified_search-get-providers`
- `core-unified_search-search`

Slice 5:

- `core-reference_api-extract`
- `core-reference_api-extract-public`
- `core-reference_api-touch-provider`
- `core-reference_api-get-providers-info`
- `core-reference_api-resolve-one`
- `core-reference_api-resolve`
- `core-reference_api-resolve-one-public`
- `core-reference_api-resolve-public`

Slice 2:

- `core-avatar-get-avatar`
- `core-avatar-get-avatar-dark`
- `core-guest_avatar-get-avatar`
- `core-guest_avatar-get-avatar-dark`
- `core-preview-get-preview`
- `core-preview-get-preview-by-file-id`
- `core-preview-get-mime-icon-url`
- `core-reference-preview`

Slice 6:

- `core-task_processing_api-task-types`
- `core-task_processing_api-queue-stats`
- `core-task_processing_api-schedule`
- `core-task_processing_api-get-task`
- `core-task_processing_api-list-tasks`
- `core-task_processing_api-list-tasks-by-app`
- `core-task_processing_api-cancel-task`
- `core-task_processing_api-delete-task`
- `core-task_processing_api-get-file-contents`
- `core-task_processing_api-get-task-queue-position`

Slice 7:

- `core-task_processing_api-task-types-ex-app-endpoint`
- `core-task_processing_api-schedule-ex-app-endpoint`
- `core-task_processing_api-get-task-ex-app-endpoint`
- `core-task_processing_api-delete-task-ex-app-endpoint`
- `core-task_processing_api-cancel-task-ex-app-endpoint`
- `core-task_processing_api-get-next-scheduled-task`
- `core-task_processing_api-get-next-scheduled-task-batch`
- `core-task_processing_api-set-progress`
- `core-task_processing_api-set-result`
- `core-task_processing_api-set-intermediate-result`
- `core-task_processing_api-set-file-contents-ex-app`
- `core-task_processing_api-get-file-contents-ex-app`

Slice 8:

- `core-text_processing_api-task-types`
- `core-text_processing_api-schedule`
- `core-text_processing_api-get-task`
- `core-text_processing_api-delete-task`
- `core-text_processing_api-list-tasks-by-app`
- `core-text_to_image_api-is-available`
- `core-text_to_image_api-schedule`
- `core-text_to_image_api-get-task`
- `core-text_to_image_api-delete-task`
- `core-text_to_image_api-get-image`
- `core-text_to_image_api-list-tasks-by-app`

Slice 9:

- `core-translation_api-languages`
- `core-translation_api-translate`

Slice 10:

- `core-two_factor_api-state`
- `core-two_factor_api-enable`
- `core-two_factor_api-disable`

## Auth model

| Route | Auth |
| --- | --- |
| Well-known | `none` — public |
| `/ocs-provider/` | `none` — public catalog |
| Navigation / autocomplete / hover card / app passwords / unified search / reference API (non-public) | `mixed` — session or Basic |
| Reference extract/resolve public | `mixed` — `@PublicPage`; no auth required |
| User / guest avatars | `none` — `@PublicPage` in legacy |
| Preview by file id / path | `session` or Basic — unauthenticated → **401** JSON `{ message }` |
| Mime icon redirect | `none` — public |
| Reference preview | `none` — public |
| Task processing (user session) | `mixed` — session or Basic |
| Task processing (Ex-App / worker) | `ExAppRequired` — session `app_api === true`; parity harness also accepts `Authorization: Bearer parity-ex-app` when `NC_PARITY_EXAPP=true` |
| Deprecated TextProcessing `tasktypes` | `@PublicPage` — unauthenticated **200** (not 401) |
| Deprecated TextProcessing / TextToImage (other) | `mixed` — session or Basic; unauthenticated → **401** OCS 997 |
| Translation API | `@PublicPage` — unauthenticated **200** (not 401) |
| Two-factor admin API | `mixed` — session or Basic; **admin only** — non-admin → **403** `Logged in account must be an admin` |

Unauthenticated OCS calls → v2 HTTP **401**, `ocs.meta.statuscode` **997**, empty `data` (except `@PublicPage` routes above).

Missing Ex-App session on `#[ExAppRequired]` routes → HTTP **412** plain JSON `{ message: "ExApp required" }` — **not** OCS envelope (SecurityMiddleware before OCS wrap).

## Conceptual Next.js shape

```
src/server/
  well-known/handlers.ts
  ocs/                         # auth, navigation, autocomplete, hover card, app passwords, …
    app-password.ts            # create/rotate/delete/confirm handlers
    app-password-store.ts      # in-memory token store for parity
    unified-search.ts          # parity providers + search
  avatar/
    user.ts                    # user avatar + guestFallback
    guest.ts                   # generated guest avatars (201)
  preview/
    catalog.ts                 # parity file catalog (NC_PARITY_PREVIEW_FILES)
    handlers.ts                # preview + mimeicon redirect
  reference/
    api.ts                     # extract/resolve/providers/touch handlers
    preview.ts                 # reference cache lookup
  task-processing/
    catalog.ts                 # parity task types + provider intersection
    store.ts                   # in-memory queue, claim/provider path, uploaded files
    api.ts                     # user-session handlers
    ex-app-api.ts              # Ex-App consumer + provider handlers
  text-processing/
    catalog.ts                 # deprecated TextProcessing task type list + provider toggle
    store.ts                   # in-memory tasks (CoreTextProcessingTask shape)
    api.ts                     # textprocessing/* handlers
  text-to-image/
    catalog.ts                 # provider availability toggle
    store.ts                   # in-memory tasks + image bytes by task/index
    api.ts                     # text2image/* handlers
  translation/
    catalog.ts                 # fixture language pairs + provider toggle
    api.ts                     # translation/* handlers
  two-factor/
    catalog.ts                 # fixture provider ids + admin enable/disable flags
    store.ts                   # in-memory provider states per user
    api.ts                     # twofactor/* handlers
  fixtures/
    binary.ts                  # deterministic PNG bytes (no real photos)
  http/
    auth.ts                    # requireLoggedInUser for preview
    binary.ts                  # size normalization, cache headers
app/
  avatar/[userId]/[size]/route.ts
  avatar/[userId]/[size]/dark/route.ts
  avatar/guest/[guestName]/[size]/route.ts
  avatar/guest/[guestName]/[size]/dark/route.ts
  core/preview/route.ts
  core/preview.png/route.ts
  core/mimeicon/route.ts
  core/references/preview/[referenceId]/route.ts
  ocs/v2.php/core/getapppassword/route.ts
  ocs/v2.php/core/getapppassword-onetime/route.ts
  ocs/v2.php/core/apppassword/route.ts
  ocs/v2.php/core/apppassword/rotate/route.ts
  ocs/v2.php/core/apppassword/confirm/route.ts
  ocs/v2.php/search/providers/route.ts
  ocs/v2.php/search/providers/[providerId]/search/route.ts
  ocs/v2.php/references/extract/route.ts
  ocs/v2.php/references/extractPublic/route.ts
  ocs/v2.php/references/resolve/route.ts
  ocs/v2.php/references/resolvePublic/route.ts
  ocs/v2.php/references/providers/route.ts
  ocs/v2.php/references/provider/[providerId]/route.ts
  ocs/v2.php/taskprocessing/tasktypes/route.ts
  ocs/v2.php/taskprocessing/queue_stats/route.ts
  ocs/v2.php/taskprocessing/schedule/route.ts
  ocs/v2.php/taskprocessing/task/[id]/route.ts
  ocs/v2.php/taskprocessing/tasks/route.ts
  ocs/v2.php/taskprocessing/tasks/app/[appId]/route.ts
  ocs/v2.php/taskprocessing/tasks/[taskId]/cancel/route.ts
  ocs/v2.php/taskprocessing/tasks/[taskId]/file/[fileId]/route.ts
  ocs/v2.php/taskprocessing/tasks/[taskId]/queue_position/route.ts
  ocs/v2.php/taskprocessing/tasks_consumer/tasktypes/route.ts
  ocs/v2.php/taskprocessing/tasks_consumer/schedule/route.ts
  ocs/v2.php/taskprocessing/tasks_consumer/task/[id]/route.ts
  ocs/v2.php/taskprocessing/tasks_consumer/tasks/[taskId]/cancel/route.ts
  ocs/v2.php/taskprocessing/tasks_provider/next/route.ts
  ocs/v2.php/taskprocessing/tasks_provider/next_batch/route.ts
  ocs/v2.php/taskprocessing/tasks_provider/[taskId]/progress/route.ts
  ocs/v2.php/taskprocessing/tasks_provider/[taskId]/result/route.ts
  ocs/v2.php/taskprocessing/tasks_provider/[taskId]/stream-result/route.ts
  ocs/v2.php/taskprocessing/tasks_provider/[taskId]/file/route.ts
  ocs/v2.php/taskprocessing/tasks_provider/[taskId]/file/[fileId]/route.ts
  ocs/v2.php/textprocessing/tasktypes/route.ts
  ocs/v2.php/textprocessing/schedule/route.ts
  ocs/v2.php/textprocessing/task/[id]/route.ts
  ocs/v2.php/textprocessing/tasks/app/[appId]/route.ts
  ocs/v2.php/text2image/is_available/route.ts
  ocs/v2.php/text2image/schedule/route.ts
  ocs/v2.php/text2image/task/[id]/route.ts
  ocs/v2.php/text2image/task/[id]/image/[index]/route.ts
  ocs/v2.php/text2image/tasks/app/[appId]/route.ts
  ocs/v2.php/translation/languages/route.ts
  ocs/v2.php/translation/translate/route.ts
  ocs/v2.php/twofactor/state/route.ts
  ocs/v2.php/twofactor/enable/route.ts
  ocs/v2.php/twofactor/disable/route.ts
```

Config:

| Env | Default | Purpose |
| --- | --- | --- |
| `NC_ADMIN_USER` / `NC_ADMIN_PASSWORD` | `admin` / `parity-test-password` | Basic auth |
| `NC_PARITY_USERS` | admin + alice JSON | Autocomplete, hover card, avatar lookup |
| `NC_PARITY_PREVIEW_FILES` | `[{"id":100,"path":"welcome.png","mime":"image/png","readable":true}]` | Preview happy path |
| `NC_APP_*_ENABLED` | all `true` for parity | OCS provider optional services |
| `NC_UNIFIED_SEARCH_MIN_LENGTH` | `1` | Ignore `term` shorter than this |
| `NC_UNIFIED_SEARCH_MAX_RESULTS` | `25` | Cap per-request `limit` |
| `NC_PARITY_TEXT_PROCESSING_PROVIDER` | `true` | Toggle deprecated TextProcessing schedule provider |
| `NC_PARITY_TEXT_TO_IMAGE_PROVIDER` | `true` | Toggle TextToImage `isAvailable` + schedule provider |
| `NC_PARITY_TRANSLATION_PROVIDER` | `true` | Toggle translation catalog + translate provider |
| `NC_PARITY_TWO_FACTOR_PROVIDER` | `true` | Toggle fixture provider `parity-totp` |

## Traps

- All OCS JSON calls need `?format=json` and header `OCS-APIRequest: true` (see `bp-ocs-envelope`)
- Navigation ETag hashes JSON with `logout.href` normalized to literal `logout`
- Hover card 404 returns OCS envelope with HTTP 404 and `data: []`, not a JSON object
- Avatar sizes normalize to **64** (≤64) or **512** (>64); deprecated sizes log in legacy only
- Guest avatars return **201** for generated avatars, **200** for custom (parity fixtures use 201)
- User avatar 404 is JSON `[]`, not a message object
- Preview validation errors return JSON `[]` with 400/404 — not OCS envelope
- Preview unauthenticated returns `{ message: string }` with 401
- Mime icon always 303; falls back to `application/octet-stream` icon
- Binary parity compares **status + content-type + size class**, not pixel bytes (documented delta)
- `index.php` prefix required in parity tests; rewrites strip it internally
- `getapppassword` requires `last-password-confirm` within 30m (+15s slack); login sets it; confirm endpoint refreshes it
- Delete/rotate require `session.app_password` — set when Basic auth uses a stored 72-char app token alongside session cookie
- `confirm` wrong password → 403 OCS with `data: []`; success returns `lastLogin` as unix seconds (not ISO)
- Generated `apppassword` values are not byte-compared in parity (unstable id)
- One-time flow: Basic auth with one-time token on `getapppassword-onetime` sets `one_time_token` session flag
- `getProviders` sets ETag from `md5(JSON.stringify(providers))`
- Search with no valid filters (e.g. missing/short `term`) → HTTP **400**, `meta.message` empty, `data` string `"No valid filters provided"`
- Unknown `providerId` → HTTP **500** OCS 996 (legacy throws `InvalidArgumentException`)
- Default `limit` is **5**; capped by `NC_UNIFIED_SEARCH_MAX_RESULTS` (min 1)
- Reference extract uses `core.reference-regex` (same as capabilities `reference-regex`); matches are trimmed
- Reference `resolve` map keys use the **raw** request value (GET query or POST array entry); lookup trims internally for GET only
- Unresolved references appear as `null` values in `data.references` — still HTTP **200**
- `touchProvider` unknown id → `{ success: false }` with HTTP **200** (not 404)
- Public extract/resolve cap `limit` at **15** (`LIMIT_MAX` in PHP)
- Resolved reference `thumb` points at `/index.php/core/references/preview/{md5(url)}`
- Default extract/resolve `limit` is **1**
- Task type catalog empty shape slots serialize as `{}` objects, not `[]` (PHP `stdClass`)
- Schedule unknown `type` → HTTP **412**, `data.message` `"The given provider is not available"`
- Schedule validation → HTTP **400**, `data.message` from `ValidationException` (e.g. `Missing key: "input"`)
- `getTask` / `queue_position` 404 → `"Task not found"`; `cancel` / `getFileContents` 404 → `"Not found"`
- `deleteTask` missing task still returns HTTP **200** with `data: null` (idempotent)
- `queue_position` success returns raw integer in `ocs.data` (not wrapped in an object)
- `getFileContents` is binary OCS-adjacent — 404/500 still use OCS JSON envelope; success is raw bytes + `Content-Disposition`
- Generated task `id` / timestamps are unstable — use `unstableIdPaths` in parity; seed mock store via `seedParityTask` for stateful cases
- Ex-App schedule with file-shaped input and no user context → **401** `Cannot schedule task with files referenced without user context`
- Ex-App auth failure → **412** `{ message: "ExApp required" }` (plain JSON, not OCS)
- `getNextScheduledTask` empty queue → **204** with empty body (no OCS envelope)
- `setFileContentsExApp` success → HTTP **201** with `ocs.meta.statuscode` **201**
- Provider `getFileContentsExApp` uses `getTask` (any owner); consumer routes filter `userId === null`
- Batch claim returns `tasks[].provider` as string id; single claim returns `provider.name`
- Deprecated TextProcessing `tasktypes` is `@PublicPage` — no 401 on missing session; `types` is an **array**, not TaskProcessing map
- Deprecated TextProcessing schedule unknown `type` → **400** `Requested task type does not exist`; no provider → **412** `Necessary language model provider is not available`
- Deprecated TextProcessing `deleteTask` success returns `{ task }` — **not** `data: null` (TaskProcessing idempotent delete differs)
- Deprecated TextProcessing task uses numeric `status` 0–4, string `input`, field `identifier` (not shape maps / `customId`)
- Deprecated TextToImage schedule validation (input length, `numberOfImages` bounds, missing provider) → **412** — not 400
- Deprecated TextToImage default `numberOfImages` is **8**; max **12**
- TextToImage `getImage` 404 messages: `Task not found` vs `Image not found`; success is raw PNG without OCS envelope
- Translation `languages` / `translate` are `@PublicPage` — no 401 on missing session
- Translation catalog is fixture-backed (`de`↔`en` pairs); `languageDetection` is **false** without `IDetectLanguageProvider`
- Translation `translate` missing provider → **412** `No translation provider available`; text > 64_000 chars → **400** `Input text is too long`
- Translation `fromLanguage === toLanguage` returns input unchanged; unsupported pair → **400** `Unable to translate` with `from` in `data`
- Translation missing `fromLanguage` without detection → **400** `Could not detect language`
- Parity fixture translate reverses text (mirrors `FakeTranslationProvider::mb_strrev`) — not a real translation
- Two-factor admin API requires admin session (`NC_ADMIN_USER`, default `admin`); non-admin → **403** with stable message
- Two-factor unknown target user → HTTP **404** with `ocs.data: null` (not `{}` or `[]`)
- Two-factor success `ocs.data` is a provider-id → bool map; empty user has `{}`
- Two-factor `enable` requires fresh `last-password-confirm` (30m + 15s); stale → **403** + `x-nc-auth-notconfirmed: true`
- Two-factor `disable` is strict password confirm — requires Basic auth password header; missing → **403** `Required authorization header missing`
- Unknown provider ids in enable/disable are silently ignored (`tryEnable` / `tryDisable` no-op) — state still returned

## Parity extras

| Case | Endpoint | Expectation |
| --- | --- | --- |
| Happy | well-known | contract status + headers/body |
| Validation | unsupported `.well-known/{service}` | 404 JSON `{ message }` |
| Happy | ocs-provider | 200 catalog shape |
| Happy | navigation (apps/settings) | 200 array + ETag; session or Basic |
| Auth failure | navigation / autocomplete / hover card | 401 OCS 997 |
| Conditional | navigation | `If-None-Match` → 304 empty |
| Happy | autocomplete | 200 user array for `search=ali` |
| Validation | autocomplete | `limit=0` → 400 OCS failure |
| Happy | hover card | 200 for known `userId` |
| Validation | hover card | 404 for unknown `userId` |
| Happy | user avatar | 200 PNG for `admin`; binary size class |
| Validation | user avatar | unknown user → 404 `[]` |
| Happy | guest avatar | 201 PNG |
| Happy | preview fileId / path | 200 PNG with session or Basic |
| Auth failure | preview | 401 `{ message }` |
| Validation | preview | missing `file` or `x=0` → 400 `[]` |
| Happy | mimeicon | 303 to `/core/img/filetypes/{mime}.svg` |
| Happy | reference preview | 200 PNG for `parity-reference` |
| Validation | reference preview | unknown id → 404 empty body |
| Happy | getapppassword | 200 + apppassword with session after login |
| Auth failure | app password endpoints | 401 OCS 997 |
| Validation | getapppassword | app_password already in session → 403 |
| Happy | delete/rotate app password | 200 with app-password session via Basic+session |
| Validation | delete/rotate | no app_password in session → 403 |
| Happy | confirm password | 200 `lastLogin` unix timestamp |
| Validation | confirm password | wrong password → 403, `data: []` |
| Happy | getapppassword-onetime | 200 after one-time Basic auth on same path |
| Validation | getapppassword-onetime | missing one_time_token → 403 |
| Happy | unified search providers | 200 provider array + ETag |
| Auth failure | unified search | 401 OCS 997 |
| Happy | unified search `parity-users` | 200 entries for `term=ali` |
| Validation | unified search | no `term` → 400 string data |
| Happy | reference extract | 200 map with `https://parity.example.com/page: null` |
| Auth failure | reference extract/providers/resolve/touch | 401 OCS 997 |
| Validation | reference extract | empty `text` → `{ references: {} }` |
| Happy | reference extractPublic / resolvePublic | 200 without auth |
| Validation | reference resolve | unknown URL → `null` in map |
| Happy | reference providers | 200 array with `parity-link` |
| Happy | reference touch provider | 200 `{ success: true }` |
| Validation | reference touch provider | unknown id → `{ success: false }` |
| Happy | reference resolve-one | 200 + `cache-control` immutable 3600 |
| Auth failure | task processing user endpoints | 401 OCS 997 |
| Happy | task types | 200 `types` map with `core:text2text` |
| Validation | schedule | unknown `type` → 412 `The given provider is not available` |
| Happy | schedule / get / list / cancel | 200 task payload; unstable id/timestamps |
| Validation | get / cancel / queue_position | unknown id → 404 with endpoint-specific message |
| Happy | queue_stats | 200 `scheduled_count` + `running_count` |
| Happy | queue_position | 200 integer `ocs.data` for scheduled task |
| Happy | delete task | 200 `data: null` even when task missing |
| Validation | get file contents | file not referenced → 404 `Not found` |
| Happy | get file contents | 200 binary; size class only (see `bp-binary-parity`) |
| Auth failure | Ex-App endpoints | 412 plain `{ message: "ExApp required" }` |
| Happy | Ex-App task types / schedule / get / cancel / delete | 200 OCS; ex-app tasks have `userId: null` |
| Validation | Ex-App schedule file input | 401 file-without-user message |
| Happy | claim next / next_batch | 200 claimed task + provider; 204 when empty |
| Happy | set progress / result / stream-result | 200 updated task payload |
| Happy | set file contents | 201 `fileId`; unstable id |
| Happy | provider get file contents | 200 binary; size class only |
| Public | deprecated TextProcessing tasktypes | 200 without auth |
| Auth failure | deprecated TextProcessing / TextToImage (non-public) | 401 OCS 997 |
| Validation | deprecated TextProcessing schedule | unknown type → 400 `Requested task type does not exist` |
| Happy | deprecated TextProcessing schedule / get / delete / list | 200 task payload; unstable id/timestamps |
| Validation | deprecated TextProcessing get/delete | unknown id → 404 `Task not found` |
| Happy | TextToImage is_available | 200 `{ isAvailable: true }` with session |
| Validation | TextToImage schedule | `numberOfImages` > 12 → 412 |
| Happy | TextToImage schedule / get / delete / list | 200 task payload; unstable id |
| Validation | TextToImage getImage | missing image bytes → 404 `Image not found` |
| Happy | TextToImage getImage | 200 PNG; size class only (see `bp-binary-parity`) |
| Public | translation languages | 200 without auth; fixture language pairs |
| Public | translation translate | 200 without auth; reversed text for `en`→`de` |
| Validation | translation translate | no provider (`NC_PARITY_TRANSLATION_PROVIDER=false`) → 412 |
| Auth failure | two-factor admin API | 401 OCS 997 |
| Validation | two-factor state | unknown `user` → 404 `data: null` |
| Validation | two-factor enable | stale password confirm → 403 + `x-nc-auth-notconfirmed` |
| Validation | two-factor disable | missing Basic password → 403 `Required authorization header missing` |
| Happy | two-factor state / enable / disable | 200 provider map; fixture `parity-totp` |

Without `LEGACY_BASE_URL`, parity uses `parity/legacy-mock/` fixtures (not waived).
