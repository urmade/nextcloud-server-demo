# Nextcloud Next (App Router skeleton)

TypeScript strict Next.js modular monolith skeleton for the Nextcloud server refactor. Route Handlers live under `app/api/`; reusable server logic lives in `src/server/`.

## Requirements

- Node.js `^20.11`, `^22`, or `^24`
- npm

## Install

```bash
cd next
npm ci
```

## Development

```bash
npm run dev
```

Placeholder endpoints:

- `GET /api/health` — liveness payload `{ status: "ok", service: "nextcloud-next" }`
- `GET /api/ready` — readiness payload `{ ready: true, service: "nextcloud-next" }`

## Tests

Unit tests (helpers + server modules):

```bash
npm run test
```

Parity harness (legacy Nextcloud vs new Next.js):

```bash
export LEGACY_BASE_URL="http://localhost:8080"
export NEW_BASE_URL="http://localhost:3100"
npm run test:parity
```

Full local CI (lint, unit tests, build, start server, parity smoke):

```bash
bash scripts/ci.sh
```

### Required environment variables

| Variable | Required for | Description |
| --- | --- | --- |
| `LEGACY_BASE_URL` | `npm run test:parity` | Base URL of the legacy Nextcloud instance (no trailing slash). |
| `NEW_BASE_URL` | `npm run test:parity` | Base URL of the new Next.js app (no trailing slash). |

Optional:

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3100` | Port used by `scripts/ci.sh` when starting the app for self-parity smoke tests. |

### Parity harness conventions

- Compare HTTP status, contract-relevant headers, and body semantics (not brittle whitespace).
- Helpers support timestamp tolerance, unstable ID fixture paths, and unordered list comparison.
- Skipped cases must use `parityWaived()` with explicit `reason` and `owner` fields (`parity:waived`).

Parity tests live in `parity/tests/*.parity.test.ts`. Shared helpers live in `parity/`.
