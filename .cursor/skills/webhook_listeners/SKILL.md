---
name: webhook_listeners
description: Admin OCS CRUD for webhook registrations. Use when implementing or testing webhook_listeners /api/v1/webhooks.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# webhook_listeners

## Purpose

Admin OCS CRUD for outbound webhook registrations. Listeners fire later via `WebhooksEventListener` + `WebhookCall` queued job — those are **not** mapped HTTP endpoints. This slice owns the six OCS routes.

Depends on `core-login`. OpenAPI scope `administration`.

## Scope

- OCS `/ocs/v{1,2}.php/apps/webhook_listeners/api/v1/webhooks`
- Filter index by `uri`
- Create/update/destroy one registration
- Delete all registrations for an AppAPI `appid`

## Non-scope

- HTTP delivery to callback URIs (`BackgroundJobs/WebhookCall`) as a client-facing route
- Inventing new auth methods beyond `none` / `header`
- Settings UI (`Settings\Admin::getForm` throws; delegation-only)
- `occ webhook_listeners:list`
- Event classes that do not implement `OCP\EventDispatcher\IWebhookCompatibleEvent`

## Key types / entities

Table `webhook_listeners`. Entity `OCA\WebhookListeners\Db\WebhookListener`. JSON from `jsonSerialize()` = **all Entity field getters**, not the psalm `WebhookListenersWebhookInfo` idealization.

| Field | Type / notes |
| --- | --- |
| `id` | Entity id (int in PHP; OpenAPI types string — accept number) |
| `appId` | AppAPI ex-app id or null |
| `userId` | creator uid or null |
| `httpMethod` | stored as given string (no verb allowlist in mapper) |
| `uri` | callback URL; AppAPI may use path starting `/` |
| `event` | FQCN, `ltrim('\\')`; must `class_exists` and `is_a(..., IWebhookCompatibleEvent::class, true)` |
| `eventFilter` | JSON object; `[]` matches all. Mongo-like query via `PHPMongoQuery::executeQuery` at fire time |
| `userIdFilter` | uid or `''` (empty = no user filter) |
| `headers` | `array<string,string>` or null |
| `authMethod` | enum `AuthMethod`: `'none'` \| `'header'` |
| `authData` | **encrypted string** in serialize (`getAuthData`), not decrypted object. Header method requires associative header map at write (`setAuthDataClear`) |
| `tokenNeeded` | `{ user_ids?: string[], user_roles?: string[] }` or `[]`. Roles: `'owner'` (creator), `'trigger'` (event user). Tokens minted at fire time, TTL 1h — not on CRUD response |

`AuthMethod::from(null)` is invalid; controller uses `$authMethod ?? 'none'` then `AuthMethod::from`. Unknown string → 400 `'This auth method does not exist'`.

OpenAPI `WebhookInfo` / psalm type lists `authData` as object and `id` as string — **PHP serialize wins**.

## Endpoints owned

Map rows whose first `feature_ids` is `webhook_listeners` (6). `ocs_version: both`.

| id | method | path |
| --- | --- | --- |
| `webhook_listeners-webhooks-index` | GET | `/ocs/v2.php/apps/webhook_listeners/api/v1/webhooks` query `uri?` |
| `webhook_listeners-webhooks-create` | POST | same |
| `webhook_listeners-webhooks-show` | GET | `.../webhooks/{id}` |
| `webhook_listeners-webhooks-update` | POST | `.../webhooks/{id}` (**POST, not PUT**) |
| `webhook_listeners-webhooks-destroy` | DELETE | `.../webhooks/{id}` |
| `webhook_listeners-webhooks-delete-by-app-id` | DELETE | `.../webhooks/byappid/{appid}` |

Register `byappid/{appid}` before `{id}`.

## Endpoint walkthrough

Every method: `#[AuthorizedAdminSetting(Admin::class)]` + `#[AppApiAdminAccessWithoutUser]`.

### Index — `webhook_listeners-webhooks-index`

`uri` query set → `getByUri(uri)`; else `getAll()`. Map `jsonSerialize`, `array_values`. 200 list. Other `\Exception` → `OCSException('An internal error occurred', 500)` (HTTP 500 v2, OCS 500).

### Show — `webhook_listeners-webhooks-show`

`getById`. `DoesNotExistException` → `OCSNotFoundException` (404). Else serialize. Other → 500 internal.

### Create — `webhook_listeners-webhooks-create`

Body: `httpMethod`, `uri`, `event`, optional `eventFilter`, `userIdFilter`, `headers`, `authMethod`, `authData`, `tokenNeeded`.

If session `app_api === true`, `appId = request header ex-app-id` (header name `ex-app-id`). Else `appId` null.

`tokenNeeded` **forced null** unless session user exists **and** is in group admin (`IGroupManager::isAdmin`). AppAPI-without-user therefore cannot persist token requests. Mapper then uses `$tokenNeeded ?? []`.

`UnexpectedValueException` → 400 with exception message (bad event class, header auth missing data). `DomainException` → 403. Other → 500 internal.

200 serialized entity.

### Update — `webhook_listeners-webhooks-update`

Same body + path `id`. Same AppAPI header / authMethod / mapper rules. **Does not** apply the admin-only `tokenNeeded` wipe that create does — update passes `tokenNeeded` through. Match PHP.

Missing id: mapper `update()` may throw; not a dedicated 404 in the controller. Do not invent 404 unless the mapper does.

### Destroy — `webhook_listeners-webhooks-destroy`

