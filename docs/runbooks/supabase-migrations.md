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

## Recovery: create_public_booking Canonical Availability Enforcement

Use this section for migration `20260627210000_enforce_public_booking_canonical_availability.sql`.

### Verify After Push

1. Confirm migration status:
   ```bash
   npx supabase@latest migration list --linked
   ```
2. Confirm the public RPC still exists and is executable through PostgREST after schema reload.
3. For a reviewer-safe linked smoke check, use `supabase db query --linked` inside a transaction and rollback. Replace placeholder UUIDs/slugs with a known disposable business/service fixture only; do not use real customer data:
   ```bash
   npx supabase@latest db query --linked <<'SQL'
   BEGIN;

   -- Expected: create_public_booking rejects a start time that is not present in
   -- _query_booking_slot_availability for that business/service/date.
   SELECT public.create_public_booking(
     'replace-with-disposable-business-slug',
     '00000000-0000-0000-0000-000000000000',
     '2099-01-01T03:00:00.000Z',
     '{"fullName":"Rollback Verification","email":"verify@example.invalid","phone":"000"}'::jsonb,
     NULL,
     NULL,
     NULL
   );

   ROLLBACK;
   SQL
   ```
   Passing evidence is an RPC error with code/message `SLOT_CONFLICT` before any booking insert. If the disposable fixture is missing, stop and create/choose a safe fixture; do not mutate production data outside the rollback transaction.

### Stop Conditions

- `migration list --linked` reports a mismatch.
- The RPC returns confirmed booking data for a slot absent from `_query_booking_slot_availability`.
- The RPC exposes `manage_token` storage in `public.bookings` instead of only `manage_token_hash`.
- PostgREST cannot resolve either `create_public_booking` overload after `NOTIFY pgrst, 'reload schema'`.

### Fix-Forward / Recovery

Do not repair migration history or rewrite the pushed migration. Create a new full-timestamp migration that:

1. Restores service availability by using `CREATE OR REPLACE FUNCTION`.
2. If enforcement is faulty, restore the previous create_public_booking definition from the prior migration or git history, preserving overloads, `SECURITY DEFINER`, `search_path`, grants, and hash-only management bearer behavior.
3. Re-apply only the corrected canonical availability check after the restored baseline is verified.
4. Push with:
   ```bash
   npx supabase@latest db push --linked --include-all
   ```
5. Re-run the rollback smoke check above and record the result in the PR notes.
