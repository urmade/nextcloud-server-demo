---
name: comments
description: Comment mention notification redirect + file comments domain. Use when implementing comments.Notifications#view or the comments data model DAV implements.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# comments

## Purpose

HTTP **mention deep-link**: `GET /apps/comments/notifications/view/{id}` redirects a logged-in user to the file that was commented on and marks the mention notification processed.

File comments themselves are stored in core `comments` / `comments_read_markers` and exposed on DAV `/remote.php/dav/comments/…`. Mapped DAV collection id `dav.Collection#comments` is owned by **`dav`** — implement the HTTP view in this slice; implement DAV verbs only in the dav slice, using this skill as the domain contract.

## Scope

1 map id: `comments.Notifications#view`.

Also this feature’s product surface the DAV slice must honor: entity type `files`, mention notifications, capabilities `files.comments: true`.

## Non-scope

- DAV tree `/remote.php/dav/comments` verbs (PROPFIND/REPORT/POST/PROPPATCH/DELETE) — **`dav`** (`dav.Collection#comments`)
- Unified search provider — `core`
- Files sidebar UI scripts
- Reactions table internals beyond comment `verb=reaction`
- Inventing comment REST besides this GET

## Endpoints owned

| id | method | path | PHP |
| --- | --- | --- | --- |
| `comments.Notifications#view` | GET | `/apps/comments/notifications/view/{id}` | `NotificationsController::view` |

`id` is the **comment id** (notification object id), not a notification row id.

OpenAPI scope `SCOPE_IGNORE`. Map success `200 html-or-json` is **wrong** — PHP is **303** or **404**.

## Key types / entities

Table `comments`:

| Column | Notes |
| --- | --- |
| `id` | stringified int after insert |
| `parent_id` / `topmost_parent_id` | `'0'` root |
| `children_count` | |
| `actor_type` / `actor_id` | DAV posts `users` + session uid |
| `message` | max **1000** (`IComment::MAX_MESSAGE_LENGTH`) |
| `verb` | e.g. `comment`, `like`, `reaction` |
| `object_type` / `object_id` | this HTTP view requires `files` + file id |
| `creation_timestamp` / `latest_child_timestamp` | |
| `expire_date` / `reference_id` / `meta_data` | |

Table `comments_read_markers`: per (object_type, object_id, user) last-read datetime.

Comment object (DAV props under `{http://owncloud.org/ns}`): `id`, `parentId`, `topmostParentId`, `childrenCount`, `verb`, `actorType`, `actorId`, `creationDateTime`, `latestChildDateTime`, `objectType`, `objectId`, `message`, `actorDisplayName`, `isUnread`, `mentions[]`.

Mentions parsed from message (`Comment::getMentions`): `@user`, `@"display name"`, `@group/…`, `@team/…`, `@guest/…`, `@email/…`, `@federated_* /…`. Markdown code fences/backticks stripped first.

Mention **notifications** (`OCA\Comments\Notification\Listener`): only mention `type === 'user'`, skip self and unknown uids. `app=comments`, `object=comment/{commentId}`, `subject=mention` with parameters `[objectType, objectId]`. Delete/pre-update marks processed.

Notifier link + primary action = this view route. Unsupported if object type ≠ `files`. Missing file → `AlreadyProcessedException`.

Capability (logged-in capabilities blob): `{files: {comments: true}}`.

Appconfig `comments.maxAutoCompleteResults` default `10` (initial state only).

DAV tree (dav-owned): `/remote.php/dav/comments/{entityType}/{objectId}/{commentId}`.

- `comments` root requires a logged-in user (`NotAuthenticated` otherwise).
- Entity types registered via `CommentsEntityEvent`. Comments app registers **`files`** iff the id exists in the current user’s folder (`getFirstNodeById`).
- `EntityTypeCollection` **cannot list children** (`MethodNotAllowed`) — client must know the file id.
- POST on `EntityCollection`: JSON `{actorType, message, verb}`; `Content-Type` application/json (ignore `charset`). `actorType` must be `users`; **actorId from session, never body**. 201 + `Content-Location` to new id. Then set read marker to now for poster.
- REPORT `{http://owncloud.org/ns}filter-comments`: `limit` **clamped 1–100** (missing/0 → **1**), `offset`, `datetime`. 207 Multi-Status.
- PROPFIND children: `getForObject` order `creation_timestamp DESC`; limit 0 = unlimited.
- PROPPATCH `{http://owncloud.org/ns}message` and DELETE: **author only** (`actorType=users` and `actorId === session uid`). Else 403 `Only authors are allowed to edit their comment.`
- Collection PROPPATCH `{http://owncloud.org/ns}readMarker`.
- Message too long → 400 `Message exceeds allowed character limit of 1000`.

