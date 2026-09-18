---
name: systemtags
description: Last-used collaborative tags HTTP + tag domain DAV implements. Use when implementing systemtags.LastUsed#getLastUsedTagIds or tag assignment model.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# systemtags

## Purpose

HTTP **last-used tag ids** for the current user: `GET /apps/systemtags/lastused`.

Collaborative tags live in `systemtag` / `systemtag_group` / `systemtag_object_mapping` and on DAV:

- `/remote.php/dav/systemtags/`
- `/remote.php/dav/systemtags-relations/`
- `/remote.php/dav/systemtags-assigned/`

Those collection ids (`dav.Collection#systemtags`, `#systemtags-relations`, `#systemtags-assigned`) are owned by **`dav`**. This slice owns the last-used GET and the write path that fills it (`TagAssignedEvent`). DAV slice must not invent a second last-used store.

## Scope

1 map id: `systemtags.LastUsed#getLastUsedTagIds`.

Domain: tag entity, visibility/assignable/groups, last_used user config (max 10).

## Non-scope

- DAV tag CRUD, assign/unassign, `{http://nextcloud.org/ns}system-tags` on files — **`dav`**
- `files.Api#updateFileTags` — **`files`**
- Admin settings HTML `restrict_creation_to_admin` form — settings chrome; the **flag** is appconfig this domain reads
- CLI `occ tag:files:*`
- Search provider (unified search — `core`)
- Public share tag listing extras (`BeforeSabrePubliclyLoadedListener`) beyond what dav implements

## Endpoints owned

| id | method | path | PHP |
| --- | --- | --- | --- |
| `systemtags.LastUsed#getLastUsedTagIds` | GET | `/apps/systemtags/lastused` | `LastUsedController::getLastUsedTagIds` |

No OpenAPI path (`apps/systemtags/openapi.json` `paths: {}`). Map shape `html-or-json` → actual **JSON array of string ids** via `DataResponse`.

## Key types / entities

Table `systemtag`:

| Column | Notes |
| --- | --- |
| `id` | numeric, exposed as **string** |
| `name` | sanitized (`Util::sanitizeWordsAndEmojis`) |
| `visibility` | user-visible |
| `editable` | user-assignable |
| `etag` / `color` | optional; color is `{http://nextcloud.org/ns}color` |

Unique on `(name, visibility, editable)`. Duplicate create → DAV 409 `Tag already exists`.

`systemtag_group`: tag ↔ group ids (restricted tags).

`systemtag_object_mapping`: `(objectid, objecttype, systemtagid)`. Files use `objecttype=files`.

`ISystemTag` access:

| visibility | assignable | level |
| --- | --- | --- |
| false | * | invisible (admins only) |
| true | false | restricted (assign: admin **or** tag groups) |
| true | true | public |

`canUserSeeTag`: public/restricted visible to everyone logged in; invisible → admin only; anonymous sees **public only**.

`canUserCreateTag` / update: all logged-in users unless appconfig `systemtags.restrict_creation_to_admin` is true (then admin only). CLI allowed when user is null.

Capability: `{systemtags: {enabled: true}}`.

**last_used**: user config app `systemtags`, key `last_used`, JSON array. On `TagAssignedEvent`, for the actor: `unshift(tagId)`, unique, **slice 0..10**. Most recent first. Unassign does **not** change last_used.

DAV tree (dav-owned):

| Path | Role |
| --- | --- |
| `/systemtags/` | `SystemTagsByIdCollection` — list visible tags; POST JSON create; child `SystemTagNode` by id |
| `/systemtags/{id}` | props: `{http://owncloud.org/ns}id`, `display-name`, `user-visible`, `user-assignable`, `groups`, `can-assign`; `{http://nextcloud.org/ns}color`, `files-assigned`, `reference-fileid`, `object-ids` |
| `/systemtags-relations/files/{fileId}/{tagId}` | mapping; PUT/createFile assigns; needs file **UPDATE**; cannot see/assign invisible/unassignable |
| `/systemtags-assigned/` | tags in use (`SystemTagsInUseCollection`); child PROPFIND path rewritten to `/systemtags/{id}` |

Create POST JSON: `{name, userVisible?=true, userAssignable?=true, groups?}` (`groups` array or `\|`-joined string). `userVisible=false` or `userAssignable=false` or non-empty groups → **admin only** else 400 `Not sufficient permissions`. `restrict_creation_to_admin` → 403 `You don’t have permissions to create tags`. Content-Type must be application/json.

