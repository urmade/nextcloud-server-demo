---
name: core-status
description: Core install status and OCS capabilities endpoints. Use when implementing or testing status.php or /cloud/capabilities.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# core-status

## Scope

- `GET /status.php` — public install/health JSON (no auth)
- `GET /ocs/v1.php/cloud/capabilities` — OCS v1 envelope + capabilities document
- `GET /ocs/v2.php/cloud/capabilities` — OCS v2 envelope + capabilities document (same data; envelope differs)

## Non-scope

- Other OCS routes (`/cloud/users`, `/config`, …)
- App capability providers (`files`, `files_sharing`, `theming`, …) — other feature slices
- WebDAV, session login UI, provisioning
- ETag generation parity (optional header; not asserted in parity)

## Endpoints owned

See map entries where `feature_ids` includes `core-status`:

- `core.status#get`
- `core.OCS#getCapabilities` (`ocs_version: both`)

## Auth model

| Route | Auth |
| --- | --- |
| `/status.php` | `none` — always public |
| `/cloud/capabilities` | `mixed` — `PublicPage`; unauthenticated callers receive **public** capabilities only; valid Basic auth expands `core.user` + `core.can-create-app-token` |

Invalid or missing Basic auth does **not** fail the request; legacy returns public capabilities with HTTP 200.

## Conceptual Next.js shape

```
src/server/
  version.ts          # version string + components from version.php
  status.ts           # status.php payload
  ocs/
    envelope.ts       # v1/v2 OCS JSON wrapper
    capabilities.ts   # core-owned capability keys only
app/
  status.php/route.ts
  ocs/v1.php/cloud/capabilities/route.ts
  ocs/v2.php/cloud/capabilities/route.ts
```

Config via env (defaults match stock Nextcloud):

| Env | Default | Maps to |
| --- | --- | --- |
| `NC_VERSION_MAJOR` | `36` | `version` major |
| `NC_VERSION_MINOR` | `0` | minor |
| `NC_VERSION_MICRO` | `0` | micro |
| `NC_VERSION_STRING` | `36.0.0 dev` | `versionstring` / `version.string` |
| `NC_PRODUCT_NAME` | `Nextcloud` | `productname` |
| `NC_INSTALLED` | `true` | `installed` |
| `NC_MAINTENANCE` | `false` | `maintenance` |
| `NC_NEEDS_DB_UPGRADE` | `false` | `needsDbUpgrade` |
| `NC_EXTENDED_SUPPORT` | `false` | `extendedSupport` |
| `NC_POLL_INTERVAL` | `60` | `capabilities.core.pollinterval` |
| `NC_WEBDAV_ROOT` | `remote.php/webdav` | `capabilities.core.webdav-root` |
| `NC_ADMIN_USER` / `NC_ADMIN_PASSWORD` | `admin` / `parity-test-password` | Basic auth for authenticated capability subset |

## Response contracts

### status.php

```json
{
  "installed": true,
  "maintenance": false,
  "needsDbUpgrade": false,
  "version": "36.0.0",
  "versionstring": "36.0.0 dev",
  "edition": "",
  "productname": "Nextcloud",
  "extendedSupport": false
}
```

Headers: `Content-Type: application/json`, `Access-Control-Allow-Origin: *`

### OCS capabilities (JSON, `?format=json`)

Envelope:

```json
{
  "ocs": {
    "meta": { "status": "ok", "statuscode": <100 v1 | 200 v2>, "message": "OK" },
    "data": {
      "version": { "major", "minor", "micro", "string", "edition", "extendedSupport" },
      "capabilities": { "core": { ... } }
    }
  }
}
```

**Public `capabilities.core`** (from `OC\OCS\CoreCapabilities`):

- `pollinterval`, `webdav-root`, `reference-api`, `reference-regex`, `mod-rewrite-working`

**Authenticated add-ons** (from `OC\Core\AppInfo\Capabilities`, logged-in only):

- `core.user`: `{ language, locale, timezone }`
- `core.can-create-app-token`: boolean

v1 vs v2: identical `data`; v1 uses HTTP 200 + `meta.statuscode` 100 on success; v2 uses HTTP 200 + `meta.statuscode` 200.

## Traps

- OCS default format is XML; clients use `?format=json` and `OCS-APIRequest: true` header
- v1 maps success HTTP 200 → OCS statuscode 100; do not copy v2 statuscodes onto v1
- Capabilities endpoint is high fan-in: only implement **core-owned** keys; parity uses `includeBodyPaths` when comparing live legacy
- `reference-regex` must match `IURLGenerator::URL_REGEX_NO_MODIFIERS` (no delimiters)

## Parity extras

| Case | Endpoint | Expectation |
| --- | --- | --- |
| Happy | all | 200, contract shape, core capability keys |
| Auth-irrelevant | `/status.php` | `Authorization: Basic bogus` still 200 |
| Public capabilities | capabilities | no auth → no `core.user` |
| Authenticated subset | capabilities | valid Basic → `core.user` present |
| Wrong method | capabilities | `PUT` → 405 |
| Missing format | capabilities | no `format=json` → still routable; tests use `?format=json` |

Without `LEGACY_BASE_URL`, parity uses `parity/legacy-mock/` recorded fixtures (not waived).
