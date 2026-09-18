---
name: bp-dav-upload-chunk-assemble
description: Chunked upload staging on dav.Collection#uploads — MKCOL folder, PUT numeric parts, MOVE .file (v1) or v2 Destination header. Use when implementing or testing upload parity.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# bp-dav-upload-chunk-assemble

Cross-cutting. PHP Sabre upload home is **not** a second server — it is a prefix on the v2 tree (`/remote.php/dav/uploads/{userId}/{folder}`). Ground in `internal/dav-uploads-contract.md`; PHP wins over Phase-0 map `success.status: 207`.

## Per-method success (PHP wins)

| Method | Status | Body |
| --- | --- | --- |
| MKCOL session folder | **201** | empty |
| PUT part | **201** | empty |
| MOVE `.file` | **201** new / **204** overwrite | `Content-Length: 0` |
| PROPFIND | **207** | multistatus XML |
| OPTIONS | **200** | Allow/DAV |

**207 is PROPFIND-only.** Do not assert 207 on MKCOL/PUT/MOVE.

## Auth / tenant

- Unauthenticated → **401** Sabre `NotAuthenticated` + `WWW-Authenticate: Basic` (Basic path; Bearer-only may omit challenge — observe PHP).
- `{userId}` must match authenticated UID → **403 Forbidden** (`Not allowed`). Unlike `files/{otherUid}`, uploads do **not** expose an empty foreign home.
- `principals/shares/{token}` is allowed in PHP (share owner UID) — defer until a sharing slice needs it.

## v1 assemble (default in parity mock)

1. **MKCOL** `/remote.php/dav/uploads/{uid}/{folder}` → **201**, empty body.
2. **PUT** parts at `…/{folder}/{part}` (natural-sort names, e.g. `1`, `2`) → **201**.
3. **MOVE** source `…/{folder}/.file` with **Destination** absolute URL under `files/{uid}/…` → **201** (new file) or **204** (replace).
4. Upload folder deleted after successful MOVE.

Chunks concatenate in natural sort (`strnatcmp`). `.file` is virtual; PUT to `.file` is forbidden.

## v2 ChunkingV2Plugin (observe before claiming parity against live PHP)

- **MKCOL** same path but requires **Destination** header pointing at final file; stores session in distributed cache (`chunking-v2`, TTL **24h sliding** on each chunk).
- **PUT** numeric part names `1…10000` only.
- Requires `IChunkedFileWrite` storage + Redis/Memcached distributed cache — often skipped on small installs.
- Do not implement v2-only behavior unless live legacy proves it for the test environment.

## Validation cases (minimum)

| Case | Request | Expect |
| --- | --- | --- |
| Happy | MKCOL → PUT → MOVE `.file` | 201/204 assemble; file visible under `files/{uid}` |
| Auth fail | MKCOL without credentials | 401 |
| Wrong uid | MKCOL/PROPFIND `uploads/otheruser/…` | 403 Forbidden XML |
| Bad MOVE | MOVE `.file` without Destination | 400 BadRequest XML |

## Parity harness

- Empty MKCOL/PUT/MOVE bodies: compare **status** + `content-length: 0`.
- Error/PROPFIND bodies: `compare: { davXmlBody: true }` (`bp-dav-xml-normalize`).
- Independent HTTP sequences per side (legacy mock process vs Next.js server); use unique folder names per test run.

## Related

- `dav` feature skill — uploads walkthrough
- `bp-dav-xml-normalize` — multistatus + Sabre exception bodies
- `bp-observe-php-contract` — map `success.status: 207` is PROPFIND-default, not MKCOL/PUT/MOVE
