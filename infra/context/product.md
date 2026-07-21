# Orvel Product Context

Orvel is being consolidated into a clean monorepo for the existing Orvel surfaces and Supabase backend assets.

## Current Surfaces

- `orvel-dashboard`: Angular dashboard.
- `orvel-landing`: Astro landing site.
- `orvel-functions`: Supabase functions and database migrations.

## Monorepo Goal

The monorepo should make product, domain, Supabase, deployment, and operational context discoverable from one place without changing the behavior of the existing products during migration.

## Product Focus

Orvel is a turnos-first SaaS for beauty businesses. The MVP target is before/around June 25, 2026.

## MVP Scope

The MVP must let a beauty business:

- Configure basic services.
- Configure working hours and booking rules.
- Share a public booking URL.
- Receive bookings.
- See a turnos dashboard.
- Create manual admin turnos.
- Cancel and reschedule turnos.
- Block unavailable times.
- Avoid overlaps and double-bookings.

### Must-haves

- M1: Unified availability.
- M2: Real admin new turno.
- M3: Blocked-time form.
- M4: Admin reschedule.
- M5: Public cancel by private link/token.
- M6: Public reschedule by private link/token.
- M7: Minimal admin auth.
- M8: Remove hardcoded/test hooks.

### Non-goals for MVP

- Advanced CRM.
- Marketing automation.
- Inventory.
- Complex payments.
- Advanced reports.
- Payroll or staff performance.
- Mobile app.
- Recurring appointments.
- Waitlist.
- Complex multi-branch.
- Marketplace.

## Billing Rules

- Orvel does not use checkout as the source of truth for billing.
- Billing source of truth is MercadoPago subscriptions/preapproval.
- If checkout code is unused, remove it.
- If a checkout-like flow is necessary, rename or migrate it to subscription/preapproval semantics.
- MercadoPago billing work must use the official subscriptions/preapproval docs: https://www.mercadopago.com.ar/developers/es/docs/subscriptions/overview

## Core Cleanup Direction

Plans and business types must come from Supabase/reference catalog sources of truth, not hardcoded application lists.

## Known Current State

- Dashboard repo: dirty active feature-slice migration.
- Landing repo: dirty.
- Functions repo: contains a migration rename.
- Supabase functions are deployed.
- Repository context records that Supabase migration history was repaired, `migration list` is aligned, and `db push --dry-run --include-all --yes` reported the remote database up to date. See `infra/context/supabase.md` for the incident notes.

Do not infer product behavior from the target folder structure. Verify against source repos or ask Santi before documenting user-facing guarantees.
