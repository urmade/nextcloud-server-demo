---
name: workflowengine
description: Flow admin/user workflow CRUD OCS. Use when implementing or testing /apps/workflowengine/api/v1/workflows/{global,user}.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# workflowengine

## Purpose

Nextcloud Flow: persist and list automation **rules** (operation + checks + entity events) in admin or user scope. Matching at file/request events is in-process, not extra HTTP.

Depends on `files` for the built-in File entity. This slice owns OCS CRUD + rule store, not third-party operation apps.

## Scope

- OCS `/ocs/v{1,2}.php/apps/workflowengine/api/v1/workflows/global[/{id}]`
- OCS `/ocs/v{1,2}.php/apps/workflowengine/api/v1/workflows/user[/{id}]`
- Tables `flow_operations`, `flow_operations_scope`, `flow_checks`
- Built-in checks + File entity registration
- App config `user_scope_disabled`

## Non-scope

- Settings HTML (`Settings\Admin` / `Personal`) and `LoadSettingsScriptsEvent`
- `GET /apps/workflowengine/timezones` (`RequestTimeController`) — **unmapped**
- Runtime in-memory operations (`RegisterRuntimeOperationsEvent`, `addRuntimeOperation`) — not OCS
- Operation implementations in other apps (automated tagging, workflow_script, …)
- OCC `workflowengine:index` / `runtime`
- Log rotate background job

## Endpoints owned

Map ids where `feature_ids` contains `workflowengine` (10). v2 path canonical; `ocs_version: both`.

| id | Method | Path | PHP |
| --- | --- | --- | --- |
| `workflowengine-global_workflows-index` | GET | `/ocs/v2.php/apps/workflowengine/api/v1/workflows/global` | `GlobalWorkflowsController::index` |
| `workflowengine-global_workflows-create` | POST | same | `create` |
| `workflowengine-global_workflows-show` | GET | `/ocs/v2.php/apps/workflowengine/api/v1/workflows/global/{id}` | `show` |
| `workflowengine-global_workflows-update` | PUT | same | `update` |
| `workflowengine-global_workflows-destroy` | DELETE | same | `destroy` |
| `workflowengine-user_workflows-index` | GET | `/ocs/v2.php/apps/workflowengine/api/v1/workflows/user` | `UserWorkflowsController::index` |
| `workflowengine-user_workflows-create` | POST | same | `create` |
| `workflowengine-user_workflows-show` | GET | `/ocs/v2.php/apps/workflowengine/api/v1/workflows/user/{id}` | `show` |
| `workflowengine-user_workflows-update` | PUT | same | `update` |
| `workflowengine-user_workflows-destroy` | DELETE | same | `destroy` |

Header `OCS-APIRequest: true`, `?format=json`. Envelope: `bp-ocs-envelope`.

`#[ApiRoute]` — no `routes.php`.

## Key types / entities

Scopes (`OCP\WorkflowEngine\IManager`):

- `SCOPE_ADMIN = 0` — `scopeId` `''`
- `SCOPE_USER = 1` — `scopeId` = uid (required)

Hash: `sha256(scope + '::' + scopeId)`.

`MAX_CHECK_VALUE_BYTES = 2048`. `MAX_OPERATION_VALUE_BYTES = 4096`.

`flow_operations`: `id`, `class` (IOperation FQCN), `name`, `checks` (JSON int[] of check ids), `operation` (string payload), `entity` (IEntity FQCN), `events` (JSON string[] of event names).

`flow_operations_scope`: `operation_id`, `type`, `value` (uid or `''`). Unique `(operation_id, type, value)`.

`flow_checks`: `id`, `class`, `operator`, `value`, `hash` = `md5(class::operator::value)`. Unique hash — checks are reused.

`WorkflowEngineCheck`: `{ class: ICheck FQCN, value: string, operator }`

Operators (psalm): `is` `in` `match` `less` `greater` `matchesIPv4` `matchesIPv6` and `!` prefixed / `!matchesIPv4` `!matchesIPv6`.

