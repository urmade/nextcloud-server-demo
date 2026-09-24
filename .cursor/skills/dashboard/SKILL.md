---
name: dashboard
description: Dashboard widget OCS (items, widgets, layout, statuses). Use when implementing or testing /apps/dashboard/api/v{1,2,3}.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# dashboard

## Purpose

Authenticated OCS for the dashboard: list widget descriptors, fetch widget items (v1 and v2 shapes), and persist the user’s layout and status-widget id lists.

Depends on `user_status` (widget id `user_status` is a common panel; layout still works if that app is absent). Do not implement weather HTTP here (`weather_status`).

## Scope

- OCS `/ocs/v{1,2}.php/apps/dashboard/api/v1/widgets`
- OCS `/ocs/v{1,2}.php/apps/dashboard/api/v1/widget-items` and `/api/v2/widget-items`
- OCS `/ocs/v{1,2}.php/apps/dashboard/api/v3/layout` GET+POST
- OCS `/ocs/v{1,2}.php/apps/dashboard/api/v3/statuses` GET+POST
- Per-user layout/statuses preferences

## Non-scope

- HTML `GET /apps/dashboard/` (`DashboardController#index`) — unmapped; firstRun/birthdate/Feature-Policy live there only
- Widget **item contents** from Talk/Mail/Calendar/Recommendations/Weather — those apps; stub `IWidget` registry
- `user_status` CRUD OCS — `user_status`
- Weather location/forecast OCS — `weather_status`
- Theming background picker UI
- App store enablement (`appStoreEnabled` initial state only on HTML)

## Endpoints owned

Map ids where `feature_ids` contains `dashboard` (7). v2 OCS path canonical; `ocs_version: both`.

| id | Method | Path |
| --- | --- | --- |
| `dashboard-dashboard_api-get-widget-items` | GET | `/ocs/v2.php/apps/dashboard/api/v1/widget-items` |
| `dashboard-dashboard_api-get-widget-items-v2` | GET | `/ocs/v2.php/apps/dashboard/api/v2/widget-items` |
| `dashboard-dashboard_api-get-widgets` | GET | `/ocs/v2.php/apps/dashboard/api/v1/widgets` |
| `dashboard-dashboard_api-get-layout` | GET | `/ocs/v2.php/apps/dashboard/api/v3/layout` |
| `dashboard-dashboard_api-update-layout` | POST | `/ocs/v2.php/apps/dashboard/api/v3/layout` |
| `dashboard-dashboard_api-get-statuses` | GET | `/ocs/v2.php/apps/dashboard/api/v3/statuses` |
| `dashboard-dashboard_api-update-statuses` | POST | `/ocs/v2.php/apps/dashboard/api/v3/statuses` |

Query names from OpenAPI: `sinceIds`, `limit`, `widgets[]`. PHP binds `sinceIds` as **map widgetId → cursor string**, `widgets` as `string[]`, `limit` int default **7**. Controller does **not** clamp `limit` (OpenAPI documents 1–30; match PHP: pass through).

Header `OCS-APIRequest: true`, `?format=json`. Envelope: `bp-ocs-envelope`.

## Key types / entities

Preferences (app `dashboard`, user config):

| Key | Store | Default |
| --- | --- | --- |
| `layout` | comma-separated widget ids | appconfig `layout` or `'recommendations,spreed,mail,calendar'` |
| `statuses` | comma-separated ids **or** legacy JSON `{ [id]: bool }` | `''` |
| `firstRun` | bool | HTML only; not these OCS routes |

`sanitizeLayout(ids)`: drop `''`, keep first occurrence, preserve order. Does **not** check the widget registry — unknown ids stay in the stored layout.

`getStatuses()`:

1. `JSON.parse` the string; if object, return `Object.keys` where value is `true`
2. Else split on `,` and drop empty strings

`updateStatuses` **does not sanitize**; it `implode(',', $statuses)` as posted.

`DashboardWidget`:

