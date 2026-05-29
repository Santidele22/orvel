# Supabase Context

Supabase assets are expected to live under:

- `supabase/functions/` for Edge Functions.
- `supabase/migrations/` for database migrations.

## Current Operational Status

- Supabase functions are deployed.
- Database push is currently blocked by a remote migration history mismatch.
- Known conflicting/mismatched migration versions from the audit context: `20260508`, `20260508000000`, `20260524`.

## Mandatory Rule

Every Supabase schema or function change must be pushed or updated immediately with the Supabase CLI.

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
