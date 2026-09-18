---
name: slice-workflow
description: Run one Nextcloud→Next.js refactor slice in order. Use when starting, continuing, closing, or sequencing a slice, or when deciding where knowledge belongs (feature skill vs bp-* skill).
---

<!--
 - SPDX-FileCopyrightText: 2026 Nextcloud GmbH and Nextcloud contributors
 - SPDX-License-Identifier: AGPL-3.0-or-later
-->

# Slice workflow

Execute in this order. Do not skip. Do not reorder. Stop if a step fails.

## Loop

1. **Expand the feature skill** — `.cursor/skills/<feature>/SKILL.md` matching `.cursor/rules/feature-map.mdc` and every `feature_ids` value this slice owns. Write enough that an implementer needs no tribal knowledge: contract, auth, edge cases, out-of-scope. If the skill does not exist, create it before code.
2. **Implement the conceptual equivalent** in Next.js App Router + TypeScript. Match client-visible behavior. Do not transcribe PHP. Do not invent product behavior. Touch only this feature's surface.
3. **Parity** — follow `parity-testing`. Every mapped endpoint this slice owns is `tested` or `parity:waived` with reason + owner.
4. **Skill hygiene** — promote or correct (below). Leave no orphan wisdom.
5. **Update maps** — endpoint map (both copies; `endpoint-mapping`) and feature map. Status fields match reality.
6. **Check in** — Conventional Commit + `Assisted-by` trailer. Push the branch. **Do not open a GitHub PR.** No `Signed-off-by`.
7. **Next slice** — only after 1–6. Do not start a second feature mid-slice.

## Skill catalog

| Kind | Path | Owns |
| --- | --- | --- |
| Workflow | `.cursor/skills/{endpoint-mapping,parity-testing,slice-workflow}/` | This process |
| Feature | `.cursor/skills/<feature>/SKILL.md` | One feature's contract and implementation notes |
| Best practice | `.cursor/skills/bp-<topic>/SKILL.md` | Cross-cutting win or correction |

`<feature>` equals a feature-map id. Every endpoint `feature_ids` value must have one skill. One feature skill per id. Never a second skill for the same feature.

## Governance

- **`bp-<topic>`** — kebab topic, not a sentence. Examples: `bp-ocs-envelope`, `bp-dav-xml-normalize`. Create only when the lesson applies to more than one feature.
- Feature-local fact → that feature skill. Cross-cutting fact → `bp-<topic>`. Process change → edit these workflow skills.
- **No orphan wisdom.** If it should change a future agent's behavior, it lands in a skill this slice. If it is a one-off, discard it. Do not leave durable knowledge only in chat, commit bodies, PR drafts, or random `notes.md`.
- **Promote** — after a win (working pattern, normalizer, auth sequence): write it into the feature skill or a `bp-<topic>` skill. Prefer editing an existing skill over adding a new one.
- **Correct** — if a skill caused a wrong implementation, fix the skill in the same slice. Stale skill is worse than missing skill.
- Do not create human essays. Skills stay terse, imperative, agent-readable.
- Do not dump debug logs, transcripts, or PHP-to-TS port notes into skills.

## Feature skill minimum

When expanding in step 1, the feature skill must state:

- Scope / non-scope
- Endpoints owned (`id` list or explicit "see map where `feature_ids` contains this feature")
- Auth model
- Conceptual Next.js shape (modules/routes), not PHP class maps
- Known traps (CSRF, OCS status wrapping, DAV namespaces)
- Parity extras beyond the default three cases

## Maps

- Endpoint map: `.cursor/maps/endpoint-map.yaml` + store `docs/endpoint-map.yaml`
- Feature map: `.cursor/rules/feature-map.mdc`
- New feature in this slice: add feature-map row + feature skill **before** implementation
- Do not check in with `parity: pending` on endpoints this slice claimed to finish

## Check-in

```
<type>(<feature>): <imperative summary>

Assisted-by: Cursor Grok 4.6
```

No GitHub PR (Nextcloud AI policy). No secrets in commits. No unrelated files.

## Self-check (gate for step 7)

- [ ] Feature skill expanded and matches what shipped
- [ ] Conceptual equivalent only; no PHP clone, no extra product behavior
- [ ] Parity law satisfied for this slice's endpoints
- [ ] Wins/corrections in a feature skill or `bp-<topic>`; nothing orphaned
- [ ] Maps updated on both copies; feature map current
- [ ] Branch committed and pushed; no PR opened