Assign missing/invisible tag → 412 Precondition Failed. No assign permission or no UPDATE on file → 403.

`{http://nextcloud.org/ns}system-tags` on file nodes is dav `SystemTagPlugin` (preload for directories depth ≤ 1).

## Endpoint walkthrough

### GET `systemtags.LastUsed#getLastUsedTagIds`

`NoAdminRequired` — session user required. Not `PublicPage`. GET → CSRF not required.

1. No user → AppFramework login redirect or 401 (map lists both 401 and 404; anonymous is **not** 200).
2. `IUserConfig::getValueArray(uid, 'systemtags', 'last_used')`.
3. Map every id with `(string)$id`.
4. 200 JSON list (DataResponse). Empty array if never assigned.

Does **not** filter deleted/invisible tags; returns stored ids as-is.

## Auth / tenant rules

| Route | Auth |
| --- | --- |
| lastused | **Session**. Per-user config; no admin bypass to read another user’s list. |
| DAV tags | Session (dav). Invisible tags and restricted create/assign follow admin/groups as above. |

last_used is **not** a tenant-wide recent list; it is the assigning actor’s stack.

## Failure modes

| HTTP | When |
| --- | --- |
| 200 `string[]` | logged-in; possibly empty |
| 401 / login redirect | anonymous |
| 405 | non-GET |
| DAV 400 | missing `name`; non-admin hidden/restricted create; non-numeric tag id |
| DAV 403 | create forbidden by restrict flag; assign not allowed |
| DAV 409 | tag already exists |
| DAV 412 | assign unknown/invisible tag |
| DAV 404 | tag id not visible |

## Conceptual Next.js shape

```
src/server/systemtags/
  tags.ts              # CRUD + visibility (shared with dav)
  last-used.ts         # get + push on assign
app/apps/systemtags/lastused/route.ts
```

DAV collections stay in the dav slice; call `last-used.ts` from assign.

## Traps

- Response ids are **strings**, even if config stored ints.
- Cap **10**, newest first (`unshift`).
- lastused does not prove the tag still exists.
- Map `html-or-json` / 404 on this GET are scanner defaults — PHP is DataResponse 200.
- Creating hidden tags is admin-only even when `restrict_creation_to_admin` is false.
- Unique key is name+visibility+editable, not name alone.
- `files.Api#updateFileTags` is a different endpoint (`files`).
- systemtags-assigned PROPFIND hrefs rewrite to `/systemtags/`.

## Do-not

- Do not implement the three DAV collections in this slice.
- Do not implement `files.Api#updateFileTags`.
- Do not return last-used for another user.
- Do not grow last_used beyond 10 or put unassign on the stack.
- Do not skip visibility checks when the dav slice assigns tags.
- Do not invent a REST tag CRUD next to DAV.

## Parity notes

Extra:

| Case | Expectation |
| --- | --- |
| GET lastused anonymous | 401 or login redirect, not 200 |
| GET lastused never used | 200 `[]` |
| Assign tag then GET lastused | 200 list, that id first, length ≤ 10 |
| Assign same tag twice | still unique; stays first |
| Assign 11th distinct tag | length 10; oldest dropped |
| GET lastused ids type | every element string |
| POST lastused | 405 |

Do not require DAV in this slice’s parity file unless also running the dav slice. last_used can be seeded via user-config in the harness.

## Repo paths

- Route: `apps/systemtags/appinfo/routes.php`
- HTTP: `apps/systemtags/lib/Controller/LastUsedController.php`
- last_used writer: `apps/systemtags/lib/Activity/TagListener.php` (`updateLastUsedTags`)
- Capability: `apps/systemtags/lib/Capabilities.php`
- Admin flag UI: `apps/systemtags/lib/Settings/Admin.php`
- Core manager: `lib/private/SystemTag/SystemTagManager.php`, `SystemTag.php`, `SystemTagObjectMapper.php`
- DAV: `apps/dav/lib/SystemTag/SystemTagPlugin.php`, `SystemTagsByIdCollection.php`, `SystemTagsRelationsCollection.php`, `SystemTagsObjectMappingCollection.php`, `SystemTagsInUseCollection.php`, `SystemTagNode.php`
- Tree: `apps/dav/lib/RootCollection.php`
- Tests: `apps/dav/tests/unit/SystemTag/`
