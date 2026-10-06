# ADR 0012: One origin per artifact — landing, pwa and web on separate hosts

Decide **where each of the three products is served** and what session each one may keep. [ADR 0011](0011-dashboard-web-pwa-split.md) split the code into two targets over a shared core and left its step 5 open ("give web its own origin and session storage key"); [#1121](https://github.com/Santidele22/orvel/issues/1121) put the public turnero and the installable PWA into the same question. This ADR answers it for all three surfaces at once.

- **Status**: Accepted (2026-10-06). Santi chose the three-origin scheme over the two-origin alternative; the derived rules below (per-target session keys, the `/booking/*` redirect policy, the deploy shape) ship with it. This is the Parte 0 deliverable of [#1121](https://github.com/Santidele22/orvel/issues/1121) and settles the origin half of Fase 4 of [#1098](https://github.com/Santidele22/orvel/issues/1098).
- **Supersedes**: nothing. Complements [ADR 0011](0011-dashboard-web-pwa-split.md) (web/pwa code split), [#1076](https://github.com/Santidele22/orvel/issues/1076) (internal decoupling) and [#1077](https://github.com/Santidele22/orvel/issues/1077) (native target).

## Context

### One deployment serves three products today

| Fact | Source |
|---|---|
| One Vercel project serves the landing, the console and the turnero | `scripts/vercel-output-config.mjs:1-2` — both `/dashboard/*` and `/booking/*` resolve to `/dashboard/index.html` |
| The landing "hosts" the app only because the deploy copies the app's dist into its output | `scripts/build-vercel.mjs:15,120-122` → `landingOutputDir/static/dashboard` |
| The app is built into the landing's path space | `scripts/build-vercel.mjs:110` (`--base-href / --deploy-url /dashboard/`) |
| Landing and app share one auth storage key | `packages/config/src/supabase-storage-key.ts:1`, consumed at `packages/dashboard-core/src/auth/supabase-config.ts:52` |
| The public booking link is canonicalised to the landing origin | `packages/booking/src/domain/public-booking-url.ts:1` — `CANONICAL_PUBLIC_BOOKING_ORIGIN = 'https://orvel.pro'` |
| The social preview is an Astro edge rewrite on the landing origin | `scripts/vercel-output-config.mjs:4` → `/booking-share`, implemented in `apps/landing/src/edge/booking-share.ts` |
| The console is already a separate artifact with no PWA machinery | `apps/dashboard-web` (Fase 3 of #1098), enforced by `scripts/check-dashboard-web-pwa-artifacts.mjs` |

The measured consequence is audit finding **S2**: an XSS anywhere on the landing origin can read the app's refresh token, because both live on the same origin under the same key. Fixing the landing side alone (PR #1124) removes the landing's own copy; it cannot remove the app's copy while the app is served from the landing's origin.

### The two halves of the move have very different costs

**Moving the console is cheap.** `apps/dashboard-web` has no installed base, no service worker, no manifest and no push, and `dashboard.orvel.pro` is already in the production handoff allowlist (`supabase/functions/_shared/session-handoff-cors.ts:13`). It needs a deploy, a hostname, its own headers and its own storage key.

**Moving the PWA is expensive, because everything durable about it is bound to the origin:**

- the manifest declares `start_url: /dashboard/turnos` and `scope: /dashboard/` (`apps/dashboard/src/manifest.webmanifest:7-8`);
- the service worker is registered by path with a scope on the same origin (`apps/dashboard/src/app/app.config.ts:22`);
- a push subscription is created per origin (`pushManager.subscribe` + VAPID) and does not migrate;
- an already-installed client is not rescued by a redirect: its cached shell keeps pointing at the old origin.

## Decision

**Three origins, one per build artifact.**

| | `orvel.pro` | `app.orvel.pro` | `dashboard.orvel.pro` |
|---|---|---|---|
| Artifact | `apps/landing` (Astro) | `apps/dashboard` (pwa) | `apps/dashboard-web` (web) |
| Serves | marketing, signup/login entry, the social preview | public turnero, mobile operator surfaces, install/update, web push | desktop console: catalogue, clients, settings, billing |
| Service worker / manifest | no | yes | no |
| Durable session | **none** | its own key | its own key |

Rules that come with the decision:

1. **One session key per target, owned by the target.** `packages/config` stops exporting a single shared constant; each target resolves its own key and nothing imports another target's. The landing resolves none — a non-credential presence hint (PR #1124) is all it keeps.
2. **Public booking links point at the app.** The canonical public URL becomes `app.orvel.pro/booking/<slug>` and `orvel.pro/booking/*` answers **301 permanent**, so links already shared keep working. The social preview rewrite (`/booking-share`) moves with the turnero, because a crawler must read the OG tags at the URL it actually lands on; a redirect to an origin that has none breaks the preview.
3. **One artifact per deploy, over the paths each app already owns.** The landing's output stops containing `static/dashboard`; the pwa moves **origin only** and keeps serving `/dashboard/*` and `/booking/*`; the console is a standalone SPA at the root of its own origin. `DASHBOARD_SPA_REWRITE` and `BOOKING_SPA_REWRITE` disappear because no artifact is served from inside another's path space, not because the pwa's paths change.
4. **Promotion moves all three artifacts together** through `dev → qa → main`; no target skips a stage.
5. **No target shares an origin with another target**, in any environment.

> **Amendment (2026-10-06): the pwa keeps its path prefix.** This ADR originally said the app would be "built for its own root instead of `/dashboard/`", which was an assumption and not a requirement of the split. Measured cost of dropping the prefix: 19 production files reference `/dashboard/`, 26 `routerLink="/dashboard/…"` are absolute in templates, and `index.html`, `manifest.webmanifest`, `ngsw-config.json` and the service-worker registration (`apps/dashboard/src/app/app.config.ts:22`) all hardcode it. The manifest declares `start_url: /dashboard/turnos` and `scope: /dashboard/`, so keeping the prefix also keeps the install and the service-worker scope **identical** — installed clients differ only by origin, which is the migration that step 2 measures. Serving the pwa from its own root is therefore an independent, optional refactor with no requirement behind it; `app.orvel.pro/turnos` is prettier than `app.orvel.pro/dashboard/turnos`, and that is the whole of its value. Revisit only if the prefix starts costing something.

## Sequencing

Each step is its own PR-sized change with its own acceptance criteria.

**Step 0 — the landing keeps no credential.** Done in PR #1124: the write-only token store is gone and the Supabase session is replaced by a non-credential hint.

**Step 1 — the console gets its own origin and key** (Fase 4 of #1098). The cheap slice, with no installed base at risk.
Acceptance: the console serves from its own host; its storage key differs from the pwa target's and a contract proves it; the landing → console handoff still completes in qa and production; CSP, HSTS and the rest of the headers apply to the new origin; the landing no longer resolves any target's key.

**Step 2 — measure the PWA park before touching it** (Parte 1 of #1121). Live installs, active push subscriptions and booking links in circulation.
Acceptance: the numbers are recorded on the issue. Without them the migration below is designed blind and its two main risks cannot be sized.

**Step 3 — turnero and PWA move to the app origin** (Partes 2-3 of #1121).
Acceptance: a booking link shared *before* the move still reaches the booking (e2e); the OG preview still renders; `orvel.pro/booking/*` answers 301; clients installed from the old origin keep being served and are shown a reinstall notice; push is re-subscribed and the operator is told why.

**Step 4 — retire the combined deploy.** Acceptance: no build copies one app into another's output; no rewrite resolves a path to a foreign artifact; the shared-key constant is gone.

## Alternatives considered

| Option | Why not |
|---|---|
| **Two origins** (`orvel.pro` landing · `app.orvel.pro` product) | Closes S2 too and costs one deploy less, but it puts the authenticated console on the same origin as a service worker with interception power over its scope, and the two artifacts are already separate builds, so merging them onto one origin is an artificial mapping. This trades a real isolation property for one deploy. |
| Stay on the combined deploy and harden in place | Never closes S2 (same origin, same key), keeps every landing release coupled to a dashboard build, and keeps `/booking/*` and `/dashboard/*` inside the marketing artifact's path space. |
| Move only the console, leave the turnero on the landing | Leaves the surface whose links are shared in public as product code inside the marketing artifact, and keeps the app's build coupled to the landing's. |

## Consequences

- **S2 closes in two steps**: after step 1 no authenticated console shares an origin with the landing; after step 3 neither does the PWA. The audit's S2 row closes when both land.
- The landing stops containing product code and stops being a deploy dependency of the app — today a booking fix cannot ship without a green landing build.
- Three deploys, three hostnames, three CSP/header sets to keep in step, and a promotion that carries all three artifacts in the same cycle.
- The pwa keeps its `/dashboard/*` and `/booking/*` paths, so the service-worker scope, the manifest and every internal link survive the move unchanged; the only thing installed clients lose is the origin (see the amendment above).
- Cost accepted: the PWA move is a one-way door for installed clients, so it depends on the measurements of step 2 and the dual-serving of step 3.

## Risks

| Risk | Mitigation |
|---|---|
| Installed PWA clients stranded on the old origin | Measure first (step 2); dual-serve the old origin during the transition; explicit reinstall notice |
| Push lost until the operator re-subscribes (the subscription is per origin and cannot migrate) | Step 2 counts active subscriptions so the blast radius is known; explicit notice at the new origin |
| Shared booking links break, which loses bookings | 301 permanent from `orvel.pro/booking/*` plus an e2e with a link captured before the move |
| Social preview breaks because a redirect lands on an origin without OG tags | Move `/booking-share` with the turnero and e2e the preview |
| Environments drift (dev/qa/main) | One promotion cycle carries all three artifacts; the migration drift guard stays in force |
| The console moves before its key is parameterised and keeps sharing one by accident | Step 1 ships the per-target key with a contract test |

## Hostnames per environment

Santi confirmed the convention on 2026-10-06. It is symmetric across environments: a target keeps its name and only the suffix changes.

| Environment | Landing | PWA | Console |
|---|---|---|---|
| production (`main`) | `orvel.pro` (+ `www`) | `app.orvel.pro` | `dashboard.orvel.pro` |
| qa | `qa.orvel.pro` | `app.qa.orvel.pro` | `dashboard.qa.orvel.pro` |
| local | `127.0.0.1:4321` (Astro) | `127.0.0.1:3000` (proxy) | `127.0.0.1:4300` |

`dev` has no deployed hostnames to reserve: `deploy-promotion.yml` runs only on pushes to `qa` and `main`. The env hook for the handoff allowlist is `SESSION_HANDOFF_ALLOWED_ORIGINS` (`supabase/functions/_shared/session-handoff-cors.ts:25`); the built-in production defaults list `orvel.pro`, `www.orvel.pro` and `dashboard.orvel.pro`, so `app.orvel.pro` and both qa product origins must be added there or through that variable.

## Open questions (deliberately not decided here)

- Whether `www.orvel.pro` keeps redirecting to `orvel.pro`. This ADR does not change it.
- How the console gets its own Vercel project and secrets: `VERCEL_PROJECT_ID` is a single value today, and the deploy lets Vercel run the build (`vercel deploy` without `--prebuilt`), so the second project needs its own build command and its own project env.

## Follow-ups

- Step 1 is Fase 4 of [#1098](https://github.com/Santidele22/orvel/issues/1098); steps 2-4 are Partes 1-4 of [#1121](https://github.com/Santidele22/orvel/issues/1121).
- ADR 0011's transitional alias (16 relative specifiers in `apps/dashboard-web`) shrinks independently of this ADR.
