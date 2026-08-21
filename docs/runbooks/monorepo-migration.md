---
status: historical, migration complete
---

# Runbook: Monorepo Migration

This runbook is a historical record of the migration of the Orvel source repos into the Orvel monorepo root. The migration is complete and the monorepo is the single source of truth; no source-repo workflow is active.

## Historical Inputs

- Dashboard source: `orvel-dashboard` Angular dashboard.
- Landing source: `orvel-landing` Astro landing.
- Functions source: `orvel-functions` Supabase functions/migrations.

## Target Locations

- Dashboard: `apps/dashboard/`
- Landing: `apps/landing/`
- Supabase functions: `supabase/functions/`
- Supabase migrations: `supabase/migrations/`
- Shared code: `packages/shared/`
- Context: `infra/context/`
- Decisions/runbooks: `docs/adr/`, `docs/runbooks/`
