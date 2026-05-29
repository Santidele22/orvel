# Runbook: Supabase Migrations

Use this runbook for Supabase schema or function changes in the Orvel monorepo.

## Current Known State

- Supabase functions are deployed.
- DB push is blocked by remote migration history mismatch.
- Known mismatch versions: `20260508`, `20260508000000`, `20260524`.

## Mandatory Rule

Every Supabase schema/function change must be pushed or updated immediately with the Supabase CLI.

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