`WorkflowEngineRule`: `{ id, class, name, checks: Check[], operation, entity, events: string[] }`

PHP `formatOperation` **keeps extra row keys**. Index/show join adds `scope_type`, `scope_actor_id`. Do not strip for parity.

Built-in entity: `OCA\WorkflowEngine\Entity\File` events:

- `\OCP\Files::postCreate` / `postWrite` / `postRename` / `postDelete` / `postTouch` / `postCopy`
- `OCP\SystemTag\MapperEvent::EVENT_ASSIGN`

Built-in checks: `FileMimeType`, `FileName`, `FileSize`, `FileSystemTags`, `RequestRemoteAddress`, `RequestTime`, `RequestURL`, `RequestUserAgent`, `UserGroupMembership`. **No built-in operations** — other apps register `IOperation`.

`user_scope_disabled` app bool (workflowengine): if true, user OCS `getScopeContext()` throws `OCSForbiddenException('User not logged in')`. Personal settings section also hidden.

Index data: `Record<operationClass, Rule[]>` (object keyed by class). Empty → `{}`.

Show `{id}`: **`id` is operation class name**, not numeric rule id. Returns **list** of rules of that class in scope, or `[]` if none. **200** either way.

Create/update/destroy `{id}` on PUT/DELETE: **numeric operation id**.

## Endpoint walkthrough

Shared logic: `AWorkflowOCSController`. Mutations `#[PasswordConfirmationRequired]`.

### Global vs user auth

| | Global | User |
| --- | --- | --- |
| `NoAdminRequired` | **no** → admin | **yes** |
| Scope | `SCOPE_ADMIN` | `SCOPE_USER` + session uid |
| User scope off / no user | n/a | **403** `User not logged in` |

Anonymous: 401. Logged-in non-admin on global: **403**.

### GET index (both)

`getAllOperations(scope)` grouped by `class`. Skip rows whose class is not in the container or `isAvailableForScope` is false. Format each. **200**.

### GET show (both)

`getOperations($id /* class */, scope)` → formatted list. Unknown class → **200 `[]`**.

### POST create (both)

Body: `{ class, name, checks, operation, entity, events }`.

`validateOperation` then insert checks + operation + scope in a transaction.

**200** formatted new rule (single object).

### PUT update (both)

Body: `{ name, checks, operation, entity, events }` — **no `class`**. Class taken from existing row.

`canModify(id, scope)` else `DomainException` → **403** `Target operation not within scope`.

Then validate + replace check ids/name/operation/entity/events. **Does not change class.** Cache `flow`/`events` dropped.

**200** formatted rule.

### DELETE destroy (both)

`canModify` else 403. Delete operation then scope row. **200** `true` (bool).

`canModify` admin: any operation with `scope.type = 0`. User: `type = 1` **and** `value = uid`. Cross-scope update/delete is 403.

## Validation (400 `OCSBadRequestException`)

`UnexpectedValueException` messages (l10n):

- `operation` string length > 4096
- `class` not `IOperation` / not in container / not available for this scope
- `entity` not `IEntity` / not in container
- empty `events` unless operation is `IComplexOperation` → `No events are chosen.`
- event name not in `entity.getEvents()`
- **zero checks** → `At least one check needs to be provided`
- check `class` not string / not `ICheck` / missing / not allowed for entity
- check `value` length > 2048
- `IOperation::validateOperation` / `ICheck::validateCheck` throws

DB errors → `OCSException` `'An internal error occurred'`.

Check insert: existing hash reused; no delete of unused checks.

## Auth / tenant rules

- Global: **admin** session. User: any logged-in user, own uid scope only.
- Password confirmation required on POST/PUT/DELETE (same as other confirm-password OCS; unconfirmed → 403).
- CSRF unless `OCS-APIRequest`.
- Tenant = instance; rules do not cross users.
- Matching at runtime uses **admin rules + that user’s rules**. HTTP list does not mix scopes.

## Failure modes

