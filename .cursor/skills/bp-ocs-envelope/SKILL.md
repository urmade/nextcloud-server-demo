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

**Trap:** Some endpoints return HTTP **400** with `meta.message` **empty** and `data` as a **plain string** (not an object), e.g. unified search filter errors (`"No valid filters provided"`). Use `ocsBadRequestStringResponse` in `respond.ts`.

**Trap:** Reference `touchProvider` returns HTTP **200** with `data.success: false` for unknown provider ids — not 404/403.

**Trap:** Reference resolve-one endpoints add `Cache-Control: private, max-age=3600, immutable` on success via `ocsSuccessResponse` extra headers.

**Trap:** TaskProcessing `schedule` validation failures use HTTP **400** or **412** with `data: { message: string }` — not empty `data`. Unknown task type → **412** (`The given provider is not available`).

**Trap:** TaskProcessing `getTaskQueuePosition` success puts a bare **integer** in `ocs.data` (queue index), not an object wrapper.

**Trap:** TaskProcessing `deleteTask` returns HTTP **200** + `data: null` even when the task id does not exist (idempotent delete).

**Trap:** TaskProcessing 404 messages are **not uniform**: `getTask` / `queue_position` → `Task not found`; `cancel` / `getFileContents` → `Not found`.

## Implementation

- Shared helpers: `src/server/ocs/envelope.ts` (`buildOcsSuccessEnvelope`, `buildOcsFailureEnvelope`, `getOcsHttpStatus`); `src/server/ocs/respond.ts` (`ocsBadRequestStringResponse` for string `data` on 400).
- `ocs_version` on map entries must be `v1`, `v2`, or `both`.
- Parity compares `ocs.meta.status`, `ocs.meta.statuscode`, `ocs.meta.message` at minimum.

## Parity

- Always pass `?format=json` and `OCS-APIRequest: true` in contract tests.
- Use `includeBodyPaths` for partial body comparison when legacy returns extra app keys.
