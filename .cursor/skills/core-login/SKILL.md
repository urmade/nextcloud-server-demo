---
name: core-login
description: Core session login, logout, and CSRF token endpoints. Use when implementing or testing /csrftoken, /login, /logout.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# core-login

## Scope (this slice)

- `GET /csrftoken` — JSON CSRF request token
- `GET /login` — guest login page (HTML)
- `POST /login` — form login (`user`, `password`, `requesttoken`, optional `rememberme`, `redirect_url`)
- `GET /logout` — session teardown + redirect to login

## Non-scope (same feature, later slices)

- WebAuthn (`/login/webauthn/*`), 2FA challenge flows, `POST /login/confirm`
- Client login v2 (`/login/v2/*`), lost password, heartbeat
- LDAP, SAML, OIDC, alternative login providers
- Brute-force throttle timing (status codes only; no delay simulation)
- `Clear-Site-Data` header (HTTPS non-Chrome only on legacy)

## Endpoints owned (this slice)

Map ids with `feature_ids: [core-login]` and `parity: tested`:

- `core.CSRFToken#index`
- `core.Login#tryLogin` (GET `/login` — showLoginForm)
- `core.Login#tryLogin.post`
- `core.Login#logout`

## Auth model

| Route | Auth |
| --- | --- |
| `GET /csrftoken` | `none` (public); strict same-site cookie required when session/`nc_token` cookies present |
| `GET /login` | `none` (public); redirects if session already logged in |
| `POST /login` | `none` (public form); CSRF `requesttoken` required unless `OCS-APIRequest` |
| `GET /logout` | `session` (no-op if anonymous; still redirects) |

Credentials: env `NC_ADMIN_USER` / `NC_ADMIN_PASSWORD` (defaults `admin` / `parity-test-password`).

## Conceptual Next.js shape

```
src/server/auth/
  cookies.ts          # same-site + session cookie names, parse/set helpers
  csrf.ts             # generate, encrypt, validate requesttoken
  session-store.ts    # in-memory session Map (parity/dev)
  session.ts          # resolve session from request cookies
  credentials.ts      # checkPassword against env config
  login.ts            # POST /login decision tree
  logout.ts           # GET /logout teardown
app/
  csrftoken/route.ts
  login/route.ts      # GET + POST
  logout/route.ts
```

## Same-site cookies

Legacy sets `nc_sameSiteCookielax` and `nc_sameSiteCookiestrict` (= `true`) on first visit.

`passesStrictCookieCheck()` returns `true` when:

- no session cookie and no `nc_token` cookie (first visit), **or**
- both lax and strict same-site cookies are `true`.

`GET /csrftoken` returns **403** with `[]` body when strict check fails.

## CSRF token

- Stored per session; returned as **encrypted** value: `base64(obfuscated):base64(secret)` (XOR obfuscation, not crypto).
- Accepted in POST body field `requesttoken`, query `requesttoken`, or header `requesttoken`.
- `OCS-APIRequest: true` bypasses CSRF (not used on login form).

## Login POST outcomes

| Condition | HTTP | Location / body |
| --- | --- | --- |
| Valid user + password + CSRF | 303 | default page (`/index.php/apps/dashboard/`) |
| Wrong password | 303 | `/login?user=<user>&direct=1` |
| Missing/invalid CSRF | 303 | `/login?user=<user>&direct=1` (error `csrfCheckFailed` in session) |
| Invalid Origin header | 303 | `/login?user=<user>&direct=1` (error `invalidOrigin`) |
| Username > 255 chars | 303 | `/login?user=<truncated>&direct=1` |
| Already logged in + bad CSRF | 303 | redirect_url or default page |

Failed login sets session flash `loginMessages: [[errorCode], []]`.

## Logout

- Clears session, `nc_username`, `nc_token`, `nc_session_id` cookies.
- Redirects to `/login?clear=true`.
- Sets `X-User-Id` response header when user was logged in.

## Traps

- Login is **form-encoded** (`application/x-www-form-urlencoded`), not JSON.
- Failed login is a **redirect**, not 401/403 JSON.
- CSRF endpoint body on 403 is empty JSON array `[]`, not an error object.
- Session cookie name is instance-derived in PHP; slice uses fixed `nc_session_id` for parity.
- Phase-0 map id `core.Login#tryLogin` on GET `/login` is showLoginForm, not POST tryLogin.

## Parity extras

| Case | Endpoint | Expectation |
| --- | --- | --- |
| Happy | `GET /csrftoken` | 200, `{ token: string }` with `:` separator |
| Strict cookie fail | `GET /csrftoken` | 403, `[]` when session cookie without same-site cookies |
| Happy | `GET /login` | 200, `text/html`, body contains `id="login"` |
| Already logged in | `GET /login` | 303 to default page |
| Happy | `POST /login` | 303 + session cookies after CSRF bootstrap |
| Wrong password | `POST /login` | 303 to `/login?user=...&direct=1` |
| Missing CSRF | `POST /login` | 303 to login (no throttle) |
| Username too long | `POST /login` | 303 redirect (validation) |
| Happy | `GET /logout` | 303 to `/login?clear=true`, cookies cleared |

Without `LEGACY_BASE_URL`, parity uses `parity/legacy-mock/` (not waived).
