---
name: dav
description: Authenticated WebDAV/CalDAV/CardDAV Sabre tree, well-known caldav/carddav, DAV OCS helpers. Use when implementing or testing remote.php DAV or dav OCS.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# dav

## Purpose

Authenticated Sabre DAV server plus DAV-adjacent HTTP/OCS. Files homes, calendars, address books, chunked uploads, tags, comments, avatars, principals. Well-known CalDAV/CardDAV discovery.

**First sub-slice (Phase C):** `dav.Root#tree` files subtree + `dav.Collection#files` + `dav.LegacyWebDAV#webdav` + `dav.LegacyWebDAV#files` + well-known caldav/carddav. Then `dav.Collection#uploads` + `dav-direct-get-url` + `dav.Direct#get`. CalDAV/CardDAV and remaining collections are later sub-slices under this same `feature_id`.

Public share DAV (`/public.php/dav`, `/public.php/webdav`) is **`files_sharing`**, not this feature.

## Key types / entities

| Entity | Role |
| --- | --- |
| Sabre tree | `OCA\DAV\RootCollection` under `CachingTree`; v2 server `OCA\DAV\Server` |
| File home | `remote.php/dav/files/{uid}/…` — **only the authenticated UID** is a real `FilesHome`; other names are empty collections |
| Upload home | `remote.php/dav/uploads/{uid}/…` — chunk assemble via MOVE of `.file`; v2 uses `Destination` header |
| Direct token | DB `dav_direct` (mapper `Direct`); 60-char alnum; default TTL 8h, max 24h |
| Calendar invitation | `calendar_invitations` token + expiry; public HTML accept/decline |
| Out-of-office | absence for **session user** on write; any logged-in user may **read** `{userId}` |
| Federated calendar | pending share on `principals/users/{uid}`; accept/decline 404 if not owner/pending |
| Principal | `principals/users\|groups\|system\|calendar-resources\|calendar-rooms\|remote-users` |

DAV XML namespaces (parity must infoset-compare, not prefixes): `DAV:`, `urn:ietf:params:xml:ns:caldav`, `urn:ietf:params:xml:ns:carddav`, `http://owncloud.org/ns` (`oc`), `http://nextcloud.org/ns` (`nc`). After first green PROPFIND, extract `bp-dav-xml-normalize`.

## Endpoints owned

48 map ids with first `feature_ids` = `dav`.

### Discovery + HTTP (non-Sabre)

| id | Method | Path |
| --- | --- | --- |
| `core.WellKnown#handle.caldav` | GET | `/.well-known/caldav` |
| `core.WellKnown#handle.carddav` | GET | `/.well-known/carddav` |
| `dav.birthday_calendar#enable.post` | POST | `/apps/dav/enableBirthdayCalendar` |
| `dav.birthday_calendar#disable.post` | POST | `/apps/dav/disableBirthdayCalendar` |
| `dav.invitation_response#accept` | GET | `/apps/dav/invitation/accept/{token}` |
| `dav.invitation_response#decline` | GET | `/apps/dav/invitation/decline/{token}` |
| `dav.invitation_response#options` | GET | `/apps/dav/invitation/moreOptions/{token}` |
| `dav.invitation_response#processMoreOptionsResult.post` | POST | `/apps/dav/invitation/moreOptions/{token}` |

### OCS (v2 canonical; v1 same route, different envelope)

| id | Method | Path |
| --- | --- | --- |
| `dav-direct-get-url` | POST | `/ocs/v2.php/apps/dav/api/v1/direct` |
| `dav-upcoming_events-get-events` | GET | `/ocs/v2.php/apps/dav/api/v1/events/upcoming` |
| `dav-federated_calendar-get-pending` | GET | `/ocs/v2.php/apps/dav/api/v1/federated_calendars/pending` |
| `dav-federated_calendar-accept` | POST | `/ocs/v2.php/apps/dav/api/v1/federated_calendars/pending/{id}` |
| `dav-federated_calendar-decline` | DELETE | same `{id}` |
| `dav-out_of_office-get-current-out-of-office-data` | GET | `/ocs/v2.php/apps/dav/api/v1/outOfOffice/{userId}/now` |
| `dav-out_of_office-get-out-of-office` | GET | `/ocs/v2.php/apps/dav/api/v1/outOfOffice/{userId}` |
| `dav-out_of_office-set-out-of-office` | POST | same |
| `dav-out_of_office-clear-out-of-office` | DELETE | same |
| `dav-calendar_export-export` | POST | `/ocs/v2.php/calendar/export` |
| `dav-calendar_import-import` | POST | `/ocs/v2.php/calendar/import` |
| `dav-contacts_import-import` | POST | `/ocs/v2.php/contacts/import` |

