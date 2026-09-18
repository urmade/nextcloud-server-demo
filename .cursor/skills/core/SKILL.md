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

## Non-scope (later core sub-slices)

| Sub-slice | Endpoint ids (prefix / theme) |
| --- | --- |
| **core-reference** | `core-reference_api-*` |
| **core-ai-tasks** | `core-task_processing_api-*`, `core-text_processing_api-*`, `core-text_to_image_api-*` |
| **core-translation** | `core-translation_api-*` |
| **core-2fa** | `core-two_factor_api-*` |
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

Slice 2:

- `core-avatar-get-avatar`
- `core-avatar-get-avatar-dark`
- `core-guest_avatar-get-avatar`
- `core-guest_avatar-get-avatar-dark`
- `core-preview-get-preview`
- `core-preview-get-preview-by-file-id`
- `core-preview-get-mime-icon-url`
- `core-reference-preview`

## Auth model

| Route | Auth |
| --- | --- |
| Well-known | `none` — public |
| `/ocs-provider/` | `none` — public catalog |
| Navigation / autocomplete / hover card / app passwords / unified search | `mixed` — session or Basic |
| User / guest avatars | `none` — `@PublicPage` in legacy |
| Preview by file id / path | `session` or Basic — unauthenticated → **401** JSON `{ message }` |
| Mime icon redirect | `none` — public |
| Reference preview | `none` — public |

Unauthenticated OCS calls → v2 HTTP **401**, `ocs.meta.statuscode` **997**, empty `data`.

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
    preview.ts                 # reference cache lookup
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

Without `LEGACY_BASE_URL`, parity uses `parity/legacy-mock/` fixtures (not waived).