```
{
  id, title, order: int,
  icon_class, icon_url,   // icon_url '' unless IIconWidget
  widget_url,             // IWidget.getUrl(); may be null
  item_icons_round: bool, // IOptionWidget or default false
  item_api_versions: int[], // 1 if IAPIWidget, 2 if IAPIWidgetV2, both possible
  reload_interval: int,   // 0 unless IReloadableWidget
  buttons?: { type, text, link }[]  // only IButtonWidget; type new|more|setup
}
```

`DashboardWidgetItem`: `{ title, subtitle, link, iconUrl, overlayIconUrl, sinceId }` — all strings.

`DashboardWidgetItems` (v2 items envelope): `{ items: DashboardWidgetItem[], emptyContentMessage, halfEmptyContentMessage }`.

Registry: `OCP\Dashboard\IManager::getWidgets()`. Apps register widgets; this slice owns routing + layout, not Talk/Mail internals.

`getShownWidgets(widgetIds)`:

- If `widgetIds` empty → explode user/system layout
- Filter registry to ids **in that list** (order = registry iteration, not layout order)

v1 items: only `IAPIWidget` → `getItems(userId, sinceIds[id] ?? null, limit)` then `jsonSerialize`.
v2 items: only `IAPIWidgetV2` → `getItemsV2(...)->jsonSerialize()`.
Widgets that implement neither contribute **no key**. Shown but non-API widgets are omitted from the items object, not returned as `[]`.

Layout GET/POST body: `{ layout: string[] }`.
Statuses GET/POST body: `{ statuses: string[] }`.

`statuses` here is **which status widgets are enabled on the dashboard**, not `user_status` rows.

## Endpoint walkthrough

All seven: `#[NoAdminRequired]`. v1/v2 GETs also `#[NoCSRFRequired]`. v3 POST layout/statuses have **no** `NoCSRFRequired` → CSRF unless `OCS-APIRequest`.

### GET `dashboard-dashboard_api-get-widgets`

Return **all** registered widgets keyed by id (not layout-filtered). **200**.

### GET `dashboard-dashboard_api-get-widget-items` (v1)

`getShownWidgets(widgets query)`. For each `IAPIWidget`, map id → item list. **200** object (possibly `{}`).

### GET `dashboard-dashboard_api-get-widget-items-v2`

Same selection; `IAPIWidgetV2` only; values are `DashboardWidgetItems`. **200**.

### GET `dashboard-dashboard_api-get-layout`

`{ layout: sanitizeLayout(stored) }`. **200**. Always an array (may be empty if stored is only commas).

### POST `dashboard-dashboard_api-update-layout`

Body `{ layout: string[] }`. Sanitize, save comma string, return `{ layout: sanitized }`. **200**.

### GET `dashboard-dashboard_api-get-statuses`

`{ statuses: getStatuses() }`. **200**. Empty stored → `[]` (not `{}` — PHP list).

### POST `dashboard-dashboard_api-update-statuses`

Save posted list as comma string **without** sanitize. Return `{ statuses: posted }` (not re-read). **200**.

Anonymous → **401** on all (no `PublicPage`).

## Auth / tenant rules

Map `auth: mixed` is scanner default. **Unauthenticated is 401**.

- Layout and statuses are **per user id**
- No admin bypass to another user’s layout
- Widget items are fetched as **that** user (`$this->userId`)
- CSRF on v3 POST without `OCS-APIRequest`
- Tenant = instance uid

## Failure modes

| Condition | Result |
| --- | --- |
| Anonymous | 401 all seven |
| Empty layout stored | GET layout `{ layout: [] }` |
| Unknown widget id in layout | stored; items skip it; widgets list still includes only registry |
| Widget not IAPIWidget | omitted from v1 items object |
| Widget not IAPIWidgetV2 | omitted from v2 items object |
| `widgets[]` given | ignore stored layout for items; still only registry ∩ that list |
| POST layout duplicates/empties | dropped; first wins |
| POST statuses duplicates/empties | **kept** in store and response |
| Wrong method | 405 |
| v1 vs v2 items path | different JSON value shape; do not reuse v1 list as v2 envelope |

