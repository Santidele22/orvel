# 01 — Target system architecture (post-release-2.0)

> **Version**: target post-release-2.0 (Phases 0–2 shipped, 3–4 pending) · **Owner**: @santi · **State**: target (NOT current `dev`)

![Diagram](./01-monorepo-architecture.excalidraw) _(open with [excalidraw.com](https://excalidraw.com) or VS Code "Excalidraw" extension)_

[Mermaid source](./01-monorepo-architecture.mmd) — regeneration source.

> **Canvas view**: light mode (`#ffffff`) so the diagram can be screenshotted cleanly inside docs, PRs, and ADRs. The violet/dark palette comes from `apps/dashboard/src/styles/tokens/index.css` (`--or-primary: #7C3AED`, `--or-bg-primary: #0F172A`).

> **Difference from the current `dev` state**: this diagram describes the TARGET architecture post-release-2.0. The current `dev` still has Mercado Pago and `process-email-outbox` alive. The purge lives on `feature/release-2-0-phase2-migrations` (PR #208 + #209). See `openspec/changes/release-2-0-supabase-migration/` for the full plan.

## What it shows

- External personas (Cliente, Operador, Visitante). NO Mercado Pago persona.
- The 4 target internal containers: Landing (Astro SSR), Dashboard (Angular PWA + Fase 3+4 included), Supabase target (Auth + 5 tables + 12 Edge Functions WITHOUT billing/MP/outbox + Storage + Realtime), CI/CD 3-env.
- **Multi-profesional modeling** (new) as a highlighted subgroup.
- `packages/shared/` marked as **reserved** because the workspace is still empty (.gitkeep only).
- **SMTP marked as "limited"** (red-dashed style) — only for `confirm-email.ts` (PR-c3 signup flow), not transactional, not outbox.
- **Vercel 3-track** (Production · QA · Preview).
- Labeled connections (HTTPS, JWT, RPCs, migrate, promote, signup confirm) between nodes.
- **No Mercado Pago**, **no `notification_email_outbox`**, **no `process-email-outbox`**, **no billing**.

## What it does NOT show (see other target diagrams)

- Detailed auth → `02-auth-target`
- Public booking target (in limbo, `bookings` deferred) → `03-booking-target`
- PWA offline walk-in queue (Fase 3) → `04-pwa-offline-walkin-queue`
- Service worker + IDB boundary → `05-pwa-sw-idb-boundary`
- CI/CD + 3-env promotion → `06-cicd-3env-promotion`
- Multi-profesional modeling in detail → `07-multi-profesional`
- 5-table target schema → `08-schema-5-tablas`

## Architectural decisions reflected (target)

- **Single-tenant MVP**: no `tenant_id` column. Isolation via deployment separation (3 Supabase projects: `orvel-qa-dev`, `orvel-main`, plus local SQLite). ADR 0001 (schema principles).
- **RLS ownership predicate**: `(select auth.uid()) = created_by` with `TO authenticated`. ADR 0003 (RLS policies).
- **Mercado Pago purged** (PR #208): 8 Edge Functions of billing replaced with 501 stubs. `packages/shared/billing` and `packages/shared/email` purged.
- **Email limited to signup**: `process-email-outbox` deleted (PR #209). `notification_email_outbox` table dropped. Only path: `confirm-email.ts` (PR-c3) for signup.
- **Multi-profesional**: `professionals` + `professional_services` (N:M composite PK) + `business_settings.auto_assign_professional`. When `sdd-apply` defines the `bookings` table, it will add `professional_id` FK.
- **3-env pipeline**: push to `dev` → deploy dev-remote `orvel-qa-dev`. Push to `qa` → migrate + Edge Functions + Vercel QA. Push to `main` → migrate `orvel-main` + Edge Functions + Vercel production. Required check: `dashboard-booking-regressions` + new `dashboard-mobile-regressions` (Fase 4).
- **PWA Fase 1+2 shipped** (commit `c1127a0`, PR #180): Tailwind build, `@angular/pwa`, manifest, SW, iOS meta, bottom-nav, FAB.
- **PWA Fase 3+4 included in this target**: IDB walk-in queue + auto/manual flush + collision policy + queue UI pill + badge + Playwright iPhone/Pixel + Lighthouse CI ≥ 0.90 gate.

## Stack pinning

- Dashboard: Angular 21.2.x · `@angular/service-worker` 21.2.18 · Tailwind v3 · Vitest 4 · SQLite local fallback (Phase 4)
- Landing: Astro 6.4.7 · Svelte 5.56 · `@astrojs/vercel` 10 · Tailwind v4
- Supabase: Postgres 17 + Auth + Storage + Realtime + 12 Edge Functions (Deno) · Supabase CLI 2.98.2
- 5 target tables: `business_types`, `services`, `professionals`, `professional_services`, `business_settings`
- CI/CD: GitHub Actions 5 workflows (4 base + mobile-regressions for Fase 4) + `deploy-promotion.yml` promotion · Vercel 3-track
- Monorepo: pnpm 11 workspaces · bun 1.3.10 local-only (dashboard)

## Known risks and gaps

- **`bookings` table in limbo**: `bookings` and `appointments` are deferred to `sdd-apply` (ADR 0002 §Deferred). The public booking flow (cancel/reschedule) stays in limbo until `sdd-apply` defines them. See diagram #03.
- **`walkin_intents` ledger**: not yet defined; required by PWA Fase 3 offline queue. Spec scope belongs to `release-1-0-3-pwa`, table placement TBD with `sdd-apply`.
- **Exact list of the 12 target Edge Functions — verified**: 3 real (`create-session-handoff`, `redeem-session-handoff`, `appointment-reminders-24h`) + 1 from PR-c3 not yet merged (`confirm-email`) + 8 stubs that return 501 `OUT_OF_MVP` (`mercadopago-webhook`, `account-closure`, `billing-reconciliation`, `cancel-subscription`, `change-subscription`, `create-subscription`, `subscription-status`, `subscription-expiry-check`). Verified via `git ls-tree -r --name-only origin/feature/release-2-0-phase2-migrations:supabase/functions/` + per-function source inspection.
- **ADR numbering collision**: the 4 release-2.0 ADRs (`0001-schema-principles`, `0002-table-design`, `0003-rls-policies`, `0004-indexes`) collide with `0001-orvel-monorepo-architecture.md` already on `dev`. Refer by concept, not by filename.
- **`packages/shared/`**: still empty post-target. Only `.gitkeep`. Do not extract types yet.
- **`confirm-email.ts` (PR-c3)**: not on `dev` yet. Separate scope. Signup email confirmation remains a window of outage until PR-c3 merges.
- **`account-closure` is a 501 stub in target** — NOT a real cron function. The `account-closure.yml` workflow and `docs/runbooks/account-closure.md` describe the `dev` (current) state and will need to be updated when billing returns to scope.
- **`stabilize-mercadopago-subscriptions.norg`**: stale remnant in `openspec/plans/` (already deleted from `dev` working tree but not yet committed). Consider archiving when MP returns.

## Maintenance

- If a target container changes → edit `.mmd` first, regenerate `.excalidraw`.
- If only layout changes → edit `.excalidraw` directly in excalidraw.com and commit the JSON.
- Audiences: technical team (new devs + architecture + cross-cutting review).
