---
name: bp-parity-ci
description: Run Next.js parity tests in GitHub Actions. Use when adding or changing CI for next/parity, wiring test:parity, or matching org workflow conventions.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# bp-parity-ci

## Workflow location

- Root workflow only: `.github/workflows/next-parity.yml` (not `next/.github/workflows/`).
- Trigger: `pull_request` + optional `push` to `master`.
- Path filter via `dorny/paths-filter`: `next/**` and the workflow file itself.

## Job steps

```bash
cd next && npm ci && npm run test:parity
```

- Do **not** set `LEGACY_BASE_URL` in CI; the harness uses fixtures when unset.
- Do **not** echo secrets or repo tokens in logs.

## Node/npm versions

- Read `next/package.json` `engines` with `skjnldsv/read-package-engines-version-actions` (`path: next/package.json`).
- Fallbacks (when engines omit npm): `fallbackNode: '^24'`, `fallbackNpm: '^11.3'` — same as `node-test.yml`.

## Org conventions (match `node-test.yml`)

- SPDX MIT header on the workflow file.
- Pin third-party actions to full commit SHAs.
- `actions/checkout` with `persist-credentials: false`.
- `paths-filter` `changes` job + conditional main job + `summary` job for branch protection.

## Local run

```bash
cd next && npm ci && npm run test:parity
```

Optional live legacy: `LEGACY_BASE_URL=https://your-legacy.example npm run test:parity`.
