---
name: bp-binary-parity
description: Parity-test binary HTTP responses and redirect Location headers without brittle byte or hostname compares. Use for avatars, previews, mime icons, and other image/binary endpoints.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# bp-binary-parity

## Binary bodies

Do **not** byte-compare PNG/SVG payloads across legacy and Next.js.

Assert:

- HTTP status
- `content-type` (base MIME, ignore `; charset=…`)
- **size class**: `empty` (<1 B), `small` (<1 KiB), `medium` (<64 KiB), `large` (≥64 KiB)

Use `next/parity/helpers/binary.ts` (`classifyBinarySize`, `compareBinarySnapshots`). Document the delta on the endpoint-map `notes` field.

## Redirect `Location`

Legacy mock and Next.js often disagree on hostname (`127.0.0.1` vs `localhost`) while the path is identical.

Before comparing `Location`:

1. Parse as URL when possible.
2. Compare **pathname + search** only — drop scheme/host/port.
3. In harness tests, exclude `headers.location` from raw `runParityCase` diff when host may differ; assert normalized path separately.

Example (mimeicon): both sides must resolve to `/core/img/filetypes/image-png.svg`.

## Auth on public binary routes

Avatars and reference previews are `@PublicPage` in legacy — no auth-failure case. Preview-by-file routes require session/Basic; assert 401 JSON `{ message }` when unauthenticated.
