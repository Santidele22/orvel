# Environment Context

Orvel runs in four distinct environments: local development, `dev`, `qa`, and `main`. Environment variable names are documented below; values are never committed.

## Origins per environment

ADR 0012 (with its Amendment 2) designates four artifacts, each served from its own origin. `dev` has no deployed hostnames: `deploy-promotion.yml` runs only on pushes to `qa` and `main`.

| Environment | Landing (Astro) | pwa (`apps/dashboard`) | Console (`apps/dashboard-web`) | Turnero (`apps/booking-web`, step 3a) |
|---|---|---|---|---|
| production (`main`) | `orvel.pro`, `www.orvel.pro` | `app.orvel.pro` | `dashboard.orvel.pro` | `reserva.orvel.pro` |
| qa | `qa.orvel.pro` | `app.qa.orvel.pro` | `dashboard.qa.orvel.pro` | `reserva.qa.orvel.pro` |
| local | `127.0.0.1:4321` | `127.0.0.1:3000` (proxy, serving `/dashboard`) | `127.0.0.1:4300` | `127.0.0.1:3000/booking/*` (proxy) |

What exists today is the combined deploy: one project serves the landing, `/dashboard/*` and `/booking/*` on the landing's origin. The console has its project (`VERCEL_PROJECT_ID_WEB`) and deploys on the next promotion; the turnero is still a route set inside the pwa artifact and gets its own app with step 3a. The turnero is public and unauthenticated, so it never appears in the handoff allowlist.

The edge functions resolve their CORS allowlist from `ENVIRONMENT`, which `deploy-promotion.yml` sets as a function secret per branch (`qa` / `production`); an unset value means the local stack. Two apps must never declare the same execution target, and each target owns its session storage key (`resolveAuthStorageKey` in `packages/config`).

## Local development

- Runs on the developer machine via the root `dev:all` script (local proxy + dashboard + landing in one terminal).
- Dashboard dev server: `127.0.0.1:4200` (serve path `/dashboard`). Landing dev server: `127.0.0.1:4321`.
- Supabase local stack via the Supabase CLI when credentials/context are available.
- Required env vars (names only): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `DASHBOARD_URL`/`PUBLIC_DASHBOARD_URL`, `PUBLIC_LANDING_URL`.
- Never commit `.env` files or local credentials.

## dev

- Integration environment. All feature branches land here first via PR.
- Receives: feature branches (via PR).
- CI gate: check `Dashboard booking regressions` (job `dashboard-booking-regressions`) runs on PRs targeting `dev`.
- Required env vars: same names as local development; values are provisioned in the environment, never in the repo.

## qa

- Pre-release smoke environment. Validates before release.
- Receives: `dev → qa` PRs only.
- Supabase project ref: `orvel-qa-dev` (schema migrations + idempotent test seed in `supabase/migrations/` and `supabase/seed.sql`).
- Required env vars: same names as local development; values are provisioned in the environment, never in the repo.

## main

- Production environment. Releases only.
- Receives: `qa → main` PRs only. Never from `dev` or a feature branch.
- Supabase production linkage: authenticated linked project, identity checked against the non-revealing digest in `supabase/production-project-ref.sha256`.
- Required env vars: same names as local development; values are provisioned in the environment, never in the repo.

## Reserved secrets

- The `orvel-qa` and `orvel-prod` GitHub environments hold `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` secrets that no workflow references: `deploy-promotion.yml` passes only `PUBLIC_LANDING_URL` and `PUBLIC_DASHBOARD_URL` as build env, and the Vercel projects carry the Supabase values as project env.
- The variable names themselves are still live. `scripts/build-vercel.mjs` reads them from the process environment during the Vercel build and bakes them into `dashboard/runtime-env.js`; `scripts/build-vercel-web.mjs` does the same for the console at `/runtime-env.js`; local development reads them from `.env.local`; `packages/config/src/dashboard-env.ts` and `apps/landing/src/lib/plans.ts` consume them at runtime.
- They are kept deliberately as reserved. Do not remove them as dead secrets without confirming with Santi.