## Endpoint walkthrough

### GET `comments.Notifications#view`

`PublicPage`, `NoCSRFRequired`. Map `auth: session` is middleware-scanner noise for the **attribute**; behavior still requires a user.

1. No session user → **303** `Location` = `core.login.showLoginForm` with `redirect_url` = this same view URL (`comments.Notifications.view`, `{id}`).
2. `commentsManager->get($id)`. Missing / throw → **404** `NotFoundResponse` (empty).
3. `objectType !== 'files'` → 404 (no markProcessed).
4. Resolve file: `userFolder.getFirstNodeById((int)objectId)`.
5. **`markProcessed` always runs if the comment is a files comment**, even when `$file === null`.
6. File missing → 404.
7. Else **303** `Location` = absolute `files.viewcontroller.showFile` `{fileid: objectId, opendetails: 'true'}`.

`markProcessed`: notification `app=comments`, `object=comment/{id}`, `subject=mention`, `user=current`.

## Auth / tenant rules

| Step | Rule |
| --- | --- |
| Attribute | Public + no CSRF (so bots can hit the URL and get a login redirect). |
| Effective | User session required to see the file. Anonymous → login redirect, **not** 401 JSON. |
| Tenant | Comment + file must be visible in **this user’s** folder. No cross-user file id leak: missing node is 404. |
| DAV (other slice) | Session/basic; cannot comment as another actor. |

Do not emit 401 for anonymous GET on this route.

## Failure modes

| HTTP | When |
| --- | --- |
| 303 Location login | anonymous |
| 303 Location files UI | logged-in, files comment, node exists |
| 404 empty | unknown comment, non-`files` object, node not in user folder, any thrown exception |

Map listed 401 is not what PHP does for this controller.

## Conceptual Next.js shape

```
src/server/comments/
  comments.ts          # get/save/mentions/read-markers (shared with dav)
  mention-redirect.ts  # view()
app/apps/comments/notifications/view/[id]/route.ts
```

DAV routes stay under the dav slice; inject the same `comments.ts` port.

## Traps

- Success is **303**, not 200 HTML.
- Anonymous is **303 login**, not 401.
- `markProcessed` before the file-null 404.
- Redirect query `opendetails=true` (string).
- Only `files` comments are viewable here.
- REPORT default limit is **1**, not “all”.
- Mention notifications fire only for `@user`, not `@group/` etc.
- DAV POST ignores body `actorId`.

## Do-not

- Do not implement `dav.Collection#comments` in this slice.
- Do not add a REST CRUD API that PHP does not have.
- Do not 401 anonymous view (redirect).
- Do not 200 a file page body from this route (redirect to files).
- Do not markProcessed when object type is not `files`.
- Do not notify the comment author of their own mention.

## Parity notes

Normalize `Location` pathname+search (`bp-binary-parity`). Extra:

| Case | Expectation |
| --- | --- |
| GET view anonymous | 303 to login; `redirect_url` contains `/apps/comments/notifications/view/{id}` |
| GET view known files comment + file | 303 to files showFile; `opendetails=true`; mention notification processed |
| GET view unknown id | 404 |
| GET view non-files comment | 404; notification not processed |
| GET view files comment, file not in folder | 404; mention **is** marked processed |
| POST view | 405 |

Do not assert notification table internals except via a follow-up GET that no longer shows the mention, if that API is in scope.

## Repo paths

- Route: `apps/comments/appinfo/routes.php`
- HTTP: `apps/comments/lib/Controller/NotificationsController.php`
- Entity registration: `apps/comments/lib/Listener/CommentsEntityEventListener.php`
- Events → notifications: `apps/comments/lib/Listener/CommentsEventListener.php`, `apps/comments/lib/Notification/Listener.php`
- Notifier + view link: `apps/comments/lib/Notification/Notifier.php`
- Capability: `apps/comments/lib/Capabilities.php`
- Core store: `lib/private/Comments/Manager.php`, `lib/private/Comments/Comment.php`
- DAV: `apps/dav/lib/Comments/{RootCollection,EntityTypeCollection,EntityCollection,CommentNode,CommentsPlugin}.php`
- Tree mount: `apps/dav/lib/RootCollection.php` (`$commentsCollection`)
- Tests: `apps/dav/tests/unit/Comments/`, `apps/comments/tests/` (if present)
