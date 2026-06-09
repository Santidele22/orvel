# Runbook: Monorepo Migration

Use this runbook when moving Orvel assets into the Orvel monorepo root.

## Known Inputs

- Dashboard source: `orvel-dashboard` Angular dashboard, currently dirty with active feature-slice migration.
- Landing source: `orvel-landing` Astro landing, currently dirty.
- Functions source: `orvel-functions` Supabase functions/migrations, with migration rename.

## Target Locations

- Dashboard: `apps/dashboard/`
- Landing: `apps/landing/`
- Supabase functions: `supabase/functions/`
- Supabase migrations: `supabase/migrations/`
- Shared code: `packages/shared/`
- Context: `infra/context/`
- Decisions/runbooks: `docs/adr/`, `docs/runbooks/`

## Safe Procedure

1. Confirm scope with Santi before copying or rewriting code.
2. Inspect source repo status and note dirty files.
3. Copy only the approved surface into its target folder.
4. Preserve history-sensitive files when possible, but do not alter source repos during this task.
5. Update package/workspace configuration only when the target package manager is confirmed.
6. Run available checks for the migrated surface.
7. Document any unresolved source/target mismatch in `infra/context/` or a follow-up runbook note.

## Stop Conditions

- Source repo has unexpected uncommitted changes.
- Required package manager or build command is unknown.
- Supabase CLI output differs from the recorded repo context that migration history was repaired, `migration list` is aligned, and `db push --dry-run --include-all --yes` reported the remote database up to date.
- Any step would require destructive commands or migration repair.
