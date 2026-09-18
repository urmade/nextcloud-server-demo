---
name: bp-request-origin
description: Derive client-visible absolute URLs from request host headers, not Next.js request.url. Use when building Location headers, nc:// server fields, grant URLs, or poll/login JSON links.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# bp-request-origin

PHP `IURLGenerator::linkToRouteAbsolute` and `getAbsoluteURL` build from the incoming request host. Next.js `request.url` is reconstructed from the bind address (`localhost` / `127.0.0.1`) and is **not** parity.

## Do

- Derive origin from `x-forwarded-host` → `host` → fallback `127.0.0.1:3100`.
- Derive scheme from `x-forwarded-proto` → fallback `http`.
- Use `new URL(path, origin)` for absolute redirects and embedded links.
- Keep `request.url` only for pathname/search parsing (query params, route segments).
- In parity tests for login v1/v2 HTML 303s, send the same `host` / `x-forwarded-host` / `x-forwarded-proto` headers to **both** sides and assert `Location` origin + pathname — not pathname-only normalization.

```typescript
function getRequestOrigin(request: Request): string {
	const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '127.0.0.1:3100';
	const proto = request.headers.get('x-forwarded-proto') ?? 'http';

	return `${proto}://${host}`;
}
```

## Do not

- Build `Location` with `new URL(path, request.url)`.
- Compare only pathname when the contract is an absolute redirect and host drift is the bug under test.
- Assume legacy mock `buildRequest` origin (`http://127.0.0.1:3100`) is the client host — pass `host` headers in parity options when testing origin.

## Applies to

| Area | Examples |
| --- | --- |
| Login flow v1 | `nc://login/server:…`, grant URL, login redirect |
| Login flow v2 | `login` JSON field, poll endpoint, landing 303, grant unauth 303, `getServerPath` poll payload |
| Sharing / DAV | share links, direct-editing URLs, public-link redirects |
| OCS reference | resolve/extract absolute links |
