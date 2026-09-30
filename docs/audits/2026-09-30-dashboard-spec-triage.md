# Orvel dashboard spec triage — Fase 0.1 of #1076

**Date**: 2026-09-30
**Issue**: [#1076](https://github.com/Santidele22/orvel/issues/1076) — *Plan maestro: desacoplar y sanear apps/dashboard*, Fase 0, item 1: *"Decidir el destino de los ~150 specs obsoletos"*.
**Scope**: the `apps/dashboard` test tree — 296 spec files, 2045 tests. No production file is changed by this triage.
**Revision**: `dev` = `origin/dev` = `f091a73`; branch `docs/1076-spec-triage`.
**Method**: full `vitest run --reporter=json` of the dashboard suite (this document's baseline), per-file failure extraction, then read-only triage agents, one per spec family, each required to cite `path:line` evidence and forbidden from guessing. The first fan-out returned a 235 KB value that the tooling truncated mid-report; the surviving three batches were transcribed verbatim from that payload and the remaining eight were re-run with each agent writing its family's verdicts straight to a JSON file. Every verdict below therefore comes from an agent that saw its own batch's failure evidence. The load-bearing claims were re-verified by hand (§3.1, §3.2, §4).
**Companion evidence**: `docs/audits/2026-09-28-dashboard-audit.md` (§3.7 test quality, §6 priorities), `docs/audits/2026-09-28-dashboard-coupling.md` (refactor journal), `docs/audits/2026-09-28-dev-code-audit.md` (gate coverage).

---

## 0. Executive summary

The 84 red files were triaged file by file, together with the 46 `*.red.contract.spec.ts` files that pass today (their requirement shipped and the `red` label has outlived its meaning):

| Verdict | Files | Assertion failures involved |
|---|---|---|
| **DELETE** — subject gone, retired or never existed | 35 | 108 |
| **REWRITE** — subject live, but the spec proves it by reading source text | 61 | 136 |
| **BACKLOG** — real requirement, never implemented | 7 | 4 |
| **FIX_CODE** — valid contract, application genuinely wrong | 4 | 4 |
| **MERGE** — near-duplicate of another spec | 6 | 0 |
| **KEEP** — earns its place as-is | 17 | 0 |
| **Total** | **130** | **252** |

What this says about the red suite:

- **The red is mostly not breakage.** 108 of the 252 failures (43 %) live in files whose subject was deliberately retired — above all the **four-theme dashboard** (`d774738`, 2026-07-24, "simplify theme resolver to always return zen"; `core/theming/theme.tokens.ts:11` is now `export type DashboardThemeName = 'zen'`) and the **in-memory `TurnoService` mock** (`tests/helpers/turno-service-testbed.ts:212` — `setProvider(_provider) {}` is a no-op, so the KB guards measure a hand-written double, never production).
- **Another 136 failures (54 %) come from source-locking specs** whose subject is live and whose assertions grep the source for names that were renamed, moved into `@orvel/booking`, or replaced by a `computed`.
- **Only 8 failures describe real work**: 4 `FIX_CODE` defects (§4.3) and 4 `BACKLOG` requirements (§4.4). The suite as it stands is a poor detector of product risk precisely because 73 % of it asserts text, not behaviour.
- **The stale set is not ancient.** 42 of the 84 red files were last touched this month; the rot is being re-committed, not inherited.

The decision this document records is therefore: **delete 35 files** (no production code, all cited), **rewrite 61** into behavioural specs as separate work items, **keep 7 red as backlog** with an issue behind each, and **fix 4 real defects**. Batch 1 (§5) executes the safest 14 deletions.

## 1. Baseline, re-measured today (not inherited)

The issue quotes 2045 tests / 252 failures. Re-running the suite on today's `dev` reproduces it exactly:

| Measure | Value |
|---|---|
| Spec files | 296 |
| Tests | 2045 |
| Passing | 1768 |
| Skipped | 25 (12 in `dashboard-branch-booking-resilience` `describe.skip`, 12 in `kb010` after its collection error, 1 `it.skip`) |
| **Failing** | **252** |
| Files with ≥1 failing test | 84 |
| Files red in total (84 + 1 collection error: `kb010`) | **85** |
| Spec lines | 45 018 |
| Specs that read production source (`readFileSync`/`import.meta.url`/…, coarse criterion) | 215 (73 %) |
| Files named `*.red.contract.spec.ts` | 77 — **32 red, 45 green** |
| Dashboard specs referenced by CI or `package.json` scripts | **14** (92 of 2049 tests ≈ 4.5 %) |

One file fails **before running a single test**: `kb010-configuracion-persistence-guard.red.contract.spec.ts` throws at collection time — `[vitest] No "ORVEL_SUPABASE_AUTH_STORAGE_KEY" export is defined on the "../../core/auth/supabase-config" mock` — so it contributes no assertion failure but does break the suite run. Any parity check must count it (§5).

Last commit date of the 84 failing files: 2026-05 → 19, 2026-06 → 7, 2026-07 → 1, 2026-08 → 15, 2026-09 → 42. The red set is **not** only ancient scaffold: half of it was touched this month and left red.

Environment note: `pnpm --dir apps/dashboard exec vitest` cannot run in this sandbox (pnpm writes its global lockfile outside the workspace). The runs used `apps/dashboard/node_modules/.bin/vitest`, with reports written under the gitignored `.cache/`.

## 2. Verdict taxonomy and decision rules

The repo convention (`openspec/config.yaml` → `strict_tdd: true`) is RED-first: a `*.red.contract.spec.ts` is written **before** the implementation and is expected to fail until the feature ships. A RED file that is still red therefore means *the requirement was never implemented* — a backlog item or an abandoned one — not automatically a defect.

| Verdict | Means | Consequence |
|---|---|---|
| **DELETE** | The subject no longer exists, was deliberately retired, or never existed; nothing live depends on it. | File removed. |
| **REWRITE** | The subject is live and matters, but the spec proves it by reading source text/paths, so it cannot catch a regression. | File replaced by a behavioural spec (TestBed/DI). |
| **FIX_CODE** | The spec is a valid behavioural contract and the application is genuinely wrong. | Production fix + keep the spec. |
| **BACKLOG** | The requirement is real, unimplemented and still wanted. | Keep RED, out of every CI gate, and track it in an issue. |
| **KEEP** | Worth keeping as-is: the requirement shipped, or the source lock is the cheapest guard for a static invariant (SQL/migration text). | No action. |
| **MERGE** | Near-duplicate of another spec. | Fold into the named spec. |

Three rules bound this triage:

- **Deleting a spec is not deleting coverage.** A DELETE verdict is accepted only where the behaviour is gone from the product or covered by a live spec elsewhere; the evidence names the replacement.
- **Nothing here relaxes a gate.** No file in the failing set is referenced by CI or by a `package.json` script (checked: the intersection with the 14 gate specs is empty), so removals cannot silently widen or narrow the current gate.
- **A DELETE that would strand production code is a separate decision.** When the only reason a production module exists is the spec that guards it, the verdict carries a `delete_also` list and is excluded from the mechanical batches (§5).

## 3. Verdicts by family

Each family below lists its files with the verdict, the confidence of the triage, and the action. §3.12 collects the evidence for every deletion; §3.13 collects the non-delete decisions that need a product answer.

Two families were spot-verified by hand before accepting their conclusions:

- **§3.2 (theme/palette)** — verified `core/theming/theme.tokens.ts:11` (`DashboardThemeName = 'zen'`), `core/theming/dashboard-theme-palettes.tokens.ts:3` (single palette), the deliberate retirement commit `d774738`, and that `features/booking/pages/turnos-list.page.html` contains **0** `isZen|isInk|isIndustrial|isChic` conditionals where the deleted specs demand those branches.
- **§3.1 (KB guards)** — verified `tests/helpers/turno-service-testbed.ts:212` (`setProvider` no-op), that `src/app/pages/` holds only `booking/` (so `dashboard-home-theme-token-path` reads a path that cannot exist), and that `revenueChartState`/`mapSupabaseRevenueToBars` never appeared in a production file — not even at the initial commit `840d405`.

### 3.1 B01 — KB guards: a TDD scaffold built against a retired mock

This KB family is a first-generation, machine-authored TDD scaffold built against things the product retired or never had: the in-memory TurnoService/mock provider (kb003/kb004/kb005 exercise a hand-written fake, not production code), a fictional env/RPC surface (kb001), and two symbols that never existed in any production file (kb014) — those five files should be deleted, and none of them is in a CI gate, so removal is safe. The four survivors cover live subjects and must become behavioural: kb002 must drive dashboardAuthGuard and the real route table instead of regexing route sources (its "no dashboard auth route" premise was deliberately reversed by #962), kb007 must seed the tenant/active business and stub the Supabase client instead of attempting a live round-trip, and kb011 must install a complete gateway double in a global beforeEach rather than regexing api-wrapper.ts, whose RPCs actually live in real-gateway.ts and mappers.ts. kb012 is one stale assertion, not a defect: the catalog is FREE|PREMIUM with PRO as an alias (packages/domain/src/reference-catalog.ts:48-58, commit 790de77), so it should assert the canonical code and drop its three source-locks. The only genuinely unimplemented, untracked requirement found is kb007.4.2 (refusing to delete a customer with active bookings; bookings.customer_id is ON DELETE SET NULL and the service only soft-deletes) — that needs a product decision before any code or test changes.

| File | Verdict | Conf. | Action |
|---|---|---|---|
| `kb001-supabase-connection-guard.red.contract.spec.ts` | **DELETE** | high | Delete the file. Keep the live guard in src/app/core/runtime/supabase-client.factory.contract.spec.ts plus the migration checks; do not port the stubbed RPC round-trips or the tautological 'expect(ex… |
| `kb002-supabase-auth-guard.red.contract.spec.ts` | **REWRITE** | high | Rewrite behaviourally: drive dashboardAuthGuard/dashboardAuthChildGuard (core/auth/dashboard-auth.guard.ts:30-36) with a stubbed Supabase session and assert fail-closed redirect to buildDashboardSign… |
| `kb003-turnos-load-guard.red.contract.spec.ts` | **DELETE** | high | Delete the spec file. Do NOT delete src/app/tests/helpers/turno-service-testbed.ts - 9+ other specs import it (turnos.spec.ts, clientes.spec.ts, turnos-notifications.contract.spec.ts, dashboard.spec.… |
| `kb004-turnos-create-guard.red.contract.spec.ts` | **DELETE** | high | Delete the spec file (keep shared helper src/app/tests/helpers/turno-service-testbed.ts, used by other specs). Coverage of create/conflict/validation stays in packages/booking; no replacement needed … |
| `kb005-turnos-update-cancel-guard.red.contract.spec.ts` | **DELETE** | high | Delete the spec file (helper stays). If status-transition rules (no cancel of completed, no backward transitions) are considered product invariants, add them once as domain tests in packages/booking … |
| `kb007-clientes-crud-full-guard.red.contract.spec.ts` | **REWRITE** (needs issue) | high | Rewrite behaviourally, reusing the injection pattern already in src/app/tests/helpers/turno-service-testbed.ts:283-291: run ClienteService in an injection context with a stubbed AuthService and seed … |
| `kb011-public-booking-api-guard.red.contract.spec.ts` | **REWRITE** | high | Rewrite behaviourally: install setSupabaseBookingGateway(...) (api-wrapper.ts:17) in a global beforeEach, extend the double with queryPublicSlotAvailability/cancelBookingByToken/rescheduleBookingByTo… |
| `kb012-onboarding-flow-guard.red.contract.spec.ts` | **REWRITE** | high | Keep the behavioural tests; change the plan assertion to the canonical code (legacy 'PRO' in → 'PREMIUM' out, with entitlements resolved from the canonical plan) and replace the three source-lock tes… |
| `kb014-home-compile-blockers.red.contract.spec.ts` | **DELETE** | high | Delete the file. Leave apps/dashboard/src/app/features/dashboard-home/pages/dashboard-home.page.{ts,html} untouched - they are live and covered by dashboard-home-page-mobile-*.contract.spec.ts and da… |

Open questions this family left:
- kb007.4.2 ('prevents delete when customer has active bookings'): I could not establish whether this is a wanted requirement or has been superseded by the intentional soft-delete/retention deferral in cliente.service.ts:275-282; flagged via needs_issue_check.
- kb012: whether `selectedPlan` in the completion result should persist the landing-chosen legacy code (PRO/STARTER/GROWTH) or the canonical code (PREMIUM) is a design call; I judged canonical from packages/domain/src/reference-catalog.ts:48-58 and commit 790de77, but Santi's earlier audit left the same question open (docs/audits/2026-09-28-dashboard-coupling.md:706-712).
- kb002: I read the reintroduction of /login, /signup, /auth/login (commit 6a9db53, #962) as a deliberate retirement of the 'canonical auth initiation lives on landing' premise, but I found no ADR/openspec decision that states it in words — only the commit and the live code.
- Verdicts rest on reading the specs/production files plus targeted runs (kb001, kb002, kb014, supabase-client.factory.contract.spec.ts); I did not run the full 296-file suite, so the pass/fail split for the untouched tests in kb007/kb011/kb012 comes from the batch extract plus spot checks, not a fresh full run.

### 3.2 B02 — Theme, palette and template conformance: the four-theme dashboard

The zen/chic/ink/industrial multi-theme architecture was deliberately retired — the live app is zen-only (theme.tokens.ts:11, a single zen palette in dashboard-theme-palettes.tokens.ts, a passing "single theme" unit spec, and the zen-only cleanup gate) — so the per-theme palette-isolation stories (1/2/3/A), theme-switch, theme-tokens and the phantom dashboard-home path guard should be deleted outright: they demand exactly the non-zen branches and old hex values the shipped direction forbids. The other five files are not dead, only source-locked or pinned to renamed hooks/helpers: rewrite them behaviourally (render the page/component and assert form persistence through the facade, the time-picker flow, the loading/empty/error live regions, and the shipped tokens), dropping the multi-theme KPI copy and the isZen marker. No production file is kept alive solely by these specs, so delete_also is empty; the only open product question surfaced is the no-op multi-business template switch at configuracion.page.ts:328-330.

| File | Verdict | Conf. | Action |
|---|---|---|---|
| `agenda-palette-isolation.story3.contract.spec.ts` | **DELETE** | high | Delete the file. The multi-theme palette-isolation contract is superseded by the zen-only cleanup gate; keep git history if ink/industrial ever return. |
| `servicios-palette-isolation.story1.contract.spec.ts` | **DELETE** | high | Delete the file; the Servicios palette-isolation story belongs to the retired 4-theme design. |
| `configuracion-palette-isolation.story2.contract.spec.ts` | **DELETE** | high | Delete the file. Once deleted, drop the now-unused isIndustrial/isChic/isInk tombstones (configuracion.page.ts:242-244) after configuracion-template-split-regression.contract.spec.ts:27-30 stops refe… |
| `configuracion-industrial-palette-conformance.storyA.contract.spec.ts` | **DELETE** | high | Delete the file; the industrial palette namespace no longer exists to conform to. |
| `configuracion-business-template-visibility.contract.spec.ts` | **REWRITE** (needs issue) | medium | Rewrite behaviourally: mount ConfiguracionPage, assert the businessName control is bound and submit persists the trimmed value via the data-access facade (spy), and assert the business selector drive… |
| `configuracion-template-split-regression.contract.spec.ts` | **REWRITE** | high | Rewrite to assert rendered behaviour: TestBed-mount the settings page and exercise the time picker open/close/confirm path updating workingHours, plus the core form bindings; teach the source helper … |
| `dashboard-template-normalization.design.contract.spec.ts` | **REWRITE** | high | Drop REQUIRED_TEMPLATE_MARKERS (no theme branches exist under zen-only), keep the token-key assertions (spec:62-78), and convert the sidebar/main_agenda/right_panel checks into DOM assertions on the … |
| `right-panel-theme-visibility.contract.spec.ts` | **REWRITE** | medium | Rewrite as one behavioural a11y contract (render TurnosListPage; assert container aria-live/aria-busy and per-state roles regardless of testid naming) and delete the two theme-multiplicity tests; top… |
| `theme-accessibility.contract.spec.ts` | **REWRITE** | high | Keep as a single behavioural contract: render the sidebar/topbar/turnos page, assert focus-visible affordances and the loading/empty/error live regions in the DOM, and keep the contrast check over th… |
| `theme-switch.contract.spec.ts` | **DELETE** | high | Delete the file. Live theme application is exercised through the shell (shared/dashboard-shell/dashboard-shell.component.ts:96-97); if regression cover is wanted, add a single behavioural test that t… |
| `theme-tokens.contract.spec.ts` | **DELETE** | high | Delete the file; the 4-theme token contract was replaced by a single zen palette. |
| `dashboard-home-theme-token-path.red.contract.spec.ts` | **DELETE** | high | Delete the file. It is a tombstone guard on a phantom path that can never pass even after implementation, so it is permanent red noise in any suite. |

Open questions this family left:
- Whether the zen-only decision is permanent or only 'MVP' scope: the gate file is named zen-only-mvp-cleanup-gate.red.contract.spec.ts and the audit (§6 item 8) leaves the fate of the stale specs to issue #1076 Fase 0.1. If multi-theme returns, the deleted palette-isolation contracts would need re-authoring (git history preserves them).
- configuracion-business-template-visibility: I verified the businessName save path is live (configuracion.page.ts:626) and selectedBusinessId is a computed (:309), but I could not determine whether the multi-business selector is expected to become functional — onSelectedBusinessChange is an explicit no-op (:329) and no active openspec change mentions it.
- dashboard-template-normalization.design.contract.spec.ts is named after a DESIGN.md that does not exist in the repo or in any git revision (searched all refs), so I could not verify the original DESIGN.md clause behind its structural assertions.
- I did not run the full 2045-test suite; the baseline (296 specs / 252 failures) and the 25/40 failing-test split for this batch were confirmed by running only the 12 batch files with the local vitest binary.

### 3.3 B03 — Stitch, zen-only gates and UX hardening

This family mixes three guards of retired design with live contracts proved by reading source text. The multi-theme stitch specs and the guard built on the deleted `apps/dashboard/DESIGN_SYSTEM.md` (removed in `b7bda8e`, #219) have no subject left. The live ones fail on stale names or on regexes that only see literals: the sidebar still carries four dead sr-only nav mirrors delimited by `<!-- ZEN SIDEBAR -->` … `<!-- INK SIDEBAR -->` and those comments are load-bearing for the green `sidebar-navigation-stabilization.contract.spec.ts`, the pages use `*-loading-skeleton` hooks where the spec demands invented English-prefixed ones, and the home/settings booking-link cards are asserted with Tailwind class-string regexes that break on every `[class]` binding or polish pass. Two items are not test work at all: the remixicon subset is genuinely missing five icons that live components use (`FIX_CODE`), and the runtime identifier gate stays red by design until the dead sidebar mirrors are removed together with that green spec's per-theme slicing (`BACKLOG`).

| File | Verdict | Conf. | Action |
|---|---|---|---|
| `stitch-remaining-dashboards.contract.spec.ts` | **DELETE** | high | Delete the file. Both red tests lock the retired 4-theme dashboard (the theme resolver was reduced to always-zen in d774738). Its single green assertion (spec:18-22, shell composition) is duplicated … |
| `stitch-zen-dashboard.contract.spec.ts` | **DELETE** | high | Delete the file. Its failing test pins an admin hook that the codebase retired on purpose; its passing assertions are redundant with green specs. |
| `zen-dashboard-guardrails.red.contract.spec.ts` | **DELETE** (needs issue) | high | Delete the file. Test 2 cannot pass (deleted document, replaced palette); tests 1/3/4 encode an unbounded design-token migration with no live source of truth. If the token rule is still wanted it mus… |
| `zen-only-mvp-cleanup-gate.red.contract.spec.ts` | **REWRITE** (needs issue) | high | Rewrite tests 2 and 4 against the current session model (selectedRubros from the reference catalog; theme resolved through resolveDashboardThemeName, never equal to a rubro) and keep the zen-only sca… |
| `zen-only-runtime-identifiers-gate.red.contract.spec.ts` | **BACKLOG** (needs issue) | high | Keep RED and out of CI (CI runs 14 spec files / 92 of 2049 tests - docs/audits/2026-09-28-dashboard-coupling.md, section 10). When the zen-only cleanup is scheduled, delete the dead non-zen sr-only n… |
| `ux-hardening-accessibility.contract.spec.ts` | **REWRITE** | high | Rewrite as a rendered-DOM contract: mount TurnosList/Servicios/Clientes/Configuracion with TestBed, assert each page's primary action is focusable, carries an accessible name, and that the shell/topb… |
| `ux-hardening-global-states.contract.spec.ts` | **REWRITE** | high | Rewrite against the live naming and ARIA model: drive each page's loading/empty/error signal and assert the rendered state surface plus its role/aria-busy semantics, accepting role=status/alert as li… |
| `ux-hardening-responsive.contract.spec.ts` | **REWRITE** | high | Rewrite: keep the stable invariants (data-testid roots, min-w-0, overflow-x-hidden, single nested wrapper containing the `{{ bookingUrl() }}/{{ publicBookingUrl() }}` code element and the copy button… |
| `remix-icons.contract.spec.ts` | **REWRITE** | medium | Rewrite test 3 as a rendered-DOM contract over the current hook namespace: for each admin action control (`turno-admin-cancel-action`, `turnos-admin-reschedule-action`, `turno-admin-approve-action`) … |
| `remixicon-subset.contract.spec.ts` | **FIX_CODE** | high | Fix the app: add the five missing ri-* rules (ri-arrow-up-s-line, ri-question-line, ri-share-forward-line, ri-team-line, ri-wallet-3-line) with their `:before` codepoints copied from node_modules/rem… |

### 3.4 B04 — Plans, packages and onboarding contracts

This batch is dominated by the 2026-07-07 'simplify mvp pricing to free premium' migration (790de77) and the 2026-09-28 deletion of the Mercado Pago checkout client (08ada3a): the retired STARTER/GROWTH/PRO (or BASIC/MEDIUM/PRO) tier model, the plan quotas of 10 rubros / 2000 AI credits / 15 monthly bookings and the modules that never shipped appear across most of the twelve specs, while the live catalog is FREE+PREMIUM with 1 rubro per plan. Five files are past saving and go, together with the test-only modules they keep alive (onboarding-persistence.service.ts, landing-dashboard-onboarding-wiring.flow.ts); the other seven target live surfaces (settings error/retry UX, operator web-push, @orvel/booking package layout, server entitlements module, dashboard bugfix product decisions) and fail only because they read source text or pin stale shapes/counts; those need behavioural rewrites, not code changes, since the production behaviour they describe is already shipped.

| File | Verdict | Conf. | Action |
|---|---|---|---|
| `packages-booking-shape.red.contract.spec.ts` | **REWRITE** | high | Replace the exact `expect(exportTypeCount).toBe(18)` pin with a subset assertion over the 18 verified names (or a floor), keep every other assertion, and stop pinning Object.keys(booking) to a litera… |
| `kbn004-signup-plan-step.red.contract.spec.ts` | **DELETE** | high | Delete the file; the 3-tier paid onboarding no longer exists. If the plan step still needs a guard, write a new behavioural spec against getLandingPlansFallback()/SignupPlanStepPage asserting the FRE… |
| `onboarding-persistence-l02.red.contract.spec.ts` | **DELETE** (+prod) | high | Delete the spec. If a persistence guard is still wanted, re-author it behaviourally against the current canonical contract: every legacy alias (BASIC, MEDIUM, PRO, STARTER...) is stored and decisione… |
| `onboarding-plan-post-editing.contract.spec.ts` | **DELETE** | high | Delete the file. The live rule is one rubro on every plan; if post-onboarding editing needs coverage, assert that behaviourally (applyPlanLimitToRubros({plan:'PREMIUM'}) keeps 1) without the BASIC/ME… |
| `onboarding-landing-dashboard-wiring-sb03.red.contract.spec.ts` | **DELETE** (+prod) | high | Delete the spec. The retired 3-tier model is the spine of every failing test; if the landing hand-off still needs an end-to-end guard, author it against the MVP flow in apps/landing plus the current … |
| `supabase-entitlements-enforcement-red.contract.spec.ts` | **REWRITE** | high | Drop the SQL-corpus test (wrong migrations path, legacy 4-tier matrix) and rewrite the app test against the live snapshot shape - subscriptionStatus plus maxMonthlyBookings/aiCreditsMonthly and the e… |
| `m8-hardcoded-test-hooks-cleanup.red.contract.spec.ts` | **REWRITE** | medium | Make the tag scan multiline (parse the opening tag across newlines - the four controls do exist) and drop the `sourceFrom(source, 'private getMockProviderTurnos')` precondition, asserting the absence… |
| `typescript-compile-fix.red.contract.spec.ts` | **DELETE** | high | Delete the file, or at least its third test: createSubscription and its entrypoint are gone with the Mercado Pago client. The other two are source-greps of files that do exist - if those invariants m… |
| `settings-load-persist-visibility.red.contract.spec.ts` | **REWRITE** | medium | Rewrite the failing test behaviourally: render the settings page, force a load failure, assert the error alert and retry button appear and that retry re-invokes the load. Do not assert template text,… |
| `operator-web-push-subscribe.red.contract.spec.ts` | **REWRITE** | high | Replace the template substring/index slicing with a behavioural component test of the Configuración Perfil tab (toggle renders, calls toggleWebPush, is absent from the Equipo tab). The feature is alr… |
| `dashboard-bugfix-product-decisions.contract.spec.ts` | **REWRITE** (needs issue) | high | Rewrite the hydration assertion behaviourally: drive an auth change and assert the form is hydrated once and savedState is set even when the slug is 'id-pendiente'. Keep the other nine source-grep gu… |
| `landing-orvel-pricing.red.contract.spec.ts` | **REWRITE** | high | Rewrite both tests for the live MVP catalog: resolve the repo root from import.meta.dirname, assert the plans/plan_entitlements rows for FREE and PREMIUM plus the alias table are seeded, then assert … |

Open questions this family left:
- onboarding-plan-post-editing and settings-load-persist-visibility are NOT in the baseline evidence JSON (the baseline counts 84 failing files; the batch file lists 12, so two overlap another batch). I ran both myself and report my own results.
- process.cwd() for the sql-corpus specs is unstable: landing-orvel-pricing resolved apps/dashboard/supabase/migrations while supabase-entitlements-enforcement-red resolved /supabase/migrations in the same session. Any rewrite must resolve the repo root from import.meta.dirname, not cwd.
- Deleting onboarding-persistence-l02 also makes core-catalog-normalization.red.contract.spec.ts:144 and kb012-onboarding-flow-guard.red.contract.spec.ts:104 reference a missing landing-dashboard-onboarding-wiring.flow.ts. kb012 is already red for the same legacy plan reason (expects 'PRO', gets 'PREMIUM') and should be triaged with this family.
- Whether the @orvel/booking drift guard should pin an exact type count is a policy call; G3-green-red.json KEEPs the other five packages-*-shape guards as repo-layout guards, so I kept the file and only asked for the count pin to be relaxed.

### 3.5 B05 — The July slice contracts (KB-era integration specs)

This family is almost entirely stale proof, not broken product: 10 of 13 files fail because they assert literal source text against code that was renamed or moved (src/app/pages/** -> src/app/features/**, openAddModal -> openModal, createCategoria -> createCategoriaAndPersist, TURNERA_SESSION_KEY -> LEGACY_DASHBOARD_SESSION_STORAGE_KEY), or because their harness lost DI providers. Two files (the home-dashboard pair) chase a Chart.js revenue/calendar design that never existed in any commit and is replaced by the shipped mobile summary, so they should go. One file (public-booking-slug-policy) mixes a false negative with a genuine divergence: business-settings.facade.ts still mints and inserts a client-derived slug while the server owns canonical_booking_slug. No file is red for a reason that makes the product wrong today except that slug authority.

| File | Verdict | Conf. | Action |
|---|---|---|---|
| `db-fix-dashboard-suite.red.contract.spec.ts` | **REWRITE** (needs issue) | medium | Split by item: keep DB-FIX-001/003 as behaviour (delete a ClienteService row and assert it survives inactive; click a row and assert openDeleteServicio got that id), drop the deferred purgeAt asserti… |
| `home-dashboard-us01-us04.red.contract.spec.ts` | **DELETE** (needs issue) | high | Delete: the subject never shipped. The live home page is the mobile summary plus desktop agenda; confirm the retirement of the v2 chart/calendar design and the unused chart.js dependency in the same … |
| `home-dashboard-v2-hotfix.red.contract.spec.ts` | **DELETE** (needs issue) | high | Delete together with home-dashboard-us01-us04.red.contract.spec.ts; if the KPI copy is still wanted, assert it against the shipped mobile summary block rather than this retired design. |
| `modal-reliability-d01.red.contract.spec.ts` | **REWRITE** | medium | Repoint DASHBOARD_ROOT to src/app/features/** and rewrite as behavioural modal tests over the live hooks (clientes-modal-add-trigger, servicios-modal-close, account-settings-modal, turnos-admin-resch… |
| `servicios-crud-d03.red.contract.spec.ts` | **REWRITE** (needs issue) | high | Rewrite against the live API (openModal(type), openEditServicio, openDeleteServicio, onSaveServicio, deleteConfirmServiceId, selectedServiceId) as behavioural component tests; keep the tenant-scope a… |
| `supabase-db-rpc-red.contract.spec.ts` | **REWRITE** | high | Anchor the corpus at the repo root (path.resolve(process.cwd(), '../..', 'supabase')) and validate the migrations there; delete the obsolete 'localRuntimeDetected: false' assertion because local Supa… |
| `c3-servicios-submit-create-validation.red.contract.spec.ts` | **REWRITE** | high | Rewrite as behaviour: submit an invalid category/service and assert no persistence call plus the rendered data-testid field error, then a valid submit persists; replace the stale literals createCateg… |
| `mini-cal-admin-turnos-ui.contract.spec.ts` | **REWRITE** | high | Rewrite as behavioural UI tests over the live hooks (turnos-admin-reschedule-action, turnos-admin-create-primary-action, turnos-admin-block-time-submit-action, turnos-admin-block-time-form); delete t… |
| `public-booking-slug-policy.red.contract.spec.ts` | **FIX_CODE** (needs issue) | medium | Remove the client slug authority: the fallback insert at business-settings.facade.ts:490 must not mint a slug via generateSlugFromName (defer to the server canonical path). Then rewrite spec:39 as be… |
| `orvel-capacity-booking.red.contract.spec.ts` | **REWRITE** | high | Only the copy assertion needs repair: retarget spec:97 to the live aria-label that concatenates ' hs, quedan ' + remainingCapacity + ' lugares', or assert behaviourally that a slot with capacity rend… |
| `turno-admin-cancel-action.contract.spec.ts` | **REWRITE** | high | Delete the self-authored 'service' double (spec:110-136) that four tests exercise instead of production; drive the real BookingCrudService or TurnosListPage with the missing business-directory port p… |
| `turnos-cancel-confirm-modal.contract.spec.ts` | **REWRITE** | high | Keep the behavioural assertions but repair the harness: provide BUSINESS_SETTINGS_SOURCE, WORKING_HOURS_DEFAULTS_SOURCE and BUSINESS_PROFESSIONALS_SOURCE (or build the page through TestBed with the r… |
| `onboarding-business-step.contract.spec.ts` | **REWRITE** | high | Rewrite as behaviour: with orvel_mock_onboarding=1 call continue() after selecting a rubro and assert the JSON session written under LEGACY_DASHBOARD_SESSION_STORAGE_KEY (and that selectedTemplateIds… |

Open questions this family left:
- Whether the Chart.js home dashboard (revenue graph, calendar modal, day/week/month summary) was ever a product requirement: it appears only in specs across all 1186 commits and no active openspec change or docs mention it, so I read it as an abandoned v2 design - but only Santi can confirm the retirement (kb014-home-compile-blockers.red.contract.spec.ts:30 locks the same phantom revenueChartState…
- Whether the client-side slug insert in business-settings.facade.ts:490 is reachable in practice: it runs only when the businesses row is missing during hydration (:331), which the server-side complete_signup_onboarding path should already have created.
- Whether the unimplemented modal hardening still wanted (ESC support in servicios/clientes/configuracion/turnos modals, focus-return to trigger, per-mutation tenant scope and a stale-mutation guard) is backlog or was silently dropped; those assertions live inside otherwise-stale files.
- CI does not run the full suite today (root check -> check:dashboard runs 5 named specs + build), so all red files are already outside every gate; a repair that repoints paths must not accidentally wire them into a gate while they are still red.

### 3.6 B06 — Clientes and cross-page behaviour

This family is mostly live behaviour broken by stale fixtures, not product defects: the ClienteService specs still assume the in-memory mock provider is the default and that delete() physically removes a row, while the service defaults to Supabase and DB-FIX-001 mandates soft delete. Seven files must be reworked into real behavioural specs (TestBed/DI), three are dead weight (a facade module that never existed plus two contracts that only drive the hand-written booking testbed), and two encode the still-open zen-only MVP and config-driven availability slices, so they stay red as backlog. One genuine product bug surfaced: the settings page still prints 'Cargando configuracion...' inside its loading block alongside the skeleton that every other page uses.

| File | Verdict | Conf. | Action |
|---|---|---|---|
| `cliente.service.spec.ts` | **REWRITE** | high | Add service.setProvider('mock') in the top beforeEach (:16) so the spec drives the live mock provider, not the Supabase default, and replace the two delete assertions (:245-256) with the DB-FIX-001 s… |
| `clientes-page-ui.contract.spec.ts` | **REWRITE** | high | Replace the regex reads with a TestBed render of the real ClientesPage fed by a fake ClienteService: assert rows, that onSearch trims+lowercases (clientes.page.ts:75), that an invalid form blocks sub… |
| `clientes-ui-facade.contract.spec.ts` | **DELETE** | high | Delete the file. Its service-level search/edit cases are covered by clientes.spec.ts (33/34 green, same mock testbed) and by the ClienteService spec after its setup fix; the facade layer it gates was… |
| `clientes.spec.ts` | **REWRITE** | high | Keep the 33 green tests; rewrite only the delete assertion at :552 to the documented soft-delete contract (row retained with activo=false and still present in items()), or assert it through the 'Gest… |
| `categoria-domain.contract.spec.ts` | **REWRITE** | high | Add servicioService.setProvider('mock') to the beforeEach, use a category name absent from the seed for the create case (then assert trim + case-insensitive duplicate), and for the delete guard asser… |
| `business-selection-rendering.contract.spec.ts` | **REWRITE** | high | Replace the source regexes with a TestBed render of DashboardSidebarComponent asserting the theme switcher is present with two dashboards and absent with one or none; the behaviour lives in the templ… |
| `dashboard.spec.ts` | **REWRITE** | high | Keep the 13 green tests. Replace the two hardcoded demo-credential tests (:210-240, :419-445) with a stubbed AuthService/session, and fix the two 'empty today' tests (:130-141, :389-401) to clear the… |
| `dashboard-section-skeletons.contract.spec.ts` | **FIX_CODE** (needs issue) | medium | Delete the leftover <p role="status">Cargando configuracion...</p> at configuracion-zen-theme.component.html:29; the skeleton that follows already carries data-testid=settings-loading-skeleton + role… |
| `turnos-notifications.contract.spec.ts` | **DELETE** | high | Delete the file. Lifecycle emails are owned by the Supabase trigger/outbox (enforced by the CI-gated booking-email-lifecycle contract) and the spec only drives tests/helpers/turno-service-testbed.ts,… |
| `dashboard-session-business-types.contract.spec.ts` | **BACKLOG** (needs issue) | medium | Keep it red and out of every CI gate until the zen-only MVP ships; the acceptance note is that ALLOWED_SELECTED_BUSINESS_TYPES becomes ['zen'] as const, at which point sanitize(['industrial','zen','e… |
| `mock-login-business-type-session.contract.spec.ts` | **DELETE** | high | Delete the file. It asserts the multi-demo-type model that the zen-only MVP gates explicitly ban; the live session builder sanitizes against the catalog rubros instead. |
| `turnos-availability-booking.contract.spec.ts` | **REWRITE** | high | Drop the two mock-double booking cases (:17-65) and guard the live path: stub the booking repository so create() answers SLOT_CONFLICT (BookingSchedulingService.create throws) and render the turno fo… |
| `turnos-availability-settings.contract.spec.ts` | **BACKLOG** (needs issue) | medium | Keep it red and out of every CI gate until the availability-settings slice ships; when getHorariosDisponiblesConConfiguracion exists on the real service, retarget the spec at it instead of the in-mem… |

Open questions this family left:
- Whether the dashboard still wants a demo/mock login: the two hardcoded-credential tests in dashboard.spec.ts have no production counterpart, but the landing keeps a mock-login builder, so their fate is a product call.
- Whether the zen-only MVP is still the direction (files 10 and 11): the live catalog-driven model exposes 8 rubros and the zen-only gates are red, so I judged those two files against the declared gates, not against live behaviour.
- Post-deletion coverage is argued from grep of production call sites, not measured; no coverage tooling is installed (@vitest/coverage-v8 absent per the 2026-09-28 audit).

### 3.7 B07 — Configuración decomposition, slot availability and tooling

This family mixes three abandoned source-locks with four live contracts broken by an over-broad SQL text extractor. The configuracion-decomposition and pages atomic-layering specs target paths and components that never existed in this repo, so they should be deleted; the three slot-availability specs and the lighthouse route spec are valid, wanted contracts whose text extraction/assertions no longer match the shipped code and must be rewritten so they can actually fail on a regression. The deploy-promotion spec asserts a `site=combined` output that the workflow deliberately dropped in 714c606, so it must be re-pointed at the single combined build (or removed as a duplicate of deploy-promotion-workflow.contract.spec.ts).

| File | Verdict | Conf. | Action |
|---|---|---|---|
| `configuracion-decomposition-safety.contract.spec.ts` | **DELETE** | high | Delete the file. Only the modal part targets live code, and that is already covered by configuracion-time-picker-modal-accessibility.contract.spec.ts (in check:dashboard); if parity is wanted, move j… |
| `admin-slot-availability-skip-min-notice.contract.spec.ts` | **REWRITE** | high | Select the intended overload (anchor the 3-arg query_public_slot_availability or the body calling the helper) and assert its canonical `_query_booking_slot_availability(..., true)` call site; keep on… |
| `slot-availability-merge-default-working-hours.contract.spec.ts` | **REWRITE** | high | Fix the extractor so it selects the definition holding the invariant under test (or match by explicit signature), then make test 3 assert the enforce_min_notice argument (true public / false admin) i… |
| `slot-availability-split-working-day-intervals.contract.spec.ts` | **REWRITE** | high | Make the extraction pick the intended overload and assert the canonical 7-arg helper call with its enforce_min_notice flag; keep the interval/fallback assertions, which are the behavioural heart of t… |
| `deploy-promotion-qa-combined.contract.spec.ts` | **REWRITE** | high | Drop the `site=` assertions and pin today's invariants: one combined deploy step, the build going through root vercel.json `build:vercel` (scripts/build-vercel.mjs, both apps), the qa alias and the o… |
| `lighthouse-main-chunk-booking.contract.spec.ts` | **REWRITE** | high | Relax the two regexes to allow keys between `path: '<x>',` and `loadChildren:`, or assert the real bundle invariant: `loadChildren` importing ./dashboard-shell.routes and no provideBooking/DashboardS… |
| `orvel-landing-returnto-contract.spec.ts` | **REWRITE** (needs issue) | medium | Rewrite the alias expectation against documented reality: assert CANONICAL_PLAN_CODES equals the catalog plans (['FREE','PREMIUM']) and that normalizePlanCode('STARTED') resolves to 'PREMIUM'; retire… |
| `dashboard-atomic-layering-pages.contract.spec.ts` | **DELETE** | high | Delete the file. The subjects live at src/app/features/servicios/pages/servicios.page.ts and src/app/features/clientes/pages/; if that layering rule still matters, re-author it against those paths wi… |
| `dashboard-atomic-layering-settings.contract.spec.ts` | **BACKLOG** (needs issue) | medium | Keep it red and out of every CI gate (it is not in test:dashboard:contracts today), rename it to *.red.contract.spec.ts if the backlog bucket requires it, and leave the TODO as the acceptance note; d… |

Open questions this family left:
- The prod RPC `get_dashboard_reference_catalog` was not queried, so I cannot prove the deployed catalog still maps STARTED to PREMIUM; the checked-in seed 20260707150000:129 does, and the fixture packages/domain/src/reference-catalog.ts:55 agrees.
- Whether the configuracion ink/industrial/noir/chic decomposition was ever planned in an OpenSpec change: no openspec/changes/ entry mentions it and no git commit ever added those files, but pre-import history is a squashed vendor import (f09f2f8), so earlier intent cannot be inspected.

### 3.8 B08 — Feature specs: booking, billing and settings

No product defect in this family: every failing assertion is a stale proof, not a broken feature. Two files chase retired architectures (the 4-plan FREE/STARTER/GROWTH/PRO catalog, replaced by FREE/PREMIUM in migration 20260707150000, and the service-level admin availability cache deleted by the #232-#236 booking refactor), one demands a capacity control deliberately removed in #801, and three break on their own harness (missing DI providers, an uncontrolled wall clock, and a source-index ordering proxy). All six subjects are live, so the action is rewrite-in-place into behavioural assertions (no DELETE); FIX_CODE is ruled out because production matches the documented decisions.

| File | Verdict | Conf. | Action |
|---|---|---|---|
| `subscription-state-machine.api.spec.ts` | **REWRITE** | high | Rewrite the two red tests to the shipped FREE/PREMIUM catalog: seed a multi-plan snapshot with initializeRuntimeReferenceCatalogSnapshot, assert alias normalization (BASIC->PREMIUM) and rank-driven u… |
| `turno-core-slice6-admin-availability-ux-runtime.red.contract.spec.ts` | **REWRITE** | high | Delete the two cache-invalidation regexes and assert the live layer behaviourally: render TurnoFormPage with a rejecting BookingAvailabilityService and assert disponibles()===[], availabilityError se… |
| `turno-form-bookable-days.behavior.spec.ts` | **REWRITE** | high | Add the missing TestBed providers ACTIVE_BUSINESS_ID_SOURCE and BUSINESS_PROFESSIONALS_SOURCE, copying turno-form-walk-in.behavior.spec.ts:129-135; the three date/hour assertions should then pass unc… |
| `turno-form-walk-in.behavior.spec.ts` | **REWRITE** | high | Inject a fixed ArgentinaClockService and set servicioId/fecha consistently with the seeded availableStarts so the client gate, not the wall clock, decides canSave; replace the `as unknown as` private… |
| `turnos-list-page-mobile-gating.contract.spec.ts` | **REWRITE** | high | Replace the source-index ordering proxy with a render assertion: instantiate TurnosListPage with the isMobile signal true and false, then assert app-calendar-picker is absent on mobile and app-mobile… |
| `settings-visible-persist.contract.spec.ts` | **REWRITE** (needs issue) | high | Drop 'capacity' from PERSISTABLE_FORM_CONTROLS, and confirm with the team whether the invisible-but-still-persisted capacity field (#856 moves slot capacity to Equipo) should also leave the FormGroup… |

Open questions this family left:
- I did not re-run the 2045-test baseline; I ran only the six batch files with apps/dashboard/node_modules/.bin/vitest and reproduced the batch's failure counts exactly (2, 2, 3, 1, 1, 1).
- Whether the now-invisible `capacity` field should also leave the save payload / FormGroup is a product question I could not settle: #801 removed the input, #856 moved slot capacity to Equipo, but no active openspec change covers the field's fate.
- For the Slice 6 file I could not find any recorded decision retiring service-level availability-cache invalidation; the cache disappeared inside the #232-#236 refactor and the replacement (page-level version tokens) is only inferable from the code.
- I inferred the intended walk-in gate from canSave() rather than from documentation; no openspec spec or active change describes canSave's clock dependency.

### 3.9 G1 — Green RED contracts: booking, mobile, settings

Of the 16 files, only three are genuinely worthless: kb013 and kb015 assert patterns the typecheck/build gate already forbids (or regexes that can never match, e.g. ngAfterViewInit in a file that has none), and both are superseded structurally, so they should go. The rest guard live surfaces (booking admin create/reschedule/blocked-time, mobile turno detail, servicios price, settings persistence/validation, onboarding guard) but prove them by reading source text, so they are rewrite items: exercise the gateway with a mocked client, mount the page/component with TestBed, or fold the residue into the spec that already covers the same surface. kb010 is the only one that breaks the suite run (collection error from an incomplete supabase-config mock) and is a one-line mock fix, not a deletion.

| File | Verdict | Conf. | Action |
|---|---|---|---|
| `core-slice3-runtime-lockdown.red.contract.spec.ts` | **REWRITE** | high | Rework into one behavioural gateway spec: keep the mocked-client assert-the-RPC pairs (:87-133, :228-296), add rejection cases for cancel/reschedule_booking_by_token and confirm_booking_deposit_recei… |
| `turno-form-cliente-chrome.red.contract.spec.ts` | **MERGE** | high | Fold the still-unique testids (:19-38, e.g. turno-admin-new-modal-shell, turno-admin-submit-action) into turno-form-mobile-create.contract.spec.ts, which already locks the same chrome, then delete th… |
| `turno-m2-admin-new-turno-ux.red.contract.spec.ts` | **REWRITE** | high | Keep it as a TurnoFormPage behaviour spec via TestBed (harness exists in turno-form-walk-in.behavior.spec.ts:1-30): assert the availability call args and disponibles() hours, and the branchId on crea… |
| `turno-m3-blocked-time-ux.red.contract.spec.ts` | **REWRITE** | high | Drive the flow through TurnosListPage with a stubbed gateway: openBlockedTimePanel()/submitBlockedTime() must send startsAtIso/endsAtIso/reason from the form, never from Date.now() or 'Lunch break' (… |
| `turno-m4-admin-reschedule-picker-ux.red.contract.spec.ts` | **MERGE** | high | Merge the unique parts into turnos-reschedule-modal.contract.spec.ts (same page/html target) and rewrite the merged file to mount the page: openReschedule() loads admin-reschedule availability with b… |
| `mobile-turno-detail.red.contract.spec.ts` | **MERGE** | high | Fold into mobile-turno-detail.consumer.contract.spec.ts and rewrite the pair behaviourally: create the component with a router stub and assert navigation state wins, the BookingQueries fallback, isMo… |
| `servicios-edit-price.red.contract.spec.ts` | **REWRITE** (needs issue) | medium | Replace both regex tests with one behavioural assertion where ServiciosPage is already mounted (dashboard-service-actions-behavior.contract.spec.ts:129): the price input is enabled with inputmode=dec… |
| `core-slice2-runtime-backend-first.red.contract.spec.ts` | **REWRITE** | high | Keep the migration-text test (:97-110) and rewrite :61-93 behaviourally: assert the catalog gateway calls rpc('get_dashboard_reference_catalog') with a mocked client, and that getBusinessEntitlements… |
| `dashboard-second-bugfix-slice.red.contract.spec.ts` | **REWRITE** | high | Rewrite the three UI it()s as behaviour: mount ClientesPage and assert the New Client submit calls facade.create with the form value, mount the settings form for the invalid-range block, and assert t… |
| `k03-configuracion-submit-validation.red.contract.spec.ts` | **REWRITE** | high | Drive ConfiguracionPage: submit an invalid settings form and assert facade save was never called, controls are touched and fieldErrors() surfaces phone/supportEmail; delete the :68-83 copies of rules… |
| `kb006-servicios-crud-full-guard.red.contract.spec.ts` | **REWRITE** | high | Delete the four source-regex tests (KB-006.1.1 :44-53, KB-006.2.1 :94-100, KB-006.4.1 :185-192, KB-006.5.1 :209-215) and KB-006.6.3 :253-257 (typeof error === 'function'); keep the behavioural ones a… |
| `kb010-configuracion-persistence-guard.red.contract.spec.ts` | **FIX_CODE** | high | Complete the module mock: add ORVEL_SUPABASE_AUTH_STORAGE_KEY to the vi.mock('../../core/auth/supabase-config') factory at :32-37 (or spread importOriginal()), as mandatory-onboarding-dashboard-guard… |
| `kb013-angular-build-errors.red.contract.spec.ts` | **DELETE** | high | Delete: the fixes shipped (no isDev in real-gateway.ts, goToToday() exists) and the defect class is already rejected by the typecheck/build gate, so this spec is a regex stand-in for a compiler that … |
| `kb015-ng0203-shell-visibility.red.contract.spec.ts` | **DELETE** | high | Delete: test 2 (:17-25) forbids literal hidden/*ngIf attributes the shell never used, and mobile-shell.contract.spec.ts:80-88 already asserts the real wrapper hiding; test 1 (:11-14) regexes an ngAft… |
| `mandatory-onboarding-dashboard-guard.red.contract.spec.ts` | **KEEP** | high | Keep: the load-bearing tests drive the real route-protection module with a mocked auth client and assert redirect targets. Delete the redundant source-text assertions at :182-186 and :190-193 and ren… |
| `ng8113-targeted-warning-guard.red.contract.spec.ts` | **REWRITE** | medium | Rewrite as one behavioural template test (mount the two components, assert no NG8113 window) or, if that is not observable in vitest, delete it and make the build fail on unused standalone imports; a… |

Open questions this family left:
- Whether a dynamic-import mock gap in kb010 (i.e. the facade importing supabase-client.factory, whose module body reads ORVEL_SUPABASE_AUTH_STORAGE_KEY at load) is the whole error; I reproduced the collection failure and confirmed the constant is exported today (src/app/core/auth/supabase-config.ts:10), but did not apply the mock fix because the repo is read-only for me.
- How many of kb010's 12 tests would actually pass after the mock fix: they exercise the real facade with createClient mocked to null, so I can only assert the interface facts I read (loadFromSupabase/saveToSupabase/syncFormState exist in the facade), not the roundtrip outcomes.
- 'Issue #355' behind servicios-edit-price exists in no open-issue list (.cache/1076/open-issues.txt jumps #352-#387) and git log has no #355 commit; the file landed in the same commit as the fix c82ac9d (PR #356), so I could not establish whether the requirement is still tracked.
- Whether the remaining 45 green *.red.contract.spec.ts in sibling batches assume the same rewrite convention; my verdicts are limited to the evidence I opened for these 16 files.

### 3.10 G2 — Green RED contracts: auth, entitlements, catalog

All 16 red-named files are green because their requirements shipped: 10 guard a live surface and would fail on regression (auth-only-landing-boundary, orvel-notifications-system, supabase-config-import-meta-env, c2-servicios, core-catalog-normalization and the account-plan/catalog family), so they only need their misleading '.red.contract' label dropped. Only two are beyond saving: p0-2-main-runtime-placeholder-guard and supabase-client-factory-typing assert the absence of literal strings that no longer exist anywhere in the repo except inside the spec itself, and active-branch-ux is unsound (it concatenates the whole src/app tree into one string and matches tokens across file boundaries). The remaining three need work: ts4111-index-signature-guard duplicates the tsconfig option noPropertyAccessFromIndexSignature plus the CI tsc gate at booking-regression.yml:79, auth-unification is a strict subset of auth-only-landing-boundary, and tenant-safe-salon + account-plan multi-salon + billing/core entitlements guard modules with zero non-test importers, so those requirements belong in the backlog, not in the gate.

| File | Verdict | Conf. | Action |
|---|---|---|---|
| `orvel-appointment-reminder-scheduler.red.contract.spec.ts` | **REWRITE** (needs issue) | high | Keep the RPC/auth half, but re-point the wiring assertions to .github/workflows/deploy-promotion.yml (the only workflows GitHub reads) and supabase/config.toml, where no [functions.appointment-remind… |
| `orvel-notifications-system.red.contract.spec.ts` | **KEEP** | high | Keep, but drop the unsound assertions: the last it() (:324-337) forbids English prose no source can contain, and the palette it()s (:284-292, :311-320) freeze hex colors. Replace them with a DOM/role… |
| `p0-2-main-runtime-placeholder-guard.red.contract.spec.ts` | **DELETE** | high | Delete the file. Both tokens exist nowhere in the repo except this spec, and main.ts reads no environment secrets at all (env loading lives in core/runtime/dashboard-env.ts), so the guard protects a … |
| `supabase-client-factory-typing.red.contract.spec.ts` | **DELETE** | high | Delete. The forbidden alias DashboardCreateClient exists nowhere but the assertion string, and the factory became generic (createDashboardSupabaseClient<TClient = SupabaseClient>), so this greps for … |
| `supabase-config-import-meta-env.red.contract.spec.ts` | **KEEP** | medium | Keep the invariant, but express it as a lint rule or build guard instead of a one-file substring check: src/main.ts:11 uses import.meta.env legitimately, so this protects only one of many runtime fil… |
| `tenant-safety-salon-boundary-sb02.red.contract.spec.ts` | **BACKLOG** (needs issue) | high | Treat as backlog, not gate: the spec is real behaviour over a service with zero non-test importers, and no production code touches the 'salon' domain. Either park spec+service behind a multi-branch t… |
| `ts4111-index-signature-guard.red.contract.spec.ts` | **DELETE** | high | Delete: the guard is the compiler option it names. tsconfig.json:8 sets noPropertyAccessFromIndexSignature and CI runs tsc -p tsconfig.app.json (booking-regression.yml:79). Its only extra reach is te… |
| `account-plan-lifecycle-sb02.red.contract.spec.ts` | **MERGE** | high | Merge into account-plan-policy-catalog.red.contract.spec.ts, keeping one behavioural file over core/accounts/account-plan-policy.ts. Both load that module and assert the same maxSalons/canCreateSalon… |
| `account-plan-policy-catalog.red.contract.spec.ts` | **MERGE** | high | Make this the survivor of the merge with account-plan-lifecycle-sb02 and drop its own source-text it()s (:30-44, :85-89): the alias and fallback behaviour at :46-83 already proves the catalog delegat… |
| `active-branch-ux.red.contract.spec.ts` | **DELETE** | high | Delete. appSource() joins every non-spec src/app .ts/.html into one string and the regexes use 800-char wildcards, so unrelated files satisfy them; core/branches contracts already cover the requireme… |
| `auth-only-landing-boundary.red.contract.spec.ts` | **KEEP** | high | Keep as the canonical auth-route spec: it is the pair's only runtime-behaviour file. Delete auth-unification.red.contract.spec.ts as its subset, rename this file to drop '.red.contract', and optional… |
| `auth-unification.red.contract.spec.ts` | **MERGE** | high | Merge into auth-only-landing-boundary.red.contract.spec.ts: its route-order it() (:26-43) is a test-for-test duplicate of that file's :35-52. Carry over only the unique negatives (mock/local auth, st… |
| `billing-entitlements-catalog.red.contract.spec.ts` | **BACKLOG** (needs issue) | medium | Treat as backlog: its behavioural half (injected RPC through getActiveSnapshot/assertEntitlement) is good, but its subject entitlements.api.ts is imported only by this spec, and :45-60 are source gre… |
| `c2-servicios-zod-create-validation.red.contract.spec.ts` | **KEEP** | high | Keep as-is; it is pure behaviour over the real validation module and it guards the live save path. Rename it to drop '.red.contract' and fix the stale loader message at :31, which still points at src… |
| `core-catalog-normalization.red.contract.spec.ts` | **KEEP** | high | Keep: the first two it()s are real behaviour over packages/domain and would catch a catalog regression. Replace the third it() (:138-160, four files regexed for matrix symbols) with behaviour on the … |
| `dashboard-core-backend-first.red.contract.spec.ts` | **BACKLOG** (needs issue) | medium | Treat as backlog: core/entitlements/server-entitlements.api.ts has no non-test importer. Keep the migration-contract it() (:99-109) and drop the symbol-absence snapshots (BOOTSTRAP_CATALOG_PAYLOAD, B… |

Open questions this family left:
- No remote check was possible: I could not confirm whether supabase/functions/appointment-reminders-24h is actually deployed or scheduled in QA/prod, nor whether it is registered in the provider dashboard. The claim that the only checked-in invoker is an inert workflow rests on git ls-files plus the GitHub fact that only the repo-root .github/workflows/ is read, not on deployment output.
- I did not run the full 296-file suite. Green state and the failure modes I describe were confirmed with targeted vitest runs (orvel-appointment-reminder-scheduler 5/5, orvel-notifications-system 12/12, ts4111 1/1, auth-only-landing-boundary + account-plan-lifecycle-sb02 + account-plan-policy-catalog 12/12), not by re-measuring the batch.
- Whether tenant-safe-salon/SB-02, the multi-salon (maxSalons) policy and the billing/core entitlement modules are 'backlog' or 'abandoned' is a product decision: no OpenSpec change or active spec under openspec/ (only repo-public-readiness) mentions SB-02, multi-branch add-on or salon tenancy, and the 2026-09-28 dashboard audit does not name them. If Santi confirms the multi-salon product line is …
- For active-branch-ux I verified the regexes are satisfiable only by a cross-file match in the concatenated corpus (python re over the joined src/app sources: it()#1 matched 1459 chars spanning two source files), but I did not construct a mutated tree to prove the assertion can never fail; the verdict rests on that measured cross-boundary match plus the requirement being covered behaviourally else…

### 3.11 G3 — Green RED contracts: onboarding, packages, entitlements

Of the 14 red-named files that pass, 7 already do the right job and just carry a stale 'red' label: k02, kbn007, onboarding-business-type-defaults-catalog, onboarding-ownership-boundary, plan-entitlements-catalog, public-booking-validations and the four packages-*-shape drift guards exercise real runtime surfaces (I ran all 14: 14 files / ~150 tests green). Four are source-grep artifacts that should be behavioural or dropped: onboarding-business-step-catalog and the source-lock third of onboarding-business-type-defaults-catalog regex tests that are already covered behaviourally by onboarding-rubro-multiselect.contract.spec.ts and kbn007; operator-web-push-send re-asserts a Supabase edge function that already has a proper Deno behavioural contract; signup-multirubro-catalog is the only orphan: the component it tests, signup-business-types-step.page.ts, has zero non-test importers while the live service-catalog-suggestions module it also covers is imported by servicios.page.ts:9-11. No file is vacuous enough to be 'trivially true' except individual assertions, and no two files in the batch are near-duplicates of each other; the four deletions are driven by dead subjects and wrong-layer duplication.

| File | Verdict | Conf. | Action |
|---|---|---|---|
| `k02-configuracion-zod-validation.red.contract.spec.ts` | **KEEP** | high | Keep as-is; it imports the real module and asserts behaviour, so it is a genuine regression guard. Remove the stale 'TODO(Magnus): falta ...' catch message at :46-48 (the module has existed since 202… |
| `kbn007-signup-business-types-step.red.contract.spec.ts` | **KEEP** | high | Keep; it is the deepest behavioural suite on this surface (45 tests, component instantiated for real). Only the 4 source-text it()s (KBN-007.1.5/1.6, 007.5.1/5.3, 007.7.1, 007.9.1-9.3, 007.10.2-10.3)… |
| `onboarding-business-step-catalog.red.contract.spec.ts` | **REWRITE** | high | Rewrite behaviourally: (a) drop CAT-ORU-001/003, which re-assert what onboarding-rubro-multiselect.contract.spec.ts:45-60 already proves (REQUIRED_RUBROS equals the catalog code list in catalog order… |
| `onboarding-business-type-defaults-catalog.red.contract.spec.ts` | **KEEP** | high | Keep the two behavioural tests (CAT-OBD-004 isAllowedOnboardingBusinessType accepts all current catalog codes, CAT-OBD-005 'uñas'/'pestañas' normalise to ascii and get a numeric capacity). Reword CAT… |
| `onboarding-ownership-boundary.red.contract.spec.ts` | **KEEP** | high | Keep - this guards a deliberate product boundary (commit cf02346 'fix: move signup onboarding to landing'). Leave test 2 (the guard's window.location.assign target) untouched and modernise test 1 by … |
| `operator-web-push-send.red.contract.spec.ts` | **DELETE** (needs issue) | high | Delete. The same surface already has a proper behavioural contract in supabase/functions/_shared/process-web-push-outbox.contract.test.ts (Deno, 264 lines: shouldSkipWebPush, buildOperatorWebPushPayl… |
| `packages-auth-shape.red.contract.spec.ts` | **KEEP** | high | Keep as a migration-window drift guard (structure cannot be asserted any other way without the package being deleted). When the @orvel/auth migration window closes, delete it together with the shim i… |
| `packages-billing-shape.red.contract.spec.ts` | **KEEP** | high | Keep. It is the only check that the REQ-BILLING-DEL-1 dead re-shims stay deleted (:176-178) and that the dashboard shims stay explicit per-name (:149-152); rename to drop '.red.contract' once the mig… |
| `packages-config-shape.red.contract.spec.ts` | **KEEP** | high | Keep - the secret-leak assertions (:47-51, environment.ts / supabase.co / sb_ / eyJ) are cheap and would catch a real regression if env handling were re-inlined into the package. Rename to drop '.red… |
| `packages-domain-shape.red.contract.spec.ts` | **KEEP** | high | Keep. It is the only test pinning that packages/domain stays dependency-free (REQ-DOMAIN-1) and that the three dashboard old paths still re-export it; rename to drop '.red.contract'. Optionally trim … |
| `packages-types-shape.red.contract.spec.ts` | **KEEP** | high | Keep — smallest and sharpest of the four package guards; the 'shim must be explicit per-name, not export *' assertion is the migration-window contract. Rename to drop '.red.contract'. |
| `plan-entitlements-catalog.red.contract.spec.ts` | **KEEP** | high | Keep; only assertion 1 (:49-64) is a source lock and it duplicates what assertions 2-3 already prove from the module's own exports, so it can be deleted for signal, not because the file is wrong. |
| `public-booking-validations.red.contract.spec.ts` | **KEEP** | high | Keep as-is; it is a clean behavioural contract with no source reading. Rename to drop '.red.contract' (the Zod migration shipped) and leave the module path as the single coupling point. |
| `signup-multirubro-catalog.red.contract.spec.ts` | **DELETE** (+prod, needs issue) | high | Delete the two dead-component tests (:53-76 - covered by kbn007) and move the three live suggestion tests (:78-120) into a renamed servicios/data-access contract spec (e.g. service-catalog-suggestion… |

Open questions this family left:
- signup-business-types-step.page.ts is not reachable from any route or component (only tests and one supabase static-contract test name it); I could not find a commit or openspec change that states its retirement, so if it is intentionally parked for a future landing/onboarding flow the two specs that exercise it should be kept instead of deleted.
- operator-web-push-send: the accepted event set in production is OPERATOR_WEB_PUSH_EVENT_TYPES (supabase/functions/_shared/process-web-push-outbox.ts:1-17) which includes lifecycle/onboarding/retention types, but the dashboard spec asserts the create-outbox migration and helper contain only the three appointment types - a later migration (20260829180000_reminder_operator_push_and_premium_activated…
- I did not re-run the whole 296-file suite; the green state of these 14 files was confirmed by targeted vitest runs today (all passed), and the orphan claim rests on repo-wide grep, not on a build/runtime check of the landing app.
- packages-*-shape specs are structural guards at the repo level, not dashboard behaviour; if Fase 0.x also owns repo-layout tests, the four of them may belong in a root scripts check rather than apps/dashboard/src/app/tests/unit.

## 3.12 Evidence for every deletion

Each row is the decisive citation the triage used, copied verbatim from the per-file verdicts. All 35 files were also checked against the gate: **none** is referenced by `.github/workflows/*.yml` or by a `package.json` script.

| Deleted file | Decisive evidence |
|---|---|
| `kb001-supabase-connection-guard.red.contract.spec.ts` | src/app/tests/integration/kb001-supabase-connection-guard.red.contract.spec.ts:274 asserts rpc('check_table_exists') === true, but the client is the spec's own stub at :246-253 that always returns { data: null, error: null }; no production code is exercised, so the 6 failing schema tests can only p… |
| `kb003-turnos-load-guard.red.contract.spec.ts` | kb003-...spec.ts:11,19 - the service under test is createMockTurnoService(), a hand-written in-memory fake (src/app/tests/helpers/turno-service-testbed.ts:203-213) whose setProvider is a no-op at :212; all 7 failures assert properties of that fake (e.g. spec:66,78 'real Supabase refs', spec:180 moc… |
| `kb004-turnos-create-guard.red.contract.spec.ts` | kb004-...spec.ts:20 imports createMockTurnoService; spec:127 expects a UUID id while the fake generates `turno-${Date.now()}` at src/app/tests/helpers/turno-service-testbed.ts:224, and the 12 'promise resolved instead of rejecting' failures come from the fake's create() which has no validation - th… |
| `kb005-turnos-update-cancel-guard.red.contract.spec.ts` | kb005-...spec.ts:20 imports the same fake; its 'supabase provider' is src/app/tests/helpers/turno-service-testbed.ts:212 (`setProvider(_provider) {}`), so KB-005.1.1.2 (`isMockId` at spec:137), the audit-in-notas tests (spec:1127) and the status-transition rejections all measure the double's own be… |
| `kb014-home-compile-blockers.red.contract.spec.ts` | kb014-...spec.ts:30 and :48 require exactly one `revenueChartState = computed(` and one `mapSupabaseRevenueToBars(` in apps/dashboard/src/app/features/dashboard-home/pages/dashboard-home.page.ts, which contains zero occurrences; `git grep revenueChartState 840d405` (initial import) and `git log -S … |
| `agenda-palette-isolation.story3.contract.spec.ts` | src/app/core/theming/theme.tokens.ts:11 - `export type DashboardThemeName = 'zen'`; src/app/core/theming/dashboard-theme-palettes.tokens.ts:3-4 declares only `zen`. The spec demands `@if (isIndustrial)` and `@if (isInk)` branches (spec:60-61) in src/app/features/booking/pages/turnos-list.page.html,… |
| `servicios-palette-isolation.story1.contract.spec.ts` | spec:45-46 requires `@if (isInk)` / `@else if (isIndustrial)` in src/app/features/servicios/pages/servicios.page.html; the live page has 0 isZen/isInk/isIndustrial matches and one unconditional two-column layout (servicios.page.html:4 main_agenda, :190 right_panel). |
| `configuracion-palette-isolation.story2.contract.spec.ts` | The only green test (spec:35-36, `get isInk`/`get isIndustrial`) passes on dead tombstones hardcoded false at src/app/features/settings/pages/configuracion.page.ts:242,244; the failing tests (spec:43,56) then require `@if (isInk)` / `@if (isIndustrial)` blocks that no settings template contains. |
| `configuracion-industrial-palette-conformance.storyA.contract.spec.ts` | spec:61,73,111 extract the `isIndustrial` block or scan settings templates for an `industrial-`/`ind-` namespace; production settings templates contain no `industrial-`/`ind-` class and configuracion.page.ts:242 hardcodes `get isIndustrial() { return false; }`. |
| `theme-switch.contract.spec.ts` | spec:7-12,53 requires industrial/zen/chic/ink with hex #F2F4F3/#8BA888/#D9C5B2; production ships DashboardThemeName = 'zen' (theme.tokens.ts:11) with zen bg '#0F172A' (dashboard-theme-palettes.tokens.ts:5,16), and those old hex values exist only in spec files. spec:58 fails precisely because applyD… |
| `theme-tokens.contract.spec.ts` | spec:24,68 demands keys ['industrial','zen','chic','ink'] and spec:28 pins zen to '#F2F4F3' while production declares only `zen` (dashboard-theme-palettes.tokens.ts:3-16, bg '#0F172A') and theme.tokens.ts:11 restricts the type to 'zen'. |
| `dashboard-home-theme-token-path.red.contract.spec.ts` | spec:7-17 reads src/app/pages/dashboard/home/dashboard-home.page.ts — that path exists nowhere in the working tree or in git history (`ls src/app/pages/` contains only `booking/`), and the live page is src/app/features/dashboard-home/pages/dashboard-home.page.ts; the test can only ever throw ENOENT. |
| `stitch-remaining-dashboards.contract.spec.ts` | src/app/core/theming/theme.tokens.ts:11 declares `export type DashboardThemeName = 'zen';` and src/app/core/theming/dashboard-theme-palettes.tokens.ts:3-22 holds only the `zen` palette, so spec:44-52 (expected triples for industrial/chic/ink, bg #0F0F0F / #FBFAFB / #050505) can never pass; the fail… |
| `stitch-zen-dashboard.contract.spec.ts` | The only red test (spec:56) requires `[data-testid="turno-admin-reschedule-action"]`; that hook was deliberately removed by 95b5bbd "refactor: remove legacy admin test hooks" (it deleted the sr-only legacy reschedule button), and the live control is `turnos-admin-reschedule-action` at src/app/featu… |
| `zen-dashboard-guardrails.red.contract.spec.ts` | spec:155 reads `DESIGN_SYSTEM.md` and fails with ENOENT: the file was deleted on purpose in b7bda8e (#219, 2026-08-15) and again in 94eb803 (#548), so test 2's only source of truth is gone; its expected palette (#F2F4F3/#8BA888/#D9C5B2, spec:158) is also contradicted by the shipping zen tokens (src… |
| `kbn004-signup-plan-step.red.contract.spec.ts` | src/app/features/billing/data-access/landing-plans-source.api.ts:45 — `LANDING_PLAN_ORDER = ['PREMIUM']`, and PLAN_COPY only defines FREE and PREMIUM; the component derives its plans from this, so it renders 1 card, not 3. |
| `onboarding-persistence-l02.red.contract.spec.ts` | src/app/features/onboarding/data-access/onboarding-persistence.service.ts:90 — `const selectedPlan = normalizePlanCode(payload.selectedPlan)` then stores that value, so 'PRO' is correctly persisted as 'PREMIUM', which is why the 5 failing tests see PREMIUM. |
| `onboarding-plan-post-editing.contract.spec.ts` | src/app/tests/unit/onboarding-plan-post-editing.contract.spec.ts:66 — the only failure: PRO must keep 5 selected rubros, but the live catalog gives PREMIUM maxRubros=1, so applyPlanLimitToRubros returns ['peluqueria']. |
| `onboarding-landing-dashboard-wiring-sb03.red.contract.spec.ts` | src/app/tests/integration/onboarding-landing-dashboard-wiring-sb03.red.contract.spec.ts:223 — expects `maxMonthlyBookings: 15` for FREE; the live catalog seeds FREE with 30 (20260707150000_mvp_free_premium_pricing_catalog.sql:100) and the flow returns 30. |
| `typescript-compile-fix.red.contract.spec.ts` | src/app/tests/unit/typescript-compile-fix.red.contract.spec.ts:31 — the failing test reads src/app/core/payments/subscriptions/create-subscription.api.ts, which does not exist (`ls src/app/core/payments/subscriptions` -> no such directory). |
| `home-dashboard-us01-us04.red.contract.spec.ts` | git log --all -S'revenueChartState' returns one commit, the initial import, and every hit is inside specs; no production file ever contained it or isCalendarOpen. |
| `home-dashboard-v2-hotfix.red.contract.spec.ts` | git log --all -S'summaryMode' -S'próximo turno' finds no production occurrence; the only hits are this spec's own assertions (spec:26-29, spec:36). |
| `clientes-ui-facade.contract.spec.ts` | :34 dynamically imports ../../services/clientes-ui.facade and returns null; src/app/services/ no longer exists (legacy shims deleted in 9cbe019), so the failure at :86 can only pass by creating a module the product never had. |
| `turnos-notifications.contract.spec.ts` | All three tests attach a notification port to the hand-written fake from createMockTurnoService (:22,:56,:84), whose attachNotificationService is a no-op (tests/helpers/turno-service-testbed.ts:273) - production work cannot make them pass. |
| `mock-login-business-type-session.contract.spec.ts` | :73-74 and :102 expect sanitizeSelectedBusinessTypes/createMockSessionFromLogin to keep ['industrial'], ['industrial','chic','ink'] and ['industrial','zen','ink'], but core/auth/mock-login-business-types.ts:13 derives the allowlist from REQUIRED_RUBROS, so none of those values is legal today. |
| `configuracion-decomposition-safety.contract.spec.ts` | configuracion.page.html:16 — the shell wires exactly one theme wrapper (app-configuracion-theme-zen); noir/metal/ink/industrial/chic selectors appear nowhere in production source. |
| `dashboard-atomic-layering-pages.contract.spec.ts` | dashboard-atomic-layering-pages.contract.spec.ts:5-8 — reads src/app/pages/dashboard/<page>/<page>.page.ts; the only file that path still matches is a broken QA script (apps/dashboard/scripts/qa/check-servicios-compile-red.mjs:5). |
| `kb013-angular-build-errors.red.contract.spec.ts` | packages/booking/src/infrastructure/supabase/real-gateway.ts has no `isDev` (grep, 0 hits) and calendar-picker.component.ts:67-68 defines goToToday() with the binding at calendar-picker.component.html:18, so :23 and :39-40 can only stay green |
| `kb015-ng0203-shell-visibility.red.contract.spec.ts` | dashboard-shell.component.html:5,13 hide the sidebar/topbar via class="hidden lg:block" on wrapper divs, so the not.toMatch(/<app-dashboard-sidebar[^>]*\b(hidden\|\*ngIf)=/) assertions at kb015-ng0203-shell-visibility.red.contract.spec.ts:24-25 are unreachable |
| `p0-2-main-runtime-placeholder-guard.red.contract.spec.ts` | Repo-wide grep for __MP_ACCESS_TOKEN__/__MP_WEBHOOK_SECRET__ returns only src/app/tests/integration/p0-2-main-runtime-placeholder-guard.red.contract.spec.ts:6 and :26 (no apps/dashboard/src/main.ts, no scripts, no workflows). |
| `supabase-client-factory-typing.red.contract.spec.ts` | src/app/tests/integration/supabase-client-factory-typing.red.contract.spec.ts:10 asserts source.includes('type DashboardCreateClient = ... SupabaseClient;') is false; repo-wide grep finds DashboardCreateClient only on that line. |
| `ts4111-index-signature-guard.red.contract.spec.ts` | apps/dashboard/tsconfig.json:8 sets "noPropertyAccessFromIndexSignature": true and .github/workflows/booking-regression.yml:79 runs 'pnpm --dir apps/dashboard exec tsc -p tsconfig.app.json --noEmit', so row.created_at on an index signature is already a build failure. |
| `active-branch-ux.red.contract.spec.ts` | active-branch-ux.red.contract.spec.ts:7-31 joins all src/app .ts/.html sources into one string, and :40/:49 match /branches[\s\S]{0,800}...activeBranchId/ and /(branch\|sucursal)[\s\S]{0,600}...(ACTIVE_BRANCH_REQUIRED)/ against it. |
| `operator-web-push-send.red.contract.spec.ts` | Every assertion is a regex over repository text: :13/:16/:17 readFileSync of the migration, helper and supabase/config.toml, e.g. :63 expects config.toml to match 'Authorization: Bearer $SERVICE_ROLE_KEY' — nothing is executed in the dashboard app. |
| `signup-multirubro-catalog.red.contract.spec.ts` | signup-business-types-step.page.ts has zero non-test importers repo-wide (grep for the filename/class outside src/app/tests matches only itself, :268), while src/app/app.routes.ts:62-84 routes signup to features/auth/pages/in-app-signup-wizard.page — so tests 1-2 exercise unreachable code. |

## 3.13 Decisions this triage cannot make alone

### Real code defects (`FIX_CODE`, 4)

**`remixicon-subset.contract.spec.ts`** (B03, high, effort S)
- **Subject**: Remix Icon subset stylesheet + mobile CSS budget: angular.json must not ship the full package CSS, the subset must cover every used ri-* class, Inter 400/600/700 only, production minify on / font inlining off
- **Action**: Fix the app: add the five missing ri-* rules (ri-arrow-up-s-line, ri-question-line, ri-share-forward-line, ri-team-line, ri-wallet-3-line) with their `:before` codepoints copied from node_modules/remixicon/fonts/remixicon.css into src/styles/remixicon-used.css, then keep the spec as the coverage gate - ideally wiring the same coverage check into scripts/qa/check-remixicon-assets.mjs, which today validates only the angular.json/CDN half of the contract.
- **Evidence**: spec:70-74 computes required = used ri-* classes that have a rule in node_modules/remixicon/fonts/remixicon.css, then requires them all in the subset; it fails with `expected [ 'ri-arrow-up-s-line', …(4) ] to deeply equal []`. Reproducing the spec's own logic over src/**/*.{html,ts} yields 79 used tokens, 74 required, exactly 5 missing, while the subset is otherwise live and hand-maintained (src/styles/remixicon-used.css, 4083 bytes, wired at angular.json:73).
- **Evidence**: All five are live UI usages: src/app/features/settings/pages/themes/configuracion-zen-theme.component.html:572 `[class]="expandedTeamId() === professional.id ? 'ri-arrow-up-s-line text-xl' : 'ri-arrow-down-s-line text-xl'"` (its ri-arrow-down-s-line twin IS in the subset, so the team toggle goes blank in the expanded state), :632 `<i class="ri-share-forward-line">`, src/app/features/operator-tour/operator-tour-help-button.component.ts:24 `<i class="ri-question-line text-xl" aria-hidden="true">`…
- **Evidence**: The other three tests pass and guard live invariants, so this is not a retired-subject source lock: angular.json:73 loads only src/styles/remixicon-used.css and not node_modules/remixicon/fonts/remixicon.css, src/index.html loads only Inter 400;600;700 with the print-media/noscript pattern, and the production optimization block keeps scripts/styles minify with fonts.inline false.
- **Note**: scripts/qa/check-remixicon-assets.mjs enforces the angular.json/CDN/landing half of this contract but not the 'subset covers used classes' half, so this spec is currently the only guard for the 5 stale rules; the batch's own counts (DELETE 3, REWRITE 5, BACKLOG 1, FIX_CODE 1) match this being the single FIX_CODE.

**`public-booking-slug-policy.red.contract.spec.ts`** (B05, medium, effort M)
- **Subject**: Public booking slug ownership: server-generated canonical slug vs client-derived slug, plus settings hydration
- **Action**: Remove the client slug authority: the fallback insert at business-settings.facade.ts:490 must not mint a slug via generateSlugFromName (defer to the server canonical path). Then rewrite spec:39 as behaviour (hydrate, assert the portal URL uses the persisted slug) and drop the placeholder check.
- **Evidence**: src/app/features/settings/data-access/business-settings.facade.ts:490 - const slug = this.generateSlugFromName(name) is INSERTed into businesses (:495-501) from the live hydration path (:331), while the spec bans generateSlugFromName (spec:48).
- **Evidence**: src/app/features/settings/pages/configuracion.page.ts:236-239 - publicBookingSlug() already prefers savedState()?.slug \|\| facade.settings()?.slug, so spec:39 is a false negative caused by extracting only the computed at :153.
- **Note**: Test 1 passes: supabase/migrations/20260617130000_dashboard_auth_state.sql implements canonical_booking_slug plus a unique-suffix retry loop, so the server-owned decision is already accepted and the facade duplicates it.

**`dashboard-section-skeletons.contract.spec.ts`** (B06, medium, effort S)
- **Subject**: Loading skeletons instead of copy on dashboard section pages (settings, turnos, servicios, clientes)
- **Action**: Delete the leftover <p role="status">Cargando configuracion...</p> at configuracion-zen-theme.component.html:29; the skeleton that follows already carries data-testid=settings-loading-skeleton + role=status, so it is a duplicate announcement and the only thing keeping this 23/24-green file red.
- **Evidence**: dashboard-section-skeletons.contract.spec.ts:51 asserts the settings template contains no 'Cargando configuracion' copy, but configuracion-zen-theme.component.html:29 still renders it immediately above the skeleton block at :30.
- **Evidence**: The three sibling assertions in the same spec (turno-form, servicios, clientes) all pass, i.e. the shipped convention on every other page is skeleton-only with no copy.
- **Note**: Product-visible copy removal, so it needs Santi's nod, but the duplicate role=status pair on the same loading branch is objectively redundant.

**`kb010-configuracion-persistence-guard.red.contract.spec.ts`** (G1, high, effort S)
- **Subject**: KB-010 BusinessSettingsFacade persistence: load/save against Supabase, working-hours and booking-policy roundtrip, sync/error signals, local fallback
- **Action**: Complete the module mock: add ORVEL_SUPABASE_AUTH_STORAGE_KEY to the vi.mock('../../core/auth/supabase-config') factory at :32-37 (or spread importOriginal()), as mandatory-onboarding-dashboard-guard.red.contract.spec.ts:26-31 already does; then rerun and keep the passing tests.
- **Evidence**: kb010-configuracion-persistence-guard.red.contract.spec.ts:32-37 mocks supabase-config with only SUPABASE_CONFIG, while src/app/core/runtime/supabase-client.factory.ts:2,11 reads ORVEL_SUPABASE_AUTH_STORAGE_KEY at module load; reproduced: vitest reports 12 skipped + 'No ... export is defined'
- **Evidence**: src/app/core/auth/supabase-config.ts:10 exports ORVEL_SUPABASE_AUTH_STORAGE_KEY, so the mock is stale, not the production module; the file instantiates the real BusinessSettingsFacade at :60-73, so its assertions are behavioural
- **Note**: Only spec that exercises BusinessSettingsFacade (grep evidence); deleting it would remove the suite's only persistence-level settings coverage. Fixing the mock is a one-liner.

### Real, unimplemented requirements (`BACKLOG`, 7)

**`zen-only-runtime-identifiers-gate.red.contract.spec.ts`** (B03, high, effort S)
- **Subject**: No industrial/chic/ink identifiers anywhere in dashboard runtime source
- **Action**: Keep RED and out of CI (CI runs 14 spec files / 92 of 2049 tests - docs/audits/2026-09-28-dashboard-coupling.md, section 10). When the zen-only cleanup is scheduled, delete the dead non-zen sr-only nav mirror and the comments together with the per-theme slicing spec; this file then becomes the cheap static guard for the invariant.
- **Evidence**: The single failure reports 182 files scanned and exactly 1 offending file: src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html (3 matches) [INDUSTRIAL, CHIC, INK] - the HTML comments at lines 31, 37 and 43. The runtime is otherwise zen-only (src/app/core/theming/theme.tokens.ts:11).
- **Evidence**: Those three comments are load-bearing for a green spec: sidebar-navigation-stabilization.contract.spec.ts:43-58 uses `<!-- ZEN SIDEBAR -->` ... `<!-- INK SIDEBAR -->` as slice markers and passes 9/9 today, so the cleanup is blocked behind a decision about that spec.
- **Note**: A grep-style identifier scan is the cheapest possible guard for this static invariant, so it should be kept, not rewritten - but it fails today, so it is a backlog item, not KEEP.

**`dashboard-session-business-types.contract.spec.ts`** (B06, medium, effort S)
- **Subject**: Zen-only session: dashboard business rules must keep 'zen' and drop removed demo types from the session
- **Action**: Keep it red and out of every CI gate until the zen-only MVP ships; the acceptance note is that ALLOWED_SELECTED_BUSINESS_TYPES becomes ['zen'] as const, at which point sanitize(['industrial','zen','evil','ink']) === ['zen'].
- **Evidence**: :99 expects sanitizeSelectedBusinessTypes(['industrial','zen','evil','ink']) === ['zen'], but core/auth/mock-login-business-types.ts:13 sets ALLOWED_SELECTED_BUSINESS_TYPES = REQUIRED_RUBROS, the 8 live catalog rubros (onboarding-rubros.ts:13; domain reference-catalog.ts:62-70), which exclude 'zen'.
- **Evidence**: integration/zen-only-mvp-cleanup-gate.red.contract.spec.ts:40 demands ALLOWED_SELECTED_BUSINESS_TYPES = ['zen'] as const and is itself red (3/6), so the requirement is an open, wanted MVP slice rather than a regression.
- **Note**: Three of the four cases pass only vacuously (an empty allowlist yields the zen fallback); confirm with Santi whether zen-only is still the direction or the rubro catalog supersedes it.

**`turnos-availability-settings.contract.spec.ts`** (B06, medium, effort S)
- **Subject**: Config-driven slot generation: slotIntervalMinutes, buffer and notice settings must change the available slots
- **Action**: Keep it red and out of every CI gate until the availability-settings slice ships; when getHorariosDisponiblesConConfiguracion exists on the real service, retarget the spec at it instead of the in-memory testbed, and drop the tautological determinism case at :16-47.
- **Evidence**: :89 expects a 15-minute interval to yield more slots than a 30-minute one, but the fake ignores the config (tests/helpers/turno-service-testbed.ts:268 just delegates to getHorariosDisponibles) and no production module defines getHorariosDisponiblesConConfiguracion (grep: only the fake and specs).
- **Evidence**: features/booking/pages/turno-core-slice6-admin-availability-ux-runtime.red.contract.spec.ts:97 demands getHorariosDisponiblesConConfiguracion in the real turno service source and is itself red, so the requirement is open and wanted.
- **Note**: The settings model is live (features/settings/data-access/business.service.ts:38-40,:518-520); only availability-side consumption is missing.

**`dashboard-atomic-layering-settings.contract.spec.ts`** (B07, medium, effort M)
- **Subject**: Sprint 2 atomic-layering TODO: configuracion.page.ts should reuse at least one presentational component from shared/components.
- **Action**: Keep it red and out of every CI gate (it is not in test:dashboard:contracts today), rename it to *.red.contract.spec.ts if the backlog bucket requires it, and leave the TODO as the acceptance note; do not delete until Santi decides the settings page must reuse shared presentational components.
- **Evidence**: dashboard-atomic-layering-settings.contract.spec.ts:6-11,16-20 — targets the live src/app/features/settings/pages/configuracion.page.ts, is failed by an assertion, and carries `TODO(Aurora)`.
- **Evidence**: configuracion.page.ts:15,41-47 — the page composes ZenThemeComponent plus ORVEL_SECTION_PRIMITIVES from shared/dashboard-section-primitives, not shared/components/; shared/components holds only calendar-picker today.
- **Note**: Requirement is real and unimplemented, not broken behaviour: the strict_tdd convention expects a red contract to stay red until it ships. Needs a product/architecture call on whether 'shared/components/' is the mandated layer (the page already reuses shared section primitives).

**`tenant-safety-salon-boundary-sb02.red.contract.spec.ts`** (G2, high, effort S)
- **Subject**: SB-02 tenant boundary: createTenantSafeSalonService requires a non-empty accountId and refuses to read/rename another tenant's salon
- **Action**: Treat as backlog, not gate: the spec is real behaviour over a service with zero non-test importers, and no production code touches the 'salon' domain. Either park spec+service behind a multi-branch tenancy issue, or delete both together.
- **Evidence**: src/app/tests/integration/tenant-safety-salon-boundary-sb02.red.contract.spec.ts:61-97 drives a two-tenant fake repository and asserts cross-tenant read/rename returns null — real behaviour, no source text read.
- **Evidence**: Repo grep for createTenantSafeSalonService/tenant-safe-salon matches only that spec (:31, :44, :69) and src/app/core/tenancy/tenant-safe-salon.service.ts:21 — no production consumer; account-plan-policy.ts:60 is the only other 'salon' consumer surface and it is itself test-only.
- **Note**: Its loader catch text (TODO(Magnus) at :34-36) is stale: the module was written and the test passes today.

**`billing-entitlements-catalog.red.contract.spec.ts`** (G2, medium, effort M)
- **Subject**: Billing subscription entitlements must resolve through the reference catalog: legacy aliases return PREMIUM with catalog limits, unknown plans fail closed to FREE, PREMIUM monthly bookings stay unlimited
- **Action**: Treat as backlog: its behavioural half (injected RPC through getActiveSnapshot/assertEntitlement) is good, but its subject entitlements.api.ts is imported only by this spec, and :45-60 are source greps. Either find the productive caller or let module and guard leave the gate together.
- **Evidence**: billing-entitlements-catalog.red.contract.spec.ts:62-129 is genuine behaviour (injected rpc rows through getActiveSnapshot and assertEntitlement), but repo grep for 'subscriptions/entitlements.api' finds only this spec at :10 — no production importer.
- **Evidence**: billing-entitlements-catalog.red.contract.spec.ts:45-54 and :56-60 assert the source file contains no PLAN_LIMITS and does not return a legacy tier string, i.e. two of its seven tests cannot fail on any behavioural regression.
- **Note**: Last touched by 790de77, 'fix(billing): simplify mvp pricing to free premium' (2026-07-07), which is exactly why the tier matrix here collapsed to FREE/PREMIUM.

**`dashboard-core-backend-first.red.contract.spec.ts`** (G2, medium, effort M)
- **Subject**: Dashboard core is backend-first: catalog through get_dashboard_reference_catalog, entitlements through get_business_entitlements_snapshot with no fake BUSINESS_PLAN/BUSINESS_USAGE maps, and fail-closed when the backend snapshot is unavailable
- **Action**: Treat as backlog: core/entitlements/server-entitlements.api.ts has no non-test importer. Keep the migration-contract it() (:99-109) and drop the symbol-absence snapshots (BOOTSTRAP_CATALOG_PAYLOAD, BUSINESS_PLAN, biz_qa_001) once one file owns the entitlement contract.
- **Evidence**: dashboard-core-backend-first.red.contract.spec.ts:111-139 imports ../../core/entitlements/server-entitlements.api and asserts the snapshot limits and the fail-closed reason, while :99-109 extracts get_business_entitlements_snapshot from the migrations corpus and requires the four limit columns.
- **Evidence**: Repo grep for server-entitlements.api finds no non-test importer, and for subscriptions/entitlements.api only billing-entitlements-catalog.red.contract.spec.ts:10 — so the snapshot/assert behaviours currently have no production caller.
- **Note**: Overlaps core-slice2-runtime-backend-first.red.contract.spec.ts (:82-95), which separately asserts server-entitlements.api's default RPC path; whichever survives should own the entitlement contract.

### Duplicates to fold (`MERGE`, 6)

**`turno-form-cliente-chrome.red.contract.spec.ts`** (G1, high, effort S)
- **Subject**: Turno form Nuevo Cliente chrome: modal testids, centered overlay, sheet tokens, input fill, footer actions
- **Action**: Fold the still-unique testids (:19-38, e.g. turno-admin-new-modal-shell, turno-admin-submit-action) into turno-form-mobile-create.contract.spec.ts, which already locks the same chrome, then delete this file.
- **Evidence**: src/app/features/booking/pages/turno-form-mobile-create.contract.spec.ts:19-33 locks the same chrome and stronger (overlay/modal regexes at :27,:30, no h-[100dvh] at :32) than turno-form-cliente-chrome lines :41-63
- **Evidence**: src/app/features/booking/pages/turno-form-cliente-chrome.red.contract.spec.ts:38 asserts the walk-in name control is absent, which turno-form-walk-in.behavior.spec.ts:154-155 already proves by rendering TurnoFormPage and querying the DOM
- **Note**: 5 of its 6 it() bodies pin exact Tailwind/hex values (bg-[#121827], #151b2b, rounded-3xl), so any legitimate restyle breaks it without a behaviour change.

**`turno-m4-admin-reschedule-picker-ux.red.contract.spec.ts`** (G1, high, effort M)
- **Subject**: M4 admin reschedule picker: row CTA, picker form, admin-reschedule availability with bookingId, no quick-shift, RPC lifecycle, validation, refresh
- **Action**: Merge the unique parts into turnos-reschedule-modal.contract.spec.ts (same page/html target) and rewrite the merged file to mount the page: openReschedule() loads admin-reschedule availability with bookingId, submit sends the chosen slot.
- **Evidence**: src/app/features/booking/pages/turno-m4-admin-reschedule-picker-ux.red.contract.spec.ts:4-14 and src/app/tests/unit/turnos-reschedule-modal.contract.spec.ts:5-10 read the identical PAGE_TS/PAGE_HTML pair; :104 of the latter already asserts the admin-reschedule availability call
- **Evidence**: src/app/features/booking/pages/turnos-list.page.html:236 contains the live data-testid="turnos-admin-reschedule-action" CTA both files guard
- **Note**: Two source-locked specs plus turno-core-slice6-admin-availability-ux-runtime red spec all cover this picker; the merged behavioural spec can replace all three.

**`mobile-turno-detail.red.contract.spec.ts`** (G1, high, effort S)
- **Subject**: MobileTurnoDetailComponent: router-state vs query fallback, mobile gating, tel: link, back navigation, empty state, route order
- **Action**: Fold into mobile-turno-detail.consumer.contract.spec.ts and rewrite the pair behaviourally: create the component with a router stub and assert navigation state wins, the BookingQueries fallback, isMobile() gating, empty state and tel: link.
- **Evidence**: src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.consumer.contract.spec.ts:13-22 asserts the same getCurrentNavigation()?.extras.state and listBookingsByBranch patterns as mobile-turno-detail.red.contract.spec.ts:52-59
- **Evidence**: src/app/features/booking/ui/mobile-turno-detail/mobile-turno-detail.component.ts:50-61,101 confirm all guarded members are live (computed turno/telefono/isEmpty, router.navigate(['/dashboard/turnos'])), so the surface is real but the guard is text-only
- **Note**: Route-order assertion (:110-116) is the only part not duplicated by the consumer spec; keep it in the merged file.

**`account-plan-lifecycle-sb02.red.contract.spec.ts`** (G2, high, effort S)
- **Subject**: Account plan lifecycle policy: FREE is enabled with maxSalons 1, paid tiers get one salon and additional branches are an add-on, unpaid premium stays disabled
- **Action**: Merge into account-plan-policy-catalog.red.contract.spec.ts, keeping one behavioural file over core/accounts/account-plan-policy.ts. Both load that module and assert the same maxSalons/canCreateSalonUnderPlan rules; after 790de77 all paid tiers resolve to maxLocales 1, restating the alias cases.
- **Evidence**: Both files load the same module: account-plan-lifecycle-sb02.red.contract.spec.ts:13-22 and account-plan-policy-catalog.red.contract.spec.ts:13-21 both dynamic-import ../../core/accounts/account-plan-policy with the same typed API.
- **Evidence**: packages/domain/src/reference-catalog.ts:48-49 defines only FREE and PREMIUM, both max_locales:1, with STARTER/BASIC/MEDIUM/GROWTH/PRO aliased to PREMIUM (:53-61) — so this file's BASIC/MEDIUM/PRO matrix at :42-51 and :65-74 asserts the same single value as the catalog spec's alias cases (:46-61).
- **Note**: The multi-salon angle this file is named for (SB-02) has no consumer: nothing outside tests reads AccountPlanPolicy.maxSalons (account-plan-policy.ts:10,33,40,46,60).

**`account-plan-policy-catalog.red.contract.spec.ts`** (G2, high, effort S)
- **Subject**: account-plan-policy must be backed by the reference catalog (no local PLAN_CODE_ALIASES/PLAN_LIMITS/matrix) and must normalize legacy aliases and invalid plans
- **Action**: Make this the survivor of the merge with account-plan-lifecycle-sb02 and drop its own source-text it()s (:30-44, :85-89): the alias and fallback behaviour at :46-83 already proves the catalog delegation. The merged file should assert exported behaviour only.
- **Evidence**: account-plan-policy-catalog.red.contract.spec.ts:30-44 reads account-plan-policy.ts as text and regexes for resolvePlanCodeFromCatalog/maxLocales plus the absence of PLAN_CODE_ALIASES and PLAN_LIMITS; :23-27 declares that readSource helper solely for this.
- **Evidence**: account-plan-policy.ts:15-23 does delegate to resolvePlanCodeFromCatalog and getPlanEntitlementsFromCatalog(...).maxLocales, so :46-61's behavioural alias cases (' BASIC ', 'medium') already pin the contract; ran today: 5/5 green.
- **Note**: It is the more behavioural of the two plan specs, which is why it should absorb the other one rather than the reverse.

**`auth-unification.red.contract.spec.ts`** (G2, high, effort S)
- **Subject**: Auth unification: public booking/manage routes stay unguarded while the dashboard shell is guarded, auth/login and auth/signup precede the dashboard, redirect helpers point to /dashboard/login, and no legacy mock/local auth remains
- **Action**: Merge into auth-only-landing-boundary.red.contract.spec.ts: its route-order it() (:26-43) is a test-for-test duplicate of that file's :35-52. Carry over only the unique negatives (mock/local auth, storage key) and express them behaviourally instead of with readFileSync.
- **Evidence**: auth-unification.red.contract.spec.ts:26-43 duplicates auth-only-landing-boundary.red.contract.spec.ts:35-52 test-for-test (auth/login and auth/signup blocks contain loadComponent, contain no canActivate, both indices < dashboard index, no SignupCredentialsPage).
- **Evidence**: auth-unification.red.contract.spec.ts:5 and :69 read source with readFileSync at paths that escape the dashboard (../../packages/auth/src/session-contract.ts), so it is a text grep layered on a path assumption the behavioural spec does not need.
- **Note**: Both files were rewritten by 9cbe019 (#1062) two days before the audit revision; the duplication survived that pass.

### Deletions that also delete production modules (`delete_also`, 3)

**`onboarding-persistence-l02.red.contract.spec.ts`** (B04, high, effort S)
- **Subject**: L-02 onboarding persistence service: payload -> account/profile/salon writes, premium pending_payment transition, tenant-context enforcement, and canonical plan codes persisted verbatim.
- **Action**: Delete the spec. If a persistence guard is still wanted, re-author it behaviourally against the current canonical contract: every legacy alias (BASIC, MEDIUM, PRO, STARTER...) is stored and decisioned as PREMIUM, FREE stays FREE. Production modules that would go with it: `src/app/features/onboarding/data-access/onboarding-persistence.service.ts`.
- **Evidence**: src/app/features/onboarding/data-access/onboarding-persistence.service.ts:90 — `const selectedPlan = normalizePlanCode(payload.selectedPlan)` then stores that value, so 'PRO' is correctly persisted as 'PREMIUM', which is why the 5 failing tests see PREMIUM.
- **Evidence**: supabase/migrations/20260707150000_mvp_free_premium_pricing_catalog.sql:128-136 — public.plan_aliases maps BASIC/STARTER/MEDIUM/GROWTH/PRO/SIMPLE/CRECE/ESCALA to PREMIUM; the spec's expectations of STARTER/GROWTH/BASIC/MEDIUM payloads (lines 132-175, 219) predate this.
- **Note**: Verified with grep: onboarding-persistence.service.ts has zero non-test importers (only this spec plus core-catalog-normalization and kb012, which the next entry also orphans). Its passing tests (tenant boundary, determinism) keep the file alive but do not justify the legacy plan assertions.

**`onboarding-landing-dashboard-wiring-sb03.red.contract.spec.ts`** (B04, high, effort M)
- **Subject**: L-02/SB-03 landing -> persistence -> dashboard wiring: FREE/PRO entitlement literals (15 monthly bookings, 10 rubros, 2000 AI credits) and BASIC/MEDIUM normalization to STARTER/GROWTH.
- **Action**: Delete the spec. The retired 3-tier model is the spine of every failing test; if the landing hand-off still needs an end-to-end guard, author it against the MVP flow in apps/landing plus the current FREE/PREMIUM contract, not against this module. Production modules that would go with it: `src/app/features/onboarding/data-access/landing-dashboard-onboarding-wiring.flow.ts`.
- **Evidence**: src/app/tests/integration/onboarding-landing-dashboard-wiring-sb03.red.contract.spec.ts:223 — expects `maxMonthlyBookings: 15` for FREE; the live catalog seeds FREE with 30 (20260707150000_mvp_free_premium_pricing_catalog.sql:100) and the flow returns 30.
- **Evidence**: src/app/tests/integration/onboarding-landing-dashboard-wiring-sb03.red.contract.spec.ts:418 — expects legacy BASIC to normalize to 'STARTER'; the flow returns 'PREMIUM' (canonical-plan-codes.ts:7 and the plan_aliases rows at migration lines 128-133).
- **Note**: grep: landing-dashboard-onboarding-wiring.flow.ts has no non-test importer, but core-catalog-normalization.red.contract.spec.ts:144 and kb012-onboarding-flow-guard.red.contract.spec.ts:104 also load it by path, so delete the flow only together with those (kb012 is red for the same 'PRO vs PREMIUM' reason).

**`signup-multirubro-catalog.red.contract.spec.ts`** (G3, high, effort M)
- **Subject**: Mixes dead SignupBusinessTypesStepPage multi-rubro preload (tests 1-2) with live service-catalog-suggestions preload/dedupe (tests 3-5)
- **Action**: Delete the two dead-component tests (:53-76 — covered by kbn007) and move the three live suggestion tests (:78-120) into a renamed servicios/data-access contract spec (e.g. service-catalog-suggestions.contract.spec.ts); do not keep a dashboard spec whose only remaining subject is not reachable from the app. Production modules that would go with it: `src/app/features/onboarding/pages/signup-business-types-step.page.ts`, `src/app/features/onboarding/pages/signup-business-types-step.page.html`, `src/app/features/onboarding/pages/signup-business-types-step.page.scss`.
- **Evidence**: signup-business-types-step.page.ts has zero non-test importers repo-wide (grep for the filename/class outside src/app/tests matches only itself, :268), while src/app/app.routes.ts:62-84 routes signup to features/auth/pages/in-app-signup-wizard.page — so tests 1-2 exercise unreachable code.
- **Evidence**: Tests 3-5 guard genuinely live code: src/app/features/servicios/pages/servicios.page.ts:9-11 imports getSuggestedServicesForRubros from ../data-access/service-catalog-suggestions; ran this spec today: 5/5 pass.
- **Note**: Confirm on issue #1076 whether the signup-business-types step is retired or parked before deleting the component itself; the suggestion tests carry no such dependency.

## 4. Gate implications

- The 14 specs referenced by CI/scripts are **untouched** by every verdict in this document: none of them is in the failing set at all.
- `pnpm run check:dashboard` runs 5 dashboard specs today (1 in `test:dashboard:time-picker`, 4 in `test:dashboard:contracts`) plus `ng build`; the full 2045-test suite runs in no gate — `test:dashboard` exists but is wired to nothing. Raising that coverage is Fase 0 item 3 of #1076, not this triage.
- The 7 `BACKLOG` files must stay **out** of any future full-suite gate until their requirement ships, otherwise the gate is red by construction.
- 45 of the 77 `*.red.contract.spec.ts` files now pass: the label is stale. Renaming them is deliberately **out of scope** here (churn with no behavioural value); when Fase 0.3 wires the full suite into CI, the label stops being a substitute for a gate.

## 5. Batch 1 — proposed deletions

Fourteen files, 68 of the 252 failures (27 %), chosen as the strict intersection of: `DELETE` verdict, **high** confidence, **no** `delete_also`, **no** open product question, and a single family-level rationale that can be stated in one sentence: *specs of two subsystems that were deliberately retired — the four-theme dashboard and the in-memory `TurnoService` mock.*

| # | File | Why it goes |
|---|---|---|
| 1 | `src/app/tests/integration/kb001-supabase-connection-guard.red.contract.spec.ts` | Asserts against its own Supabase stub (`rpc: async () => ({ data: null, error: null })`), so `tableExists` can only become `true` by editing the stub; its env premise (`SUPABASE_URL`/`SUPABASE_ANON_KEY`) does not exist — the live contract is `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` (`packages/config/src/dashboard-env.ts:1`), already covered by the green `core/runtime/supabase-client.factory.contract.spec.ts`. |
| 2 | `src/app/tests/integration/kb003-turnos-load-guard.red.contract.spec.ts` | Exercises `createMockTurnoService()` only; no production `TurnoService` exists (live booking lives in `@orvel/booking`). |
| 3 | `src/app/tests/integration/kb004-turnos-create-guard.red.contract.spec.ts` | Same double; 12 "resolved instead of rejecting" failures are the fake's missing validation. Create/conflict/validation rules are covered in `packages/booking/src/application/booking-scheduling.service.ts:60-66` and `booking-core.ts:40`. |
| 4 | `src/app/tests/integration/kb005-turnos-update-cancel-guard.red.contract.spec.ts` | Same double (`setProvider` no-op); two failures are thrown by the double itself. Cancel/reschedule semantics live in `packages/booking/src/domain/`. |
| 5 | `src/app/tests/integration/kb014-home-compile-blockers.red.contract.spec.ts` | Guards `revenueChartState` / `mapSupabaseRevenueToBars`, symbols that never existed in any production file in the repo's history. |
| 6 | `src/app/tests/integration/agenda-palette-isolation.story3.contract.spec.ts` | Demands `@if (isIndustrial)` / `@if (isInk)` branches in `turnos-list.page.html`, which has zero theme conditionals; contradicted by the passing zen-only gate. |
| 7 | `src/app/tests/integration/servicios-palette-isolation.story1.contract.spec.ts` | Same for `servicios.page.html`. |
| 8 | `src/app/tests/integration/configuracion-palette-isolation.story2.contract.spec.ts` | Passes only on dead `get isInk() { return false }` tombstones; demands unreachable branches. |
| 9 | `src/app/tests/integration/configuracion-industrial-palette-conformance.storyA.contract.spec.ts` | The `industrial-` namespace it conforms to no longer exists anywhere in the settings UI. |
| 10 | `src/app/tests/integration/theme-switch.contract.spec.ts` | Pins four themes and hex values (`#F2F4F3`, `#8BA888`, `#D9C5B2`) that exist only inside spec files; the resolver coerces everything to zen. |
| 11 | `src/app/tests/unit/theme-tokens.contract.spec.ts` | Requires the four-theme token map; production declares one palette. |
| 12 | `src/app/tests/unit/dashboard-home-theme-token-path.red.contract.spec.ts` | Reads `src/app/pages/dashboard/home/dashboard-home.page.ts` — a path that exists nowhere in the tree or in git history, so it can only ever throw `ENOENT`. |
| 13 | `src/app/tests/integration/stitch-remaining-dashboards.contract.spec.ts` | Requires per-theme token triples and four topbar testids; the shell mounts one zen topbar. |
| 14 | `src/app/tests/integration/stitch-zen-dashboard.contract.spec.ts` | Its only red assertion pins `turno-admin-reschedule-action`, a hook deliberately removed in `95b5bbd`; its green assertions duplicate `sidebar-navigation-stabilization.contract.spec.ts` and `ux-hardening-responsive.contract.spec.ts`. |

**Acceptance criteria for batch 1**

1. Full suite re-run: `252 → 184` failures (exactly the 68 asserted by these files), 296 → 282 spec files, and **zero new** failing tests or files (failure parity, not pass-parity).
2. The one collection error (`kb010`) is unchanged — it is a `FIX_CODE` item, not part of this batch.
3. `tsc -p tsconfig.app.json --noEmit` and `pnpm --dir apps/dashboard run build` still pass (no production file is touched, so this is a regression check on the deletion itself).
4. No file in the 14 appears in `.github/workflows/*.yml` or in a `package.json` script (verified before deleting).

**Deliberately left for the next batches**

| Batch | Contents | Why not now |
|---|---|---|
| 2 | The other 14 clean `DELETE`s (`kb013`, `kb015`, `p0-2`, `supabase-client-factory-typing`, `ts4111`, `active-branch-ux`, `configuracion-decomposition-safety`, `dashboard-atomic-layering-pages`, `clientes-ui-facade`, `turnos-notifications`, `mock-login-business-type-session`, `kbn004`, `onboarding-plan-post-editing`, `typescript-compile-fix`) | Same class as batch 1, different rationale; kept separate so each PR states one reason. |
| 3 | The 3 deletions carrying `delete_also` (`onboarding-persistence-l02` + `onboarding-persistence.service.ts`, `onboarding-landing-dashboard-wiring-sb03` + `landing-dashboard-onboarding-wiring.flow.ts`, `signup-multirubro-catalog` + `signup-business-types-step.page.{ts,html,scss}`) | They remove production modules; each needs its own verify-importers pass and Santi's OK. |
| 4 | `FIX_CODE` (4) and `BACKLOG` (7) | Product decisions, scheduled as their own issues. |
| 5 | `REWRITE` (61) + `MERGE` (6) | The largest body of work in the epic; each rewrite is a slice of Fase 1–3, not a cleanup. |

## 6. What this triage does not decide

- **Rewrites are scheduled, not done.** Every REWRITE verdict states what the behavioural spec must assert; writing them belongs to the Fase 1–3 slices that touch those areas.
- **The `red` filename label stays.** All 77 `*.red.contract.spec.ts` files keep their names in this change; renaming 45 green ones is churn with no behavioural value.
- **No production code is touched** by this document or by batch 1. The three `delete_also` cases wait for batch 3.
- **Coverage is still unmeasured.** `@vitest/coverage-v8` is not installed, so the thresholds in `vitest.config.ts` (lines 70 / functions 70 / branches 60) remain unverified; deleting text-locking specs changes the *shape* of the suite, not a measured number.
