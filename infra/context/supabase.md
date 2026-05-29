# Supabase Context

Supabase assets are expected to live under:

- `supabase/functions/` for Edge Functions.
- `supabase/migrations/` for database migrations.

## Current Operational Status

- Supabase functions are deployed.
- Project ref: `tzqgwziyiospmvpdgbnt`.
- Migration history was repaired on branch `feat/import-orvel-repos`.
- `migration list` is aligned.
- `db push --dry-run --include-all --yes` reports the remote database is up to date.

## Mandatory Rule

Every Supabase schema or function change must be pushed or updated immediately with the Supabase CLI.

Future migrations must use full timestamp filenames, for example `YYYYMMDDHHMMSS_description.sql`, to avoid ordering drift between short remote versions and local filenames.

## Migration History Incident

Remote migration history contained short version `20260508` before `20260508000000`, while valid local migration filenames sorted differently.

Resolution:

- Remote `20260508` was marked reverted.
- External-reference SQL was consolidated into `20260508000000_mp_preapproval_plan_sprint1.sql`.
- Local `20260508_add_mp_external_reference.sql` was removed.
- Final state: `migration list` aligned and `db push --dry-run --include-all --yes` reported the remote database up to date.

## Safety Constraints

- Do not run destructive Supabase commands without Santi approval.
- Do not run migration repair without Santi approval.
- Do not invent the expected remote state. Inspect with the Supabase CLI or ask Santi when access or context is missing.
- Do not commit secrets, tokens, project refs, or environment values.

## Before Changing Supabase Assets

1. Confirm the intended schema/function change with Santi if it changes behavior or data shape.
2. Inspect local migrations/functions.
3. Check remote migration status with the Supabase CLI when credentials/context are available.
4. Apply the change locally.
5. Push/update with the Supabase CLI immediately, unless blocked.
6. If blocked by migration history mismatch, stop and ask Santi. Do not repair automatically.
