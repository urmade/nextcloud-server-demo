---
name: profile
description: Profile OCS get/set plus shared-resources list. Use when implementing or testing profile fields, visibility, or /apps/profile/api/v1/resources.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# profile

## Purpose

Read a user’s visible profile fields (OCS under `/profile/{targetUserId}`) and write **own** field visibility. List files/calendar events the caller shares with that user (`/apps/profile/api/v1/resources/{userId}`).

Depends on `core-login`. Account property **values** are written by `provisioning_api` / `settings`, not here.

## Scope

- OCS GET/PUT `/ocs/v{1,2}.php/profile/{targetUserId}`
- OCS GET `/ocs/v{1,2}.php/apps/profile/api/v1/resources/{userId}`
- Visibility map persistence (`profile_config`)
- Field filtering via visibility + account scope + known-user

## Non-scope

- HTML `GET /u/{targetUserId}` (`ProfilePageController`) — unmapped; do not invent an endpoint id
- `core-hover_card-get-user` — `core`
- Editing displayname/email/phone/bio — `provisioning_api` / `settings`
- Avatars — `core` (`core-avatar-*`)
- User status payload on the HTML page — `user_status`
- Smart-picker reference provider (`ProfilePickerReferenceProvider`)
- Inventing extra profile fields

## Endpoints owned

Map ids where `feature_ids` contains `profile` (3). v2 path canonical; `ocs_version: both`.

| id | Method | Path |
| --- | --- | --- |
| `core-profile_api-get-profile-fields` | GET | `/ocs/v2.php/profile/{targetUserId}` |
| `core-profile_api-set-visibility` | PUT | `/ocs/v2.php/profile/{targetUserId}` |
| `profile-profile_api-get-resources` | GET | `/ocs/v2.php/apps/profile/api/v1/resources/{userId}` |

Header `OCS-APIRequest: true`, `?format=json`. Envelope: `bp-ocs-envelope`.

## Key types / entities

Table `profile_config` (`core/Migrations/Version23000Date20210930122352.php`):

| Column | Type |
| --- | --- |
| `id` | bigint PK |
| `user_id` | string 64 unique |
| `config` | text JSON |

`config` shape: `{ [paramId]: { visibility: Visibility } }`. Missing rows are created from defaults on first `getProfileConfig`.

`Visibility` (`OCP\Profile\IProfileManager`):

| Value | Who sees the field |
| --- | --- |
| `show` | public + logged-in (still gated by account **scope**) |
| `show_users_only` | logged-in only (still gated by scope) |
| `hide` | nobody |

Unknown visibility strings **normalize to `hide`** (`ProfileConfig::normalizeVisibility`). Case-insensitive match on `show` / `show_users_only`.

Default visibilities (`DEFAULT_PROPERTY_VISIBILITY`):

| paramId | Default |
| --- | --- |
| `address`, `email`, `phone` | `show_users_only` |
| `avatar`, `biography`, `displayname`, `headline`, `organisation`, `role`, `twitter`, `bluesky`, `website`, `pronouns` | `show` |

Action ids default to `show_users_only` (`DEFAULT_VISIBILITY`). Instance lexicon presets can overwrite address/email/phone defaults (shared/school hide; private/family show email; small/medium/large show email+phone). Do not invent other preset behavior.

Account **scope** (`IAccountManager`): `v2-private` \| `v2-local` \| `v2-federated` \| `v2-published`. Visibility and scope **both** apply (`isProfileFieldVisible`):

- `hide` → never
- `show_users_only` → visiting user must be logged in; `SCOPE_PRIVATE` additionally requires known-user
- `show` → `SCOPE_PRIVATE` still requires known-user; other scopes visible even anonymously **if** the HTML page allowed it — **this OCS is login-required**, so anonymous never reaches GET fields

Profile **fields in GET data** (`CoreProfileFields` + timezone from controller):

```
{
  userId: string,
  address?: string|null,
  biography?: string|null,
  displayname?: string|null,
  headline?: string|null,
  organisation?: string|null,
  role?: string|null,
  pronouns?: string|null,
  isUserAvatarVisible?: bool,
  actions: { id, icon, title, target }[],
  timezone: string,          // GET fields only
  timezoneOffset: int        // seconds; GET fields only
}
```

