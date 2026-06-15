# Runbook: Supabase Migrations

Use this runbook for Supabase schema or function changes in the Orvel monorepo.

## Current Known State

- Supabase functions are deployed.
- Project ref: `tzqgwziyiospmvpdgbnt`.
- Migration history was repaired on branch `feat/import-orvel-repos`.
- `migration list` is aligned.
- `db push --dry-run --include-all --yes` reports the remote database is up to date.

## Mandatory Rule

Every Supabase schema/function change must be pushed or updated immediately with the Supabase CLI.

Future migrations must use full timestamp filenames, for example `YYYYMMDDHHMMSS_description.sql`, to avoid ordering drift between short remote versions and local filenames.

## Incident Note: Short-Version Ordering Drift

Remote migration history contained the short version `20260508` before `20260508000000`, while valid local migration filenames sorted differently.

Resolution applied:

- Remote version `20260508` was marked reverted.
- External-reference SQL was consolidated into `20260508000000_mp_preapproval_plan_sprint1.sql`.
- Local migration `20260508_add_mp_external_reference.sql` was removed.
- Final validation: `migration list` aligned and `db push --dry-run --include-all --yes` reported the remote database up to date.

## Safe Procedure

1. Confirm the intended change and whether it affects data, auth, billing, booking, or public contracts.
2. Inspect local files under `supabase/functions/` and `supabase/migrations/`.
3. Check remote migration status with the Supabase CLI when credentials and project context are available.
4. Create or update the local migration/function.
5. Run local validation if available.
6. Push/update with the Supabase CLI immediately.
7. If CLI reports migration history mismatch, stop and ask Santi.

## Prohibited Without Santi Approval

- Destructive database commands.
- Migration repair.
- Rewriting remote migration history.
- Guessing which migration version should win.

## Documentation After Change

Record:

- Migration/function name.
- CLI command used.
- Whether push/update succeeded.
- Any blocker and exact error summary, without secrets.
