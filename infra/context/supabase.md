# Supabase Context

Supabase assets are expected to live under:

- `supabase/functions/` for Edge Functions.
- `supabase/migrations/` for database migrations.

## Current Operational Status

- Supabase functions are deployed.
- Production operations use the authenticated linked project; identity is checked against the non-revealing digest in `supabase/production-project-ref.sha256`.
- Migration history was repaired on branch `feat/import-orvel-repos`.
- `migration list` is aligned.
- Fresh read-only evidence on 2026-07-12 shows migration `20260710210000_one_time_trial_reminder_attempt.sql` applied, the durable attempt unconsumed, and direct/default-ACL EXECUTE drift on its four functions. Forward migrations `20260712190000_normalize_legacy_reminder_function_acl.sql` and `20260712213000_generic_one_time_email_contract.sql` must be applied in that exact order with no extras; each commits independently. An ACL-applied/generic-pending state is recoverable only through the checked-in `forward-migrate` fix-forward path. Production invocation remains blocked until both are applied and alignment/default ACL closure are re-verified.

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
