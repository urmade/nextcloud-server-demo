# Legacy Nextcloud parity target

Disposable **legacy** Nextcloud (official Docker image, SQLite) for the API parity harness. Lives in-repo at `.cursor/parity/` on branch `cursor/parity-legacy-target-fe3a` — separate from the Next.js refactor under `next/` (do not mix).

## Quick start

```bash
cd .cursor/parity
cp .env.example .env          # optional; boot.sh creates this for you
chmod +x boot.sh smoke-check.sh
./boot.sh up
./smoke-check.sh
```

Tear down (keeps data volume):

```bash
./boot.sh down
```

Full reset (remove volume):

```bash
docker compose down -v
```

## Defaults (test-only)

| Setting | Value |
|--------|--------|
| Host port | `19080` → container `80` |
| `LEGACY_BASE_URL` | `http://localhost:19080` |
| Admin user | `admin` |
| Admin password | `parity-test-password` |
| Database | SQLite (embedded in official image) |
| Image | `nextcloud:stable` (override via `NEXTCLOUD_IMAGE`) |

These credentials are **for local/CI parity only**. Never reuse in production.

## How the Next.js harness points at it

Set the same base URL in the harness environment (e.g. `next/.env.local` or CI secrets):

```bash
LEGACY_BASE_URL=http://localhost:19080
LEGACY_ADMIN_USER=admin
LEGACY_ADMIN_PASSWORD=parity-test-password
```

Parity tests should:

1. Call legacy routes under `${LEGACY_BASE_URL}` (OCS, WebDAV, status, etc.).
2. Compare responses to the new Next.js route handlers.
3. Use Basic auth or session cookies against legacy when an endpoint requires authentication.

If the harness runs inside Docker while legacy runs on the host, use `http://host.docker.internal:19080` (or the CI runner hostname) instead of `localhost`.

## Smoke check

`smoke-check.sh` exits non-zero on failure. It verifies:

- `GET /status.php` → `installed: true` (waits up to 180s)
- `GET /ocs/v2.php/cloud/capabilities` with admin Basic auth → OCS status 100
- `GET /login` returns a login page

Run after `./boot.sh up` or in CI once the container is healthy.

## Files

| Path | Purpose |
|------|---------|
| `docker-compose.yml` | Single-service legacy Nextcloud |
| `.env.example` | Template for `LEGACY_*` and port/image |
| `boot.sh` | `up` / `down` / `logs` / `status` |
| `smoke-check.sh` | Post-boot verification |

## VM verification (2026-09-18)

Docker CLI and daemon were **not available** on the parity worker VM (`docker: command not found`). Files are committed; instance was **not** booted here. On a machine with Docker:

```bash
./boot.sh up && ./smoke-check.sh
```
