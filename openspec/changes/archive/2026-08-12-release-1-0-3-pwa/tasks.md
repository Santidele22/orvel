# Tasks: Release 1.0.3 — PWA Mobile-First (Fase 3 + Fase 4)

Retroactive for Fase 1+2 (shipped, PR #180/`c1127a0`). Forward scope: Fase 3 offline walk-in queue + Fase 4 mobile verification. Strict TDD: every RED `.red.contract.spec.ts` lands before its GREEN.

## 1. Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR #1 ~350 · PR #2 ~250 · PR #3 ~200 (total ~800) |
| 400-line budget risk | Low per PR (all ≤ 350) |
| Chained PRs recommended | Yes |
| Suggested split | PR #1 (queue storage) → PR #2 (flush + UI) → PR #3 (mobile verification) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending (user decision; see below) |

```text
Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: Low
```

**Chain strategy request (ask-on-risk)**: 3 PRs force-chained PR #1 → PR #2 → PR #3. Recommended: `feature-branch-chain` — tracker branch `release-1-0-3-pwa` accumulates; PR #1 base = tracker branch, PR #2 base = PR #1 branch, PR #3 base = PR #2 branch; tracker PRs to `dev` (3-branch promotion, never direct to `main`). Orchestrator asks Santi before apply.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | IDB storage + queue services + idempotent RPC | PR #1 | `pnpm --dir apps/dashboard exec vitest run src/app/tests/unit/walkin-queue-storage.red.contract.spec.ts src/app/tests/unit/walkin-queue-service.contract.spec.ts` + `node --test supabase/checks/20260807000000_walkin_intent_idempotency.contract.test.mjs` | N/A — contract/unit only; RPC overload verified by regex contract, no live DB (Supabase ref `tzqgwziyiospmvpdgbnt` unverified) | Revert migration (10-arg overload preserved, additive) + revert `apps/dashboard/src/app/core/offline/` |
| 2 | Auto/manual flush + collision + queue UI | PR #2 | `pnpm --dir apps/dashboard exec vitest run src/app/tests/unit/walkin-queue-flush.red.contract.spec.ts src/app/tests/unit/walkin-queue-ui.red.contract.spec.ts` | Real: Chrome DevTools offline toggle on `/dashboard/turnos`, online event auto-flush; iOS Safari "Enviar ahora" (or Playwright `setOffline(true)`) | Revert `apps/dashboard/src/app/features/turnos/queue/` + flush service; no UI = feature off |
| 3 | Playwright mobile + Lighthouse gate | PR #3 | `pnpm exec playwright test --project="iPhone 13" --project="Pixel 5"` + `pnpm --dir apps/dashboard exec vitest run src/app/tests/integration/pwa-mobile-offline-shell.red.contract.spec.ts` | Local `npx @lhci/cli@0.13.0 collect` dry run against `http://127.0.0.1:4200/dashboard` to record baseline | Delete `.github/workflows/dashboard-mobile-regressions.yml` + revert `playwright.config.ts` + baseline JSON (additive only) |

## 2. PR #1 — Fase 3 part 1: Storage + Services (~350 lines)

Goal: idempotent RPC overload + IndexedDB persistence + queue service. Dependency: `main` ≥ `c1127a0`.

- [ ] 1.1 **RED** — `supabase/checks/20260807000000_walkin_intent_idempotency.contract.test.mjs`: regex-assert `walkin_intents` table (uuid PK, `business_id`, `appointment_id`, `status CHECK IN ('pending','processed')`, RLS disabled), 11-arg overload of `create_admin_manual_booking` with `p_intent_id uuid DEFAULT NULL`, idempotent branch returning existing `appointment_id`, GRANT to `authenticated, service_role`. Follows `20260724012000_booking_respects_knobs.contract.test.mjs` pattern.
- [ ] 1.1 **GREEN** — `supabase/migrations/20260807000000_walkin_intent_idempotency.sql`: table + overload per design.md §4. Copy existing 10-arg body verbatim; `ON CONFLICT (intent_id) DO NOTHING`. Commit: `feat(supabase): add walkin_intents ledger + create_admin_manual_booking intent overload`
- [ ] 1.2 **RED** — `apps/dashboard/src/app/tests/unit/walkin-queue-storage.red.contract.spec.ts`: IDB round-trip of full intent schema, keyPath `intentId`, indexes `status`/`createdAt`/`attempts`, forward-only `onupgradeneeded`, reload survival (REQ-OWQ-1), `storage.estimate() > 80%` warn, graceful `versionchange` close.
- [ ] 1.3 **GREEN** — `apps/dashboard/src/app/core/offline/walkin-queue-storage.ts`: raw IndexedDB wrapper, DB `orvel-walkin-queue` v1, store `intents` (D-2; no `idb` lib). Commit: `feat(dashboard): add WalkinQueueStorage IndexedDB wrapper`
- [ ] 1.4 **GREEN** — `apps/dashboard/src/app/core/offline/walkin-device-id.service.ts`: stable UUID in `localStorage`, no PII, never sent (REQ-OWQ-10). `apps/dashboard/src/app/core/offline/walkin-queue.service.ts`: public `enqueue`, `observeQueue`, `flushNow`; enqueue only while `navigator.onLine === false`, MUST NOT POST offline (REQ-OWQ-2); page-context only (REQ-OWQ-9). Commit: `feat(dashboard): add WalkinDeviceIdService and WalkinQueueService`
- [ ] 1.5 **GREEN** — `apps/dashboard/src/app/tests/unit/walkin-queue-service.contract.spec.ts` + storage integration specs: enqueue→`pending`+counter, observe emits by `createdAt`, reload persistence. Commit: `test(dashboard): green queue storage and service contracts`

## 3. PR #2 — Fase 3 part 2: Flush + Collision + UI (~250 lines)

Dependency: PR #1 merged.

- [ ] 2.1 **RED** — `apps/dashboard/src/app/tests/unit/walkin-queue-flush.red.contract.spec.ts`: online event iterates `pending` by `createdAt` → `syncing` → 2xx → `synced`; backoff 1s/4s/16s max 3 (REQ-OWQ-7); exhaustion → `failed`; 4xx → NOT retried.
- [ ] 2.2 **GREEN** — `apps/dashboard/src/app/core/offline/walkin-queue-flush.service.ts`: `online` listener + shared manual path; POST via `TurnoService.createAdminManualBooking(..., { intentId })` → passes `p_intent_id` (REQ-OWQ-5; RPC overload from PR #1). Commit: `feat(dashboard): add WalkinQueueFlushService with bounded backoff`
- [ ] 2.3 **RED** — collision scenario in `walkin-queue-flush.red.contract.spec.ts`: 4xx slot conflict → `failed`, toast text "Ese horario ya fue reservado. Cargalo de nuevo si todavía la clienta está.", counter decremented, MUST NOT retry/draft/modal (REQ-OWQ-6, Q2).
- [ ] 2.4 **GREEN** — collision handling in flush service + toast wiring via existing toast mechanism. Commit: `feat(dashboard): handle slot collision with drop and toast`
- [ ] 2.5 **RED** — manual flush scenario in `walkin-queue-flush.red.contract.spec.ts`: "Enviar ahora" executes the same shared flush path as `online` (REQ-OWQ-4); synced intents disappear.
- [ ] 2.6 **GREEN** — manual flush entry point exposed through `WalkinQueueService.flushNow`. Commit: `feat(dashboard): expose manual flush for iOS Enviar ahora`
- [ ] 2.7 **RED** — `apps/dashboard/src/app/tests/unit/walkin-queue-ui.red.contract.spec.ts` (Q-OWQ-UI-1): pill + "Enviar ahora" render on `/dashboard/turnos` with `data-testid="walkin-queue-pill"` when pending > 0; badge on `nav-turnos` bottom-nav item shows count; empty state hidden; failed list with retry (transient only); `lg:hidden` per mobile-first.
- [ ] 2.7 **GREEN** — `apps/dashboard/src/app/features/turnos/queue/walkin-queue.component.{ts,html,scss}` (pill + list + states; copy ES: empty "No hay turnos pendientes de envío.", failed + "Reintentar", button "Enviar ahora") + badge in `apps/dashboard/src/app/core/shell/mobile-bottom-nav/mobile-bottom-nav.component.ts` + TurnoFormPage integration. Commit: `feat(dashboard): add walkin queue UI pill with counter and nav badge`
- [ ] 2.8 **Verify** — full offline→online flow GREEN: offline submit → pill shows 1 → online → auto-flush → counter 0; collision → toast + drop. Commit: `test(dashboard): verify full offline-to-online walkin flow`

## 4. PR #3 — Fase 4: Mobile Verification (~200 lines)

Dependency: PR #2 merged.

- [ ] 3.1 **Record baseline** — one local dry run: `npx @lhci/cli@0.13.0 collect` against local dev build `http://127.0.0.1:4200/dashboard`; commit median scores (5 categories) to `apps/dashboard/lighthouse-baseline.json`. Pin `@lhci/cli@0.13.0` in `apps/dashboard/package.json` (Q-OWQ-LH-1). Commit: `chore(dashboard): record Lighthouse baseline and pin @lhci/cli@0.13.0`
- [ ] 3.2 **RED** — `apps/dashboard/src/app/tests/integration/pwa-mobile-offline-shell.red.contract.spec.ts`: manifest validity (name, icons, `start_url` `/dashboard/turnos`, `display` `standalone`, `theme_color`), SW registration on first load, offline shell renderable (REQ-MV-4a/b/c; vitest + `readFile` pattern per `turno-admin-manual-import.red.contract.spec.ts`).
- [ ] 3.3 **GREEN** — same file asserts against shipped Fase 1+2 artifacts; expected: no production code change (Fase 1+2 already satisfy). Commit: `test(dashboard): green PWA mobile offline shell contract`
- [ ] 3.4 **Config** — add `iPhone 13` and `Pixel 5` projects to root `playwright.config.ts` via `devices['iPhone 13']`/`devices['Pixel 5']`, keep chromium (REQ-MV-3). Commit: `chore: add iPhone 13 and Pixel 5 Playwright projects`
- [ ] 3.5 **RED** — `tests/e2e/walkin-offline.spec.ts` mobile: bottom-nav renders and navigates on iPhone/Pixel viewports; pill counter reflects offline enqueue (runs under both mobile projects).
- [ ] 3.6 **GREEN** — implement mobile e2e assertions. Commit: `test(e2e): mobile walkin offline navigation contract`
- [ ] 3.7 **Stub** — `.github/workflows/dashboard-mobile-regressions.yml` (Q-OWQ-CI-1; stub below). Jobs: `dashboard-mobile-regressions` (job name = required check for `main` protection) + `lighthouse-ci`. Commit: `ci: add dashboard-mobile-regressions workflow with Playwright mobile and Lighthouse gate`
- [ ] 3.8 **Verify** — confirm `dashboard-mobile-regressions` matches protected-branch required-check naming (same pattern as `dashboard-booking-regressions`); Lighthouse asserts `categories.pwa >= 0.90` (blocks, Q4), others advisory delta vs baseline.

```yaml
name: Dashboard mobile regressions
on:
  pull_request:
    branches: [main]
  push:
    branches: [main, qa]
permissions:
  contents: read
jobs:
  dashboard-mobile-regressions:
    name: Dashboard mobile regressions
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.0.8 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps
      - run: pnpm exec playwright test --project="iPhone 13" --project="Pixel 5"
  lighthouse-ci:
    name: Lighthouse PWA gate
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.0.8 }
      - uses: actions/setup-node@v4
        with: { node-version: 24, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build:dashboard
      - name: Lighthouse CI (PWA >= 0.90 blocks)
        uses: treosh/lighthouse-ci-action@v12
        with:
          urls: http://127.0.0.1:4200/dashboard
          runs: 3
          uploadArtifacts: true
          temporaryPublicStorage: false
          configPath: apps/dashboard/lhci-config.json
```

## 5. DoD per PR

- **PR #1**: migration contract check green; storage RED→GREEN; `WalkinQueueService` exposes `enqueue`/`observeQueue`/`flushNow`; all 10-arg RPC call sites untouched; 1.0.1+1.0.2 contract suite still green.
- **PR #2**: auto-flush on `online`; backoff 1/4/16 cap 3; collision → toast+drop (no modal/draft/retry); "Enviar ahora" shared path; pill+badge+states render per Q-OWQ-UI-1; e2e offline→online flow green.
- **PR #3**: baseline JSON committed; mobile projects in `playwright.config.ts`; RED contract green without prod changes; workflow stub committed; required-check name verified against branch protection; Lighthouse PWA ≥ 0.90 blocks, others advisory.

## 6. Rollback per PR

- **PR #1**: revert migration (additive overload — 10-arg signature preserved, zero downtime) + revert `apps/dashboard/src/app/core/offline/` + storage specs.
- **PR #2**: revert `features/turnos/queue/` + flush service + nav badge; no UI = offline path inert; IndexedDB forward-only migrations are safe.
- **PR #3**: delete `dashboard-mobile-regressions.yml` (workflow disable) + revert `playwright.config.ts` + baseline JSON; `dashboard-booking-regressions` unaffected.

## 7. Rules of Advance

- Strict TDD: every phase RED → GREEN → REFACTOR; no implementation without RED first (`openspec/config.yaml` §strict_tdd).
- Conventional commits only (`feat`/`chore`/`ci`/`test`); no Co-authored-by, no AI attribution.
- 400-line budget per PR (hard ceiling); any phase exceeding → stop and re-split before apply.
- Force-chained order: PR #1 → PR #2 → PR #3; never skip.
- The 41 contract tests from 1.0.1 + 1.0.2 must pass at every PR boundary (`pnpm run check` + `dashboard-booking-regressions` command set).
- 3-branch promotion: PRs land on `dev`; never direct to `qa`/`main`.
- No Supabase destructive commands; migration pushed via Supabase CLI only with credentials/context available.
