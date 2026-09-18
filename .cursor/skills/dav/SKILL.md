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

**Phase C sub-slices:** (1) **well-known caldav/carddav** — landed (`dav-well-known`); (2) **files PROPFIND cluster** — landed (`dav-files-propfind`, 109 tested); (3) **`dav.Collection#uploads`** — landed (`dav-uploads`, 110 tested); (4) `dav-direct-get-url` + `dav.Direct#get` (next cluster). CalDAV/CardDAV collections and remaining tree prefixes are later sub-slices under this same `feature_id`.

Public share DAV (`/public.php/dav`, `/public.php/webdav`) is **`files_sharing`** feature rows `dav.Public#tree` / `dav.Public#legacy-webdav` — implemented in `src/server/dav/public-handler.ts` (parity slice `files-sharing-public-dav`). Reuse `xml.ts`, `bp-dav-xml-normalize`; token/session rules live in `files_sharing` skill.

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

### Well-known caldav/carddav (`parity: tested`)

Apache `.htaccess` **301** `/.well-known/caldav|carddav` → `/remote.php/dav/` (`auth: none`). `WellKnownController` is **not** the product handler — it only runs when the rewrite is missing and returns 404 JSON `{message}` + `X-NEXTCLOUD-WELL-KNOWN: 1`. Next.js: `handleWellKnown` in `src/server/well-known/handlers.ts` via `app/well-known/[service]/route.ts`; **301** to `/remote.php/dav/`; **no** `X-NEXTCLOUD-WELL-KNOWN` on happy path. Map `success.status` is **301** (Phase-0 `200` was wrong). Setup check (`WellKnownUrls`) accepts PROPFIND 207 or redirect hop ending with `/remote.php/dav` after rtrim slash. Parity: status + normalized `Location` only — do not follow into Sabre in this slice.

### v2 tree — `dav.Root#tree`

Auth plugin order (`OCA\DAV\Server`):

1. `OCA\DAV\DAV\PublicAuth` — no credentials if path starts `public-calendars` or `principals/system/public` → principal `principals/system/public`
2. `BearerAuth` — app-password / OAuth access token; 401 **without** `WWW-Authenticate` unless `oauth2.enable_oc_clients` + mirall UA
3. Basic `Auth` — session DAV cookie or `logClientIn`; realm = themed name / `Nextcloud`

Logged-in plugins add `oc`/`nc` props, `OC-ETag`, `X-Request-Id`, `X-User-Id`; after PUT `X-NC-OwnerId`, `X-NC-Permissions`. Debug GET on `/` may return dummy text; production Browser plugin off.

**Files:** `GET/PUT/DELETE/MKCOL/COPY/MOVE/PROPFIND/PROPPATCH/LOCK/UNLOCK` under `files/{uid}`. Quota, checksum, tags, shares props. Listing root children disabled unless `debug`.

**Uploads:** MKCOL upload folder; PUT parts; MOVE `.file` (v1 ChunkingPlugin) or v2 `ChunkingV2Plugin` + `Destination`. Other users' upload homes → **403 Forbidden** (`Not allowed`), not empty like `files/{other}`. Storage `/{uid}/uploads`. v2 session cache TTL 24h sliding. See `bp-dav-upload-chunk-assemble`.

#### Upload walkthrough — `dav.Collection#uploads` (`parity: tested`)

Next.js: `src/server/dav/uploads.ts` + upload branches in `handler.ts` (middleware routes MKCOL/PUT/MOVE on v2 tree).

| Step | Method | Path | Notes |
| --- | --- | --- | --- |
| Create staging folder | MKCOL | `/remote.php/dav/uploads/{uid}/{folder}` | **201** empty body; `{uid}` must match session |
| Upload part | PUT | `…/{folder}/{part}` | **201**; parts sorted naturally at assemble |
| Assemble | MOVE | `…/{folder}/.file` | **Destination** absolute URL → `files/{uid}/target`; **201** new / **204** replace |
| Inspect result | PROPFIND | `files/{uid}/target` | depth 0 → **207** multistatus (`bp-dav-xml-normalize`) |

Parity extras (`next/parity/tests/dav-uploads.parity.test.ts`): unauthenticated MKCOL → **401**; MKCOL `uploads/otheruser/…` → **403**; MOVE `.file` without Destination → **400**.

