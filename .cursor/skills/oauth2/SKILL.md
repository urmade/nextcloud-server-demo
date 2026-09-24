---
name: oauth2
description: OAuth2 authorize, token, and admin client CRUD. Use when implementing or testing /apps/oauth2/* token and authorize flows.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# oauth2

## Purpose

Authorization-code OAuth2 for third-party clients. Issue and rotate Bearer access tokens backed by auth tokens (`authtoken`). Admin registers clients. Depends on `core-login` (session + ClientFlowLogin picker/grant).

Not a full OAuth2 server: `response_type` must be `code`. No PKCE, no implicit, no client-credentials grant.

## Key types / entities

| Entity | Storage | Fields that matter |
| --- | --- | --- |
| Client | `oauth2_clients` (`OCA\OAuth2\Db\Client`) | `id`, `name` (≤64), `redirectUri` (≤2000), `clientIdentifier` (64 alnum), `secret` (HMAC hex, not plaintext) |
| AccessToken row | `oauth2_access_tokens` (`OCA\OAuth2\Db\AccessToken`) | `tokenId` → auth token, `clientId`, `hashedCode`, `encryptedToken` (app-password encrypted with current code), `codeCreatedAt`, `tokenCount` |
| Auth token | `authtoken` via `OC\Authentication\Token\IProvider` | 72-char alnum access token; expiry **3600s** after each issue/rotate; `user_id` = token UID |

Client secret at create: 64-char alnum, stored as `bin2hex(HMAC(secret))`. Admin list returns `clientSecret: ''` — plaintext only on `addClient` response.

Authorization code: 128-char alnum; expires **10 minutes** (`AUTHORIZATION_CODE_EXPIRES_AFTER`). `tokenCount === 0` means unused code; after first redeem, further `authorization_code` grants fail.

Refresh: same table; `grant_type=refresh_token` treats `refresh_token` as the current code. Each success **rotates** both the 72-char access token and the 128-char refresh code (compare-and-swap on hashed code). Concurrent redeem of the same code → 400 `invalid_request`.

## Endpoints owned

Map rows whose first `feature_ids` is `oauth2` (6). Pretty URL and `/index.php` OpenAPI twins are **one handler**.

| id | Method | Path | PHP |
| --- | --- | --- | --- |
| `oauth2.LoginRedirector#authorize` | GET | `/apps/oauth2/authorize` | `LoginRedirectorController::authorize` |
| `oauth2.OauthApi#getToken.post` | POST | `/apps/oauth2/api/v1/token` | `OauthApiController::getToken` |
| `oauth2-oauth_api-get-token` | POST | `/index.php/apps/oauth2/api/v1/token` | same `getToken` |
| `oauth2.OauthApi#pushToken.post` | POST | `/apps/oauth2/api/v1/pushtoken` | `OauthApiController::pushToken` |
| `oauth2.Settings#addClient.post` | POST | `/apps/oauth2/clients` | `SettingsController::addClient` |
| `oauth2.Settings#deleteClient.delete` | DELETE | `/apps/oauth2/clients/{id}` | `SettingsController::deleteClient` |

`oauth2-login_redirector-authorize` (`GET /index.php/apps/oauth2/authorize`) is **owned by `core-login`**. Same PHP method as `oauth2.LoginRedirector#authorize`. Implement authorize once; do not fork a second route module.

## Endpoint walkthrough

### Authorize — `oauth2.LoginRedirector#authorize`

`GET /apps/oauth2/authorize?client_id=&state=&response_type=&redirect_uri=`

1. Lookup client by `client_id` (`getByIdentifier`). Missing → **200** guest `core/404` template (`content` = not-authorized string). Not a JSON 401.
2. `response_type !== 'code'` → **303** to `{client.redirectUri}?error=unsupported_response_type&state={urlencoded state}`.
3. Session `oauth.state` = `state`.
4. Legacy OC clients: if `oauth2.enable_oc_clients` **and** stored `redirectUri === 'http://localhost:*'`, pass request `redirect_uri` through as `providedRedirectUri`. Otherwise ignore `redirect_uri` (clients use the registered URI later in ClientFlowLogin).
5. If client `name` is in appconfig `oauth2` / `skipAuthPickerApplications`: mint 64-char state token, session `client.flow.state.token`, **303** to `core.ClientFlowLogin.grantPage`.
6. Else **303** to `core.ClientFlowLogin.showAuthPickerPage` with `clientIdentifier` + `providedRedirectUri`.

Picker/grant/code mint live in **`core-login`**. After grant, ClientFlowLogin redirects to the client's `redirectUri` with `code` + `state`. This slice only starts that flow.

### Token — `oauth2.OauthApi#getToken.post` / `oauth2-oauth_api-get-token`

`POST /apps/oauth2/api/v1/token` — **not OCS**. JSON body or form fields: `grant_type`, `code`, `refresh_token`, `client_id`, `client_secret`.

If `PHP_AUTH_USER` is set, **Basic auth overrides** body `client_id` / `client_secret`.

`grant_type` ∈ `{authorization_code, refresh_token}` else 400 `{error: invalid_grant}`.

Success **200** (no OCS envelope):

```json
{
  "access_token": "<72 alnum>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_token": "<128 alnum>",
  "user_id": "<uid>"
}
```

Global Scale **primary** may add `x.nc-gss.secondary_url`. Default installs omit it.

Bruteforce action: `oauth2GetToken`. Successful issue resets login throttle for the token UID.

### Push token — `oauth2.OauthApi#pushToken.post`

Global Scale **secondary** only. `PublicPage`. Body `jwt`. Decode via `IGlobalScaleService`, `generateToken` on this instance. Success `{ }` 200. If GSS disabled / not secondary / empty jwt / unknown uid → **400** `[]` + throttle `oauth2PushToken`. OpenAPI `SCOPE_IGNORE`.

### Admin clients — `oauth2.Settings#addClient.post` / `#deleteClient.delete`

No `NoAdminRequired` → **admin session**. CSRF required. `addClient`: `#[PasswordConfirmationRequired(strict: true)]`. `deleteClient`: `#[PasswordConfirmationRequired]` (non-strict).

`addClient(name, redirectUri)`: empty name → 400 `{message}`; `redirectUri` must pass `FILTER_VALIDATE_URL` → else 400 with the “full URL” message. Success 200 `{id, name, redirectUri, clientId, clientSecret}` (`clientId` = identifier).

`deleteClient(id)`: invalidate matching **named** auth tokens for seen users **except** wipe-marked tokens; delete `oauth2_access_tokens` for client; delete client row. Success `[]`.

## Auth / tenant rules

| Route | PHP attrs | Effective auth |
| --- | --- | --- |
| authorize | `PublicPage`, `NoCSRFRequired`, `UseSession` | Public; uses session to stash `oauth.state` |
| getToken | `PublicPage`, `NoCSRFRequired`, bruteforce `oauth2GetToken` | Public; **client** secret, not user session. Map `auth: session` on the routes.php row is wrong — follow PHP. |
| pushToken | `PublicPage`, `NoCSRFRequired`, bruteforce `oauth2PushToken` | GSS JWT, not user cookie |
| add/delete client | admin + password confirm + CSRF | Admin cookie session |

Issued `access_token` is a Bearer app password for later DAV/OCS. Do not require the user cookie on `/token`.

Tenant = this instance's `oauth2_clients` + `authtoken`. No multi-tenant header. GSS `x.nc-gss.secondary_url` is the only cross-instance hook; skip unless GSS is enabled in parity config.

## Failure modes

Token 400 JSON `{error}` (RFC-ish, not OCS):

| `error` | When |
| --- | --- |
| `invalid_grant` | `grant_type` not `authorization_code` / `refresh_token` |
| `invalid_request` | missing/unknown code; auth-code already used (`tokenCount > 0`); auth-code older than 10 min (row deleted); client row missing; auth token missing (row deleted); rotate CAS lost race |
| `invalid_client` | missing secret; HMAC mismatch; `client_id` ≠ stored identifier |

Authorize: unknown client = HTML 404, not JSON. Wrong `response_type` = 303 to client with `error=unsupported_response_type`.

Admin: 400 validation; unauthenticated / non-admin → AppFramework 401/403 (not `{error}`).

Do not invent `unauthorized_client` / `access_denied` on `/token` — PHP does not emit them here (`access_denied` would come from ClientFlowLogin, `core-login`).

## Do-not list

- Do not implement ClientFlowLogin picker/grant/code mint (`core-login`).
- Do not implement `oauth2-login_redirector-authorize` as a second feature (map owner is `core-login`; same controller).
- Do not add PKCE, `response_type=token`, client-credentials, or RFC resource indicators.
- Do not return stored client secret on list/get; plaintext only on create.
- Do not treat token endpoint as OCS (`bp-ocs-envelope` does not apply).
- Do not implement occ commands `oauth2:add-client` / `delete-client` / import-legacy (CLI, not HTTP map).
- Do not implement admin settings HTML (`OCA\OAuth2\Settings\Admin`) as an oauth2 map endpoint.
- Do not cancel remote-wipe tokens when deleting a client.
- Do not start `files` / `dav` in this slice.
- Map `auth` on routes.php oauth rows is coarse; never 401 a public token POST for missing user session.

## Conceptual Next.js shape

```
src/server/oauth2/
  clients.ts          # Client store (identifier, hashed secret, redirectUri)
  access-tokens.ts    # hashed code, encrypted app token, tokenCount, CAS rotate
  authorize.ts        # GET /authorize decision tree → 303 or 404 HTML
  token.ts            # POST /token grants + RFC error JSON
  push-token.ts       # GSS stub: 400 unless explicitly enabled
  admin-clients.ts    # add/delete + password-confirm gate
app/apps/oauth2/
  authorize/route.ts
  api/v1/token/route.ts
  api/v1/pushtoken/route.ts
  clients/route.ts
  clients/[id]/route.ts
```

Pretty paths without `/index.php`. Also accept `/index.php/apps/oauth2/api/v1/token` as the OpenAPI twin.

## Parity notes

Minimum cases (plus `parity-testing` trio):

| Case | Endpoint | Expect |
| --- | --- | --- |
| Happy authorize | authorize | known `client_id`, `response_type=code` → 303 to ClientFlowLogin (auth picker URL) |
| Unknown client | authorize | 200 HTML 404 template |
| Bad response_type | authorize | 303 `?error=unsupported_response_type&state=` |
| Happy token | getToken | valid unused code + matching client secret → 200 token JSON, `token_type=Bearer`, `expires_in=3600` |
| Basic client auth | getToken | `Authorization: Basic` client_id:secret overrides body |
| Bad grant | getToken | `grant_type=foo` → 400 `{error:invalid_grant}` |
| Bad code | getToken | 400 `{error:invalid_request}` |
| Reuse auth code | getToken | second `authorization_code` → 400 `invalid_request` |
| Bad client secret | getToken | 400 `{error:invalid_client}` |
| Refresh rotates | getToken | new `access_token` + `refresh_token`; old refresh fails |
| Expired code | getToken | code older than 10 min → 400 `invalid_request` |
| GSS off | pushToken | 400 `[]` |
| Admin create | addClient | valid URL → 200 with one-time `clientSecret` |
| Admin bad URL | addClient | 400 message about full URL |
| Admin empty name | addClient | 400 |
| Auth failure | addClient / deleteClient | no admin session → 401/403 |

Normalize: generated tokens/ids (assert length/charset, not equality). Compare error `error` key exactly.

Without `LEGACY_BASE_URL`, use `parity/legacy-mock/` (not waived). Token bruteforce delay is status-only; do not simulate sleep.

## Repo links

- `apps/oauth2/appinfo/routes.php`
- `apps/oauth2/lib/Controller/LoginRedirectorController.php`
- `apps/oauth2/lib/Controller/OauthApiController.php`
- `apps/oauth2/lib/Controller/SettingsController.php`
- `apps/oauth2/lib/Service/ClientService.php`
- `apps/oauth2/lib/Db/Client.php`, `AccessToken.php`
- `apps/oauth2/lib/Settings/Admin.php` (not a mapped endpoint)
- Tests: `apps/oauth2/tests/Controller/OauthApiControllerTest.php`, `LoginRedirectorControllerTest.php`, `SettingsControllerTest.php`
- Feature map: `.cursor/rules/feature-map.mdc` row `oauth2`
- Cross: `core-login` ClientFlowLogin; DAV/OCS Bearer consumption
