# Nextcloud refactoring — project context

Locked for this Project. Amend only when Tobias changes a constraint.

## Objective

Conceptual-and-functional refactor of Nextcloud server core into Next.js (App Router) + TypeScript. Sequence slices until Definition of Done is proven. Tobias steers and marks done.

## Non-goals

- Line-by-line PHP → TypeScript ports
- Pixel-perfect UI rewrite unless a slice requires it
- Inventing product behavior not exposed via Nextcloud APIs
- Human-facing docs as the primary artifact (except the one migration plan)

## Target stack

- Next.js App Router + TypeScript
- Route Handlers / server modules
- Modular monolith unless evidence forces otherwise
- CI-runnable tests; parity harness compares legacy Nextcloud vs new Next.js

## Definition of Done

- Endpoint map covers discovered surface and stays current
- Parity tests exist for each mapped endpoint, or `parity:waived` with reason + owner
- Feature map rule + one feature skill per feature, matching reality
- Best-practice skills reflect wins and corrections
- One human migration plan exists; phases complete or in progress with remaining work listed

## Policy

- Do not open GitHub PRs autonomously (Nextcloud AI policy). Land on branches; Tobias submits.
- Conventional Commits + `Assisted-by` trailer. No `Signed-off-by` from agents.
- Never print secrets.

## Models

- Planning: Grok 4.6
- Implementation: Composer
- UI verification: Muse Spark
- Bug persists after one fix: Opus 5

## Artifact homes

- Human migration plan + this file + parity target: `docs/refactor/` in the active refactor branch
- Endpoint map: `.cursor/maps/endpoint-map.yaml` (548 endpoints; commit map updates on the active branch)
- Feature map: `.cursor/rules/feature-map.mdc`
- Skills: `.cursor/skills/`
