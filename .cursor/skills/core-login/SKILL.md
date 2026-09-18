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
- `GET /login/selectchallenge` — pick 2FA provider (HTML, 2FA pending session)
- `GET /login/challenge/{challengeProviderId}` — show provider challenge (HTML)
- `POST /login/challenge/{challengeProviderId}` — submit challenge code (form `challenge`)
- `POST /login/webauthn/start` — begin WebAuthn login (JSON `{ loginName }`)
- `POST /login/webauthn/finish` — complete WebAuthn login (JSON `{ data }`)
- `POST /login/confirm` — sudo password confirmation (JSON `{ password }`)
- `GET /heartbeat` — empty 200 keepalive probe (OC.php early return, not a controller)

`/index.php/login/v2` and `/index.php/login/v2/poll` are twins rewritten to `/login/v2*`.
`/index.php/login/confirm` rewrites to `/login/confirm`.
`/index.php/csrftoken` rewrites to `/csrftoken` (same handler as `core.CSRFToken#index`).
`/index.php/heartbeat` rewrites to `/heartbeat`.

## Non-scope (same feature, later slices)

- Settings WebAuthn registration (`/settings/api/personal/webauthn/*`)
- Lost password
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
- `core.TwoFactorChallenge#select`
- `core.TwoFactorChallenge#showChallenge`
- `core.TwoFactorChallenge#solve`
- `core.WebAuthn#start`
- `core.WebAuthn#finish`
- `core-csrf_token-index` (twin of `core.CSRFToken#index`)
- `core-login-confirm-password`
- `core.heartbeat#get`

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
| `GET /login/selectchallenge` | `session` with 2FA pending (`twoFactorPendingUid`); redirects if unauthenticated or 2FA complete |
| `GET /login/challenge/{id}` | same as selectchallenge |
| `POST /login/challenge/{id}` | same; form field `challenge` (NoCSRFRequired on legacy) |
| `POST /login/webauthn/start` | `none` (public); JSON `{ loginName }`; stores challenge in session |
| `POST /login/webauthn/finish` | `none` (public); JSON `{ data }` where `data` is stringified assertion; requires prior start session |
| `POST /login/confirm` | `session` (logged-in user); `NoCSRFRequired`; JSON `{ password }` |
| `GET /heartbeat` | `none` (public); empty 200, no body; not CSRF keepalive (`GET /csrftoken`) |

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
  two-factor-challenge.ts  # select/show/solve + pending-session state
  webauthn-store.ts        # in-memory fixture credentials
  webauthn.ts              # start/finish handlers
  confirm-password.ts      # sudo confirm handler
  heartbeat.ts             # OC.php early-return probe
app/
  csrftoken/route.ts
  heartbeat/route.ts
  login/route.ts
  logout/route.ts
  login/v2/route.ts
  login/v2/poll/route.ts
  login/v2/flow/route.ts
  login/v2/flow/[token]/route.ts
  login/v2/grant/route.ts
  login/selectchallenge/route.ts
  login/challenge/[challengeProviderId]/route.ts
  login/webauthn/start/route.ts
  login/webauthn/finish/route.ts
  login/confirm/route.ts
