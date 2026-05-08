# TSK-MINI-CAL-SUPABASE-DB-TDD-011 — Supabase DB/RPC RED Handoff (Bruno ➜ Magnus)

## What is RED right now

New RED static contract suite:

- `src/app/tests/integration/supabase-db-rpc-red.contract.spec.ts`

This suite currently fails until real Supabase SQL artifacts exist under `/supabase/migrations`.

---

## Required files (GREEN target)

Create these artifacts under repository root (`dashboard/`):

1. `supabase/migrations/<timestamp>_booking_core_schema.sql`
   - Core schema entities + constraints
2. `supabase/migrations/<timestamp>_booking_rpcs.sql`
   - RPC function definitions used by gateway contracts

Optional but recommended for next phase:

3. `supabase/config.toml`
   - Enables local Supabase runtime tooling

---

## SQL signatures required by gateway contracts

Implement **exact RPC names**:

1. `public.resolve_business_by_slug(business_slug text)`
2. `public.create_public_booking(
   business_slug text,
   service_id text,
   starts_at_iso text or timestamptz,
   client jsonb,
   notes text default null,
   professional_id text/uuid default null
)`
3. `public.manage_booking_by_token(token text, now_iso text or timestamptz)`
4. `public.create_admin_manual_booking(
   business_id uuid/text,
   service_id text,
   starts_at_iso text or timestamptz,
   duration_minutes integer,
   client_id uuid/text default null,
   walk_in_name text default null,
   professional_id uuid/text,
   performed_by uuid/text,
   notes text default null
)`
5. `public.create_admin_blocked_time(
   business_id uuid/text,
   starts_at_iso text or timestamptz,
   ends_at_iso text or timestamptz,
   reason text,
   performed_by uuid/text
)`

---

## Core entities required

Minimum schema expected by RED suite:

- `public.businesses` (with unique `slug`)
- `public.customers`
- `public.bookings` (`starts_at` + management token field)
- `public.blocked_times` (`starts_at`, `ends_at`)
- `public.notification_email_outbox` (recipient email column)

---

## Deterministic error-code parity required

Migration SQL must include these literals (for parity with gateway mapping expectations):

- `BUSINESS_NOT_FOUND`
- `BOOKING_VALIDATION_ERROR`
- `CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN`
- `INVALID_TOKEN`
- `TOKEN_EXPIRED`
- `POLICY_WINDOW_CLOSED`
- `SLOT_CONFLICT`
- `BLOCKED_TIME_COLLISION`

Implementation note:
- For business slug resolution, ensure unknown slug produces deterministic not-found behavior compatible with API mapping to `BUSINESS_NOT_FOUND`.

---

## Infra blocker (tracked)

No local Supabase runtime wiring detected yet:

- missing `supabase/config.toml`
- no `package.json` scripts invoking Supabase CLI

Current RED is intentionally static (file/signature contract checks).

---

## Acceptance to flip RED ➜ GREEN

1. Add migration SQL files under `supabase/migrations/` implementing schema + RPCs above.
2. Run:
   - `npm run test -- src/app/tests/integration/supabase-db-rpc-red.contract.spec.ts`
3. Ensure all tests in that suite pass.
