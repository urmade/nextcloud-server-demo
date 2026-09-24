# Nextcloud → Next.js migration plan

Phase 0 inventory. Conceptual-and-functional refactor of Nextcloud **server core** into Next.js App Router + TypeScript. Not a line-by-line PHP port.

## Goals & non-goals

**Goals**

- Prove Definition of Done: endpoint map covers the discovered surface; each mapped endpoint has a parity test or `parity: waived` with reason + owner; feature map + one feature skill per feature; one human migration plan.
- Sequence slices until a modular Next.js monolith can stand in for the public contracts clients and apps actually call.
- Keep `.cursor/maps/endpoint-map.yaml` current on the active branch (548 endpoints; 300 `parity: tested` as of `8419203`).

**Non-goals**

- Line-by-line PHP → TypeScript transcription.
- Pixel-perfect UI rewrite unless a slice requires it.
- Inventing product behavior not exposed via Nextcloud APIs.
- Human-facing docs as the primary artifact (this plan is the exception).
- Autonomous GitHub PRs (Nextcloud AI policy: Tobias submits).

**Target stack:** Next.js App Router + TypeScript, Route Handlers / server modules, modular monolith unless evidence forces otherwise. Parity harness compares legacy Nextcloud vs new Next.js.

## Inventory summary

### Apps (bundled server core)

| App | Role |
| --- | --- |
| `files` | Files UI + JSON API, templates, direct editing, conversion |
| `dav` | WebDAV / CalDAV / CardDAV Sabre tree, chunked uploads, system tags, comments, avatars |
| `files_sharing` / `sharing` | Share OCS, public links, public DAV; new sharing registry v1 |
| `federatedfilesharing` / `federation` / `cloud_federation_api` | OCM + trusted servers + outgoing/incoming federation |
| `files_versions` / `files_trashbin` / `files_external` / `files_reminders` | Versions, trash, external mounts, reminders |
| `settings` / `provisioning_api` / `appstore` | Admin/personal settings, user/group/app provisioning, app catalog |
| `oauth2` / `twofactor_backupcodes` / `user_ldap` | Client OAuth, 2FA backup codes, LDAP |
| `theming` / `profile` / `dashboard` / `user_status` / `weather_status` | Shell chrome and widgets |
| `comments` / `systemtags` / `workflowengine` / `encryption` / `webhook_listeners` | Collaboration + Flow + SSE + webhooks |
| `updatenotification` | Update UX |
| `testing` | Dev-only; not product |

Core (`core/`, `lib/`, `status.php`, `ocs/*.php`, `remote.php`, `public.php`) owns login, capabilities, preview, search, avatars, AI task APIs, well-known, OCM discovery.

### API families

| Family | Ingress | Notes |
| --- | --- | --- |
| OCS | `/ocs/v2.php/...` (v1 identical routing, different envelope) | AppFramework OCS; `ocs_version: both` |
| HTTP / frontpage | pretty URLs (optional `/index.php` prefix) | Login, settings pages, public shares `/s/{token}` |
| DAV | `/remote.php/dav/...` plus legacy `/remote.php/webdav`, `/caldav`, `/carddav` | Sabre; method `*` |
| Public DAV | `/public.php/dav` and `/public.php/webdav` | Token share access |
| OCM | `/ocm-provider/`, `/ocm/...`, `.well-known/ocm` | Cloud Federation |
| Discovery | `/status.php`, `/ocs-provider/`, `.well-known/*` | Clients probe these first |
| Other | `/cron.php`, installer `GET/POST /` when uninstalled | Protocol gates, not product APIs |

### Auth

Clients use **cookie session** (web UI + CSRF), **HTTP Basic**, **Bearer app-password / OAuth access token**, **public-share tokens**, and **signed direct-download tokens**. Many OCS routes are `PublicPage` but still *expand* payload when authenticated (`mixed`). WebDAV uses Basic or Bearer. Do not assume 401 on missing auth for public capability/status probes.

### Storage / DB touchpoints (conceptual)

- Files: `filecache`, `storages`, `mounts`, object-store/local data directory — not SQL blobs for file bytes.
- Auth: `users`, `authtoken`, `webauthn`, `twofactor_providers`, `bruteforce_attempts`, `login_flow_v2`.
- Sharing: `share` (+ federated share tables).
- DAV: calendar/addressbook/object tables, `properties`, `systemtag*`.
- Config: `appconfig`, `preferences`, `accounts`.
- Jobs: `jobs`, `taskprocessing_tasks`.

Next.js slices should talk to the same contracts (or a compatibility store), not clone Doctrine migrations line by line.

## Phases

### A — Foundation

Parity harness + legacy target already exist. Land **core-status** (`GET /status.php`, `GET /ocs/v{1,2}.php/cloud/capabilities`) then **core-login** (session cookie, CSRF, form login/logout). These unblock every authenticated slice. Also: OCS envelope helper (`bp-ocs-envelope`), auth middleware (Basic/Bearer/session), config/version module.