Hidden properties are present as `null`, not omitted (except avatar which is boolean `isUserAvatarVisible`). Empty string values become `null`.

`PROFILE_PROPERTIES` rendered as scalars: address, biography, displayname, headline, organisation, role, pronouns. Avatar is **not** a URL here.

`actions`: email, phone, website, twitter, bluesky, fediverse (plus app-registered `ILinkAction`). Dropped when `getTarget()` is null or field not visible. Sorted by action priority. Action id must not collide with a core property.

`ProfileSharedResource`: `{ label, text, href, img, themedIcon?: bool }`.

Global kill switch: `config.php` `profile.enabled` (default `true`). Per-user: account property `profile_enabled`.

## Endpoint walkthrough

### GET `core-profile_api-get-profile-fields`

`#[NoAdminRequired]`, `#[BruteForceProtection(action: user)]`, `#[UserRateLimit(30, 120)]`. No `PublicPage`.

1. No session/Basic/Bearer → **401**
2. Unknown `targetUserId` → **404** `null` data + throttle
3. User exists but **disabled** → **404** `null` (no throttle)
4. Profile disabled (global or `profile_enabled`) → **400** `null`
5. Caller is **not** the target **and** `currentUserCanEnumerateTargetUser` fails → **404** `null` (no throttle)
6. Else **200** `getProfileFields(target, caller)` plus:
   - `timezone`: user `core/timezone` or system `default_timezone` (`UTC`); invalid tz → `UTC`
   - `timezoneOffset`: `DateTimeZone::getOffset(now)` in **seconds**

Does **not** require password confirmation.

### PUT `core-profile_api-set-visibility`

`#[NoAdminRequired]`, `#[NoSubAdminRequired]`, `#[PasswordConfirmationRequired]`, `#[UserRateLimit(40, 600)]`.

Body: `{ paramId: string, visibility: string }`.

1. No auth → **401**
2. Password not recently confirmed → **403** (core-login confirm)
3. `requestingUser.uid !== targetUserId` → **403** `"People can only edit their own visibility settings"`
4. Target missing → **404** `"Account does not exist"`
5. Ensure a `profile_config` row exists (`getProfileConfig` self-as-visitor)
6. `paramId` not in the visibility map keys → **400** `"Account does not have a profile parameter with ID: {paramId}"`
7. `setVisibility` + persist → **200** empty `data` `[]`

Admins cannot set another user’s visibility via this route.

### GET `profile-profile_api-get-resources`

`#[NoAdminRequired]`, `#[NoCSRFRequired]`.

1. No auth → **401** (uses `userSession.getUser()`)
2. `userManager.get(userId)` null → **404** `OCSNotFoundException` (empty message)
3. Else **200** `array_values(events + files)` — events first, then files

**Does not** check profile enabled, enumeration, or disabled users. Unknown user is the only 404. Disabled-but-existing users still 200.

Files (max **5**, user-to-user shares only `IShare::TYPE_USER`):

- Outgoing: shares **by target** where `sharedWith === caller`
- Incoming: shares **by caller** where `sharedWith === target`
- Paginate `getSharesBy(..., limit 50)` until 5 matches or exhausted
- Merge, `array_slice(0, 5)`, sort by node `mtime` descending
- File node → preview URL `core.Preview.getPreviewByFileId` (`mimeFallback: true`)
- Folder → core `filetypes/folder.svg`
- `href` → `files.view.index` with parent path + fileid
- `text` → `formatTimeSpan(mtime)`

Events: if `calendar` app disabled for **caller**, `[]`. Else CalDAV search on caller principal, pattern = target uid, `VEVENT`, attendee+organizer, start `now-1h`, limit 9. Skip `STATUS=CANCELLED` and already-ended `DTEND`. `themedIcon: true`. `href` calendar object route (with recurrence id when present).

## Auth / tenant rules

Map `auth: mixed` is scanner default. **Unauthenticated is 401** on all three (no `PublicPage`).

- Visibility writes: **self only**
- GET fields: self always; others only if share enumeration allows
- Resources: any existing uid; payload is **shares with the caller**, not the target’s private files
- CSRF: PUT needs `OCS-APIRequest` or requesttoken. Both GETs: resources has `NoCSRFRequired`; GET fields is GET
- Password confirmation: PUT only
- Tenant = instance user id; no cross-instance profile OCS here