### Sabre ingress

| id | Path | Source |
| --- | --- | --- |
| `dav.Root#tree` | `/remote.php/dav/{path}` | `remote.php` → `apps/dav/appinfo/v2/remote.php` |
| `dav.Direct#get` | `/remote.php/direct/{token}` | `v2/direct.php` — auth `signed` |
| `dav.LegacyWebDAV#webdav` | `/remote.php/webdav/{path}` | `v1/webdav.php` |
| `dav.LegacyWebDAV#files` | `/remote.php/files/{path}` | alias of v1 webdav |
| `dav.LegacyCalDAV#caldav` | `/remote.php/caldav/{path}` | `v1/caldav.php` |
| `dav.LegacyCalDAV#calendar` | `/remote.php/calendar/{path}` | alias |
| `dav.LegacyCardDAV#carddav` | `/remote.php/carddav/{path}` | `v1/carddav.php` |
| `dav.LegacyCardDAV#contacts` | `/remote.php/contacts/{path}` | alias |

Collection rows (`dav.Collection#*`) are **path prefixes on the same v2 tree**, not separate servers: `files`, `calendars`, `public-calendars` (`auth: none` on map), `remote-calendars`, `addressbooks-users`, `addressbooks-system`, `uploads`, `avatars`, `comments`, `systemtags`, `systemtags-relations`, `systemtags-assigned`, `apple-provisioning`, `principals-users`, `principals-groups`, `principals-system`, `principals-calendar-resources`, `principals-calendar-rooms`, `system-calendars-resources`, `system-calendars-rooms`.

Map lists DAV methods `*` and default success 207. Real statuses: OPTIONS/GET file 200, MKCOL/PUT create 201, PROPFIND 207, No Content 204, errors 401/403/404/409/412/423/507.

## Endpoint walkthrough

### Ingress — `remote.php`

`resolveService()` first path segment: `dav`→v2, `webdav`/`files`→v1 webdav, `caldav`/`calendar`→v1 caldav, `carddav`/`contacts`→v1 carddav, `direct`→direct. Else `core` appconfig `remote_{service}`. Upgrade → 503. Empty path → 404. CSP `default-src 'none'`.

### Well-known caldav/carddav

Apache `.htaccess` **301** `/.well-known/caldav|carddav` → `/remote.php/dav/`. `WellKnownController` is **not** the default handler for these two (other `.well-known/*` are). Setup check accepts 207 or redirect ending in `/remote.php/dav`. Implement 301 (or equivalent redirect) to `/remote.php/dav/`. Do not 404 JSON `{message}`.

### v2 tree — `dav.Root#tree`

Auth plugin order (`OCA\DAV\Server`):

1. `OCA\DAV\DAV\PublicAuth` — no credentials if path starts `public-calendars` or `principals/system/public` → principal `principals/system/public`
2. `BearerAuth` — app-password / OAuth access token; 401 **without** `WWW-Authenticate` unless `oauth2.enable_oc_clients` + mirall UA
3. Basic `Auth` — session DAV cookie or `logClientIn`; realm = themed name / `Nextcloud`

Logged-in plugins add `oc`/`nc` props, `OC-ETag`, `X-Request-Id`, `X-User-Id`; after PUT `X-NC-OwnerId`, `X-NC-Permissions`. Debug GET on `/` may return dummy text; production Browser plugin off.

**Files:** `GET/PUT/DELETE/MKCOL/COPY/MOVE/PROPFIND/PROPPATCH/LOCK/UNLOCK` under `files/{uid}`. Quota, checksum, tags, shares props. Listing root children disabled unless `debug`.

**Uploads:** MKCOL upload folder; PUT parts; MOVE `.file` (v1 ChunkingPlugin) or v2 `ChunkingV2Plugin` + `Destination`. Other users' upload homes → Forbidden. Storage `/{uid}/uploads`. v2 session cache TTL 24h sliding.