**Public calendars:** unauthenticated PROPFIND/GET by token name; not public **file** shares.

#### Direct walkthrough — `dav-direct-get-url` + `dav.Direct#get` (`parity: tested`)

Next.js: `src/server/dav/direct.ts` + `src/server/dav/direct-store.ts`; OCS route `app/ocs/v2.php/apps/dav/api/v1/direct/route.ts`; GET route `app/remote.php/direct/[token]/route.ts`.

| Step | Method | Path | Notes |
| --- | --- | --- | --- |
| Mint | POST | `/ocs/v2.php/apps/dav/api/v1/direct?format=json` | Logged-in (`bp-ocs-envelope`). Body `{fileId, expirationTime?}` default TTL **28800** (8h), max **86400**. Returns `{url}` with `/remote.php/direct/{60-alnum}`. |
| Download | GET | `/remote.php/direct/{token}` | **200** file bytes. `Content-Type` = MIME. `Content-Length`, `ETag`, `Last-Modified`. **No** session/Basic/Bearer. HEAD same headers, empty body. |
| Block write | PUT | same token path | **403** Sabre XML Forbidden |

Parity extras (`next/parity/tests/dav-direct.parity.test.ts`): anonymous mint → **401/997**; folder `fileId` → **400**; unknown/expired token GET → **404**; closed pair mint→GET uses `bp-binary-parity` (status + MIME + size class + contract headers, not raw bytes).

**Direct:** no Sabre login. `DirectHome::getChild` unknown token → throttle `directlink`. Child is GET-stream only; PUT/DELETE Forbidden. Expiry vs `ITimeFactory`.

### v1 servers

v1 webdav: user filesystem view; Basic + Bearer. v1 caldav/carddav: **Basic only** (no Bearer in those entry files). Legacy ACL plugin.

### OCS direct URL — `dav-direct-get-url`

`DirectController::getUrl(fileId, expirationTime=28800)`. `NoAdminRequired`. Requires `shareApiAllowLinks()`. File must exist in **caller** folder and be a `File`. `expirationTime` in `(0, 86400]`. `BeforeDirectFileDownloadEvent` may forbid. Returns `{url: absolute remote.php/direct/{token}}`. Errors: 403 links disabled / event; 404 missing; 400 expiry or not a file.

### Invitations (public HTML) — `dav-invitation-html` (`parity: tested`)

Next.js: `src/server/dav/invitation-html.ts` + `invitation-html-store.ts`; routes `app/apps/dav/invitation/accept|decline|moreOptions/[token]/route.ts`.

`InvitationResponseController`: `#[PublicPage]` + `#[NoCSRFRequired]` + `#[OpenAPI(IGNORE)]`. Map `auth: session` and documented **401/404 are lies** — no login, no JSON 404. Always **200 HTML** guest templates.

| Step | Method | Path | Notes |
| --- | --- | --- | --- |
| Accept | GET | `/apps/dav/invitation/accept/{token}` | Token in `calendar_invitations`, `expiration ≥ now`. iTIP status `1.2` → `schedule-response-success`; else `schedule-response-error` (+ optional `organizer` link). Bad/expired token → error template **200**. |
| Decline | GET | `/apps/dav/invitation/decline/{token}` | Same as accept with `DECLINED`. |
| Options | GET | `/apps/dav/invitation/moreOptions/{token}` | **No DB lookup** — always **200** `schedule-response-options` even for junk tokens. |
| More options | POST | same | Body/query `partStat` ∈ `ACCEPTED\|DECLINED\|TENTATIVE`. No CSRF. Bad token or bad `partStat` → error template **200**. |

Parity extras (`next/parity/tests/dav-invitation-html.parity.test.ts`): anon GET accept 200 HTML; junk token 200 error template (not 404); options junk token 200; POST no CSRF still 200. Assert `data-template` markers, not pixels.

### Out of office — `dav-out-of-office` (`parity: tested`)

Next.js: `src/server/dav/out-of-office.ts` + `out-of-office-store.ts`; OCS routes `app/ocs/v2.php/apps/dav/api/v1/outOfOffice/[userId]/…`.

