# Proposal: Release 1.0.3 — PWA Mobile-First

> **Status**: retroactive proposal. Closes dangling forward refs from `openspec/changes/release-1-0-1/roadmap.md` (lines 92–93) to `release-1-0-3-pwa/proposal.md` and `tasks.md`.

## Intent

Per `openspec/changes/release-1-0-1/roadmap.md` (27/07 strategy pivot): users run Orvel from their phones; verticals without mobile-first ship as half-products. PWA is "the circulatory system"; verticals are leaves.

Locked rationale (roadmap §"Decisión mobile", 27/07): no migration script exists that takes Angular/Astro + Supabase to native mobile. Capacitor is rejected as webapp-wrap, not native. Native (RN/Flutter) is only acceptable if PWA validates traction and a concrete limitation surfaces. So: PWA-first with limited scope.

This proposal stands on the roadmap's shoulders. It does not re-litigate the mobile decision or the PWA scope split.

## Scope

### 2.1 Already Shipped — DO NOT RE-DESIGN

> `[ALREADY SHIPPED — DO NOT RE-DESIGN]` Evidence: commit `c1127a0` on `main` ("feat(dashboard): PWA mobile-first Fase 1+2", PR #180, merged 2026-07-27).

- **Tailwind build pipeline**: `tailwindcss@3` + `postcss` + `autoprefixer`; `apps/dashboard/tailwind.config.js` (Orvel dark/violet palette), `apps/dashboard/postcss.config.js`, `apps/dashboard/src/styles.css` with `@tailwind base/components/utilities`; CDN removed from `index.html`.
- **PWA artifacts**: `@angular/service-worker@^21.2.18` registered via `app.config.ts`; `apps/dashboard/src/manifest.webmanifest` (name `Orvel`, start_url `/dashboard/turnos`, scope `/dashboard/`, display `standalone`, maskable icon); `apps/dashboard/src/ngsw-config.json` (assetGroups `app` + `assets`); placeholder icons at `apps/dashboard/src/icons/icon-{192,512}x512.png`.
- **iOS meta tags** in `index.html`: `apple-mobile-web-app-capable`, `black-translucent` status bar, `apple-touch-icon`, `viewport-fit=cover`, `theme-color`.
- **Mobile bottom nav**: `apps/dashboard/src/app/core/shell/mobile-bottom-nav/mobile-bottom-nav.component.ts` — 5 items (Inicio / Turnos / Clientes / Notificaciones / Perfil), `lg:hidden`, `safe-area-inset-bottom`, per-item test-ids, Remix icons.
- **Dashboard shell integration**: FAB activated (mobile-only, `lg:hidden`), `pb-16` on mobile to clear the nav, `navigateToNewTurno()` routes to `/dashboard/turnos/new`.
- **Stub pages**: `apps/dashboard/src/app/features/notificaciones/pages/notificaciones.page.ts` and `apps/dashboard/src/app/features/perfil/pages/perfil.page.ts` so the bottom-nav routes resolve end-to-end.
- **Contract tests shipped with PR #180**:
  - `apps/dashboard/src/app/tests/integration/pwa-manifest.contract.spec.ts` — manifest, ngsw-config, iOS meta tag assertions.
  - `apps/dashboard/src/app/tests/integration/mobile-shell.contract.spec.ts` — FAB activation, lg-hidden visibility, route additions, bottom-nav render.
  - `apps/dashboard/src/app/tests/integration/tailwind-migration.contract.spec.ts` — Tailwind v3 build pipeline.
  - `apps/dashboard/src/app/core/shell/mobile-bottom-nav/mobile-bottom-nav.component.spec.ts` — nav items, routes, icons, lg-hidden, safe-area class, test-ids.

Locked follow-on (per roadmap, not re-verified in this session): viewport gating and `tel:` action on turno detail. **TBD — to be confirmed in spec phase against current `main`.**

### 2.2 Pending — Forward Scope

**Fase 3 — Offline walk-in queue**
- IndexedDB persistence layer for walk-in intents.
- Queue UI screen ("Cola offline (N)") with per-row status + retry.
- Auto-flush on `online` event (Chrome / Android).
- Manual "Enviar ahora" button for iOS Safari (Background Sync API unsupported — known since roadmap PR #180).
- Conflict handling vs Supabase: slot uniqueness + idempotency key.
- Bounded backoff retry with attempt cap.

**Fase 4 — Mobile verification**
- Playwright device profiles (iPhone, Android) for dashboard e2e (root `playwright.config.ts` is currently chromium-only).
- Lighthouse CI gate (PWA category + perf budget).
- New `.contract.spec.ts` + `.red.contract.spec.ts` for PWA behaviors (manifest, service worker, offline queue) — RED-first per strict TDD.

## Approach

- **Locked stack** (roadmap): `@angular/pwa` + service worker + IndexedDB queue. Web Push deferred.
- **No Workbox directly.** `@angular/service-worker` already wraps assetGroups via `ngsw-config.json`; layering Workbox risks double service-worker registration.
- **IndexedDB wrapper**: thin wrapper over `idb` (or Angular-idiomatic `StorageService` pattern). **TBD — to be resolved in spec phase.** Rejected alternatives:
  - `localStorage` — sync API, 5–10 MB cap, leaks to HTTP layer.
  - Cookies — wrong semantics, CSRF surface.
- **Contract-test surface**: source-level assertions for static contracts (pattern proven in `pwa-manifest.contract.spec.ts` and `is-mobile.contract.spec.ts`); runtime integration via Playwright mobile profiles.
- **`packages/shared` extraction**: if Fase 3 needs shared types, propose extracting them in spec phase. Per `sdd-init/orvel`, the package currently holds `.gitkeep` only — do NOT inline duplicate types inside dashboard.

## Out of Scope (Desktop-Only)

Per roadmap §"Scope desktop-only", these stay desktop-only even after 1.0.3 ships:

- Service and schedule configuration.
- Branding.
- Mercado Pago integration.
- Reports.
- Buffer / defaults configuration (`business_settings` knobs from 1.0.2).

## Capabilities

### New

- `pwa-offline-walkin-queue`: IndexedDB persistence + queue UI + auto/manual flush + conflict handling vs Supabase.
- `pwa-mobile-verification`: Playwright device profiles + Lighthouse CI gate + additional PWA contract tests.

### Modified

- **None.** Fase 1+2 already shipped and is documented retroactively in §2.1. This change extends the PWA surface without modifying spec-level behavior of existing capabilities.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/dashboard/src/app/core/offline/` | New | IndexedDB persistence layer + queue service |
| `apps/dashboard/src/app/features/turnos/queue/` | New | Queue UI screen + iOS "Enviar ahora" button |
| `apps/dashboard/playwright.config.ts` | Modified | Add iPhone + Android device profiles |
| `.github/workflows/` | New | Lighthouse CI job + Playwright mobile job |
| `apps/dashboard/src/app/tests/**/*.{contract,red.contract}.spec.ts` | New | PWA behavior contracts (manifest, SW, offline queue) |
| `packages/shared/offline-queue/` | New (if needed) | Extracted IndexedDB types + queue payload contracts |
| `openspec/changes/release-1-0-1/roadmap.md` | Modified | Forward refs to `release-1-0-3-pwa/proposal.md` now resolve |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| iOS Safari: Background Sync API absent | High | Already known (roadmap PR #180); manual "Enviar ahora" is the design response |
| IndexedDB quota / storage eviction under pressure | Med | Cap retry attempts; surface eviction as toast; spec phase defines eviction policy |
| Multi-device conflict (operator phone + tablet, same walk-in created twice offline) | Med | Idempotency key derived from `(deviceId, intentLocalId)`; Supabase rejects duplicates |
| Offline → online race: slot booked by another operator while we were offline | Med | Mark `synced` with visible server-side error; UI offers manual draft reconciliation — see Open Q2 |
| Strict TDD enabled — Fase 3+4 cannot ship without RED tests first | Certain | `sdd-spec` writes red specs; `sdd-verify` gates on green before archive |
| `packages/shared` empty — Fase 3 shared types risk duplication if extracted carelessly | Med | Spec phase proposes `packages/shared/offline-queue/` placement; contract tests pin the surface |
| Supabase ref `tzqgwziyiospmvpdgbnt` is roadmap-recorded only — `environments.md` confirms no refs verified | Med | Any contract test needing a live DB documents the unverified access as a risk; do not assume DB reachable |
| 3-branch promotion (`dev → qa → main`); `dashboard-booking-regressions` is the required check on protected branches | Certain | Fase 4 PRs run the mobile profile job on `dev` first; never skip directly to `qa` or `main` |
| Lighthouse CI score variance across runs | Med | Pin Lighthouse version; use median of N runs; document threshold as advisory until locked — Open Q4 |

## Decisions Already Locked (Cite, Do Not Reopen)

Per roadmap §"PWA decisions cerradas (PR #180)" — six bullets, reproduced verbatim:

1. Approach: `@angular/pwa` + Web Push deferred + IndexedDB offline queue.
2. Bottom nav bar (5 items: Inicio / Turnos / Clientes / Notificaciones / Perfil).
3. `start_url` = `/dashboard/turnos` (agenda directo).
4. NO push notifications in MVP (release siguiente con Web Push API + VAPID).
5. Tailwind migrated from CDN to build local (obligatorio para offline real).
6. iOS Background Sync no soportado → walk-in offline necesita botón "Enviar ahora" manual.

**All six bullets are decided, out of scope for this proposal to re-litigate.**

## Rollback Plan

- **Fase 3**: gate the entire offline-queue path behind a feature flag `pwa.offlineQueue.enabled`. Rollback = flip the flag in app config; no schema change required. IndexedDB schema migrations are forward-only, but the read path is feature-flag-gated, so no data corruption on rollback.
- **Fase 4**: additive CI jobs only. Rollback = remove the Lighthouse CI workflow file and the Playwright mobile projects; existing `dashboard-booking-regressions` stays green.
- **Docs-only**: `openspec/changes/release-1-0-1/roadmap.md` forward refs that this proposal lands are harmless to undo (just revert the proposal.md file).

## Dependencies

- **Internal**: PR #180 (`c1127a0`) merged on `main`. Fase 3 branch new from `c1127a0` per roadmap §"Próximos pasos". Locked `dashboard-booking-regressions` CI check must remain green.
- **External**: Playwright `@1.61` already at root (chromium-only currently). Lighthouse CI requires `@lhci/cli` — **TBD — root `package.json` decision pending**.
- **Supabase**: production ref `tzqgwziyiospmvpdgbnt` is roadmap-recorded only. `infra/context/environments.md` states no project refs verified. Contract tests that need a real DB must wait until access is verified by Santi.

## Success Criteria

- [ ] Fase 3: RED→GREEN→REFACTOR complete; IndexedDB queue + UI + iOS manual button verified on real device or BrowserStack.
- [ ] Fase 3: offline → online auto-flush verified; conflict scenarios covered by `.contract.spec.ts` and `.red.contract.spec.ts`.
- [ ] Fase 4: Playwright iPhone/Android profiles green in CI; Lighthouse PWA category ≥ agreed threshold (Open Q4).
- [ ] Strict TDD gate respected: no implementation merged without RED tests first.
- [ ] No desktop-only feature accidentally leaks into PWA scope.
- [ ] `openspec/changes/release-1-0-1/roadmap.md` forward refs to `release-1-0-3-pwa/proposal.md` and `tasks.md` resolve.

## Open Questions for the User

1. **Offline queue scope**: buffer only walk-in creations, or also manual status changes ("no vino") and cliente-side edits?
2. **Collision policy**: when a synced walk-in collides with a slot already booked by another operator, keep as local `draft` for manual resolution, or drop with an error toast?
3. **Queue visibility**: per-device only, or expose to a manager role for cross-device reconciliation?
4. **Lighthouse PWA score**: what's the blocking threshold for release (≥ 90? ≥ 95?)? Blocking or advisory?
5. **CI gating**: after Fase 4 ships, treat Playwright mobile runs as a required check on `main` (same pattern as `dashboard-booking-regressions`), or advisory-only?