Controller does not 400 on unknown layout ids.

## Conceptual Next.js shape

```
src/server/dashboard/
  types.ts
  layout.ts           # sanitize, defaults
  statuses-pref.ts    # JSON-or-csv parse
  widgets.ts          # registry + item adapters
  ocs.ts
app/ocs/v2.php/apps/dashboard/api/v1/widgets/route.ts
app/ocs/v2.php/apps/dashboard/api/v1/widget-items/route.ts
app/ocs/v2.php/apps/dashboard/api/v2/widget-items/route.ts
app/ocs/v2.php/apps/dashboard/api/v3/layout/route.ts
app/ocs/v2.php/apps/dashboard/api/v3/statuses/route.ts
```

Stub registry widgets for parity (ids + empty items). Do not clone PHP widget UIs.

## Traps

- **Two** “statuses”: dashboard pref list vs `user_status` app. This feature is the pref list
- `getWidgets` = full registry; items = layout ∩ API widgets
- v1 items: `Record<id, WidgetItem[]>`; v2: `Record<id, WidgetItems>`
- Default layout string includes apps that may be disabled — ids remain until POST
- Legacy statuses JSON must not be served as a JSON object to the OCS `statuses` array field
- POST statuses echo input; GET after POST with empties will drop `''` on the csv parse path
- `item_icons_round` default **false**
- `limit` default 7; PHP does not enforce max 30
- OCS v1 vs v2 envelopes (the **OCS** version, not widget-items v1/v2)

## Do not

- Implement HTML dashboard page, firstRun, or birthdate OCS
- Implement weather or user-status CRUD
- Filter `getWidgets` by layout
- Return v1 item arrays under the v2 path
- Treat dashboard `statuses` as presence/online
- Call other apps’ HTTP from these handlers; use in-process widget ports
- Edit `endpoint-map.yaml` from this skill

## Parity notes

Minimum per id: happy, 401 anonymous, one validation (POST layout empty strings; or GET items with bogus `widgets[]`).

Extras:

| Case | Expect |
| --- | --- |
| GET widgets | 200 object keyed by id; each has `item_api_versions` array |
| GET items no widgets query | 200; keys ⊆ layout ∩ API widgets |
| GET items `widgets[]=unknown` | 200 `{}` |
| GET layout default | 200 array (system default unless user override) |
| POST layout `["a","","a","b"]` | 200 `{ layout: ["a","b"] }` |
| GET statuses empty | 200 `{ statuses: [] }` |
| POST statuses then GET | round-trip ids (csv path) |
| v1 vs v2 OCS | same data; statuscode 100 vs 200 |
| v1 vs v2 widget-items | different value shape |

Do not require Talk/Mail to be installed for layout GET. Normalize widget `icon_url`/`widget_url` hosts. No PII in fixtures.

## Repo links

- Controller: `apps/dashboard/lib/Controller/DashboardApiController.php`
- Service: `apps/dashboard/lib/Service/DashboardService.php`
- Types: `apps/dashboard/lib/ResponseDefinitions.php`
- Tests: `apps/dashboard/tests/DashboardServiceTest.php`
- HTML (adjacent): `apps/dashboard/lib/Controller/DashboardController.php`
- Widget contracts: `lib/public/Dashboard/{IWidget,IAPIWidget,IAPIWidgetV2,IButtonWidget,IIconWidget,IOptionWidget,IReloadableWidget}.php`
- Models: `lib/public/Dashboard/Model/{WidgetItem,WidgetItems,WidgetButton,WidgetOptions}.php`
- OpenAPI: `apps/dashboard/openapi.json`
- App: `apps/dashboard/appinfo/info.xml`
- User-status widget (adjacent): `apps/user_status/lib/Dashboard/UserStatusWidget.php` id `user_status`
- Map: `docs/feature-map.mdc` → `dashboard`