| HTTP (v2) | When |
| --- | --- |
| 401 | anonymous |
| 403 | non-admin global; user scope disabled; `canModify` fail; password not confirmed |
| 400 | validation (`UnexpectedValueException`) |
| 200 `[]` | show unknown class |
| 200 `{}` | index empty |
| 405 | wrong method |
| 5xx OCS | DB exception |

No 404 on show/destroy unknown numeric id: destroy unknown → 403 (`canModify` false) or 400 if `getOperation` during update (`Operation #%s does not exist`) after canModify true… `canModify` false if id not in scope list → **403**, not 404.

## Conceptual Next.js shape

```
src/server/workflowengine/
  types.ts
  scope.ts
  rules.ts            # CRUD + validate + format
  checks.ts           # built-in check ports
  ocs.ts
app/ocs/v2.php/apps/workflowengine/api/v1/workflows/global/route.ts
app/ocs/v2.php/apps/workflowengine/api/v1/workflows/global/[id]/route.ts
app/ocs/v2.php/apps/workflowengine/api/v1/workflows/user/route.ts
app/ocs/v2.php/apps/workflowengine/api/v1/workflows/user/[id]/route.ts
```

Register at least one stub `IOperation` for create parity. Do not clone PHP listener wiring in this slice beyond persisting rules.

## Traps

- **show `{id}` = class FQCN**; PUT/DELETE `{id}` = int
- Index is a **map of arrays**, show is an **array**, create returns **one object**
- Extra DB keys on formatted rules
- User 403 message is `'User not logged in'` even when logged in but user scope disabled
- Global has no `NoAdminRequired` (map `auth: mixed` is wrong for anonymous; 401, and 403 for users)
- Password confirmation on mutations only
- Empty events illegal unless `IComplexOperation`
- Checks must be ≥1
- `formatOperation` `events` json null → `[]`
- Runtime operations never appear in OCS index
- File events are `\OCP\Files::post*` strings, not class names

## Do not

- Implement `/timezones` in this slice (unmapped)
- Implement settings HTML
- Let a user CRUD another user’s or admin’s rules
- Treat show id as numeric
- Ship Flow operators from files_automatedtagging here
- Invent REST besides these 10 ids
- Edit `endpoint-map.yaml` from this skill

## Parity notes

Minimum per id: happy, 401 anonymous, one validation (POST zero checks → 400; or non-admin GET global → 403).

Extras:

| Case | Expect |
| --- | --- |
| GET global as admin empty | 200 `{}` |
| GET global as user | 403 |
| GET user as user | 200 object |
| GET user when `user_scope_disabled` | 403 |
| GET show unknown class | 200 `[]` |
| POST no checks | 400 |
| POST then GET index | class key present; rule `checks` lack `id`/`hash` |
| PUT other scope id | 403 |
| DELETE own | 200 `true` |
| POST without password confirm | 403 |
| v1 vs v2 | same data; 100 vs 200 success |

Do not assert OCC or event firing in HTTP parity.

## Repo links

- Base: `apps/workflowengine/lib/Controller/AWorkflowOCSController.php`
- Global: `apps/workflowengine/lib/Controller/GlobalWorkflowsController.php`
- User: `apps/workflowengine/lib/Controller/UserWorkflowsController.php`
- Manager: `apps/workflowengine/lib/Manager.php`
- Scope: `apps/workflowengine/lib/Helper/ScopeContext.php`
- Types: `apps/workflowengine/lib/ResponseDefinitions.php`
- File entity: `apps/workflowengine/lib/Entity/File.php`
- Checks: `apps/workflowengine/lib/Check/*.php`
- Schema: `apps/workflowengine/lib/Migration/Version2000Date20190808074233.php`
- Contracts: `lib/public/WorkflowEngine/{IManager,IOperation,ICheck,IEntity,IComplexOperation}.php`
- Unmapped timezones: `apps/workflowengine/lib/Controller/RequestTimeController.php`
- Tests: `apps/workflowengine/tests/ManagerTest.php`
- OpenAPI: `apps/workflowengine/openapi.json`
- Map: `docs/feature-map.mdc` → `workflowengine`
