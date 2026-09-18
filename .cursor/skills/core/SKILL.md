---
name: core
description: Core platform APIs after login — well-known, ocs-provider, navigation, autocomplete, hover card. Use when implementing or testing this slice or planning later core sub-slices.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# core

## Scope (slice 1 — platform probes)

High fan-in endpoints used immediately after login:

- `GET /.well-known/change-password` — 303 to personal security settings
- `GET /.well-known/security.txt` — RFC 9116 plaintext
- `GET /ocs-provider/` — OCS service catalog JSON
- `GET /ocs/v2.php/core/navigation/apps` — app menu + ETag/304
- `GET /ocs/v2.php/core/navigation/settings` — settings menu + ETag/304
- `GET /ocs/v2.php/core/autocomplete/get` — collaborator search
- `GET /ocs/v2.php/hovercard/v1/{userId}` — hover card payload

v1 OCS paths mirror v2 routes in legacy; this slice implements **v2 canonical paths** only (same as capabilities slice).

## Non-scope (later core sub-slices)

| Sub-slice | Endpoint ids (prefix / theme) |
| --- | --- |
| **core-avatars** | `core-avatar-*`, `core-guest_avatar-*`, `core-preview-*`, `core-reference-preview` |
| **core-app-passwords** | `core-app_password-*` |
| **core-unified-search** | `core-unified_search-*` |
| **core-reference** | `core-reference_api-*` |
| **core-ai-tasks** | `core-task_processing_api-*`, `core-text_processing_api-*`, `core-text_to_image_api-*` |
| **core-translation** | `core-translation_api-*` |
| **core-2fa** | `core-two_factor_api-*` |
| **core-wipe** | `core-wipe-*` |
| **core-collaboration** | `core-collaboration_resources-*` |
| **core-teams** | `core-teams_api-*` |
| **core-misc** | `provisioning_api-users-search-by-phone-numbers` (owned by map under `core`) |

Well-known **ocm/caldav/carddav** belong to `cloud_federation_api` / `dav`, not this feature.

## Endpoints owned (this slice)

- `core.WellKnown#handle.change-password`
- `core.WellKnown#handle.security-txt`
- `core.ocs-provider#get`
- `core-navigation-get-apps-navigation`
- `core-navigation-get-settings-navigation`
- `core-auto_complete-get`
- `core-hover_card-get-user`

## Auth model

| Route | Auth |
| --- | --- |
| Well-known | `none` — public |
| `/ocs-provider/` | `none` — public catalog |
| Navigation / autocomplete / hover card | `mixed` — session cookie (`nc_username` + `nc_session_id`) **or** valid Basic (`NC_ADMIN_USER` / `NC_ADMIN_PASSWORD`) |

Unauthenticated OCS calls → v2 HTTP **401**, `ocs.meta.statuscode` **997**, empty `data`.

## Conceptual Next.js shape

```
src/server/
  well-known/handlers.ts       # change-password redirect, security.txt body
  ocs/
    auth.ts                    # resolve session or Basic user id
    respond.ts                 # JSON envelope helpers (uses envelope.ts)
    provider.ts                # /ocs-provider/ catalog
    navigation.ts              # apps + settings entries, ETag, absolute URLs
    autocomplete.ts            # user search + Link header pagination
    hover-card.ts              # user lookup for hover card
  config/
    users.ts                   # parity user directory (env NC_PARITY_USERS JSON)
app/
  .well-known/[service]/route.ts
  ocs-provider/route.ts
  ocs/v2.php/core/autocomplete/get/route.ts
  ocs/v2.php/core/navigation/apps/route.ts
  ocs/v2.php/core/navigation/settings/route.ts
  ocs/v2.php/hovercard/v1/[userId]/route.ts
```

Config:

| Env | Default | Purpose |
| --- | --- | --- |
| `NC_ADMIN_USER` / `NC_ADMIN_PASSWORD` | `admin` / `parity-test-password` | Basic auth |
| `NC_PARITY_USERS` | `[{"id":"admin","displayName":"Admin","label":"Admin"},{"id":"alice","displayName":"Alice","label":"Alice A."}]` | Autocomplete + hover card |
| `NC_APP_*_ENABLED` | all `true` for parity | OCS provider optional services |

## Traps

- All OCS JSON calls need `?format=json` and header `OCS-APIRequest: true` (see `bp-ocs-envelope`)
- Navigation ETag hashes JSON with `logout.href` normalized to literal `logout`
- Hover card 404 returns OCS envelope with HTTP 404 and `data: []`, not a JSON object
- Autocomplete `limit` must be ≥ 1 (legacy validation); use as representative validation case
- Well-known responses always include `X-NEXTCLOUD-WELL-KNOWN: 1`
- `change-password` is **303** redirect, not JSON; parity harness uses `redirect: manual` on fetch

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

Without `LEGACY_BASE_URL`, parity uses `parity/legacy-mock/` fixtures (not waived).
