---
name: cloud_federation_api
description: OCM discovery, incoming shares/notifications, JWKS, catch-all /ocm/{path}. Use when implementing or testing OCM, .well-known/ocm, or /ocm-provider/.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# cloud_federation_api

## Purpose

Open Cloud Mesh (OCM) ingress: discovery documents, JWKS, incoming share + notification POSTs, and a signed catch-all under `/ocm/{path}`. Remote Nextclouds (and other OCM servers) call these; browsers usually do not.

Depends on `core` (well-known dispatcher, URL generator, capabilities). Outgoing federation and trusted-server secrets are **`federatedfilesharing` / `federation`**, not this feature.

Isolate remotes in parity. Do not call the public internet.

## Scope

12 map ids:

- `GET /.well-known/ocm`
- `GET /ocm-provider/` and OpenAPI alias `/index.php/ocm-provider`
- `GET /apps/cloud_federation_api/api/v1/jwks`
- `POST /ocm/shares` (+ `/index.php/ocm/shares`)
- `POST /ocm/notifications` (+ `/index.php/ocm/notifications`)
- Catch-all `GET|POST|PUT|DELETE /ocm/{ocmPath}`

## Non-scope

- `POST /api/v1/access-token` (`TokenController::accessToken`) — **exists in PHP, not in the feature map**. Discovery advertises `tokenEndPoint` to it. Do not implement until mapped; do not drop the advertisement field from discovery JSON if PHP emits it.
- Outgoing create/accept/decline (`federatedfilesharing-request_handler-*`)
- Trusted servers OCS (`federation`)
- Public WebDAV `/public.php/webdav/` (dav / files_sharing) — only **listed** as the file resource protocol path
- Signing key generation internals beyond JWKS JSON shape

## Key types / entities

| Name | Shape |
| --- | --- |
| OCM provider document | `enabled`, deprecated `apiVersion` default `'1.0-proposal1'`, `version` (real, default `1.1.2`), `endPoint` (directory containing `/shares` and `/notifications`), `provider`, `resourceTypes[]`, optional `capabilities[]`, `tokenEndPoint`, `jwksUri`, `publicKey`, `inviteAcceptDialog` — `OC\OCM\Model\OCMProvider::jsonSerialize` |
| Resource type (stock) | `{name: file, shareTypes: [user, group], protocols: {webdav: /public.php/webdav/}}` plus types from `LocalOCMDiscoveryEvent` / `ResourceTypeRegisterEvent` |
| Capabilities (stock) | `notifications`, `shares`, `exchange-token`; plus `http-sig` when JWKS URI can be built and signing is not disabled |
| Add-share success | `{recipientDisplayName: string, recipientUserId?: string}` HTTP **201** |
| OCM error | `{message}` |
| OCM validation error | `{message, validationErrors: [{name, message|null}]}` |
| JWKS | `{keys: list<object>}` — empty `keys` if local JWKS fails |
| Incoming share | `shareWith`, `name`, `description?`, `providerId`, `owner`, `ownerDisplayName?`, `sharedBy?`, `sharedByDisplayName?`, `protocol` (array with `name` + sharedSecret), `shareType` (`user`\|`group`…), `resourceType` (`file`…) |
| Protocol sharedSecret | Legacy `{name, options: {sharedSecret}}` **or** `{name, <type>: {sharedSecret}}` **or** multi `{name: multi, webdav: {sharedSecret}, ...}` — any sibling array with string `sharedSecret` counts |
| Notification | `notificationType`, `resourceType`, `providerId`, `notification` object (must include `sharedSecret` when signatures are verified) |
| Catch-all event | `OCMEndpointRequestEvent(method, normalizedPath, payload, origin)` — first listener response wins; else HTTP 404 empty |
| Token map | `ocm_token_map` access-token-id ↔ refresh token (`OcmTokenMap`) — used when resolving signed notification identity from an access token |

Config knobs (do not invent others):

