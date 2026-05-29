# TSK-MINI-CAL-SUPABASE-DB-TDD-011 — RED Static Contract for Supabase DB/RPC

This contract is intentionally **RED-first**.
It defines the minimum SQL artifacts required under `/supabase` before wiring real runtime execution.

## Required root artifacts

- `supabase/`
- `supabase/migrations/`
- `supabase/migrations/*.sql` (at least one migration with schema + RPC definitions)

## Required core entities

Minimum table set expected by booking gateway contracts:

1. `public.businesses`
   - includes `slug` with uniqueness contract
2. `public.customers`
3. `public.bookings`
   - includes `starts_at`
   - includes a management token field (`manage_token` or `management_token`)
4. `public.blocked_times`
   - includes `starts_at` + `ends_at`
5. `public.notification_email_outbox`
   - includes destination email column (`to_email` or `recipient_email`)

## Required RPC signatures

SQL functions must be present (name + argument contract):

1. `resolve_business_by_slug(business_slug text)`
2. `create_public_booking(business_slug text, service_id text, starts_at_iso text|timestamptz, client jsonb, ... )`
3. `manage_booking_by_token(token text, now_iso text|timestamptz)`
4. `create_admin_manual_booking(business_id uuid|text, service_id text, starts_at_iso text|timestamptz, duration_minutes integer, professional_id uuid|text, performed_by uuid|text, ... )`
5. `create_admin_blocked_time(business_id uuid|text, starts_at_iso text|timestamptz, ends_at_iso text|timestamptz, reason text, performed_by uuid|text)`

## Deterministic error-code parity literals

Migration SQL must include deterministic parity literals:

- `BUSINESS_NOT_FOUND`
- `BOOKING_VALIDATION_ERROR`
- `CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN`
- `INVALID_TOKEN`
- `TOKEN_EXPIRED`
- `POLICY_WINDOW_CLOSED`
- `SLOT_CONFLICT`
- `BLOCKED_TIME_COLLISION`

## Infra mode

Current repo state is static-check mode (no local Supabase runtime wiring detected):

- no `supabase/config.toml`
- no package scripts invoking Supabase CLI

Therefore this task enforces **static SQL contract validation** first.
