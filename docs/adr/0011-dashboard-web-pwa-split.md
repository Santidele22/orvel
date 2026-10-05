# ADR 0011: Split the dashboard into web and pwa targets on a shared core

Split `apps/dashboard` into two execution targets — `web` (the desktop operator console) and `pwa` (the mobile installable product) — over a shared, platform-agnostic core, executed as a strangler rather than a rewrite.

- **Status**: Accepted (2026-10-02). Santi accepted option A on 2026-10-02, which is the gate this ADR set for Fase 1 to start moving code. Option B stays available as the transitional step of the shell inside steps 2-3, not as the destination. This ADR was the Fase 0 deliverable of [#1098](https://github.com/Santidele22/orvel/issues/1098).
- **Supersedes**: nothing. Complements [ADR 0010](0010-hexagonal-architecture.md) (ports and adapters, booking pilot) and issues [#1076](https://github.com/Santidele22/orvel/issues/1076) (internal decoupling) and [#1077](https://github.com/Santidele22/orvel/issues/1077) (native target).

## Context

`apps/dashboard` is **one** Angular application (`salon-de-belleza` in `angular.json`) that today serves three different things: the public turnero, the operator console and the installable shell. The product context is explicit that these are different products:

> The customer-facing product is a mobile-first PWA (`@angular/pwa`) so people can book and manage turnos from a phone without an app-store install. The operator dashboard is an explicit desktop-only carve-out.
> — `infra/context/product.md:3`, see also `:36-38`

Measured state at the time of writing (method in the issue):

| Fact | Value |
|---|---|
| Angular projects | 1 |
| Production `.ts` files / lines | 163 / 22 750 |
| PWA artifacts in the same build | `manifest.webmanifest`, `ngsw-config.json`, `orvel-push-sw.js`, `serviceWorker` in `angular.json`, route `dashboard/installar`, features `pwa-install`, `pwa-in-app-update`, `operator-web-push` |
| Platform detection | 3 mechanisms: `core/shell/is-mobile/is-mobile.ts`, the tour's own `matchMedia` (`operator-tour.service.ts:130-136`, breakpoints in `operator-tour-steps.ts:170-172`) and `pwa-install/pwa-display.ts:8-21`. `isMobile` appears in 7 production files, `matchMedia` in 6, `userAgent` in 3 |
| Platform gating in templates | `lg:hidden` 3 files, `hidden lg:` 4, `md:hidden` 1, `min-width: 1024` 2 |
| Bundle budgets | one set (`initial` 2 MB warn) for all three surfaces |
| Deploy and origin | one combined deployment serves landing + `/dashboard/*` + `/booking/*` on the same origin, with the same session storage key (`scripts/vercel-output-config.mjs:1-2`, `packages/config/src/supabase-storage-key.ts:1`) |

Two corrections to working assumptions, so nobody builds for a PWA that does not exist:

- **There is no offline data layer.** `ngsw-config.json` declares only `assetGroups` (`app`, `app-lazy`, `assets`) and **no `dataGroup`**; there is no `indexedDB`, `idb-*` or `workbox` in production. The offline queue from Fase 3-4 of the archived `2026-08-12-release-1-0-3-pwa` change was never implemented. Today "PWA" means installable + precached shell + web push + in-app update banner.
- **The seam is not "mobile vs desktop" by role.** There are mobile *operator* surfaces (the agenda, the turno detail, the walk-in flow) and mobile *public* surfaces. The cut is by **execution target**, not by who uses it.

## Decision

Adopt **two targets over one shared core**, in this order:

1. extract the platform-agnostic core (`core/runtime`, `core/api`, `core/auth`, `core/time`, `core/storage`, `core/business`) behind ports and packages, **without changing runtime behaviour**;
2. introduce a single platform port and classify routes by target;
3. create the second application (`apps/dashboard-web`) consuming that core;
4. move PWA-only concerns (service worker, manifest, install, update banner, web push) into the pwa app;
5. give web its own origin and session storage key.

Creating the second app **before** step 1 is explicitly rejected: it would produce two copies of the same coupling.

## Targets

| | **pwa** | **web** |
|---|---|---|
| Surfaces | public turnero (`booking/*`), install guidance, and the mobile operator surfaces | the desktop console: catalogue, clients, settings, notifications, profile, subscription |
| Shared by both | auth pages, payment returns, the shell entry, the mobile-first operator loop | — |
| Needs service worker | yes | **no** |
| Needs manifest / install / update banner | yes | **no** |
| Needs operator web push | yes | no |
| Own bundle budget | yes | yes |

The classification is **data, not prose**: `apps/dashboard/src/app/core/platform/dashboard-targets.ts` holds it and `dashboard-targets.contract.spec.ts` walks the real router table (including lazy children and the two shell mounts) and fails when a route is unclassified. There is deliberately no `dashboard/**` catch-all, so a new route forces the decision.

> **Amendment (2026-10-05, Fase 3 corte 2).** The core behind step 1 now lives in `packages/dashboard-core` (`@orvel/dashboard-core`), so the classification data is at `packages/dashboard-core/src/platform/dashboard-targets.ts` and its contract spec — which tests the *app's* router table — moved to `apps/dashboard/src/app/tests/unit/dashboard-targets.contract.spec.ts`. The decision itself is unchanged; the rest of this ADR is revisited when Fase 3 lands, as its Follow-ups say.

## Consequences

- The web build stops shipping PWA machinery, and each target gets its own budget.
- Step 5 closes **S2** of `docs/audits/2026-09-28-dashboard-audit.md` (landing and dashboard sharing an origin and an auth storage key): `dashboard.orvel.pro` is already in the handoff allowlist (`supabase/functions/_shared/session-handoff-cors.ts:16`).
- The extracted core becomes the third consumer's substrate, which is what [#1077](https://github.com/Santidele22/orvel/issues/1077) needs for the native target.
- Cost accepted: two builds, two deploys and two shells to keep in step. Both targets promote together through `dev → qa → main`; no target skips a stage.
- Existing PWA installs must survive: any shell change needs service-worker cache-busting, verified by an install/update smoke test.

## Alternatives considered

| Option | Why not (now) |
|---|---|
| One app, two entry points behind a build flag (`--configuration=web\|pwa` + `fileReplacements`) | Cheaper, and a reasonable **transitional** step for the shell, but the service worker, the PWA features and the platform checks stay entangled, and a second origin still needs a second deploy. Kept as the intermediate move inside step 2-3 rather than as the destination. |
| Only internal libraries, one app | This is [#1076](https://github.com/Santidele22/orvel/issues/1076). It improves the code but never creates the target seam. |
| Microfrontends / runtime federation | No problem in this repository is caused by deploy independence, and the cost (shared dependencies, duplicated Angular runtime, routing complexity) is real. Rejected. |

## Follow-ups

- Fases 1-4 are specified with acceptance criteria in [#1098](https://github.com/Santidele22/orvel/issues/1098).
- Revisit this ADR when Fase 3 lands: the recommendation to keep one workspace with two apps should be re-checked against the measured cost of two builds.