**Public calendars:** unauthenticated PROPFIND/GET by token name; not public **file** shares.

**Direct:** no Sabre login. `DirectHome::getChild` unknown token → throttle `directlink`. Child is GET-stream only; PUT/DELETE Forbidden. Expiry vs `ITimeFactory`.

### v1 servers

v1 webdav: user filesystem view; Basic + Bearer. v1 caldav/carddav: **Basic only** (no Bearer in those entry files). Legacy ACL plugin.

### OCS direct URL — `dav-direct-get-url`

`DirectController::getUrl(fileId, expirationTime=28800)`. `NoAdminRequired`. Requires `shareApiAllowLinks()`. File must exist in **caller** folder and be a `File`. `expirationTime` in `(0, 86400]`. `BeforeDirectFileDownloadEvent` may forbid. Returns `{url: absolute remote.php/direct/{token}}`. Errors: 403 links disabled / event; 404 missing; 400 expiry or not a file.

### Invitations (public HTML)

`InvitationResponseController`: `PublicPage` + `NoCSRFRequired`. Token row + `expiration ≥ now`. accept/decline → guest templates `schedule-response-success` if iTIP `1.2` else error (+ optional organizer). `options` GET does **not** check DB. POST `partStat` ∈ `ACCEPTED|DECLINED|TENTATIVE`.

### Out of office

Reads: any logged-in user for any `{userId}`; 404 if no user/absence. **Writes ignore path `{userId}`** and mutate the **session user**. POST body `firstDay`,`lastDay` (`YYYY-MM-DD`), `status` (≤100 chars), `message`, optional `replacementUserId`. 400 `{error:statusLength|firstDay}`; 401 if no session; 404 replacement missing. DELETE clears session user’s absence.

### Federated calendars OCS

Pending list for current principal. accept/decline: 404 for missing **or** not-owned/not-pending (no existence leak).

### Upcoming events

Query `location?`. `{events:[{uri,recurrenceId,calendarUri,start,summary,location,calendarAppUrl}]}`. Current user only.

### Birthday calendars

`#[AuthorizedAdminSetting(CalDAVSettings)]`. enable: `generateBirthdayCalendar=yes` + jobs. disable: `no`, drop jobs, delete birthday calendars. 200 `[]`.

### Calendar/contacts import-export

`#[ApiRoute]` under `/calendar` and `/contacts`. Export: stream ical/jcal/xcal; UserRateLimit 1/60s; own calendar or **admin** + `user` query. Import: NDJSON `application/x-ndjson`; rate 10/3600; calendar/addressbook must be writable. Contacts default format `'ical'` as written.

## Auth / tenant rules

| Surface | Auth |
| --- | --- |
| well-known caldav/carddav | none → redirect |
| v2 `/remote.php/dav` | mixed: Basic, Bearer, or public-calendar PublicAuth |
| v1 webdav | mixed Basic + Bearer |
| v1 cal/card | Basic only |
| `/remote.php/direct/{token}` | knowledge of token (`signed`) |
| invitation HTML | public token |
| birthday enable/disable | admin CalDAV setting ACL |
| other DAV OCS | logged-in (`NoAdminRequired`); mixed on map means 401 OCS 997 when anonymous |
| public-calendars collection | unauthenticated token name |
| files/uploads | must match authenticated UID (uploads also allow `principals/shares`) |
| comments root | NotAuthenticated if no user |

OCS JSON: `?format=json` + `OCS-APIRequest: true` (`bp-ocs-envelope`).

Do not leak another user’s file home via `files/{otherUid}` — empty collection, not their storage.

## Failure modes

- Wrong DAV method on a file → 405 / Sabre exception XML, not OCS.
- Unauthenticated files PROPFIND → 401 (Basic challenge on v1; Bearer may omit WWW-Authenticate).
- Direct OCS: folder fileId → 400; links disabled → 403.
- Direct GET unknown/expired token → 404 + throttle.
- Invitation bad/expired token → error template (still 200 HTML), not JSON 404.
- OOO POST with `firstDay > lastDay` → 400 `{error:firstDay}`.
- Federated accept wrong id → OCS 404.
- Import/export missing calendar → 400 `{error:…}`; 401 unauthenticated.
- Maintenance/upgrade on `remote.php` → 503 (XML if Content-Type `text/xml`).
- Map 207 is not universal; assert per-method.