## Failure modes

| Condition | GET fields | PUT visibility | GET resources |
| --- | --- | --- | --- |
| Anonymous | 401 | 401 | 401 |
| Unknown user | 404 + throttle | 404 | 404 |
| Disabled user | 404 | 404 (if missing after get) | **200** if uid exists |
| Profile disabled | **400** | 200 if self + valid param (visibility still stored) | 200 |
| Enumeration denied | **404** | — | 200 |
| Other user’s PUT | — | **403** | — |
| Bad `paramId` | — | 400 | — |
| Unconfirmed password | — | 403 | — |
| Calendar app off | — | — | files only |
| Wrong method | 405 | 405 | 405 |

PUT on a disabled profile still updates visibility if the user exists and is self.

## Conceptual Next.js shape

```
src/server/profile/
  types.ts
  visibility.ts       # show | show_users_only | hide; defaults; presets
  fields.ts           # filter by visibility+scope
  resources.ts        # 5 files + calendar events
  ocs.ts
app/ocs/v2.php/profile/[targetUserId]/route.ts          # GET+PUT
app/ocs/v2.php/apps/profile/api/v1/resources/[userId]/route.ts
```

v1 OCS path shares handlers + `bp-ocs-envelope`. Do not port PHP classes.

## Traps

- Disabled profile is **400** on GET fields, **404** on unknown/disabled/enumeration
- Hidden fields are `null`, not omitted
- Avatar key is `isUserAvatarVisible`, not `avatar`
- Timezone keys exist only on GET fields, not on HTML initial state shape
- Resources 404s **only** on missing user — no profile/enumeration gate
- File list cap is 5 **after** merge, then mtime sort (order is not “outgoing then incoming” in the response)
- `paramId` must already be a key in the map (defaults + stored); cannot create arbitrary ids
- Invalid visibility → stored as `hide`, not 400
- GET fields throttles **unknown** uid only
- OCS v1 vs v2 envelopes

## Do not

- Implement `GET /u/{user}` in this slice unless the map gains an id
- Implement hover cards, avatars, or account value editors
- Let user A set user B’s visibility
- Return 404 on GET fields for “profile disabled” (that is 400)
- Apply enumeration checks to resources
- Leak file contents; only metadata + preview URL
- Emit theming/user_status capabilities
- Edit `endpoint-map.yaml` from this skill

## Parity notes

Minimum per id: happy, 401 anonymous, one validation.

Extras:

| Case | Expect |
| --- | --- |
| GET self | 200, `userId` match, `timezone` string, `actions` array |
| GET other allowed | 200; hidden fields null |
| GET unknown | 404 |
| GET profile disabled | 400 |
| GET enumeration denied | 404 |
| PUT self | 200 empty data; subsequent GET reflects visibility |
| PUT other uid | 403 |
| PUT unknown paramId | 400 |
| PUT no password confirm | 403 |
| GET resources unknown | 404 |
| GET resources self | 200 array (possibly empty) |
| v1 vs v2 | same data; statuscode 100 vs 200 |

Normalize preview/file `href`/`img` hosts. Do not assert calendar event text wording. No PII in fixtures.

## Repo links

- Core OCS: `core/Controller/ProfileApiController.php`
- Profile types: `core/ResponseDefinitions.php` (`CoreProfileFields`, `CoreProfileData`, `CoreProfileAction`)
- Manager: `lib/private/Profile/ProfileManager.php`
- Public API: `lib/public/Profile/IProfileManager.php`
- Entity/mapper: `core/Db/{ProfileConfig,ProfileConfigMapper}.php` — table `profile_config`
- Migration: `core/Migrations/Version23000Date20210930122352.php`
- Actions: `lib/private/Profile/Actions/*.php`
- App OCS resources: `apps/profile/lib/Controller/ProfileApiController.php`
- Resource type: `apps/profile/lib/ResponseDefinitions.php`
- OpenAPI: `apps/profile/openapi.json` + core OpenAPI `core-profile_api-*`
- HTML (adjacent): `apps/profile/lib/Controller/ProfilePageController.php` — `GET /u/{targetUserId}`
- App: `apps/profile/appinfo/info.xml`
- Map: `docs/feature-map.mdc` → `profile`