| Step | Method | Path | Notes |
| --- | --- | --- | --- |
| Current | GET | `…/outOfOffice/{userId}/now` | **200** `{id:string,startDate,endDate,shortMessage,…}` when user exists and absence is in effect; **404** `null` if user missing or not current |
| Configured | GET | `…/outOfOffice/{userId}` | **200** `{id:int,firstDay,lastDay,status,message,replacementUser*}`; **404** `null` if no absence (no user-exists check) |
| Set | POST | `…/outOfOffice/{userId}` | Body `{firstDay,lastDay,status,message,replacementUserId?}`; **writes session user** (path `{userId}` ignored); **400** `{error:statusLength\|firstDay}`; **404** unknown replacement |
| Clear | DELETE | `…/outOfOffice/{userId}` | **200** `null`; clears **session** absence even when path is another uid |

Reads: any logged-in user for any `{userId}`. **Writes ignore path `{userId}`** and mutate the **session user**. Anon → OCS **401/997** (`auth: mixed`). `getCurrent` checks user exists; `get` does not.

Parity extras (`next/parity/tests/dav-out-of-office.parity.test.ts`): unauth 401/997; GET other user 200/404; POST other-uid path still writes self; `firstDay > lastDay` → 400 `{error:firstDay}`.

### Upcoming events — `dav-upcoming_events-get-events` (`parity: tested`)

Next.js: `src/server/dav/cal-ocs.ts` + `cal-ocs-store.ts`; route `app/ocs/v2.php/apps/dav/api/v1/events/upcoming/route.ts`.

| Step | Method | Path | Notes |
| --- | --- | --- | --- |
| List | GET | `/ocs/v2.php/apps/dav/api/v1/events/upcoming?format=json` | Query `location?` optional filter. **200** `{events:[{uri,recurrenceId,calendarUri,start,summary,location,calendarAppUrl}]}`. Empty `events: []` valid. **401/997** anon. Current session user only. |

`jsonSerialize` includes `recurrenceId` and `calendarAppUrl` even though Psalm `DAVUpcomingEvent` omits them — parity must emit both keys on every event object.

Parity extras (`next/parity/tests/dav-cal-ocs.parity.test.ts`): unauth 401/997; upcoming empty 200.

### Federated calendars OCS — `dav-federated_calendar-*` (`parity: tested`)

Next.js: `src/server/dav/cal-ocs.ts` + `cal-ocs-store.ts`; routes under `app/ocs/v2.php/apps/dav/api/v1/federated_calendars/pending/…`.

| Step | Method | Path | Notes |
| --- | --- | --- | --- |
| Pending list | GET | `…/federated_calendars/pending?format=json` | **200** `[{id,displayName,color,sharedBy,sharedByDisplayName,remoteUrl,permissions,components}]`. Principal `principals/users/{uid}`, state pending. **401/997** anon. |
| Accept | POST | `…/pending/{id}` | **200** `data: null`. Missing **or** not-owned **or** not-pending → **404** `data: null` (no existence leak). Anon accept → **404** not 401. |
| Decline | DELETE | same `{id}` | Same 404 rules as accept. Success **200** `data: null`. |

Parity extras (`next/parity/tests/dav-cal-ocs.parity.test.ts`): unknown accept 404; unknown decline 404.

### Birthday calendars

`#[AuthorizedAdminSetting(CalDAVSettings)]`. enable: `generateBirthdayCalendar=yes` + jobs. disable: `no`, drop jobs, delete birthday calendars. 200 `[]`.

Parity (`next/parity/tests/dav-birthday.parity.test.ts`): unauth JSON **401** `{message}`; HTML **303** login; non-admin **403**; no CSRF **412**; enable/disable admin **200** `[]`. Reset via `resetParityBirthdayStores()` → `/api/parity/reset-dav-birthday-store`.

### Principals — `dav-principals` (`parity: tested`)

Next.js: `src/server/dav/principals.ts` + `principals-store.ts`; PROPFIND branches in `handler.ts` on v2 tree.

| Step | Method | Path | Notes |
| --- | --- | --- | --- |
| Own user principal | PROPFIND | `/remote.php/dav/principals/users/{uid}/` | depth 0 → **207** multistatus (`bp-dav-xml-normalize`) |
| Group principal | PROPFIND | `/remote.php/dav/principals/groups/{groupId}/` | depth 0 → **207** |
| System principal | PROPFIND | `/remote.php/dav/principals/system/{name}/` | `system` + `public` exist |
| Public system principal | PROPFIND | `/remote.php/dav/principals/system/public/` | **PublicAuth** — no creds, not **401** |
| Resource/room/remote | PROPFIND | `…/calendar-resources/{id}`, `…/calendar-rooms/{id}`, `…/remote-users/{id}` | unknown id → **404** |