| Key | Effect |
| --- | --- |
| `core` appconfig OCM discovery enabled (`ConfigLexicon::OCM_DISCOVERY_ENABLED`) | If false, provider stays `enabled: false` with empty endpoint |
| `OCMSignatoryManager::APPCONFIG_SIGN_DISABLED` | Skip incoming signature checks on shares/notifications |
| `OCMSignatoryManager::APPCONFIG_SIGN_ENFORCED` | Unsigned incoming request → 400/401 |
| `sharing.federation.ocm.apiVersion` | Override advertised version; also `removeVersion()` (legacy `apiVersion` becomes real version, `version` omitted) |
| `sharing.federation.ocm.removePublicKey` | Omit `publicKey` |

## Endpoints owned

| id | method | path | PHP |
| --- | --- | --- | --- |
| `core.WellKnown#handle.ocm` | GET | `/.well-known/ocm` | `lib/private/OCM/OCMDiscoveryHandler.php` — only if `service === ocm`; JSON of `getLocalOCMProvider()` |
| `core.OCM#discovery` | GET | `/ocm-provider/` | `core/Controller/OCMController.php` |
| `core-ocm-discovery` | GET | `/index.php/ocm-provider` | same discovery, pretty-URL vs index.php |
| `cloud_federation_api.Token#jwks` | GET | `/apps/cloud_federation_api/api/v1/jwks` | `TokenController::jwks` **PublicPage** (map `auth: session` is wrong) |
| `cloud_federation_api-request_handler-add-share` | POST | `/index.php/ocm/shares` | OpenAPI |
| `cloud_federation_api.RequestHandler#addShare.post` | POST | `/ocm/shares` | routes.php `root => /ocm` |
| `cloud_federation_api-request_handler-receive-notification` | POST | `/index.php/ocm/notifications` | OpenAPI |
| `cloud_federation_api.RequestHandler#receiveNotification.post` | POST | `/ocm/notifications` | routes.php |
| `cloud_federation_api.OCMRequest#manageOCMRequests` | GET | `/ocm/{ocmPath}` | catch-all, **must be last** |
| `cloud_federation_api.OCMRequest#manageOCMRequests.post` | POST | same | |
| `cloud_federation_api.OCMRequest#manageOCMRequests.put` | PUT | same | |
| `cloud_federation_api.OCMRequest#manageOCMRequests.delete` | DELETE | same | |

Duplicate OpenAPI vs routes.php rows share one handler. Catch-all `ocmPath` is `.*` — **must not** steal `/ocm/shares` or `/ocm/notifications`.

## Endpoint walkthrough

### Discovery

1. If discovery disabled → `{enabled:false, ...}` still 200 (well-known). `/ocm-provider/` wraps `jsonSerialize()` with headers `X-NEXTCLOUD-OCM-PROVIDERS: true`, `Content-Type: application/json`. Exception → 500 `{message: "/ocm-provider/ not supported"}`.
2. If enabled: `endPoint` = absolute addShare URL with last path segment stripped (so `.../ocm`). `tokenEndPoint` = absolute access-token route. File resource type registered. Events may add types. Signing: JWKS URI + `http-sig` + optional `publicKey` signatory when `fullDetails` (HTTP discovery uses default true).
3. Well-known uses `GenericResponse(JSONResponse(provider))` — same object, may differ on headers (`X-NEXTCLOUD-WELL-KNOWN` comes from well-known front controller, see `core`).

### JWKS

Always 200 `{keys}`. Build failure → log + empty `keys`, **not** 500.

### POST /ocm/shares (`addShare`)

`PublicPage`, `NoCSRFRequired`, brute-force `receiveFederatedShare`, federation rate limit 5/1200s.

