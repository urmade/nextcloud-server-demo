---
name: bp-dav-xml-normalize
description: Compare DAV PROPFIND/MKCOL XML by infoset (namespace URI + local name + text), not prefix strings or attribute order. Use in parity tests for multistatus and Sabre error bodies.
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# bp-dav-xml-normalize

Cross-cutting. PHP Sabre and Next.js may emit different prefixes (`d:` vs `D:`) for the same namespaces. Parity must compare **infoset**, not serialized XML strings.

## Namespaces to preserve

| Prefix (example) | URI |
| --- | --- |
| `d` | `DAV:` |
| `oc` | `http://owncloud.org/ns` |
| `nc` | `http://nextcloud.org/ns` |
| `s` | `http://sabredav.org/ns` |

Resolve `xmlns:*` on the root element before comparing child tags.

## Do

- Normalize to sorted `{name: "{URI}localName", text?}` entries via `next/parity/helpers/dav-xml.ts` (`normalizeDavXmlInfoset`).
- Enable harness comparison with `compare: { davXmlBody: true }` in parity tests.
- Assert required props by infoset name, e.g. `{DAV:}getetag`, `{http://owncloud.org/ns}fileid`.
- Compare status + contract headers (`content-type`, `www-authenticate` on 401) separately.

## Do not

- Raw-string compare multistatus XML across legacy and Next.js.
- Require a specific prefix (`oc:` vs default namespace).
- Treat attribute order or insignificant whitespace as contract.

## Harness

```typescript
compare: {
  contractHeaders: ['content-type'],
  davXmlBody: true,
}
```

Implementation: `parity/compare.ts` calls `normalizeDavXmlInfoset` when `davXmlBody` is set.

## Related

- `parity-testing` — XML row in normalize-before-diff table
- `dav` feature skill — PROPFIND parity cases
- `bp-binary-parity` — non-XML DAV (GET file bytes) uses size class instead
