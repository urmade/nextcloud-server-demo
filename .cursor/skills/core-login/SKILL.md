---
name: core-login
description: Core session login, logout, CSRF token, and client login flow v2 endpoints. Use when implementing or testing /csrftoken, /login, /logout, /login/v2/*.
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
- `POST /login/v2` — init client login flow v2 (JSON poll + login URLs)
- `POST /login/v2/poll` — poll for credentials (JSON body `{ token }`)
- `GET /login/v2/flow/{token}` — landing redirect; sets session login-flow token
- `GET /login/v2/flow` — auth picker HTML (requires session login-flow token)
- `GET /login/v2/grant` — grant page HTML (session + `stateToken` query)
- `POST /login/v2/grant` — confirm grant, generate app password for client

`/index.php/login/v2` and `/index.php/login/v2/poll` are twins rewritten to `/login/v2*`.

## Non-scope (same feature, later slices)

- WebAuthn (`/login/webauthn/*`), 2FA challenge flows, `POST /login/confirm`
- Lost password, heartbeat
- `POST /login/v2/apptoken` (app-token redirect path)
- LDAP, SAML, OIDC, alternative login providers
- Brute-force throttle timing (status codes only; no delay simulation)
- `Clear-Site-Data` header (HTTPS non-Chrome only on legacy)

## Endpoints owned (this slice)

Map ids with `feature_ids: [core-login]` and `parity: tested`:

- `core.CSRFToken#index`
- `core.Login#tryLogin` (GET `/login` — showLoginForm)
- `core.Login#tryLogin.post`
- `core.Login#logout`
- `core-client_flow_login_v2-init`
- `core-client_flow_login_v2-poll`
- `core.ClientFlowLoginV2#init`
- `core.ClientFlowLoginV2#flow`
- `core.ClientFlowLoginV2#grant`
- `core.ClientFlowLoginV2#poll`

## Auth model

| Route | Auth |
| --- | --- |
| `GET /csrftoken` | `none` (public); strict same-site cookie required when session/`nc_token` cookies present |
| `GET /login` | `none` (public); redirects if session already logged in |
| `POST /login` | `none` (public form); CSRF `requesttoken` required unless `OCS-APIRequest` |
| `GET /logout` | `session` (no-op if anonymous; still redirects) |
| `POST /login/v2` | `none` (public); reads `user-agent` header for client name |
| `POST /login/v2/poll` | `none` (public); JSON `{ token }` |
| `GET /login/v2/flow/{token}` | `none` (public); sets `loginFlowV2Token` in session |
| `GET /login/v2/flow` | `session` login-flow token in session (not user login) |
| `GET /login/v2/grant` | `session` (logged-in user) + valid `stateToken` |
| `POST /login/v2/grant` | `session` + CSRF + fresh password confirm + valid `stateToken` |

Credentials: env `NC_ADMIN_USER` / `NC_ADMIN_PASSWORD` (defaults `admin` / `parity-test-password`).

## Conceptual Next.js shape

```
src/server/auth/
  cookies.ts
  csrf.ts
  session-store.ts
  session.ts
  credentials.ts
  login.ts
  logout.ts
  login-flow-v2-store.ts   # in-memory pending flows
  login-flow-v2.ts         # init/poll/flow/grant handlers
app/
  csrftoken/route.ts
  login/route.ts
  logout/route.ts
  login/v2/route.ts
  login/v2/poll/route.ts
  login/v2/flow/route.ts
  login/v2/flow/[token]/route.ts
  login/v2/grant/route.ts
```

## Client login flow v2

1. Client `POST /login/v2` → `{ poll: { token, endpoint }, login: <landing-url> }`.
2. Client polls `POST /login/v2/poll` with `{ token: pollToken }` until 200 or timeout.
3. User opens `login` URL → `GET /login/v2/flow/{loginToken}` → 303 → `GET /login/v2/flow`.
4. Auth picker sets `loginFlowV2StateToken` in session; user proceeds to grant page.
5. Logged-in user `POST /login/v2/grant` with `stateToken` + CSRF → generates app password, stores on flow.
6. Poll returns `{ server, loginName, appPassword }` once; flow entry deleted (404 on re-poll).

Pending flows are **in-memory only** (no DB). App passwords are stored in the shared app-password store on grant.

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
- Required on `POST /login/v2/grant`.

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
- Login v2 **poll** body is JSON, not form-encoded.
- Poll **404** body is `[]`, not an error object.
- Grant POST requires **fresh password confirmation** (`lastPasswordConfirm` within 30m); stale → 403 + `X-NC-Auth-NotConfirmed: true`.
- Do not invent grant UX pixels; minimal HTML stubs with `#core-loginflow` marker suffice.

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
| Happy | `POST /login/v2` | 200 JSON with `poll.token`, `poll.endpoint`, `login` |
| Poll unknown token | `POST /login/v2/poll` | 404, `[]` |
| Poll not ready | `POST /login/v2/poll` | 404, `[]` before grant completes |
| Happy poll | `POST /login/v2/poll` | 200 `{ server, loginName, appPassword }`; second poll 404 |
| Flow without session token | `GET /login/v2/flow` | 403 HTML |
| Landing valid token | `GET /login/v2/flow/{token}` | 303 to `/login/v2/flow` |
| Grant unauthenticated | `GET /login/v2/grant` | 403 HTML |
| Grant missing state | `POST /login/v2/grant` | 403 HTML `State token missing` |

Without `LEGACY_BASE_URL`, parity uses `parity/legacy-mock/` (not waived).
