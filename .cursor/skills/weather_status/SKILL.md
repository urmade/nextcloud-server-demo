---
name: weather_status
description: Weather widget OCS (location, forecast, favorites, mode). Use when implementing or testing /apps/weather_status/api/v1/*.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# weather_status

## Purpose

Per-user weather location + forecast for the dashboard status widget. OCS stores coords/mode/favorites on the user, geocodes via Nominatim, altitude via OpenTopoData, forecast via MET Norway.

Depends on `dashboard` for widget chrome. This slice owns weather HTTP, not dashboard layout.

## Scope

- OCS `/ocs/v{1,2}.php/apps/weather_status/api/v1/{mode,location,forecast,favorites,use-personal}`
- User config under app `weather_status`
- Capability `weather_status.enabled: true`
- Dashboard script injection (`weather-status` JS/CSS) — adjacent, not mapped

## Non-scope

- Dashboard layout/widget-items OCS — `dashboard`
- User status CRUD — `user_status`
- Account profile `address` write — `profile` / `provisioning_api`
- Inventing extra weather providers or modes
- HTML dashboard page

## Endpoints owned

Map ids where `feature_ids` contains `weather_status` (7). v2 path canonical; `ocs_version: both`.

| id | Method | Path |
| --- | --- | --- |
| `weather_status-weather_status-get-favorites` | GET | `/ocs/v2.php/apps/weather_status/api/v1/favorites` |
| `weather_status-weather_status-set-favorites` | PUT | `/ocs/v2.php/apps/weather_status/api/v1/favorites` |
| `weather_status-weather_status-get-forecast` | GET | `/ocs/v2.php/apps/weather_status/api/v1/forecast` |
| `weather_status-weather_status-get-location` | GET | `/ocs/v2.php/apps/weather_status/api/v1/location` |
| `weather_status-weather_status-set-location` | PUT | `/ocs/v2.php/apps/weather_status/api/v1/location` |
| `weather_status-weather_status-set-mode` | PUT | `/ocs/v2.php/apps/weather_status/api/v1/mode` |
| `weather_status-weather_status-use-personal-address` | PUT | `/ocs/v2.php/apps/weather_status/api/v1/use-personal` |

Header `OCS-APIRequest: true`, `?format=json`. Envelope: `bp-ocs-envelope`. All `#[NoAdminRequired]`, no `PublicPage` → **401** anonymous. Map `auth: mixed` is scanner default.

No `NoCSRFRequired` → CSRF unless `OCS-APIRequest`.

## Key types / entities

User config (app `weather_status`, current uid):

| Key | Type | Default |
| --- | --- | --- |
| `mode` | int | `2` (`MODE_MANUAL_LOCATION`) |
| `lat` | float | `0` |
| `lon` | float | `0` |
| `address` | string | `''` |
| `altitude` | float | `0` |
| `favorites` | string[] | `[]` |

Modes (`WeatherStatusService`):

- `MODE_BROWSER_LOCATION = 1` — client supplies coords
- `MODE_MANUAL_LOCATION = 2` — stored address

`setMode` **does not validate** 1 vs 2; stores any int.

`WeatherStatusSuccess`: `{ success: bool }`

`WeatherStatusLocation`: `{ lat?: string, lon?: string, address?: string|null }`

`WeatherStatusLocationWithSuccess` = location ∧ `{ success }`

`WeatherStatusLocationWithMode` = location ∧ `{ mode: int }`

`WeatherStatusForecast` — MET compact timeseries element: `{ time, data: { instant.details, next_1_hours?, next_6_hours?, next_12_hours? } }`. PHP returns **sliced raw MET JSON**, first **10** hours. Do not reshape.

External HTTP (stub in Next.js; User-Agent `NextcloudWeatherStatus/{appVersion} nextcloud.com`):

| Use | URL |
| --- | --- |
| Forward geocode | `https://nominatim.openstreetmap.org/search` (`q`, `format=json`, `addressdetails=1`, `extratags=1`, `namedetails=1`, `limit=1`) |
| Reverse geocode | `https://nominatim.openstreetmap.org/reverse` (`lat`,`lon` **2 decimal**, `addressdetails=1`, `format=json`) |
| Altitude | `https://api.opentopodata.org/v1/srtm30m` (`locations=lat,lon`) — missing elevation → `0` |
| Forecast | `https://api.met.no/weatherapi/locationforecast/2.0/compact` (`lat`,`lon` 2 decimal, `altitude`) |

Cache: distributed `weatherstatus`. Key = `url\|implode(',', values)\|implode(',', keys)`. TTL 3600s, or `Expires` header if longer.

OSM format: city/town/village/municipality, then `, postcode`, then `, country`. Else `display_name`. Null → caller uses l10n `Unknown address` when setting by coords.

## Endpoint walkthrough

### GET `weather_status-weather_status-get-favorites`

`getValueArray(..., 'favorites', [])`. **200** string list.

### PUT `weather_status-weather_status-set-favorites`

Body `{ favorites: string[] }`. Store as-is. **200** `{ success: true }`. No sanitize.

### GET `weather_status-weather_status-get-location`

Returns `{ lat, lon, address, mode }`.

Trap: `lat`/`lon` are **strings**. If `abs(value) < PHP_FLOAT_EPSILON`, emit `''` (empty string), not `"0"`.

`mode` default **2** if unset.

### PUT `weather_status-weather_status-set-location`

Body `{ address?: string, lat?: float, lon?: float }`.

1. Both `lat` and `lon` non-null → store floats, reverse-geocode address (or `Unknown address`), store altitude. **Does not set `mode`.** Return `{ address, success: true }` (no lat/lon in this branch).
2. Else if `$address` is truthy → `setAddress`: Nominatim search. On hit, store formatted address + lat/lon/altitude and **set mode = 2**. Return `{ lat, lon, address, success: true }` (`lat`/`lon` are Nominatim **strings**).
3. Else `{ success: false }` still **200**. Empty `address` is falsy → this branch.

### PUT `weather_status-weather_status-set-mode`

Body `{ mode: int }`. Store. **200** `{ success: true }`.

### PUT `weather_status-weather_status-use-personal-address`

Read account property `address` for current user.

- Missing property or `''` → **200** `{ success: false }` (not 404)
- Else `setAddress(address)` (same as location-by-address, including mode=2)

### GET `weather_status-weather_status-get-forecast`

If stored `lat === 0.0` or `lon === 0.0` (float equality, **not** epsilon) → **404** `{ success: false }`.

Else MET compact; `array_slice(timeseries, 0, 10)`.

- Valid timeseries → **200** list of forecast objects
- Else **200** `{ error: string }` (`Malformed JSON data.` or HTTP/exception message)

**404 is only the zero-coord case.** Upstream errors are 200 `{ error }`.

## Auth / tenant rules

- Session user required. Anonymous → 401 all seven.
- Config is **this uid** only. No admin read of another user’s weather.
- Account `address` for `use-personal` is the **caller’s** profile property.
- Tenant = instance uid.
- CSRF on mutating methods without `OCS-APIRequest`.

## Failure modes

| Condition | Result |
| --- | --- |
| Anonymous | 401 |
| No lat/lon (both 0.0) forecast | 404 `{ success: false }` |
| Nominatim miss / error | 200 `{ success: false }` (set location/address) |
| MET malformed / HTTP ≥400 / exception | 200 `{ error: string }` |
| Missing personal address | 200 `{ success: false }` |
| `setMode` unknown int | 200 stored anyway |
| PUT location neither coords nor address | 200 `{ success: false }` |
| Wrong method | 405 |

Controller never 400s on these routes.

## Conceptual Next.js shape

```
src/server/weather_status/
  types.ts
  config.ts          # user prefs
  geocode.ts         # Nominatim + OSM format + altitude
  forecast.ts        # MET compact slice
  ocs.ts
app/ocs/v2.php/apps/weather_status/api/v1/favorites/route.ts
app/ocs/v2.php/apps/weather_status/api/v1/forecast/route.ts
app/ocs/v2.php/apps/weather_status/api/v1/location/route.ts
app/ocs/v2.php/apps/weather_status/api/v1/mode/route.ts
app/ocs/v2.php/apps/weather_status/api/v1/use-personal/route.ts
```

Stub geocode/forecast in parity. Do not call live OSM/MET from CI.

## Traps

- `getLocation` lat/lon empty string vs forecast zero-float 404
- Coords PUT does **not** set mode; address PUT **does** (`2`)
- Coords success payload omits lat/lon; address success includes them as strings
- Forecast 404 vs 200 `{ error }` vs 200 list — three success-shaped outcomes
- `use-personal` failure is 200 not 404
- Favorites PUT does not echo the list
- Map 401 on forecast is auth; location-missing is 404
- Capability is always `{ enabled: true }` when app is loaded
- Widget is **not** `IWidget`; dashboard listener injects JS

## Do not

- Implement dashboard widget-items or layout
- Proxy live OSM/MET from the App Router without a port; stub for parity
- Invent mode 3+
- Return numeric lat/lon on GET location (strings or `''`)
- 400 empty favorites or unknown mode
- Treat `{ error }` forecast as HTTP 404
- Edit `endpoint-map.yaml` from this skill

## Parity notes

Minimum per id: happy, 401 anonymous, one validation (PUT location empty body `{ success: false }`; or GET forecast with unset coords → 404).

Extras:

| Case | Expect |
| --- | --- |
| GET location never set | 200 `lat`/`lon` `''`, `mode` 2, `address` `''` |
| PUT location `{ lat, lon }` | 200 `{ address, success: true }`; GET location has string coords; **mode unchanged** |
| PUT location `{ address }` hit | 200 includes `lat`,`lon`,`address`,`success`; mode 2 |
| PUT location `{ address }` miss | 200 `{ success: false }` |
| PUT favorites `["a",""]` | 200 `{ success: true }`; GET returns both |
| GET forecast zero coords | 404 `{ success: false }` |
| GET forecast stub MET | 200 array length ≤ 10 |
| PUT use-personal no address | 200 `{ success: false }` |
| v1 vs v2 OCS | same data; statuscode 100 vs 200 |

Normalize forecast timestamps if comparing live MET. No PII (stored addresses) in fixtures.

## Repo links

- Controller: `apps/weather_status/lib/Controller/WeatherStatusController.php`
- Service: `apps/weather_status/lib/Service/WeatherStatusService.php`
- Types: `apps/weather_status/lib/ResponseDefinitions.php`
- Routes: `apps/weather_status/appinfo/routes.php`
- Capability: `apps/weather_status/lib/Capabilities.php`
- Dashboard inject: `apps/weather_status/lib/Listeners/BeforeTemplateRenderedListener.php`
- App: `apps/weather_status/appinfo/info.xml`
- OpenAPI: `apps/weather_status/openapi.json`
- Map: `docs/feature-map.mdc` → `weather_status`
