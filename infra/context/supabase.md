# Supabase Context

Supabase assets live under:

- `supabase/functions/` for Edge Functions.
- `supabase/migrations/` for database migrations.
- `supabase/migrations/_legacy/` for archived, no-longer-active migrations.

## Current Operational Status

- Supabase functions are deployed.
- Production operations use the authenticated linked project; identity is checked against the non-revealing digest in `supabase/production-project-ref.sha256`.
- The active project ref is `orvel-qa-dev` (pre-release validation environment, seeded with `supabase/seed.sql`).
- `migration list` is aligned.
- Migration history was repaired on the `dev` branch; no further repair is pending.

## Mandatory Rule

Every Supabase schema or function change must be pushed or updated immediately with the Supabase CLI.

Future migrations must use full timestamp filenames, for example `YYYYMMDDHHMMSS_description.sql`, to avoid ordering drift between short remote versions and local filenames.

Migrations that are superseded or no longer part of the active history are moved under `supabase/migrations/_legacy/` instead of being deleted, so history remains auditable.

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