1. Unless signing disabled: `getIncomingSignedRequest($owner)` + `confirmSignedOrigin(..., 'owner', $owner)`. Fail → 400 `{message, validationErrors:[]}`.
2. Required: `shareWith`, `name`, `providerId`, `resourceType`, `shareType`, `protocol` array with `name`. Else 400 Missing arguments.
3. Protocol must carry a string `sharedSecret` (legacy options **or** typed sibling). Else 400 Missing sharedSecret.
4. `shareType` must be in provider `getSupportedShareTypes($resourceType)` else **501**.
5. Resolve `shareWith` cloud id → local user. `user`: LDAP hook `preLoginNameUsedAsUserName`, then userExists or 400 + throttle. `group`: groupExists or 400 + throttle.
6. Homograph check (`Spoofchecker`) on owner/sharedBy domains → 400 + throttle.
7. Provider `validateShare` (if `IValidationAwareCloudFederationProvider`) then `shareReceived`. Map: `BadRequestException` 400; `ProviderDoesNotExistsException` 501; `ProviderCouldNotAddShareException` status from exception code or 501; other → 400 Internal error (with instance base URL in message).
8. Success 201: user shares include `recipientDisplayName` + `recipientUserId`; else `{recipientDisplayName:''}`.

`sharedBy` defaults to `owner` when omitted.

### POST /ocm/notifications (`receiveNotification`)

`PublicPage`, brute-force `receiveFederatedShareNotification`.

1. Required: `notificationType`, `resourceType`, `providerId`, `notification` array. Else 400 Missing arguments.
2. Unless signing disabled: resolve identity from `notification.sharedSecret` via signed provider (`ISignedCloudFederationProvider`); empty identity may map access token → refresh token then retry. Confirm origin. Missing sharedSecret → BadRequestException (400).
3. `notificationReceived(...)`. Map: unknown provider 400; `ShareNotFound` 400 + throttle; `ActionNotSupported` **501**; `BadRequestException` 400 payload; `AuthenticationFailedException` **403 `{message: RESOURCE_NOT_FOUND}`** + throttle (do not say 401); other 400 Internal error.
4. Dispatch `OCMNotificationReceivedEvent` (failures logged, still 201).
5. 201 body = provider `$result` (array, possibly empty).

### Catch-all `/ocm/{ocmPath}`

`PublicPage`, brute-force `receiveOcmRequest`.

1. Path must be UTF-8 else `OCMArgumentException`.
2. Pick identity from payload `owner` | `sender` | `sharedBy`.
3. Signed-request check (same enforce/disabled flags). Fail → 400 + throttle.
4. JSON-decode body (unsigned uses `php://input`). Invalid JSON → payload null, still dispatch.
5. Collapse duplicate slashes in path. Dispatch `OCMEndpointRequestEvent`. Return listener response or **404 empty** (not JSON).

## Auth / tenant rules

| Route | Auth |
| --- | --- |
| Discovery, well-known, JWKS, shares, notifications, catch-all | **Public** (`PublicPage` / well-known none). Map `session`/`mixed` on several rows is scanner noise — **do not 401 missing cookies**. |
| Integrity | HTTP Message Signatures / cavage when remote supports it; `SIGN_ENFORCED` rejects unsigned; `SIGN_DISABLED` skips. Origin of signature must match cloud-id host of `owner` / notification identity. |
| CSRF | Off (`NoCSRFRequired`). |

No Nextcloud user session. Tenant is the local instance; `shareWith` is a **local** user or group after cloud-id parse.

## Failure modes

| HTTP | When |
| --- | --- |
| 200 | discovery, JWKS (even empty keys) |
| 201 | share or notification accepted |
| 400 | signature, validation, missing fields, unknown user/group, spoofed domain, ShareNotFound on notification, generic internal |
| 403 | notification `RESOURCE_NOT_FOUND` (auth fail, throttled) |
| 404 | catch-all no listener; well-known non-ocm is **not this feature** |
| 500 | `/ocm-provider/` exception |
| 501 | unsupported share/resource type or action |
| 429/throttle | brute-force on bad user/group, bad notification secret, bad catch-all signature |

Do not convert 403 RESOURCE_NOT_FOUND into 401.

## Conceptual Next.js shape

```
src/server/ocm/
  discovery.ts         # local provider JSON
  signatures.ts        # incoming signed request + origin confirm
  shares.ts            # addShare
  notifications.ts     # receiveNotification
  catch-all.ts         # OCMEndpointRequestEvent analog
  jwks.ts
app/.well-known/ocm/route.ts
app/ocm-provider/route.ts
app/ocm/shares/route.ts
app/ocm/notifications/route.ts
app/ocm/[...ocmPath]/route.ts          # after static segments
app/apps/cloud_federation_api/api/v1/jwks/route.ts
```

