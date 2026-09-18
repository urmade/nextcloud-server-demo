---
name: bp-observe-php-contract
description: Ground HTTP status and body in the PHP controller before trusting Phase-0 map shapes. Use when implementing a mapped route whose OpenAPI/scan row looks like 303/login-failed/401.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# bp-observe-php-contract

Cross-cutting. Phase-0 map `response.success` / `errors` are hypotheses from OpenAPI + a coarse scanner. They are not the contract.

## Do

- Open the PHP controller method named in `legacy_source` before writing a handler.
- Take status + content-type from the return type: `JSONResponse`, `RedirectResponse`, `TemplateResponse`, raw body.
- Honor attributes: `@PublicPage`, `@NoCSRFRequired`, `@UseSession`, `@FrontpageRoute`. Scanner `auth: session` is often wrong.
- Correct the map row in the same slice when observation disagrees with Phase-0.
- Keep mock and Next.js sequences independent when stores are process-local. Seed via HTTP, not in-process mutation of the server's memory.

## Do not

- Implement 401 `login-failed` or 303 because the YAML says so.
- Treat OpenAPI `operationId` success status as observed.
- Mutate a shared in-memory store from the test process and expect the Next.js HTTP server to see it.

## Observed corrections (do not regress)

| Area | Phase-0 | PHP / parity |
| --- | --- | --- |
| Login flow v2 init | 303 | 200 JSON `{ poll, login }` |
| Login flow v2 poll pending | 401 | 404 `[]` |
| 2FA challenge unauthenticated | 401 `login-failed` | 303 → `/login` |
| WebAuthn start/finish | 303 `login-failed` | `JSONResponse` (`PublicPage` + session); finish without start session → 400 `[]` |
| Login confirm | `auth: mixed`, 401 from controller | `auth: session`; unauth JSON → 401 `{ message }`; wrong password → 403 `[]`; missing password → 400 empty; `lastLogin` is confirm timestamp |
| CSRF `/index.php` twin | `auth: mixed` | `auth: none`; same `CSRFTokenController#index` as `/csrftoken` |
| Heartbeat | `legacy_source: core/routes.php heartbeat` (implies controller) | `lib/OC.php handleRequest` path-only early return; empty 200, no Content-Type; not CSRF/user_status |
| Lost email | 303 “Send reset email”, 401 login-failed | 200 `{ status: success }` (does not prove mail sent); CSRF 412 JSON; overlong user 200 error JSON |
| Lost setPassword | missing 400/412 in map | missing `password`/`proceed` → 400 empty; CSRF fail → 412 `{ message }` |
| Well-known caldav/carddav | `success.status: 200`, shape "301 redirect" | Apache `.htaccess` **301** → `/remote.php/dav/`; no `X-NEXTCLOUD-WELL-KNOWN` on happy path; 404 JSON is missing-rewrite misconfig, not product contract |
| Files Api JSON GET | 401 login-or-json, 404 not-found | `NoAdminRequired` + no `NoCSRFRequired`: strict cookie missing → **303 `/`**; JSON unauth → 401 `{ message }`; `getGridView` body is `{ gridview }` not `{ message, data }`; `getStorageStats` sets 5 min cache |
| Files Api crop/tags POST | html-or-json, 404 not-found | `cropImagePreviews` → empty 200 + `crop_image_previews` user value; `updateFileTags` → `DataResponse` `{}` or `{ tags }`; missing path 404 / storage 503 `{ message }`; same session + CSRF as other Api mutations |
| Files direct-editing OCS | OpenAPI creators `mimetypes` list | `DirectEditingService` uses creator key **`mimetype`** (string); success `{url}` absolute `/index.php/apps/files/directEditing/{token}`; open/create fail 403 `{message}`; disabled 500 |
