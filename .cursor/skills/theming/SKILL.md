---
name: theming
description: Instance theme CSS/icons/logos, admin ajax, user theme OCS, user backgrounds. Use when implementing or testing theming assets or /apps/theming/*.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# theming

## Purpose

Instance chrome: public CSS variables, icons, logos, web manifest; admin ajax to set colors/URLs/images; per-user theme enable/disable (OCS) and background image/color (HTTP).

Depends on `core` (capabilities document hosts `theming` keys from this app’s provider — implement the provider here, do not expand `core-status`).

## Scope

- Public GET image, theme CSS, manifest, favicon, touch icon, themed SVG
- Admin POST/PUT ajax: stylesheet fields, image upload, undo, undo-all, default apps
- User GET/POST/DELETE background
- OCS PUT/DELETE enable/disable theme by id

## Non-scope

- `theming` capability **emission** on `/cloud/capabilities` routing — `core-status` owns the endpoint; this feature owns the payload keys
- Personal/admin settings HTML (`theming` settings sections) — `settings`
- Provisioning preference keys (`primary_color`, `toast_timeout`, …) — `provisioning_api`; theming listener only **validates** those keys
- Generating pixel-perfect CSS variable tables beyond what clients need; match public CSS contract
- Imagick setup check HTTP
- `occ theming:config`

## Endpoints owned

25 map ids. **routes.php and OpenAPI duplicate the same handlers.** Implement once; both ids share the route. Pretty URL `/apps/theming/...` equals `/index.php/apps/theming/...`.

### Admin ajax (HTTP, session, **not** OCS)

| id | Method | Path |
| --- | --- | --- |
| `theming.Theming#updateStylesheet.post` | POST | `/apps/theming/ajax/updateStylesheet` |
| `theming.Theming#updateAppMenu.put` | PUT | `/apps/theming/ajax/updateAppMenu` |
| `theming.Theming#uploadImage.post` | POST | `/apps/theming/ajax/uploadImage` |
| `theming.Theming#undo.post` | POST | `/apps/theming/ajax/undoChanges` |
| `theming.Theming#undoAll.post` | POST | `/apps/theming/ajax/undoAllChanges` |

`#[AuthorizedAdminSetting(Admin::class)]`. CSRF required. Success JSON: `{ data: { message, ... }, status: "success" }` — **not** an OCS envelope.

### Public / mixed HTTP assets

PHP is `#[PublicPage]` + `#[NoCSRFRequired]` for image, CSS, manifest, icons. Map `auth: session` on routes.php copies is **wrong**; anonymous must **200** when the asset exists.

| routes.php id | OpenAPI id | Method | Path |
| --- | --- | --- | --- |
| `theming.Theming#getImage` | `theming-theming-get-image` | GET | `/apps/theming/image/{key}` |
| `theming.Theming#getThemeStylesheet` | `theming-theming-get-theme-stylesheet` | GET | `/apps/theming/theme/{themeId}.css` |
| `theming.Theming#getManifest` | `theming-theming-get-manifest` | GET | `/apps/theming/manifest/{app}` (`app` default `core`) |
| `theming.Icon#getFavicon` | `theming-icon-get-favicon` | GET | `/apps/theming/favicon/{app}` |
| `theming.Icon#getTouchIcon` | `theming-icon-get-touch-icon` | GET | `/apps/theming/icon/{app}` |
| `theming.Icon#getThemedIcon` | `theming-icon-get-themed-icon` | GET | `/apps/theming/img/{app}/{image}` |

### User background (HTTP, login required)

`#[NoAdminRequired]`. **Not** `PublicPage` → anonymous **401**. GET has `NoCSRFRequired`. POST/DELETE need CSRF unless `OCS-APIRequest` (these are **not** OCS).

| routes.php id | OpenAPI id | Method | Path |
| --- | --- | --- | --- |
| `theming.userTheme#getBackground` | `theming-user_theme-get-background` | GET | `/apps/theming/background` |
| `theming.userTheme#setBackground.post` | `theming-user_theme-set-background` | POST | `/apps/theming/background/{type}` |
| `theming.userTheme#deleteBackground.delete` | `theming-user_theme-delete-background` | DELETE | `/apps/theming/background/custom` |

### User theme OCS

| id | Method | Path |
| --- | --- | --- |
| `theming-user_theme-enable-theme` | PUT | `/ocs/v2.php/apps/theming/api/v1/theme/{themeId}/enable` |
| `theming-user_theme-disable-theme` | DELETE | `/ocs/v2.php/apps/theming/api/v1/theme/{themeId}` |

`ocs_version: both`. Empty `data` on 200.

## Key types / entities

Theme ids and types (`ThemesService` registration order):

| id | Type |
| --- | --- |
| `default` | `TYPE_THEME` (1) |
| `light` | `TYPE_THEME` |
| `dark` | `TYPE_THEME` |
| `light-highcontrast` | `TYPE_THEME` |
| `dark-highcontrast` | `TYPE_THEME` |
| `opendyslexic` | `TYPE_FONT` (2) |
| `reduced-motion` | `TYPE_SUPPLEMENTARY` (3) |

User pref `theming` / `enabled-themes`: JSON array, default `'["default"]'`. Enabling a `TYPE_THEME` or `TYPE_FONT` **drops other enabled ids of the same type**; supplementary stacks.

System `enforce_theme`: if set to a known id, `getThemes()` shrinks to `default` + `dark` + enforced. OCS enable/disable of another `TYPE_THEME` → **403** `"Theme switching is disabled"`. Font/supplementary still toggle.

Appconfig keys (lexicon / `ThemingDefaults::set`): `name`, `url`, `imprintUrl`, `privacyUrl`, `slogan`, `primary_color`, `background_color`, `disable-user-theming`, `{key}Mime` for uploads, `cachebuster`. Aliases on write: `legalNoticeUrl`→`imprintUrl`, `privacyPolicyUrl`→`privacyUrl`, `primaryColor`→`primary_color`, `backgroundColor`→`background_color`, `disableUserTheming`→bool `disable-user-theming`.

`VALID_UPLOAD_KEYS`: `header`, `logo`, `logoheader`, `background`, `favicon`.

`ThemingBackground`: `{ backgroundImage: string|null, backgroundColor, primaryColor, version: int }`.

Background `type` path (`BackgroundService`):

| type | Action |
| --- | --- |
| `shipped` | `value` must be a `SHIPPED_BACKGROUNDS` filename |
| `custom` | `value` = user file path; stored as custom |
| `default` | reset image **and** color |
| other | **400** unless `color` query/body is set (color-only) |

Shipped filenames are the keys of `BackgroundService::SHIPPED_BACKGROUNDS` (webp/jpg under `apps/theming/img/background/`). Default image `jo-myoung-hee-fluid.webp`. Default color `#00679e`.

User pref `userCacheBuster`: POST setBackground increments; DELETE background does **not** increment.

`disable-user-theming` hides UI; **enable/disable theme OCS does not read this flag** in `UserThemeController`. Do not invent a 403 there.

Capability document (`Capabilities`, public): keys `name`, `productName`, `url`, `imprintUrl`, `privacyUrl`, `slogan`, `color`, `color-text`, `color-element`, `color-element-bright`, `color-element-dark`, `logo`, `background`, `background-text`, `background-plain`, `background-default`, `logoheader`, `favicon`, `primaryColor`, `backgroundColor`, `defaultPrimaryColor`, `defaultBackgroundColor`, `inverted`, `cacheBuster`, `enabledThemes`, `toastTimeout`, `toastTimeoutValues`. Toast timeouts: `[7000, 15000, 30000, -1]`; default 7000.

## Endpoint walkthrough

### Admin `updateStylesheet`

Fields: see switch in `ThemingController::updateStylesheet`. Length caps: name 250; url/imprint/privacy/slogan 500. Colors: `/^\#([0-9a-f]{3}|[0-9a-f]{6})$/i`. URLs: `http://` or `https://`, `FILTER_VALIDATE_URL`, no `"`. `disable-user-theming` values `yes|true|no|false`. `backgroundMime` only allowed as `backgroundColor`. Unknown key → 400 `{ status: error, data.message }`. Success `{ status: success, data.message: Saved }`.

### Admin `updateAppMenu`

`setting` must be `defaultApps`; `value` array of navigation ids → `INavigationManager::setDefaultEntryIds`. Invalid → 400.

### Admin `uploadImage`

Multipart `key` + `image`. Invalid key → 400 `Invalid key`. Empty/PHP upload error/processor exception → **422**. Success includes `name`, `url`, `message`.

### Admin `undo` / `undoAll`

`undo($setting)` with same aliases; returns `{ data: { value, message }, status: success }`. `undoAll` also `setDefaultEntryIds([])`.

### GET `getImage`

`key` one of uploaded image keys. `useSvg` query (default true) and converter capability. Missing → **404**. Cache 3600. `Content-Type` from `{key}Mime` when filename equals key. `Content-Disposition: attachment; filename="{key}"`.

### GET `getThemeStylesheet`

Unknown `themeId` → **404**. Query `plain`, `withCustomCss` (OpenAPI). `plain=true`: `:root { vars } ` + custom CSS. Else at-rules hoisted; rest scoped `[data-theme-{id}] { vars + css }`. `Content-Type: text/css`. Cache 86400.

`withCustomCss` is accepted on the PHP signature; custom CSS always comes from `$theme->getCustomCss()` in the method as written — do not invent extra gating unless live legacy differs.

### GET `getManifest`

`app` `core` or `settings` → instance name/slogan, `start_url` base. Else app must be `isEnabledForUser` or **404** + throttle `action=manifest`. Icons: touch 512 PNG + favicon SVG 16, cachebuster query. `display` / `display_override` from system `theming.standalone_window.enabled` (default true → `standalone` + `minimal-ui`). Cache 3600.

### Icons

Disabled/unknown app → treat as `core` (themed icon also resets `image` to `favicon.png`). Favicon: custom uploaded `favicon` wins (`image/x-icon`); else generated ICO if converters exist; else `core/img/favicon.png`. Touch: custom favicon file; else generated PNG; else `core/img/favicon-touch.png`. Themed SVG cached as `icon-{app}-{color}-{image}`. Cache 86400.

### GET background

Custom file from `BackgroundService::getBackground()`. Hit: binary + mime, cache 24h (private). Miss: **404**.

### POST background `{type}`

Optional `color`. Then switch on `type`. InvalidArgument → 400 `{ error }`; other throw → 500 `{ error }`. Success `ThemingBackground` JSON (not OCS).

### DELETE background

`deleteBackgroundImage`; return `ThemingBackground` with `backgroundImage: null` and **current** version.

### OCS enable / disable theme

`validateTheme`: empty/unknown id → **400** `Invalid theme id: …`. Enforced theme + `TYPE_THEME` → **403**. Idempotent enable if already on. **200** `[]`.

## Auth / tenant rules

| Surface | Auth |
| --- | --- |
| Admin ajax | Admin setting authorization + session + CSRF |
| Public assets | None (`PublicPage`) |
| User background | Logged-in user; 401 anonymous |
| Theme OCS | Logged-in; 401 anonymous |

User backgrounds and `enabled-themes` are **per uid**. Admin images are instance-global (`appdata/theming`). CSRF on mutating non-OCS routes. Theme OCS: CSRF unless `OCS-APIRequest`.

## Failure modes

| Condition | Result |
| --- | --- |
| Anonymous admin ajax | 401/login |
| Anonymous public CSS/icon | **200** (or 404 missing) |
| Anonymous background GET | 401 |
| Anonymous theme OCS | 401 |
| Unknown themeId CSS | 404 |
| Unknown themeId OCS | 400 (not 404) |
| `enforce_theme` + toggle light/dark | 403 |
| Invalid color / URL / too long | 400 admin JSON |
| Invalid upload key | 400 |
| Upload I/O | 422 |
| Missing custom background | 404 |
| Invalid shipped `value` | 400 `{ error }` |
| Manifest for disabled app | 404 + throttle |
| Wrong method | 405 |

## Conceptual Next.js shape

```
src/server/theming/
  types.ts
  instance-config.ts    # name/colors/urls/images
  themes.ts             # ids, CSS variables, enable/disable
  background.ts         # shipped/custom/default
  icons.ts
  manifest.ts
app/apps/theming/theme/[themeId]/route.ts   # .css
app/apps/theming/image/[key]/route.ts
app/apps/theming/favicon/[app]/route.ts
app/apps/theming/background/route.ts
app/ocs/v2.php/apps/theming/api/v1/theme/[themeId]/enable/route.ts
```

Do not transcribe SCSS. Emit the CSS string contract (`:root` vs `[data-theme-*]`). Binary: `bp-binary-parity`.

## Traps

- Duplicate map ids = one handler
- PublicPage vs map `session`: follow PHP
- Admin JSON is `{ data, status }`, not `ocs`
- OCS unknown theme is **400**; CSS unknown theme is **404**
- `TYPE_THEME` is exclusive; `reduced-motion` is not
- `enabled-themes` is JSON array string, not csv
- DELETE background does not bump `userCacheBuster`
- Favicon/touch fallbacks are files under `core/img/`, not 404, when converters missing
- getThemedIcon silently remaps disabled apps to core favicon
- Color regex allows 3- or 6-digit hex with `#`
- OCS v1 vs v2 envelopes on enable/disable only

## Do not

- Implement settings HTML or occ
- Put theming keys into `core-status` handlers (capability **provider** yes; `/cloud/capabilities` route no)
- 401 anonymous CSS/favicon
- Allow non-admin to POST ajax
- Invent theme ids
- Share Tailwind/tokens across this feature
- Edit `endpoint-map.yaml` from this skill

## Parity notes

Minimum per id: happy, auth failure as PHP does, one validation.

Extras:

| Case | Expect |
| --- | --- |
| GET theme `default.css` anon | 200 `text/css` contains `--` variables |
| GET theme unknown | 404 |
| GET `plain=1` | `:root {` present |
| GET favicon anon | 200 image |
| GET manifest core | 200 `short_name`, `icons[2]` |
| GET manifest disabled app | 404 |
| GET background anon | 401 |
| GET background no custom | 404 |
| POST background bad type no color | 400 |
| PUT enable `dark` | 200; capabilities/enabledThemes include `dark` |
| PUT enable unknown | 400 |
| PUT enable `light` while `dark` on | `dark` dropped (same TYPE_THEME) |
| PUT enable with `enforce_theme` | 403 for TYPE_THEME |
| POST stylesheet bad hex | 400 |
| POST upload bad key | 400 |
| Duplicate OpenAPI vs routes.php | same bytes |

Binary: status + content-type + size class (`bp-binary-parity`). CSS: assert selectors/variable names, not full minified equality if cache headers differ. No PII in fixtures.

## Repo links

- Routes: `apps/theming/appinfo/routes.php`
- Controllers: `apps/theming/lib/Controller/{ThemingController,UserThemeController,IconController}.php`
- Themes: `apps/theming/lib/Service/ThemesService.php`, `apps/theming/lib/Themes/*.php`, `apps/theming/lib/ITheme.php`
- Background: `apps/theming/lib/Service/BackgroundService.php`
- Defaults/images: `apps/theming/lib/{ThemingDefaults,ImageManager,IconBuilder,Util}.php`
- Capabilities: `apps/theming/lib/Capabilities.php`
- Lexicon: `apps/theming/lib/ConfigLexicon.php`
- Types: `apps/theming/lib/ResponseDefinitions.php`
- Pref validation (adjacent): `apps/theming/lib/Listener/BeforePreferenceListener.php`
- OpenAPI: `apps/theming/openapi.json`
- App: `apps/theming/lib/AppInfo/Application.php`
- Map: `docs/feature-map.mdc` → `theming`