File-share persistence belongs to `federatedfilesharing` provider. This slice: validate, signature, dispatch to a provider port, return OCM JSON.

## Traps

- Catch-all **below** `/shares` and `/notifications` in the router.
- `/index.php/ocm/...` vs `/ocm/...` vs pretty URLs — same handlers.
- `endPoint` is the **parent** of `/shares`, not the shares URL itself.
- Discovery `apiVersion` is the **legacy** string unless `removeVersion` config; `version` is `1.1.2` unless overridden.
- JWKS and addShare are unauthenticated.
- Unknown local user on addShare is **400**, throttled, not 404.
- Notification auth failure is **403 RESOURCE_NOT_FOUND**.
- Homograph domains rejected.
- `protocol.name === 'multi'` still accepted if any sibling holds `sharedSecret`.
- Feature map `Token#jwks` auth=session is incorrect vs `#[PublicPage]`.

## Do-not

- Do not implement trusted-server shared-secret OCS (`federation`).
- Do not implement outgoing S2S (`federatedfilesharing`).
- Do not add unmapped `access-token` unless the map gains that id.
- Do not 401 public OCM POSTs for missing session.
- Do not leak whether a sharedSecret matched (use 403 RESOURCE_NOT_FOUND / 400 ShareNotFound as PHP does).
- Do not skip signature origin checks when signing is enabled.
- Do not call real remote OCM in tests; mock discovery/signatures.

## Parity notes

Mock signing: unsigned accepted when enforce is false (PHP default). Extra:

| Case | Expectation |
| --- | --- |
| GET `/ocm-provider/` | 200 JSON + `X-NEXTCLOUD-OCM-PROVIDERS` + `Content-Type: application/json` |
| GET `/.well-known/ocm` | 200 provider JSON |
| Discovery disabled | `enabled: false` |
| GET JWKS no auth | 200 `{keys: array}` |
| POST shares missing `protocol.name` | 400 validationErrors |
| POST shares unknown user | 400 + throttle |
| POST shares unsupported shareType | 501 |
| POST notifications missing fields | 400 |
| POST notifications auth fail | 403 `{message: RESOURCE_NOT_FOUND}` |
| GET `/ocm/not-a-capability` unsigned allowed | 404 empty if no listener |
| Catch-all non-UTF-8 path | error (argument exception) |
| POST `/ocm/shares` as GET | 405 |

`endPoint` / `tokenEndPoint` / `jwksUri`: rewrite host in harness. `publicKey` presence depends on signing config — assert against the same env as legacy.

## Repo paths

- Routes: `apps/cloud_federation_api/appinfo/routes.php`
- Shares/notifications: `apps/cloud_federation_api/lib/Controller/RequestHandlerController.php`
- JWKS + unmapped access-token: `apps/cloud_federation_api/lib/Controller/TokenController.php`
- Catch-all: `apps/cloud_federation_api/lib/Controller/OCMRequestController.php`
- Types: `apps/cloud_federation_api/lib/ResponseDefinitions.php`
- Share-type helper: `apps/cloud_federation_api/lib/Config.php`
- Token map: `apps/cloud_federation_api/lib/Db/OcmTokenMap.php`, `OcmTokenMapMapper.php`, `lib/Service/OcmTokenService.php`
- Discovery HTTP: `core/Controller/OCMController.php`
- Well-known: `lib/private/OCM/OCMDiscoveryHandler.php`
- Provider builder: `lib/private/OCM/OCMDiscoveryService.php`, `lib/private/OCM/Model/OCMProvider.php`
- Signatures: `lib/private/OCM/OCMSignatoryManager.php`
- Events: `lib/public/OCM/Events/OCMEndpointRequestEvent.php`, `OCMNotificationReceivedEvent.php`, `LocalOCMDiscoveryEvent.php`
- OpenAPI: `apps/cloud_federation_api/openapi.json`