### B — Core platform APIs

App passwords, client login flow v2 (desktop/mobile), navigation, autocomplete, unified search, avatars, previews, well-known, theming CSS/JS, profile OCS. Prefer endpoints with high client fan-in over admin HTML.

Current: leftover core YAML harvested through `core-web-updater` (`b6936e9`). DAV remaining is complete on `cursor/dav-example-content-e1af` at `25d0602`. Users-edit harvested on `cursor/provisioning-users-edit-e1af` at `8419203` (300 `parity: tested` of 548). Implementation paused by Tobias. Next when resumed: `provisioning-users-groups`. Leftover `core` is empty.

### C — Files / WebDAV / storage

Sabre files tree (`/remote.php/dav/files/{user}`), legacy `/remote.php/webdav`, chunked uploads, versions, trashbin, external storage mounts, files JSON API + files UI shell. Files DAV prefixes already tested. Remaining `dav` through tree extras is harvested (49/56). Last DAV lock is example content (+7). DAV XML namespaces: `bp-dav-xml-normalize` exists after files-home PROPFIND (regex/flat-tag infoset; needs a real parser before nested CalDAV multistatus).

### D — Sharing & collaboration

Share OCS CRUD, sharees, public `/s/{token}` + public DAV, federated incoming/outgoing, OCM, comments, system tags, user status. Public-share auth is its own session, not the user cookie.

### E — High-traffic apps

Dashboard widgets, CalDAV/CardDAV (same Sabre server as files — may start in C if cheaper), Flow, encryption status, LDAP wizard (admin), webhooks, AI taskprocessing. CalDAV/CardDAV is large; treat as its own sub-slice under `dav`.

### F — Admin / settings / provisioning

Provisioning OCS (users/groups/apps/config), settings pages, declarative settings, app store, update notification, integrity/setup checks. Needed for a replaceable admin surface; lower client fan-in than A–D.

### G — Hardening / perf / cutover

Rate limit + bruteforce parity, CSRF coverage, maintenance/upgrade modes, metrics, cron/webcron, performance (PROPFIND, preview, search), cutover runbook (reverse proxy routing, data dir, DB). Remaining `parity: pending` must be `tested` or `waived`.

## Slice order & dependencies

```
core-status          # status.php + capabilities (in progress)
    └─ core-login    # CSRF, session, login/logout, login flow v2
         ├─ core     # app-password, preview, search, well-known, avatars
         ├─ oauth2
         ├─ dav      # files WebDAV first; CalDAV/CardDAV later
         │    ├─ files
         │    ├─ files_sharing ── sharing, federatedfilesharing, federation
         │    └─ cloud_federation_api
         ├─ settings / provisioning_api / appstore
         └─ dashboard / user_status / theming / profile
```

Do not start a second feature mid-slice. Expand `.cursor/skills/<feature>/SKILL.md` before code.

## Risk register

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Auth matrix (`mixed` vs 401) | Capabilities/status and many OCS routes succeed unauthenticated with a reduced body | Parity cases: no auth, bad Basic, good Basic |
| OCS v1 vs v2 envelopes | Same route, different `meta.statuscode` (100 vs 200); v1 maps errors to HTTP 200 | Shared envelope helper; never collapse tests |
| DAV XML + namespaces | Clients break on prefix/ns drift | Normalize in parity; first PROPFIND slice writes `bp-dav-xml-normalize` |
| Public share is a second auth world | `/s/{token}` + `/public.php/dav` must not leak user session | Separate auth adapter |
| Federation/OCM | Cross-instance signatures, JWKS, catch-all `/ocm/{path}` | Isolate behind `cloud_federation_api`; mock remote in parity |
| Encryption + external storage | Wrong abstraction leaks ciphertext or mount credentials | Contract tests on headers/ETag/size, not bytes layout |
| Map drift | New PHP routes land on `master` weekly | Re-scan OpenAPI + routes.php at the start of every slice |
| Scope explosion | Server core is hundreds of routes | One feature per slice; DoD on that feature only |

## Done criteria

- Endpoint map covers discovered ingress (OCS, DAV, HTTP, OCM, well-known, ocs-provider) and stays current.
- Every mapped endpoint is `parity: tested` or `parity: waived` with reason + owner.
- Feature map lists every `feature_ids` value; each has a feature skill when its slice starts (and after it ships).
- Best-practice skills capture cross-cutting wins (OCS envelope, DAV XML, auth).
- This plan remains the single human migration doc; phases marked complete or remaining work listed.
- No autonomous GitHub PRs; Conventional Commits + `Assisted-by`; no `Signed-off-by` from agents.

## Recommended first slice

**`core-status`** — already the highest fan-in probe (`GET /status.php`, `GET /ocs/v1.php/cloud/capabilities`, `GET /ocs/v2.php/cloud/capabilities`). Then **`core-login`**: session cookie + CSRF (`/csrftoken`) + `GET/POST /login` + `/logout`. Everything in B–F hangs off those two.
