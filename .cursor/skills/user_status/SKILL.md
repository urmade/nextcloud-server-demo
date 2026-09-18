---
name: user_status
description: User status CRUD, public status list, predefined messages. Use when implementing or testing /apps/user_status/api/v1/* except heartbeat.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# user_status

## Purpose

Per-user presence + status message. Callers read/write **own** private status, list/read **public** statuses, and fetch predefined messages.

Depends on `core-login`. **Heartbeat is not this feature** — map id `user_status-heartbeat-heartbeat` is owned by `core-login`.

## Scope

- OCS predefined statuses
- OCS public statuses list + by user
- OCS own status GET; set type; predefined/custom message; clear message; revert

## Non-scope

- `PUT /ocs/v2.php/apps/user_status/api/v1/heartbeat` — `core-login`
- Dashboard widget HTTP — `dashboard` (widget class lives here: `UserStatusWidget`, id `user_status`)
- CalDAV out-of-office / availability / call automated statuses — `dav` listeners call `StatusService::setUserStatus`
- HTML initial-state injection
- Contacts-menu provider
- Inventing extra status types or message ids

## Endpoints owned

Map ids where `feature_ids` contains `user_status` (9). Heartbeat excluded. v2 path canonical; `ocs_version: both`.

| id | Method | Path |
| --- | --- | --- |
| `user_status-predefined_status-find-all` | GET | `/ocs/v2.php/apps/user_status/api/v1/predefined_statuses` |
| `user_status-statuses-find-all` | GET | `/ocs/v2.php/apps/user_status/api/v1/statuses` |
| `user_status-statuses-find` | GET | `/ocs/v2.php/apps/user_status/api/v1/statuses/{userId}` |
| `user_status-user_status-get-status` | GET | `/ocs/v2.php/apps/user_status/api/v1/user_status` |
| `user_status-user_status-set-status` | PUT | `/ocs/v2.php/apps/user_status/api/v1/user_status/status` |
| `user_status-user_status-set-predefined-message` | PUT | `/ocs/v2.php/apps/user_status/api/v1/user_status/message/predefined` |
| `user_status-user_status-set-custom-message` | PUT | `/ocs/v2.php/apps/user_status/api/v1/user_status/message/custom` |
| `user_status-user_status-clear-message` | DELETE | `/ocs/v2.php/apps/user_status/api/v1/user_status/message` |
| `user_status-user_status-revert-status` | DELETE | `/ocs/v2.php/apps/user_status/api/v1/user_status/revert/{messageId}` |

Header `OCS-APIRequest: true`, `?format=json`. Envelope: `bp-ocs-envelope`. All `#[NoAdminRequired]`, no `PublicPage` → **401** anonymous.

OpenAPI path for predefined omits trailing slash; PHP route is `/api/v1/predefined_statuses/`. Treat as the same resource.

## Key types / entities

Table `user_status`:

| Column | Type |
| --- | --- |
| `id` | bigint PK |
| `user_id` | string 255 unique (backup rows use `_` + uid) |
| `status` | string |
| `status_timestamp` | unsigned int |
| `is_user_defined` | bool |
| `message_id` | string null |
| `custom_icon` | string null |
| `custom_message` | text null |
| `clear_at` | unsigned int null |
| `is_backup` | bool |
| `status_message_timestamp` | unsigned int default 0 |

List queries exclude `is_backup = true`.

`UserStatusType`: `online` \| `away` \| `dnd` \| `busy` \| `offline` \| `invisible`.

Priority (high → low): online, away, dnd, busy, invisible, offline.

**Persistent** (heartbeat/live events must not override if user-defined): away, busy, dnd, invisible.

`INVALIDATE_STATUS_THRESHOLD` = 15 min. `REFRESH_STATUS_THRESHOLD` = 7 min. `MAXIMUM_MESSAGE_LENGTH` = 80 (mb_strlen).

`UserStatusPublic`: `{ userId, message, icon, clearAt, status }`. Public formatter maps `invisible` → **`offline`**.

`UserStatusPrivate` = public + `{ messageId, messageIsPredefined, statusIsUserDefined }`. Private keeps `invisible`. `messageIsPredefined` = `messageId !== null`. `message`/`icon` for predefined ids are filled from translations on read (`processStatus`).

`UserStatusPredefined`: `{ id, icon, message, clearAt }` where `clearAt` is `{ type: "period"|"end-of", time: int|"day"|"week" } | null`.

Visible predefined (GET list filters `visible !== false`):

| id | icon | default clearAt |
| --- | --- | --- |
| `meeting` | 📅 | period 3600 |
| `commuting` | 🚌 | period 1800 |
| `be-right-back` | ⏳ | period 900 |
| `remote-work` | 🏡 | end-of day |
| `sick-leave` | 🤒 | end-of day |
| `vacationing` | 🌴 | null |

Hidden (not in GET list; valid for set/revert/automation): `call`, `out-of-office`.

`isValidId` also accepts: `availability`, `vacationing`, `meeting`, `busy-tentative`, `call`, `out-of-office`, plus the visible set.

Backup: `createBackupStatus` sets `is_backup` and prefixes `user_id` with `_`. Unique constraint: a second backup fails; automated `setUserStatus` then aborts.

Enumeration (`findAll` / `findAllAfterId`): return **`[]`** when `core` `shareapi_allow_share_dialog_user_enumeration` is not `yes`, **or** restrict-to-group is `yes`, **or** restrict-to-phone is `yes`. `find(userId)` does **not** use that empty-list short-circuit.

`UserEnumerationFilterEvent` may drop uids from findAll after fetch. `hasMoreResults` uses the **unfiltered** page size (`count >= limit`).

Capability (authenticated app provider, not this slice’s HTTP): `{ user_status: { enabled: true, restore: true, supports_emoji: <platform>, supports_busy: true } }`.

## Endpoint walkthrough

### GET `user_status-predefined_status-find-all`

Return visible predefined only (`visible` missing or true). **200**.

### GET `user_status-statuses-find-all`

Query: `limit`, `offset`, `lastId`. If `lastId` set → keyset `id > lastId` order by id; **ignore offset**. Else offset pagination. Process each row (`processStatus`: expire stale online/non-user-defined after 15 min; expire message if `clearAt < now`; hydrate predefined text/icon). Filter enumeration event. Headers: `Link: <url>; rel="next"` when more.

Public format (invisible→offline). **200** list.

### GET `user_status-statuses-find`

`findByUserId` (non-backup). Missing → **404** `"No status for the requested userId"`. Else public format. **200**.

Does not 404 merely because enumeration is disabled.

### GET `user_status-user_status-get-status`

`calendarStatusService.processCalendarStatus(userId)` then `findByUserId`. Missing → **404** `"No status for the current user"`. Private format. **200**.

### PUT `user_status-user_status-set-status`

Body `{ statusType }`. Must be in `PRIORITY_ORDERED_STATUSES`. Else **400**. `setStatus(..., isUserDefined=true)`, `removeBackupUserStatus`. Private format. **200**.

### PUT `user_status-user_status-set-predefined-message`

Body `{ messageId, clearAt? }`. Invalid id or `clearAt < now` → **400**. Creates offline row if none. Clears custom icon/message. `removeBackupUserStatus`. **200** private.

### PUT `user_status-user_status-set-custom-message`

Body `{ statusIcon?, message?, clearAt? }`.

If **all** of: icon null/`''`, message null/`''`, clearAt null/`0` → `clearMessage` then find (404 if no row).

Else `setCustomMessage`: icon must be a **single emoji** when non-null (`IEmojiHelper::isValidSingleEmoji`); message `mb_strlen <= 80`; `clearAt < now` → 400. Sets `messageId` null. **200** private.

### DELETE `user_status-user_status-clear-message`

`clearMessage` (no-op if missing). Always **200** `[]`. Does not 404.

### DELETE `user_status-user_status-revert-status`

`revertUserStatus(uid, messageId, revertedManually=true)`:

- No backup → **200** `[]`
- Current row `message_id` ≠ path `messageId` → **200** `[]` (no restore)
- Else delete current, un-prefix backup uid, `is_backup=false`; if backup status was `offline`, set `online`; bump timestamp → **200** private backup

## Auth / tenant rules

Unauthenticated **401** on all nine. No admin read of another user’s **private** document via GET `/user_status` (that route is always the caller). Public GET `/statuses/{userId}` is any uid the caller can see as a logged-in user; still 401 if anonymous.

Writes only mutate **caller** uid. Backup rows must never appear in public lists.

CSRF on PUT/DELETE unless `OCS-APIRequest`. GET: no CSRF.

`clearAt` is unix seconds.

## Failure modes

| Condition | Result |
| --- | --- |
| Anonymous | 401 |
| No row, GET own | 404 |
| No row, GET public | 404 |
| No row, clear message | 200 `[]` |
| No row, custom-message **clear** branch | 404 |
| Invalid `statusType` | 400 |
| Invalid `messageId` | 400 |
| `clearAt` in the past | 400 (`< now`; **equal now is allowed**) |
| Icon not single emoji | 400 |
| Message > 80 chars | 400 |
| Enumeration disabled | findAll **[]** (not 403); find-by-id still 200/404 |
| Revert mismatch / no backup | 200 `[]` |
| `invisible` public | status field `offline` |
| `invisible` private | status field `invisible` |
| Wrong method | 405 |

Live/heartbeat expiry: non-user-defined or `online` older than 15 min → stored as offline on read (`processStatus`). Persistent user-defined statuses stay.

## Conceptual Next.js shape

```
src/server/user-status/
  types.ts
  store.ts              # table user_status + backup prefix
  predefined.ts
  process.ts            # expiry + hydrate
  ocs.ts
app/ocs/v2.php/apps/user_status/api/v1/predefined_statuses/route.ts
app/ocs/v2.php/apps/user_status/api/v1/statuses/route.ts
app/ocs/v2.php/apps/user_status/api/v1/statuses/[userId]/route.ts
app/ocs/v2.php/apps/user_status/api/v1/user_status/route.ts
app/ocs/v2.php/apps/user_status/api/v1/user_status/status/route.ts
app/ocs/v2.php/apps/user_status/api/v1/user_status/message/route.ts
app/ocs/v2.php/apps/user_status/api/v1/user_status/message/predefined/route.ts
app/ocs/v2.php/apps/user_status/api/v1/user_status/message/custom/route.ts
app/ocs/v2.php/apps/user_status/api/v1/user_status/revert/[messageId]/route.ts
```

Do not implement heartbeat here. Calendar side effects: GET own may show dav-written message ids; do not call CalDAV from this slice unless a port already exists.

## Traps

- Heartbeat map id is **core-login**
- Public `invisible` → `offline`; never leak invisible on `/statuses`
- findAll empty when enumeration restricted — including in-group-only (PHP returns [] rather than filtering by group)
- `lastId` pagination ignores `offset`
- Link header uses unfiltered `hasMore`
- Custom-message “empty” includes `clearAt === 0`
- `messageIsPredefined` is `messageId != null`, even for hidden ids
- Backup uid `_alice` is not a real user; never list it
- `clearAt` comparison is `< now`, not `<=`
- GET predefined hides `call` / `out-of-office`; PUT predefined still accepts them if `isValidId`
- OCS v1 vs v2 envelopes
- Predefined `clearAt` in the **catalog** is a period/end-of object; on a **status row** `clearAt` is unix int

## Do not

- Implement heartbeat in this slice
- Return private fields on `/statuses`
- Allow user A to PUT user B’s status
- Create HTTP for dav automated statuses
- Treat dashboard `statuses` pref as this table
- Edit `endpoint-map.yaml` from this skill

## Parity notes

Minimum per id: happy, 401 anonymous, one validation.

Extras:

| Case | Expect |
| --- | --- |
| GET predefined | 200; ids exclude `call`, `out-of-office` |
| GET statuses enum off | 200 `[]` |
| GET statuses/{id} missing | 404 |
| GET own missing | 404 |
| PUT status `dnd` | 200 private `status=dnd`, `statusIsUserDefined=true` |
| PUT status `nope` | 400 |
| PUT predefined past clearAt | 400 |
| PUT custom too long | 400 |
| PUT custom empty fields | clear path; 200 or 404 |
| DELETE message | 200 `[]`; GET own message null |
| PUT status `invisible` then GET public | public `offline` |
| DELETE revert no backup | 200 `[]` |
| v1 vs v2 | same data; statuscode 100 vs 200 |

Normalize `clearAt`/timestamps with a delta. Do not assert translated predefined `message` strings across locales — assert `id` + `icon`. No PII in fixtures.

## Repo links

- Controllers: `apps/user_status/lib/Controller/{UserStatusController,StatusesController,PredefinedStatusController}.php` (HeartbeatController = core-login)
- Service: `apps/user_status/lib/Service/{StatusService,PredefinedStatusService}.php`
- Types: `apps/user_status/lib/ResponseDefinitions.php`
- Entity/mapper: `apps/user_status/lib/Db/{UserStatus,UserStatusMapper}.php` — table `user_status`
- Migrations: `apps/user_status/lib/Migration/Version0001Date20200602134824.php` (+ `is_backup`, `status_message_timestamp`)
- Constants: `lib/public/UserStatus/IUserStatus.php`
- Capabilities: `apps/user_status/lib/Capabilities.php`
- Live status (heartbeat consumer): `apps/user_status/lib/Listener/UserLiveStatusListener.php`
- Job: `apps/user_status/lib/BackgroundJob/ClearOldStatusesBackgroundJob.php`
- Pagination: `lib/private/AppFramework/Http/PaginationTrait.php`
- Widget (adjacent): `apps/user_status/lib/Dashboard/UserStatusWidget.php`
- OpenAPI: `apps/user_status/openapi.json`
- App: `apps/user_status/lib/AppInfo/Application.php`
- Map: `docs/feature-map.mdc` → `user_status`
