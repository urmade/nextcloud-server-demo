---
name: bp-ocs-envelope
description: OCS JSON envelope rules for v1 vs v2. Use when implementing or testing any OCS endpoint.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# bp-ocs-envelope

Cross-cutting OCS JSON contract. Applies to every `protocol: ocs` endpoint.

## Request

- Clients send `OCS-APIRequest: true` header.
- JSON responses require `?format=json` query param (default format is XML).
- `OCS-APIRequest` header bypasses CSRF checks on legacy.

## Envelope shape

```json
{
  "ocs": {
    "meta": { "status": "ok"|"failure", "statuscode": <int>, "message": "<string>" },
    "data": <payload>
  }
}
```

v1 success adds `totalitems` and `itemsperpage` (empty strings) to `meta`.

## v1 vs v2 statuscode mapping

| Outcome | v1 HTTP | v1 meta.statuscode | v2 HTTP | v2 meta.statuscode |
| --- | --- | --- | --- | --- |
| Success | 200 | **100** | 200 | **200** |
| Unauthorized | 200 | 997 | 401 | 997 |
| Not found | 200 | 998 | 404 | 998 |
| Server error | 200 | 996/999 | 500 | 996/999 |
| Method not allowed | 200 | 405 | 405 | 405 |
| Forbidden (app password, confirm) | 200 | 403 | 403 | 403 |

**Trap:** v1 maps most failures to HTTP 200 with a failure `meta.statuscode`. Do not copy v2 HTTP codes onto v1.

**Trap:** `OCSForbiddenException` and `DataResponse` with HTTP 403 both become v2 HTTP **403** with `meta.statuscode` **403** and `data: {}` (or `[]` for confirm-password failure).

## Implementation

- Shared helpers: `src/server/ocs/envelope.ts` (`buildOcsSuccessEnvelope`, `buildOcsFailureEnvelope`, `getOcsHttpStatus`).
- `ocs_version` on map entries must be `v1`, `v2`, or `both`.
- Parity compares `ocs.meta.status`, `ocs.meta.statuscode`, `ocs.meta.message` at minimum.

## Parity

- Always pass `?format=json` and `OCS-APIRequest: true` in contract tests.
- Use `includeBodyPaths` for partial body comparison when legacy returns extra app keys.
