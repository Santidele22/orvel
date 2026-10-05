# Orvel dashboard audit — coupling, code quality, security

**Date**: 2026-09-28
**Scope**: `apps/dashboard` (Angular 21 PWA), plus the Supabase assets it depends on (`supabase/migrations`, `supabase/functions`) and the monorepo packages it imports.
**Revision audited**: `c03a058` (`origin/dev`, after the six refactor PRs #1061–#1066 merged).
**Method**: three independent read-only audits (coupling, code quality, security), each measured with its own scripts and commands, plus cross-cutting measurements by the orchestrator (bundle, coverage proxy, before/after refactor delta, ADR conformance). No file in the repo was modified by the auditors.
**Previous audits**: `docs/audits/2026-09-28-dashboard-coupling.md` (refactor journal) and the untracked `docs/audits/2026-09-28-dev-code-audit.md` (security audit from another session; **not present in worktrees because it was never committed**).

---

## 0. Executive summary

| # | Finding | Area | Severity |
|---|---|---|---|
| S1 | `services` table allows **cross-tenant anonymous enumeration** (RLS policy filters by `is_active`, not by tenant; never revoked for `anon`) | Security | **High** |
| S2 | Dashboard and landing share origin **and the auth storage key**, so any landing XSS can steal dashboard sessions | Security | **High** |
| S3 | No `Content-Security-Policy` and no HSTS on a PWA that keeps tokens in `localStorage` | Security | **High** |
| S4 | `@angular/core` pinned at `21.2.17` by an **override**, below the patched versions (`21.2.19`/`21.2.20`) | Security | **High** |
| C1 | Area cycle `core ↔ shared`: `shared/` imports `core/` 13× and `core/` imports `shared/` 2× | Coupling | **High** |
| C2 | 24 horizontal `feature → feature` edges (13 pairs), including a real `billing ↔ onboarding` cycle | Coupling | **High** |
| C3 | Three feature "god services" hold 27 % of total fan-in (`servicio.service` 24, `cliente.service` 23, `business.service` 14) | Coupling | **High** |
| Q1 | The suite validates **text, not behaviour**: 216/296 specs (73 %) read sources and assert with regex; they produce 152 of the 252 failures | Quality | **High** |
| Q2 | **0 of 36 components use `ChangeDetectionStrategy.OnPush`** (verified: 36 files declare `@Component`, 0 declare `ChangeDetectionStrategy`) while the app runs zone-based change detection | Quality | **High** |
| Q3 | God files and god methods: 4 files >1000 LOC, 24 methods >60 LOC, one file with 236 branch points | Quality | **High** |
| S5 | `subscription-status` edge function reads ids from the query string and uses service-role **without verifying ownership** | Security | Medium |
| S6 | `resolve_business_by_slug` (GRANTed to `anon`) returns deposit alias/CBU and falls back to the owner's phone | Security | Medium |
| C4 | No single data layer: 12 files import `@supabase/supabase-js` directly, 3 client-access mechanisms, direct `localStorage` in 17 production files | Coupling | Medium |
| Q4 | 787 duplicated blocks ≥8 lines (76 ≥20, 5 ≥40), including 29 lines of **production code copied into a spec** | Quality | Medium-High |
| Q5 | No ESLint anywhere in the repo; `check:servicios:compile` is broken (ENOENT); 2 QA scripts are unwired and 1 is vacuous | Quality | Medium |
| S7 | `sync-mp-plans` has `verify_jwt = false` and **no local source**, so it cannot be audited | Security | Medium |
| Q6 | 7 orphan `.ts` files, of which 3 are real (2 billing shims kept alive only by a test, 1 tombstone re-export) | Quality | Low |
| S8 | Three `SECURITY DEFINER` functions without a fixed `search_path` | Security | Low |

Positive findings are listed in §4.4 and §5; they matter as much as the problems, because they bound what needs fixing.

---

## 1. Effect of today's refactor (before `a454a04` → after `c03a058`)

Measured by the orchestrator on two worktrees of the same repository.

| Metric | Before | After | Delta |
|---|---|---|---|
| Production files / lines | 186 / 24 688 | 167 / 23 428 | **−19 files, −1 260 lines** |
| Spec files / lines | 297 / 45 008 | 296 / 44 958 | −1 / −50 |
| `core/shared → features` inversions (files) | 8 | **1** | −7 |
| Files in `src/app/services/` (legacy) | 7 | **0** | −7 |
| Feature importers of `features/settings/.../business.service` | 6 | **0** | −6 |
| Failing tests (full suite) | 278 | **252** | −26 |
| Bundle JS (all chunks) | 1 690 037 B / 74 files | 1 693 353 B / 77 files | +3 316 B (+0,20 %) |
| `tsc app` / `tsc spec` errors | 0 / 769 | **0 / 767** | −2 |

The single remaining `core → features` edge is `core/auth/mock-login-business-types.ts:2` → `features/onboarding/data-access/onboarding-rubros.ts`, required by `tests/unit/onboarding-rubro-multiselect.contract.spec.ts`. Everything cuttable was cut.

---

## 2. Coupling

### 2.1 Import graph

575 internal relative edges across 463 `.ts` files under `src/app` (production subgraph: 163 files / 23 119 lines). Method: line-by-line parser resolving `import/export … from './'|'../'` against `.ts`/`index.ts`, validated against raw grep counts. Bare imports (`@angular/*`, `@supabase/*`, `@orvel/*`, `rxjs`) are excluded from the graph and counted separately.

Fan-out / fan-in by top-level area: `core` **100/310** · `tests` 164/19 · `features/booking` 76/38 · `features/settings` 45/30 · `features/onboarding` 42/23 · `features/servicios` 22/28 · `features/clientes` 18/26 · `shared` 19/21 · `models` 0/35 · `features/billing` 18/11 · `features/dashboard-home` 19/3 · root 19/3 · `features/auth` 13/8.

`core` absorbs 54 % of all fan-in. The global direction is correct (features → core) except for the edges below.

Fan-in top 5: `core/auth/auth.service.ts` 35 · `features/servicios/data-access/servicio.service.ts` 24 · `features/clientes/data-access/cliente.service.ts` 23 · `core/branches/branch-context.service.ts` 19 · `core/plans/plan-entitlements.ts` 19.
Fan-out top 5: `features/booking/pages/turnos-list.page.ts` 18 · `features/dashboard-home/pages/dashboard-home.page.ts` 16 · `features/settings/pages/configuracion.page.ts` 16 · `shared/dashboard-shell/dashboard-shell.component.ts` 13 · `features/booking/pages/turno-form.page.ts` 12.

### 2.2 Horizontal coupling: 24 `feature → feature` edges (13 pairs)

| Edge | Files | Count |
|---|---|---|
| `booking → clientes` / `booking → servicios` | `turnos-list.page.ts:18,19`, `turno-form.page.ts:13,14`, `public-booking.page.ts:8`, 3 specs | 9 |
| `settings → onboarding` | `business-settings.facade.ts:6,7`, `business.service.ts:10` | 3 |
| `settings → {servicios, billing, operator-web-push}` | `configuracion.page.ts:20,31,35` | 3 |
| `dashboard-home → {operator-web-push, pwa-install}` | `dashboard-home.page.ts:16,17,18` | 3 |
| `servicios → onboarding` | `service-catalog-suggestions.ts:2`, `servicios.page.ts:18` | 2 |
| **`billing ↔ onboarding` (cycle)** | `billing-subscription.page.ts:9` ↔ `signup-plan-step.page.ts:8` | 2 |
| `perfil → operator-web-push`, `servicios → settings` (spec only) | | 2 |

Interpretation: features reuse **each other's data-access services**, not shared contracts. `@orvel/booking` is the only package adopted as a contract (42 imports); the other `@orvel/*` packages are used 2–6 times each.

### 2.3 Layer inversions

- `core → features`: **1 edge** (the contract-required rubros one, §1).
- `shared → features`: **0**.
- `core → shared`: **2** — `core/templates/dashboard-templates.ts:4-5` imports `shared/dashboard-topbar/templates/zen-topbar.component.ts` and `shared/dashboard-sidebar/templates/zen-sidebar.component.ts`.
- `shared → core`: **13** — `shared/dashboard-shell/dashboard-shell.component.ts` (11) and `shared/dashboard-topbar/templates/zen-topbar.component.ts:3,4` (2).

That pair is the area cycle **C1**: a presentational layer imports the app core, while core imports presentational templates back.

### 2.4 Cycles

Real cycles at file level: **1** — `core/auth/mock-login-business-types.ts:1` → `core/auth/session-contract.ts:15` → `core/auth/validate-session-schema.ts:1`. No self-loops.
Cycles at area level: **2** — `core ↔ shared`, and `features/servicios ↔ features/settings` (the latter only through a spec).
4 sub-directory SCCs, of which 3 are aggregation artefacts (different files, no real cycle) and 1 is real: `core/{accounts,auth,billing,branches,catalog,observability,plans,runtime}` + `features/billing` + `features/onboarding` (10 nodes).

### 2.5 Infrastructure coupling

| Mechanism | Files | Occurrences |
|---|---|---|
| `from '@supabase/supabase-js'` | 12 (7 core / 5 features) | 12 |
| `createSupabaseClient` | 12 | 28 |
| `getSupabaseClient` | 7 | 25 |
| `SUPABASE_CLIENT` token | 4 | 9 |
| Union of the three | **23** | 62 |
| `localStorage` | 43 (17 production) | 124 |
| `sessionStorage` | 5 (4 production) | 7 |

`core/storage/browser-storage-keys.ts` has fan-in 14 but only exports **keys**; there is no access gate.

### 2.6 God nodes and size

23 of 463 files (5.0 %) exceed 500 lines. Highest combined fan-in+fan-out: `core/auth/auth.service.ts` 38 (35/3, 216 LOC) · `features/servicios/data-access/servicio.service.ts` 31 (24/7, 1061) · `features/clientes/data-access/cliente.service.ts` 29 (23/6, 745) · `core/branches/branch-context.service.ts` 23 · `features/settings/data-access/business.service.ts` 23 (14/9, 674) · `features/booking/pages/turnos-list.page.ts` 21 (3/18, 1020) · `features/settings/pages/configuracion.page.ts` 18 (2/16, 1113).

Pages with >600 LOC **and** fan-out 9–18 orchestrate data from 4–5 features: `public-booking.page.ts` (1217/9), `configuracion.page.ts` (1113/16), `turnos-list.page.ts` (1020/18), `turno-form.page.ts` (602/12).

### 2.7 Dependency depth

Maximum chain length: **15 edges**. 15 files sit at depth 14–15. Longest chain starts at `features/clientes/pages/clientes.page.ts` and passes through `core/theming` → `core/templates` → `shared/dashboard-topbar` → `core/notifications` → `core/auth` → `features/onboarding` → `core/catalog` → `core/runtime`.
Closure from entry points: `dashboard-shell.routes.ts` reaches 43 files; `app.config.ts` 28; `features/settings/pages/configuracion.page.ts` 57 (largest production closure).

---

## 3. Code quality

### 3.1 Size

463 `.ts` files, 68 848 lines: 167 production (23 595 lines) vs 296 specs (45 253 lines) — **1,9 spec lines per production line**.
Thresholds (total · production · specs): >300 lines → 56·20·36 · >500 → 23·12·11 · >800 → 8·5·3 · >1000 → 6·4·2.

Production top 10: `public-booking.page.ts` 1217 · `configuracion.page.ts` 1113 · `servicio.service.ts` 1061 · `turnos-list.page.ts` 1020 · `core/api/supabase-booking.gateway.ts` 877 · `cliente.service.ts` 745 · `business-settings.facade.ts` 692 · `business.service.ts` 674 · `in-app-signup-wizard.page.ts` 654 · `signup-business-types-step.page.ts` 606.
Spec top 3: `public-booking-settings-sync.contract.spec.ts` 1987 · `kb005-turnos-update-cancel-guard.red.contract.spec.ts` 1277 · `kbn007-signup-business-types-step.red.contract.spec.ts` 820.

### 3.2 Complexity

Branch points (upper bound, includes template literals): `public-booking.page.ts` 236 · `business.service.ts` 173 · `configuracion.page.ts` 165 · `supabase-booking.gateway.ts` 149 · `business-settings.facade.ts` 136 · `servicio.service.ts` 133.
24 methods >60 lines, worst: `business-settings.facade.ts:315` `saveToSupabase` 138 · `signup-business-types-step.page.ts:97` 104 · `public-booking.page.ts:339` `loadPortal` 100 · `public-booking.page.ts:866` `checkDaysAvailability` 97 · `turno-form.page.ts:277` `checkAvailability` 95.

### 3.3 Duplication

787 blocks ≥8 normalized lines appear in more than one place (76 ≥20, 5 ≥40). Worst cases: two 49-line spec headers (`supabase-api-layer-red` ≡ `supabase-gateway-mapping-red`), a 46-line block shared by two deposit specs, a 42-line block between `turno-form-bookable-days.behavior.spec.ts` and `turno-form-walk-in.behavior.spec.ts`, and — most notably — **29 lines of production code copied verbatim into a spec**: `features/onboarding/data-access/landing-dashboard-onboarding-wiring.flow.ts:16-44` ≡ `tests/integration/onboarding-landing-dashboard-wiring-sb03.red.contract.spec.ts:9-37`.
Production-only: 36 blocks; worst is 27 lines between `in-app-signup-wizard.page.ts:623-649` and `signup-business-types-step.page.ts:485-511`.

### 3.4 Weak types and lint

`: any` 25 · `as any` 34 (11 production) · `as unknown as` 70 (3 production) · `<any>` 3 · `@ts-ignore` 0 · `@ts-expect-error` 0 · `eslint-disable` 0 — because **ESLint is not installed anywhere in the repo** (0 configs, 0 dependency).
Highlight: 7 × `@Input({required:true}) ctx!: any` in `features/settings/pages/components/modal/*` and `themes/configuracion-zen-theme.component.ts:13`; `business.service.ts:512,642` map untyped rows; `supabase-booking.gateway.ts:294,374,495` `result.data as any`.

### 3.5 Marked debt

`TODO` 84, **all inside `src/app/tests/**`** (0 in production); `FIXME`/`HACK`/`XXX`/`@deprecated` 0. Several TODOs ask for features that already exist (e.g. `tests/integration/mini-cal-booking-public-ui.contract.spec.ts:18`, `business-settings-page-ui.contract.spec.ts:23`), which confirms spec↔code drift rather than real backlog.

### 3.6 Angular consistency

`standalone: true` in 34 of 36 components (only `app.ts` omits it, which is the v21 default) · **`OnPush` in 0 of 35** while `app.config.ts:19` installs `provideZoneChangeDetection` · `inject()` in 36 files vs 2 constructor-injection outliers (`features/clientes/data-access/clientes-ui.facade.ts:32`, `core/auth/supabase-auth.client.ts:128`) · `signal()` in 27 files, `BehaviorSubject` 0, `Subject` 0 · templates: `@if` ×197, `@for` ×40, `@switch` ×2, legacy `*ngIf` 0 and `*ngFor` 1 (`features/onboarding/pages/onboarding-business-step.page.html:9`).

### 3.7 Test quality

296 specs, 2 135 `it()`/`test()`:
- **source-locking 216 (73,0 %)** — read the source with `readFileSync`/`import.meta.url`/`sourceText` and assert with regex. (Criterion note: a stricter count — only `readSource`/`readFileSync`/`import.meta.url`/`readUtf8` — yields **136** specs; the 216 figure includes specs that reach the source through their own helpers. Both figures are quoted because §5 uses the strict one.)
- behaviour (TestBed / `vi.fn` / `vi.mock` / spyOn without reading sources) 28 (9,5 %);
- pure unit 52 (17,6 %).
Hygiene: `it.only`/`describe.only` 0 · `it.skip` 1, `describe.skip` 1 · 2 specs with 0 `expect()` and 18 with 1–2.
Of the 252 failures: **source-locking 152 (60,3 %)** · pure unit 81 (32,1 %) · behaviour 17 (6,7 %) · 2 outside `src/app`. 31 of the 84 red files are named `*.red.contract.spec.ts` and concentrate 131 failures (deliberately red contracts, not regressions); the remaining 121 failures across 53 files mix real breakage (e.g. `tests/unit/cliente.service.spec.ts` 19, `configuracion-decomposition-safety.contract.spec.ts` 5, `dashboard.spec.ts` 4).

Coverage proxy (orchestrator): 118 of 167 production files (**70 %**) are imported or path-read by at least one spec; **49 have no spec touching them**, including `landing-plans-source.api.ts` (202 lines), `perfil.page.ts` (190), `create-subscription.api.ts` (151), `configuracion.validation.ts` (104). Real coverage was **not** measured: `@vitest/coverage-v8` is not installed, so the thresholds in `vitest.config.ts` (lines 70 / functions 70 / branches 60) are unverified.

### 3.8 Orphans

Of 172 production `.ts` files, 7 have no relative importer; 4 are configuration-referenced. Real orphans:
- `src/app/models/branch.model.ts` — tombstone re-export; its own comment says "Deletable once no importer references this old path", and today it is only a string in `tests/unit/packages-types-shape.red.contract.spec.ts:20`;
- `src/app/features/billing/data-access/payments/webhooks/payment-webhook-idempotency.ts`;
- `src/app/core/payments/manual/index.ts` (barrel, zero importers) — both billing files are declared intentional by `packages-billing-shape.red.contract.spec.ts` yet nothing imports them.
Legacy shims kept alive only by tests: `src/app/pages/booking/public-booking.validation.ts` (5 lines, imported exclusively by `tests/unit/public-booking-validations.red.contract.spec.ts:23`) and `src/app/validators/servicio-form.validator.ts` (48 lines, only `tests/unit/servicio-management.contract.spec.ts`).

### 3.9 Tooling

- `scripts/qa/check-servicios-compile-red.mjs` — **broken**: reads `src/app/pages/dashboard/servicios/servicios.page.html`, a path deleted long ago (the file lives in `features/servicios/pages/`) → ENOENT, exit 1. Wired as `check:servicios:compile` (`apps/dashboard/package.json:8`).
- `scripts/qa/check-calendar-picker-scss-red.mjs` — vacuous: always exits 0 with "Unexpected pass".
- `scripts/qa/check-no-direct-bookings-reads.mjs` and `check-remixicon-assets.mjs` — pass, but are wired to **nothing** (no package.json script, no CI step).
- `check:dashboard` = `test:dashboard:time-picker` + `test:dashboard:contracts` + `build`; **none of the four QA scripts is in that gate**, which is why they rotted unnoticed.
- Build emits 1 warning: `NG8113: RouterLink is not used within the template of MobileTurnoDetailComponent` (`features/booking/ui/mobile-turno-detail/mobile-turno-detail.component.ts:15`).

### 3.10 Bundle (orchestrator)

Initial total **694,97 kB raw / 176,57 kB transfer**; 77 JS chunks totalling 1 654 kB; largest chunk 319,9 kB; `main` 49,9 kB; `ngsw-worker.js` 82,8 kB; `dist` 2,5 MB. Declared budgets (`angular.json`): initial warning 2 MB / error 3 MB, `anyComponentStyle` 10 kB — the initial budget is ~3× the current size, which is why regressions there would not be caught.

---

## 4. Security

### 4.1 High

**S4 · Vulnerable Angular pinned by override.** `package.json:65` and `pnpm-workspace.yaml:8` force `@angular/core` to `21.2.17`. Two advisories require higher versions: `GHSA-jj27-h5hq-8x99` (HIGH, XSS via i18n; fixed in ≥21.2.19) and `GHSA-hh8m-fm6v-7cvg` (MODERATE, sanitizer bypass; fixed in ≥21.2.20). A `pnpm update` does **not** fix this — the override must be edited. Mitigation today: the app uses no `$localize`/i18n, so the HIGH path is not reachable. Also `@angular/common` 21.2.17 → `GHSA-jhpw-976m-542j` (HIGH, HttpTransferCache) and `GHSA-p297-fm68-3q8c` — the app does not use hydration/transfer cache.

**S2 · Landing and dashboard share origin and auth storage key.** The key `orvel.supabase.auth` is defined once in `packages/config/src/supabase-storage-key.ts:1` and used by the dashboard (`core/auth/supabase-config.ts:17`, `core/runtime/supabase-client.factory.ts:12`) and by the landing (`apps/landing/src/lib/supabase-auth-adapter.ts:74`). `scripts/vercel-output-config.mjs:2-4` serves `/dashboard/*` from the same deployment as the Astro site. Consequence: any XSS in the landing can read the dashboard's refresh token. Suggested fix: `dashboard.orvel.pro` (already in the handoff CORS allowlist, `supabase/functions/_shared/session-handoff-cors.ts:13`) with its own storage key.

**S3 · No CSP and no HSTS.** `scripts/vercel-output-config.mjs:13-18` sets only `X-Content-Type-Options`, `X-Frame-Options: DENY`, `X-XSS-Protection` and `Referrer-Policy`, frozen by `apps/dashboard/src/app/tests/unit/vercel-output-security-headers.contract.spec.ts:9-14`. With tokens in `localStorage`, CSP is the highest-value mitigation available.

**S1 · `services` allows cross-tenant anonymous reads.** `supabase/migrations/20260629190000_harden_public_services_rls.sql:7-11` creates policy `"Public view active services" … TO anon USING (COALESCE(is_active,true)=true)` — it filters by `is_active`, **not by tenant** — and never revokes table access for `anon`. `apps/dashboard/src/app/features/servicios/data-access/servicio.service.ts:598-601` reads it with the anonymous client. Anyone holding the (public) anon key can `select=*` and enumerate name, price and `business_id` for **all** tenants. `20260928150000_harden_public_tenant_reads.sql:16-25` acknowledges this and defers it to an expand/contract. Fix: public catalogue behind a `SECURITY DEFINER` RPC plus `REVOKE ALL ON TABLE public.services FROM anon`.

### 4.2 Medium

**S5 · `subscription-status` IDOR.** `supabase/functions/subscription-status/index.ts:30-57,72-85` takes `subscription_session_id`/`preapproval_id` from the query string, uses service-role and performs **no** `auth.getUser` nor ownership check, unlike `cancel-subscription/index.ts:448-461,521-523`, `create-subscription/index.ts:263-264` and `change-subscription/index.ts:89,132-134`. The function is absent from `supabase/config.toml` (so `verify_jwt` defaults to true), but the anon key is itself a valid JWT — `Authorization: Bearer <anon key>` passes. Impact bounded to `status`/`materialized` of third parties.

**S6 · Deposit data still anonymous through RPC.** The `business_settings` revocation is closed at table level: `20260928151800_revoke_anon_business_settings.sql:31-32` is the head migration (144 migrations, no later re-grant). But `20260904240000_public_deposit_receipt_contact.sql` redefined `resolve_business_by_slug` to return `depositAlias`, `depositCbu` and `supportPhone` — with a fallback to the **owner's phone from `profiles`** — and it is GRANTed to `anon` (lines 76-86). Intentional (the public turnero must show where to transfer), lookup by slug only, no bulk dump. Fix: gate the fields on `deposit_enabled = true` and drop the owner-phone fallback.

**S7 · `sync-mp-plans` is unauditable.** `supabase/config.toml:430-431` sets `verify_jwt = false` and there is **no source** at `supabase/functions/sync-mp-plans/`. If deployed, it is an endpoint without JWT verification.

**C4 (coupling, security-relevant)** · 17 production files touch `localStorage` directly instead of going through `core/storage`, which spreads the XSS-exfiltration surface and makes key rotation harder.

### 4.3 Low

- Three `SECURITY DEFINER` functions without `SET search_path`: `20260501_consolidated_schema.sql:141` (`is_business_owner`, used in RLS), `20260529000000_billing_plans_and_entitlements.sql:109` (`assert_business_entitlement`), `20260707150000_mvp_free_premium_pricing_catalog.sql:185` (`get_active_plans`). Supabase Lint flags these; real exploitability is low because identifiers are qualified with `public.`.
- Guard asymmetry: `apps/dashboard/src/app/app.routes.ts:43-49` — `/billing/subscription` has no `canActivate` while `/billing/subscription/cancel` (line 48) does; `/payments/return/*` (28-41) and `/dashboard/installar` (52-56) are public.
- `?handoff=` in the URL (`core/auth/route-protection.ts:132-171`) — well mitigated (2-minute TTL, 32-byte hashed single-use token, AES-GCM, `replaceState` after exchange) but still travels through logs/history/Referer.
- `apps/dashboard/src/orvel-push-sw.js:45,52,57,60` uses `payload.url` without validating its origin in `notificationclick`.
- Deposit alias/CBU persisted in `sessionStorage` (`features/booking/pages/public/public-booking-deposit-hold.ts:74-98`).

### 4.4 Dependencies (method: `pnpm audit --json`, exit 1, over the workspace lockfile; `npm audit` failed with ENOLOCK — npm workspaces are declared without a root lockfile, so that result is **not** reported as clean; OSV API queried per direct dependency)

- `@angular/core`/`compiler` 21.2.17 and `@angular/common` 21.2.17 — see S4.
- `devalue` <5.9.1 (transitive via `@vercel/analytics > svelte`) → `GHSA-9rgm-9g3h-6x36`; the `/svelte` export is not imported (`src/main.ts:3`).
- 40+ HIGH/MODERATE/LOW advisories in `piscina`, `undici`, `brace-expansion`, `fast-uri`, `hono`, `ip-address`, `qs`, `nanoid`, `immutable`, `browserslist`, `vitest`, `@babel/core`, `body-parser` — all in the **build toolchain** (`@angular/build`, `@angular/cli`, `vite`, `jsdom`), not shipped in the bundle.
- OSV reported **no advisories** for `@supabase/supabase-js` 2.108.2, `zod` 4.4.3, `@vercel/analytics` 2.0.1, `chart.js` 4.5.1, `driver.js` 1.8.0, `canvas-confetti` 1.9.4, `remixicon` 4.9.1, `rxjs` 7.8.2, `zone.js` 0.16.3, `@angular/service-worker` 21.2.18.
- Out of scope but relevant to S2: `apps/landing` has one CRITICAL advisory (`astro` `GHSA-26w7-cxv4-gfx2`, RCE via AVIF).

### 4.5 Good practices already in place (do not re-report these as gaps)

- **XSS**: zero dangerous sinks in production code — no `innerHTML`, `[innerHTML]`, `bypassSecurityTrust*`, `DomSanitizer`, `eval`, `new Function`, `document.write` or `javascript:` (they appear only in tests).
- **Secrets**: none versioned; no `.env` tracked or present; anon key comes from the environment; `environment.generated.ts` is gitignored; `eyJ…`/`sb_publishable_` strings are test fixtures; no `service_role` in the client.
- **RLS**: all 55 created tables have `ENABLE ROW LEVEL SECURITY` (automated diff, 0 missing). The `USING (true)` policies from `20260501_consolidated_schema.sql:161-169` were closed: `bookings` in `20260615174014_harden_public_bookings_direct_access.sql:6-10`; `businesses`/`branches`/entitlements in `20260928150000:37-49`; `business_settings` in `20260928151800:31-32`.
- **Server-side authorization**: `get_business_entitlements_snapshot` validates `is_business_owner` (`20260905210000_premium_trial_14_days.sql:23-25`); the three billing functions verify JWT + `owner_id`.
- **Edge functions**: CORS by allowlist, never `*` (`_shared/billing-security.ts:57-69`, `_shared/session-handoff-cors.ts:38-48`); the `verify_jwt = false` functions validate `CRON_KEY` in constant time and fail closed (`account-closure/index.ts:696`, `purge-elapsed-bookings/index.ts:39`); `process-email-outbox` additionally requires the service role (`index.ts:93-100,333`).
- **PWA**: `src/ngsw-config.json` declares no `dataGroups`, so the generated `ngsw.json` has `dataGroups: []` — **the service worker does not cache authenticated API responses**. Scope is `/dashboard/`; `X-Frame-Options: DENY` is set.
- **Session**: PKCE, autoRefresh, `detectSessionInUrl: false` (`core/runtime/supabase-client.factory.ts:5-13`); `sanitizeReturnTo` blocks open redirects and token-bearing params (`core/auth/route-protection.ts:44-80`); logout clears caches and legacy keys (`route-protection.ts:384-416`).

---

## 5. Conformance with the declared architecture

`docs/adr/0010-hexagonal-architecture.md` states the decision as "Adopt hexagonal (ports and adapters) for the Orvel dashboard. **Booking is the only pilot context. Other bounded contexts stay as-is** until a later change", with status "Accepted for booking pilot. **WU6 leftover mixed source-locks remain; the hexagonal pilot is not complete**".

Measured:

| Claim | Measurement |
|---|---|
| Hexagonal pilot structured for booking | `packages/booking/src/{application,domain,infrastructure,observability}` exist; 39 dashboard files import `@orvel/booking` (42 imports) — the only shared package broadly adopted |
| Pilot not complete (leftover source-locks) | **136 of 296 specs** read sources by path; booking itself still has 3 such specs (`booking.providers.consumer.contract.spec.ts`, `turnos-list.page.section-cache.spec.ts`, `public-booking.service.contract.spec.ts`) |
| Other contexts stay as-is | 24 feature→feature edges and 3 feature god services remain, i.e. the coupling the pilot exists to break persists outside booking |

---

## 6. Recommended priorities

Ordered by (impact ÷ effort), each with the evidence above.

**Now — security, small diffs**
1. Raise the Angular override to `21.2.20` (`package.json:65`, `pnpm-workspace.yaml:8`) for `@angular/core`, `@angular/common`, `@angular/compiler` (S4).
2. Add CSP + HSTS in `scripts/vercel-output-config.mjs` and update the contract that freezes the header list (S3).
3. Require authentication and ownership in `subscription-status`, or sign the id (S5); audit/remove `sync-mp-plans` (S7).
4. Gate `depositAlias`/`depositCbu`/`supportPhone` on `deposit_enabled = true` and drop the owner-phone fallback (S6).
5. Add `SET search_path = public, pg_temp` to the three `SECURITY DEFINER` functions (S8).

**Next — product decisions (need Santi)**
6. `services`: public catalogue via `SECURITY DEFINER` RPC + `REVOKE ALL … FROM anon` (S1). This is the largest real exposure found.
7. Separate the dashboard onto its own origin/storage key (S2).
8. Decide the fate of ~150 obsolete specs (see §3.7): delete, rewrite against current behaviour, or keep `dev` red with parity as the gate. This is the single biggest lever on quality.
9. Decide whether the 22 specs that declare unimplemented requirements (`TODO(`/`Missing`) are backlog or should be closed.

**Then — structural debt**
10. Break the `core ↔ shared` cycle (C1) and the `billing ↔ onboarding` cycle (C2); replace feature→feature service reuse with contracts (as done for the business directory).
11. Introduce `OnPush` (Q2) and fix the zone-based CD assumption in `app.config.ts:19`.
12. Split the four >1000-line pages/services (Q3) and remove the 787 duplicated blocks (Q4).
13. Unify data access behind one client provider and one storage gate (C4).
14. Add ESLint to the repo and to `check:dashboard`; repair `check:servicios:compile`, delete the vacuous script, and wire or delete the two orphan QA scripts (Q5).
15. Delete the 3 real orphans and the 2 test-only shims (Q6).

---

## 8. Post-merge validation against the real QA project

The three hardening migrations were validated against `orvel-qa-dev` (the
documented pre-release project; its ref is deliberately not written here, per
`infra/context/supabase.md`) through the Supabase Management API, executing each file
inside `BEGIN … ROLLBACK` so the project was left **untouched** (re-verified
afterwards: `list_public_services` absent again, `anon` SELECT back to `true`).
Production (`orvel-prod`) was never contacted, even though its token is present
in the local `.env.local`.

The method was sanity-checked with a negative control: a deliberately broken
query returns the real Postgres error (`42P01: relation … does not exist`), so an
empty result from the migrations means "applied cleanly", not "ignored".

| Check | QA before | With the migrations |
|---|---|---|
| `list_public_services` exists | `false` | **`true`** |
| `anon` can `SELECT` on `services` | **`true`** | **`false`** |
| `is_business_owner` `search_path` | `null` | **`{search_path=public, pg_temp}`** |
| `assert_business_entitlement` `search_path` | `null` | **`{search_path=public, pg_temp}`** |
| Services the RPC returns for one business | — | **10 of 168** (tenant isolation holds) |
| RPC returns only active rows for non-managers | — | **`true`** |
| Deposit alias/CBU/percent with `deposit_enabled = false` | **published** (`Julian.mp`, `2142321321321`, `25`) | **`null`, `null`, `0`** |
| Deposit alias/CBU with `deposit_enabled = true` | published | **still published** (legitimate flow intact) |

Additional findings from the real project:

- The deposit leak and the anonymous `services` read were **live in QA**, not
  theoretical: `has_table_privilege('anon','public.services','SELECT')` was
  `true`, and the old `resolve_business_by_slug` published the alias and CBU of a
  business that had the deposit turned off.
- QA holds 144 applied migrations and 168 services, so the tenant-isolation
  number above is measured against real data.
- The owner-phone removal could **not** be exercised on real data: no QA business
  has `support_phone` and `whatsapp` empty while its owner has `profiles.phone`.
  The change is a deletion of that lookup, verified by reading the diff, and the
  case is untestable with today's QA data.

---

## 7. Method and limits

**Measured by the coupling audit**: directed graph of *static relative* imports (`import`/`export … from './'|'../'`) over 463 `.ts` files, resolved to `.ts`/`index.ts`, validated against raw grep counts (580 specifiers → 575 edges, 5 unresolved because they point outside `src/app`: `environments/environment`, `scripts/*.mjs`). Fan-in/out per file, directory and feature; feature→feature matrix; layer inversions; Tarjan SCC at three granularities; depth over the SCC DAG; counts of `@supabase/supabase-js`, the three client helpers, `localStorage`/`sessionStorage`, `@orvel/*`, LOC per file. Bare imports are excluded from the graph and counted separately; `tsconfig*.json` declares no `paths`/`baseUrl`, so no alias can be missed.

**Measured by the quality audit**: own Python tooling (string/template/comment stripper + brace matching for method sizes; normalized-shingle index + `difflib` for duplication; spec classifier; orphan resolver) and one `vitest run --reporter=json` that reproduced the baseline exactly (252 failures / 85 of 297 suites red). Evidence kept in `.cache/audit-quality/` at the repo root (`.cache/` is gitignored). Branch counts are upper bounds (they include template literals).

**Measured by the security audit**: `pnpm audit --json` over the workspace lockfile plus per-package OSV queries; static tracing of all 144 migrations to derive final RLS state; source reading of every edge function; header and service-worker configuration; `git`-based checks for secrets.

**Measured by the orchestrator**: before/after worktree diff, bundle and budget, coverage proxy (files touched by a spec's import or path read), build warnings, ADR 0010 conformance, and CI status of `dev` after the merge.

**Not verified / limits**:
- **RLS was verified against QA, not production** (§8). Production state is not observable from here; the validation proves the migrations apply and behave correctly on the QA schema, not that prod matches it.
- **Real test coverage was not measured** (`@vitest/coverage-v8` is not installed); the 70 % figure in §3.7 is a proxy, not line coverage.
- **No dynamic testing**: no Chrome/Chromium and no Deno in this environment, so no exploitation, no `deno check`, and no Playwright run.
- Runtime coupling (Angular DI, `providedIn`, injection tokens) and template/SCSS coupling were not measured; the coupling numbers are structural/static.
- Directory-level cycles are SCCs; 3 of the 4 sub-directory SCCs are aggregation artefacts, not real cycles.
- `sync-mp-plans` has no local source, so its behaviour is unknown; that functions absent from `config.toml` run with `verify_jwt = true` is an inference from Supabase's default, not a remote observation.
- `docs/audits/2026-09-28-dev-code-audit.md` is not present in worktrees (never committed), so it could not be cross-checked; its referenced items were re-verified independently.
