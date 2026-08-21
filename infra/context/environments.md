# Environment Context

Orvel runs in four distinct environments: local development, `dev`, `qa`, and `main`. Environment variable names are documented below; values are never committed.

## Local development

- Runs on the developer machine via the root `dev:all` script (local proxy + dashboard + landing in one terminal).
- Dashboard dev server: `127.0.0.1:4200` (serve path `/dashboard`). Landing dev server: `127.0.0.1:4321`.
- Supabase local stack via the Supabase CLI when credentials/context are available.
- Required env vars (names only): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `DASHBOARD_URL`/`PUBLIC_DASHBOARD_URL`, `PUBLIC_LANDING_URL`.
- Never commit `.env` files or local credentials.

## dev

- Integration environment. All feature branches land here first via PR.
- Receives: feature branches (via PR).
- CI gate `dashboard-booking-regressions` runs on PRs targeting `dev`.
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