```

## Password confirmation (`POST /login/confirm`)

`LoginController::confirmPassword`. Not `PublicPage`. `NoCSRFRequired`. Brute-force action `sudo` (status only in parity).

| Condition | HTTP | Body |
| --- | --- | --- |
| Valid password | 200 | `{ lastLogin: <unix seconds> }` — **confirm timestamp** (`session last-password-confirm`), not `IUser::getLastLogin()` |
| Wrong password | 403 | `[]` |
| Not logged in (JSON Accept) | 401 | `{ message: "Current user is not logged in" }` |
| Not logged in (HTML Accept) | 303 | login form with `redirect_url` |
| Missing `password` field | 400 | empty body |

Success refreshes `lastPasswordConfirm` in session (used by grant and `PasswordConfirmationRequired` routes).

## Login-time WebAuthn

Fixture authenticator only — no real FIDO2 ceremony. Toggle: `NC_PARITY_WEBAUTHN_PROVIDER` (default on).

1. Seed credential: `POST /ocs/v2.php/webauthn/parity/register?format=json` with admin session + `{ user: "admin" }` (parity helper, not mapped).
2. `POST /login/webauthn/start` with `{ loginName }` → 200 `PublicKeyCredentialRequestOptionsJSON`; session stores `webauthn_login`, `webauthn_login_uid`, `webauthn_login_name`.
3. Client signs with browser authenticator; parity uses stable `FIXTURE_ASSERTION_DATA`.
4. `POST /login/webauthn/finish` with `{ data: "<assertion-json>" }` → 200 `{ defaultRedirectUrl }` + login cookies on success.
5. Missing session keys → 400 `[]`. Invalid assertion → 400 `[]` in parity mock.

User-verified fixture credentials skip 2FA (`TwoFactorCommand` behavior). Empty `allowCredentials` when user has no registered devices.

## Login-time 2FA challenge

Fixture provider `parity-totp` (enable via OCS `/ocs/v2.php/twofactor/enable`). Challenge code: env `NC_PARITY_TWO_FACTOR_CODE` (default `123456`).

1. `POST /login` with 2FA-enabled user → `prepareTwoFactorLogin` sets `twoFactorPendingUid` → 303 to `/login/challenge/parity-totp` (single provider) or `/login/selectchallenge` (multiple).
2. User submits `POST /login/challenge/{id}` with form field `challenge`.
3. Success → `completeTwoFactorLogin` sets `twoFactorDone`, clears pending → 303 to default page or `redirect_url`.
4. Failure → session flash `twoFactorAuthError` → 303 back to showChallenge (error shown on next GET).

Unauthenticated → 303 `/login`. Already 2FA-complete → 303 default page. Unknown providerId → 303 `/login/selectchallenge`.

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
- 2FA challenge pages use `#twofactor-select` / `#twofactor-challenge` markers; not full TOTP/WebAuthn UI.
- `POST /login/challenge/*` uses form field `challenge`, not `requesttoken` (legacy `NoCSRFRequired`).
- Map `auth: session` on 2FA routes means 2FA-pending session, not fully authenticated; failures are 303 redirects, not 401 JSON.
- WebAuthn start/finish are **JSON POST**, not form-encoded; phase-0 map 303/login-failed is wrong — PHP returns JSONResponse.
- WebAuthn finish missing session returns **400** `[]`, not 401 JSON.
- `defaultRedirectUrl` is absolute URL from `linkToDefaultPageUrl()`; compare pathname in parity.
- Confirm `lastLogin` field name is a **confirm timestamp**, not user last-login.
- Confirm 403 body is `[]`, not an error object. Missing password is 400 empty, not 403.
- `core-csrf_token-index` is the same handler as `core.CSRFToken#index`; map `auth: mixed` was wrong.
- `/heartbeat` is not CSRF polling (`GET /csrftoken`) and not user_status OCS heartbeat. OC.php path-only early return; empty 200, no Content-Type.
- Phase-0 map `legacy_source: core/routes.php heartbeat` implies a controller; contract is `lib/OC.php handleRequest` short-circuit.

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
| Unauthenticated | `GET /login/selectchallenge` | 303 to `/login` |
| Happy select | `GET /login/selectchallenge` | 200 HTML `#twofactor-select` after 2FA-pending login |
| Happy show | `GET /login/challenge/parity-totp` | 200 HTML `#twofactor-challenge` + `name="challenge"` |
| Invalid provider | `GET /login/challenge/unknown` | 303 to `/login/selectchallenge` |
| Wrong code | `POST /login/challenge/parity-totp` | 303 back; next GET shows `.two-factor-error` |
| Happy solve | `POST /login/challenge/parity-totp` | 303 to `/index.php/apps/dashboard/` |
| Already 2FA-complete | `GET /login/challenge/parity-totp` | 303 to default page |
| Happy start | `POST /login/webauthn/start` | 200 JSON with `challenge`, `allowCredentials`, `userVerification` |
| No credentials | `POST /login/webauthn/start` | 200 JSON with `allowCredentials: []` |
| Missing session | `POST /login/webauthn/finish` | 400, `[]` |
| Invalid assertion | `POST /login/webauthn/finish` | 400, `[]` |
| Happy finish | `POST /login/webauthn/finish` | 200 `{ defaultRedirectUrl }` + login cookies |
| Twin | `GET /index.php/csrftoken` | same as `GET /csrftoken` |
| Happy | `POST /login/confirm` | 200 `{ lastLogin }` unix timestamp |
| Unauth JSON | `POST /login/confirm` | 401 `{ message }` |
| Wrong password | `POST /login/confirm` | 403 `[]` |
| Missing password | `POST /login/confirm` | 400 empty |
| Happy | `GET /heartbeat` | 200 empty body |
| Twin | `GET /index.php/heartbeat` | same as `GET /heartbeat` |

Without `LEGACY_BASE_URL`, parity uses `parity/legacy-mock/` (not waived).
