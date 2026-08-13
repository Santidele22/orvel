# pwa-mobile-verification Specification

## Purpose

Defines mobile verification for Fase 4 (proposal §2.2): Lighthouse CI PWA gate per Q4 (≥90, blocking) and Playwright mobile CI per Q5 (required check on `main`, matching `dashboard-booking-regressions` pattern).

## Requirements

### REQ-MV-1: Lighthouse CI Gate

A Lighthouse CI job MUST run on every PR to `main`. It MUST report the PWA category score. CI MUST block the PR when PWA < 90. Performance, accessibility, SEO, and best-practices scores MUST be reported but MUST NOT block per Q4.

### REQ-MV-2: Lighthouse Version Pinning

`@lhci/cli` version MUST be pinned. Baseline scores for all five Lighthouse categories MUST be recorded in the CI workflow for future regression detection.

### REQ-MV-3: Playwright Mobile Device Profiles

`playwright.config.ts` MUST add iPhone 13 and Pixel 5 projects using `devices['iPhone 13']` and `devices['Pixel 5']`. These MUST run as a required CI check on `main` (Q5), matching the `dashboard-booking-regressions` pattern. MUST NOT be advisory or dev-only.

### REQ-MV-4: PWA Contract Tests

New contract tests MUST assert: (a) manifest validity — name, icons, `start_url`, `display`, `theme_color`; (b) service worker registration on first load; (c) offline shell renderable when SW intercepts. MUST follow existing vitest + `readFile` + `expect` pattern in `apps/dashboard/src/app/tests/integration/`.

### REQ-MV-5: RED Specs First

Per strict TDD (`openspec/config.yaml` §strict_tdd: true), contract tests in REQ-MV-4 MUST be authored RED (failing) before implementation. MUST use `.red.contract.spec.ts` naming to signal expected failure until feature code exists.

## Scenarios

#### Scenario: Lighthouse blocks PR below PWA threshold

- GIVEN a PR to `main`
- WHEN Lighthouse CI runs and PWA score is 85
- THEN CI fails and PR is blocked
- AND performance, a11y, SEO, best-practices are reported but do not block

#### Scenario: Lighthouse passes PR at threshold

- GIVEN a PR to `main`
- WHEN Lighthouse CI runs and PWA score is 92
- THEN CI passes and all five category scores are reported

#### Scenario: Playwright mobile profiles run as required CI check

- GIVEN a PR to `main`
- WHEN the Playwright mobile job runs with iPhone 13 and Pixel 5
- THEN dashboard e2e tests execute on both device profiles
- AND the check is required, matching `dashboard-booking-regressions`

#### Scenario: Offline shell renders from SW cache

- GIVEN dashboard previously loaded, service worker active
- WHEN operator navigates to `/dashboard/turnos` while offline
- THEN cached shell renders (nav, FAB, bottom nav) without network error

## Out of Scope

- Native mobile builds (RN/Flutter) — per proposal §Intent, PWA-first only.
- Capacitor wrappers — rejected per roadmap.
- Fase 3 offline queue testing — covered by `pwa-offline-walkin-queue` spec.

## Acceptance Criteria

- [ ] Lighthouse CI on PRs to `main`: PWA ≥ 90 required, other scores advisory.
- [ ] `@lhci/cli` version pinned; baseline scores in workflow file.
- [ ] `playwright.config.ts` includes iPhone 13 and Pixel 5 projects.
- [ ] Mobile profiles run as required CI check on `main`.
- [ ] `.red.contract.spec.ts` files exist and fail before implementation.
- [ ] Manifest contract validates name, icons, start_url, display, theme_color.
- [ ] SW registration contract confirms registration after first load.
- [ ] Offline shell contract confirms cached shell renders without network.