## Do-not list

- Do not implement `/public.php/dav` or `/public.php/webdav` (`files_sharing`: `dav.Public#tree`, `dav.Public#legacy-webdav`).
- Do not implement HTTP comments/systemtags apps (`comments`, `systemtags` features) — only DAV collections here.
- Do not implement core HTTP avatars/previews (`core` avatars slice) — `dav.Collection#avatars` is the DAV collection only.
- Do not implement `ExampleContentController` (default contact/event) — not in the feature map.
- Do not clone Sabre plugin classes; match client-visible XML/headers/status.
- Do not invent CalDAV scheduling beyond what plugins emit.
- Do not start `files` JSON UI in this slice (`files` depends on this).
- Do not treat well-known caldav/carddav as `WellKnownController` 404 JSON.
- Do not enable directory listing of DAV root unless `debug`.
- Filenames/versioning/trash/external mounts: other features; files tree must still **expose** those nodes if mounted.

## Conceptual Next.js shape

```
src/server/dav/
  remote.ts              # service router (dav|webdav|files|caldav|carddav|direct)
  auth.ts                # Basic / Bearer / public-calendar / token
  xml.ts                 # PROPFIND/PROPPATCH infoset + oc/nc ns
  tree/files.ts          # files/{uid}
  tree/uploads.ts        # chunk v1 + v2
  tree/calendars.ts      # later sub-slice
  tree/addressbooks.ts
  tree/principals.ts
  direct.ts              # OCS mint + GET stream
  ocs-ooo.ts
  ocs-federated-cal.ts
app/remote.php/[...path]/route.ts     # method-agnostic
app/.well-known/caldav/route.ts
app/.well-known/carddav/route.ts
app/ocs/v2.php/apps/dav/api/v1/...
```

## Parity notes

First files PROPFIND slice **must** land `bp-dav-xml-normalize` (infoset, ignore prefix/attr order).

| Case | Endpoint | Expect |
| --- | --- | --- |
| Happy PROPFIND | `dav.Collection#files` | 207 multistatus, `oc:fileid` / `d:getetag` present |
| Auth fail | files | no creds → 401 |
| Wrong user home | files/{other} | empty/not their bytes |
| Happy GET | file | 200 bytes + ETag |
| PUT then PROPFIND | files | new etag/size |
| Legacy | `dav.LegacyWebDAV#webdav` | same file as v2 home (path without `{uid}` prefix) |
| Well-known | caldav/carddav | 301/302 to `/remote.php/dav/` |
| Direct mint | `dav-direct-get-url` | 200 `{url}` containing `/remote.php/direct/` |
| Direct GET | `dav.Direct#get` | 200 file; bad token 404 |
| OOO unauth | outOfOffice | OCS 401/997 |
| Invitation bad token | accept | error HTML template |
| Upload chunk | `dav.Collection#uploads` | assemble via MOVE; skip or waive until storage backend exists (`waiver_owner` required) |

Chunked upload may be `parity: waived` only with reason + owner if this slice has no storage. Do not silently skip.

Capabilities `core.webdav-root` stays `remote.php/webdav` (`core-status`).

## Repo links

- `remote.php`
- `apps/dav/appinfo/v2/remote.php`, `v2/direct.php`
- `apps/dav/appinfo/v1/webdav.php`, `caldav.php`, `carddav.php`
- `apps/dav/appinfo/routes.php`
- `apps/dav/lib/Server.php`, `RootCollection.php`
- `apps/dav/lib/Files/RootCollection.php`, `Upload/RootCollection.php`
- `apps/dav/lib/Controller/DirectController.php` (+ Invitation, OutOfOffice, FederatedCalendar, UpcomingEvents, BirthdayCalendar, CalendarExport/Import, ContactsImport)
- `apps/dav/lib/Direct/DirectHome.php`
- `apps/dav/lib/DAV/PublicAuth.php` (public **calendars**, not file shares)
- `apps/dav/lib/Connector/Sabre/BearerAuth.php`
- `.htaccess` well-known caldav/carddav
- `apps/settings/lib/SetupChecks/WellKnownUrls.php`
- Cross: `files_sharing` public.php; `files` JSON API; `bp-ocs-envelope`; future `bp-dav-xml-normalize`