`deleteById` → 200 **boolean** (`true` if a row deleted). No 404 for missing id.

### Delete by app id — `webhook_listeners-webhooks-delete-by-app-id`

`deleteByAppId` → 200 **integer** count.

## Auth / tenant

| Who | Access |
| --- | --- |
| Anonymous | 401 / OCS 997 |
| Logged-in non-admin without delegated webhook setting | 403 |
| Admin or delegated `webhook_listeners` settings | full CRUD |
| AppAPI session (`app_api` + `AppApiAdminAccessWithoutUser`) | CRUD without a user; `ex-app-id` stamped on create/update; `tokenNeeded` stripped on **create** |

Instance-global table (not per-tenant beyond Nextcloud instance). `userIdFilter` only affects **when** a stored hook fires, not who may read the list.

Password confirmation is **not** annotated on these controllers.

## Failure modes

| Code | Cause |
| --- | --- |
| 400 | unknown `authMethod`; event not `IWebhookCompatibleEvent`; header auth without map |
| 401 / 997 | unauthenticated |
| 403 | not admin/delegated; `DomainException` from mapper (none thrown today — keep the mapping) |
| 404 | show missing id only |
| 500 | wrapped `\Exception`; create/update/index/destroy/deleteByAppId |

OCS v1: errors HTTP 200 + OCS code. v2: HTTP matches 400/403/404/500.

Fire path (not mapped): empty filter matches; non-empty filter uses `PHPMongoQuery`; job payload `{event, user, time}` plus ephemeral `authentication` tokens at send time. Do not implement callback HTTP as an inbound Next.js route.

## Conceptual Next.js shape

```
src/server/webhooks/
  store.ts            # CRUD + uri filter
  auth-method.ts      # none | header
  events.ts           # allowlist of IWebhookCompatibleEvent names for stubs
app/ocs/v2.php/apps/webhook_listeners/api/v1/webhooks/route.ts
app/ocs/v2.php/apps/webhook_listeners/api/v1/webhooks/byappid/[appid]/route.ts
app/ocs/v2.php/apps/webhook_listeners/api/v1/webhooks/[id]/route.ts
```

Persist `authData` encrypted-at-rest; **CRUD JSON must still return the stored ciphertext string** if PHP would. Do not decrypt in `index`/`show`.

Stub a small set of event class names that exist in this repo and implement `IWebhookCompatibleEvent` so create can succeed. Reject unknown names with the PHP message `"{event} is not an event class compatible with webhooks"`.

## Traps

- Update is **POST** `/webhooks/{id}`, not PUT.
- destroy returns **bool**, deleteByAppId returns **int**.
- `jsonSerialize` dumps encrypted `authData`, includes `appId`.
- Leading `\\` on event is stripped; comparison uses the trimmed name.
- Create vs update `tokenNeeded` admin check is **asymmetric**.
- Header name is `ex-app-id` (not `Ex-App-Id` in PHP getHeader — framework normalizes).
- OCS default XML; tests use `?format=json`.
- Distributed cache key `eventsUsedInWebhooks_{userIdFilter}` TTL 300s — invalidate on write if implementing fire; not required for CRUD parity.

## Do-not

- Do not add `PUT` as the update verb.
- Do not return decrypted header secrets on GET.
- Do not allow non-admin create of `tokenNeeded` (create path).
- Do not accept event classes that are not `IWebhookCompatibleEvent`.
- Do not expose `WebhookCall` as an HTTP API.
- Do not render `Settings\Admin` (it throws).
- Do not mix with `workflowengine` Flow CRUD.

## Parity notes

Minimum: happy, 401/997, 403.

| Case | Expectation |
| --- | --- |
| GET index empty | 200 `[]` |
| GET index `?uri=` | only matching uri |
| POST create `authMethod=nope` | 400 This auth method does not exist |
| POST create event `stdClass` | 400 not compatible with webhooks |
| POST create `authMethod=header`, `authData` null | 400 Header auth method needs an associative array… |
| POST create default auth | stored `none`, 200 with `id` |
| GET show missing | 404 |
| POST update | 200 updated fields |
| DELETE missing id | 200 `false` |
| DELETE byappid none | 200 `0` |
| GET as user | 403 |
| PUT `/webhooks/{id}` | 405 |

Do not assert outbound HTTP to `uri` in this slice unless a later fire test is added and marked extra.

## Repo paths

- Controller: `apps/webhook_listeners/lib/Controller/WebhooksController.php`
- Entity: `apps/webhook_listeners/lib/Db/WebhookListener.php`
- Mapper: `apps/webhook_listeners/lib/Db/WebhookListenerMapper.php`
- Auth enum: `apps/webhook_listeners/lib/Db/AuthMethod.php`
- Psalm type: `apps/webhook_listeners/lib/ResponseDefinitions.php`
- Fire: `apps/webhook_listeners/lib/Listener/WebhooksEventListener.php`
- Job: `apps/webhook_listeners/lib/BackgroundJobs/WebhookCall.php`
- Filter: `apps/webhook_listeners/lib/Service/PHPMongoQuery.php`
- Tokens: `apps/webhook_listeners/lib/Service/TokenService.php`
- Delegation: `apps/webhook_listeners/lib/Settings/Admin.php`
- Bootstrap: `apps/webhook_listeners/lib/AppInfo/Application.php`
- OpenAPI: `apps/webhook_listeners/openapi.json`
- Tests: `apps/webhook_listeners/tests/Db/WebhookListenerMapperTest.php`, `tests/Service/PHPMongoQueryTest.php`