Collection children listing disabled unless `NC_DAV_DEBUG=true` (observe depth-1 on `principals/users/` — no child enumeration). Unauth (except `system/public`) → **401** Sabre XML + Basic `WWW-Authenticate`.

Parity extras (`next/parity/tests/dav-principals.parity.test.ts`): unauth 401; own principal PROPFIND 207; unknown principal 404; `system/public` unauth not 401; depth-1 users collection no listing. Reset via `resetParityPrincipalsStores()` → `/api/parity/reset-dav-principals-store`.

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

#### Public files DAV walkthrough — `dav.Public#tree` + `dav.Public#legacy-webdav` (`parity: tested`)

Next.js: `src/server/dav/public-handler.ts` + `public-auth.ts` + `public-files.ts` + `public-remote.ts`; middleware routes `/public.php/dav/*` and `/public.php/webdav/*`.

| Step | Method | Path | Notes |
| --- | --- | --- | --- |
| List share root | PROPFIND | `/public.php/dav/files/{token}/` | depth 0 → **207** multistatus (`bp-dav-xml-normalize`) |
| Download file | GET | `/public.php/dav/files/{token}/{file}` | **200** bytes + MIME (`bp-binary-parity` size class) |
| Options | OPTIONS | same prefix | **200**; legacy requires AJAX or outgoing S2S like other methods |
| Upload | PUT | `/public.php/dav/files/{token}/{file}` | **201** create; v2 non-GET needs `X-Requested-With: XMLHttpRequest` or outgoing S2S |
| Legacy home | PROPFIND/GET | `/public.php/webdav/{path}` | Basic username = token; **all** methods gated by AJAX or outgoing S2S |

Auth: `auth: public-share` is correct. Owner login cookie does **not** count. Password DAV session is `public_link_authenticated` (share **id** list from `authSucceeded`). Map default success **207** is a lie — assert per method.

Parity extras (`next/parity/tests/files-sharing-public-dav.parity.test.ts`): open link PROPFIND 207; GET file 200; unknown token 401/404 Sabre XML; password no creds 401; v2 PUT without AJAX and S2S off 401; legacy GET without AJAX and S2S off 401; owner cookie still 401.

## Do-not list
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
  public-handler.ts      # /public.php/dav + /public.php/webdav (files_sharing slice)
  public-auth.ts
  public-files.ts
  public-remote.ts
  auth.ts                # Basic / Bearer / public-calendar / token
  xml.ts                 # PROPFIND/PROPPATCH infoset + oc/nc ns
  tree/files.ts          # files/{uid}
  tree/uploads.ts        # chunk v1 + v2
  tree/calendars.ts      # later sub-slice
  tree/addressbooks.ts
  tree/principals.ts
  direct.ts              # OCS mint + GET stream
  ocs-ooo.ts
  cal-ocs.ts
  cal-ocs-store.ts
  invitation-html.ts
  invitation-html-store.ts
app/remote.php/[...path]/route.ts     # method-agnostic
app/.well-known/caldav/route.ts
app/.well-known/carddav/route.ts
app/ocs/v2.php/apps/dav/api/v1/...
```

## Parity notes

First files PROPFIND slice **landed** `bp-dav-xml-normalize` (infoset, ignore prefix/attr order).

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
| Cal OCS unauth | upcoming/pending GET | OCS 401/997 |
| Cal OCS accept/decline anon | federated pending/{id} | OCS 404 null (not 401) |
| Federated accept wrong id | pending/{id} | OCS 404 null |
| Invitation bad token | accept | error HTML template 200 (not 404) |
| Invitation options junk token | options | options HTML template 200 |
| Invitation POST no CSRF | processMoreOptions | 200 HTML |
| Upload chunk | `dav.Collection#uploads` | MKCOL → PUT parts → MOVE `.file`; wrong uid **403**; see `bp-dav-upload-chunk-assemble` |

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
- Cross: `files_sharing` public.php; `files` JSON API; `bp-ocs-envelope`; `bp-dav-xml-normalize`
