---
name: files_reminders
description: Per-user file due-date reminders OCS. Use when implementing or testing files_reminders get/set/remove.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# files_reminders

## Purpose

One due-date reminder per (user, file). Clients GET/PUT/DELETE OCS. Due dates also appear as a DAV property on files (`dav` slice). Notifications fire from a background job — not a mapped HTTP endpoint.

Depends on `files` (node must exist in the user’s folder). Setup check: `notifications` app should be enabled (warning only, API still runs).

## Scope

- OCS `/ocs/v{1,2}.php/apps/files_reminders/api/v1/{fileId}` GET, PUT, DELETE
- Reminder row + due-date formatting
- Node/user delete cleanup (side effect)

## Non-scope

- DAV `{http://nextcloud.org/ns}reminder-due-date` on `/remote.php/dav/files/…` — `dav` owns PROPFIND; this feature owns the lookup
- Notification app HTTP APIs
- Files UI chrome
- Inventing recurring reminders or multiple dues per file

## Endpoints owned

`version` path segment **must be `1`**.

| id | Method | Path |
| --- | --- | --- |
| `files_reminders-api-get` | GET | `/ocs/v2.php/apps/files_reminders/api/v{version}/{fileId}` |
| `files_reminders-api-set` | PUT | same |
| `files_reminders-api-remove` | DELETE | same |

`ocs_version: both` — also `/ocs/v1.php/…`. Header `OCS-APIRequest: true`, `?format=json`.

## Key types / entities

Table `files_reminders`:

| Column | Type |
| --- | --- |
| `id` | bigint PK |
| `user_id` | string 64 |
| `file_id` | bigint |
| `due_date` | datetime (UTC) |
| `updated_at` | datetime |
| `created_at` | datetime |
| `notified` | bool default false |

Unique index `(user_id, file_id, due_date)`. Service upserts the **current un-notified** row per user+file (`findDueForUser` filters `notified = false`).

`GET` payload: `{ dueDate: string | null }` — ISO 8601 `DateTimeInterface::ATOM` when set.

Put body: `{ dueDate: string }` ISO 8601. Parsed then forced to UTC. Must be **strictly after now (UTC)**.

Node check: `userFolder.getFirstNodeById(fileId)` — missing node is `NodeNotFoundException`.

Past-due un-notified rows: `getDueForUser` returns **null** (not shown). Overdue job (`ScheduledNotifications`, 60s) sends notification `app=files_reminders`, subject `reminder-due`, object `reminder/{id}`, then `notified=true`. Cleanup job deletes notified rows older than 1 day.

File delete → `removeAllForNode`. User delete → `removeAllForUser`.

## Endpoint walkthrough

### GET `files_reminders-api-get`

1. No user → **401** `[]`
2. Node missing → **200** `{ dueDate: null }` (not 404)
3. No row / notified / due in the past → **200** `{ dueDate: null }`
4. Future due → **200** `{ dueDate: '<ATOM>' }`

### PUT `files_reminders-api-set`

Parse `dueDate` **before** auth. Invalid parse or `dueDate <= now(UTC)` → **400** `[]` (even if later 401 would apply).

Then no user → **401**. Node missing → **404**. Insert → **201** `[]`. Update existing future reminder → **200** `[]`.

### DELETE `files_reminders-api-remove`

No user → **401**. Node missing **or** no current reminder → **404** `[]`. Else delete → **200** `[]`.

Empty OCS `data` on 201/200 mutate and on errors.

## Auth / tenant rules

`#[NoAdminRequired]`, not `PublicPage`. Login required (session / Basic / Bearer).

Map `auth: mixed` is scanner default — **unauthenticated is 401**, no public body.

- Reminders are **per user**. Same `fileId` for user B is a different row
- Node must be visible in **that** user’s files folder (shares count if the node is in their tree)
- PUT/DELETE: CSRF unless `OCS-APIRequest` (same as other OCS). GET: no CSRF
- No admin bypass: admins still scoped to their own uid

## Failure modes

| Condition | GET | PUT | DELETE |
| --- | --- | --- | --- |
| Anonymous | 401 | 401 (if date valid) | 401 |
| Bad / past `dueDate` | — | 400 | — |
| File not in user folder | 200 `{ dueDate: null }` | 404 | 404 |
| No reminder | 200 `{ dueDate: null }` | — | 404 |
| Past-due existing row | 200 `{ dueDate: null }` | create 201 (new row) | 404 (`getDueForUser` null) |
| `version` ≠ 1 | 404 route miss | same | same |
| Wrong method | 405 | 405 | 405 |

Do not copy GET’s null-on-missing-file onto PUT/DELETE.

## Conceptual Next.js shape

```
src/server/files-reminders/
  types.ts
  store.ts              # get / upsert / remove, tenant = uid
  ocs.ts
app/ocs/v2.php/apps/files_reminders/api/v1/[fileId]/route.ts
```

v1 OCS path can share the handler + envelope helper (`bp-ocs-envelope`).

Cron: optional later; parity HTTP does not require sending notifications. If GET hides past dues, the store must treat `due_date < now` as absent.

## Traps

- GET missing file is **200 null**, not 404
- PUT invalid date is 400 **before** 401
- ATOM timestamps; compare parsed instants, not raw strings
- `dueDate <= now` uses `<=` (equal now is 400)
- Unique DB key includes `due_date`; API still behaves as one active reminder per user+file
- DAV property returns `''` when unset/anonymous — not this slice’s HTTP
- OCS v1 vs v2 envelopes

## Do not

- Implement DAV `reminder-due-date` here (`dav`)
- Return 404 on GET for unknown file
- Allow past due dates
- Leak user A’s reminder to user B
- Require the notifications app for HTTP 200 (setup check is warning only)
- Add list-all HTTP (CLI `files_reminders:list` only)
- Edit `endpoint-map.yaml` from this skill

## Parity notes

Minimum per id: happy, 401 anonymous, one validation.

Extras:

| Case | Expect |
| --- | --- |
| GET no reminder | 200 `{ dueDate: null }` |
| GET unknown fileId | 200 `{ dueDate: null }` |
| PUT create | 201 empty data |
| PUT same file again | 200 (update) |
| PUT past date | 400 |
| PUT garbage date | 400 |
| PUT unknown file | 404 |
| DELETE missing reminder | 404 |
| DELETE then GET | 200 null |
| v1 vs v2 | same data; statuscode 100 vs 200 |

Normalize `dueDate` with a time delta. No PII in fixtures.

## Repo links

- Routes: `apps/files_reminders/appinfo/routes.php`
- Controller: `apps/files_reminders/lib/Controller/ApiController.php`
- Service: `apps/files_reminders/lib/Service/ReminderService.php`
- Entity/mapper: `apps/files_reminders/lib/Db/{Reminder,ReminderMapper}.php` — table `files_reminders`
- Migration: `apps/files_reminders/lib/Migration/Version10000Date20230725162149.php`
- OpenAPI: `apps/files_reminders/openapi.json`
- DAV prop (adjacent): `apps/files_reminders/lib/Dav/PropFindPlugin.php`
- Jobs: `apps/files_reminders/lib/BackgroundJob/{ScheduledNotifications,CleanUpReminders}.php`
- Notifier: `apps/files_reminders/lib/Notification/Notifier.php`
- Listeners: `apps/files_reminders/lib/Listener/{NodeDeletedListener,UserDeletedListener}.php`
- Setup: `apps/files_reminders/lib/SetupChecks/NeedNotificationsApp.php`
- App: `apps/files_reminders/appinfo/info.xml`
- Map: `docs/feature-map.mdc` → `files_reminders`
