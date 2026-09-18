---
name: bp-session-map-serialization
description: Serialize PHP session maps as JSON objects, never arrays, so keyed entries survive a round trip. Use when porting a PHP session key that holds an id-to-value map, such as public_link_authenticated_frontend.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# bp-session-map-serialization

A PHP array is both a list and a map, so PHP session code writes `$session['key'][$token] = $hash` for either. JavaScript arrays are not maps: `JSON.stringify` **silently drops non-index properties**.

```js
const map = JSON.parse('[]');   // Array, not object
map['token-abc'] = 'hash';
JSON.stringify(map);            // "[]" — the entry is gone, no error
```

The write succeeds, the read returns `undefined`, and nothing throws. In an auth gate this reads as "never authenticated", so the user is redirected back to the gate they just passed — a redirect loop with no error anywhere.

This is what `public_link_authenticated_frontend` (token → password hash) hit: a `?? '[]'` default made every successful public-link password POST a no-op, so `GET /s/{token}` bounced back to `/authenticate/showShare` forever.

## Do

- Default keyed session state to `'{}'` and reject arrays on read:

```ts
function readMap(session: SessionData): Record<string, string> {
	const raw = session.someMap ?? '{}';

	try {
		const parsed = JSON.parse(raw) as unknown;

		if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
			return {};
		}

		return parsed as Record<string, string>;
	} catch {
		return {};
	}
}
```

- Keep list-shaped session keys as real arrays (`public_link_authenticated` is a list of share **ids**) and dedupe on write.
- Check the PHP key's access pattern before choosing a shape: `$session[$key][$id] = …` is a map, `$session[$key][] = …` is a list.
- Cover the **post-gate happy path**, not only the rejection. A test that asserts "wrong password is 200 wrongpw" passes while the correct password is broken.

## Do not

- Round-trip a map through `JSON.parse('[]')`.
- Trust `typeof parsed === 'object'` alone — arrays pass it.
- Assume a silent auth failure will surface as an error status; it surfaces as a loop.

## Related

- `files_sharing` — public link session keys
- `bp-observe-php-contract` — read the PHP session shape, do not infer it from the map
