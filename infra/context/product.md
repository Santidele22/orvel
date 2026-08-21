# Orvel Product Context

Orvel is a turnos-first SaaS for beauty businesses, delivered as a mobile-first PWA built with `@angular/pwa`, with an explicitly desktop-only carve-out for the dashboard surface.

## Current Surfaces

- `orvel-dashboard`: Angular dashboard (mobile-first PWA).
- `orvel-landing`: Astro landing site.
- `orvel-functions`: Supabase functions and database migrations.

## Monorepo Goal

The monorepo should make product, domain, Supabase, deployment, and operational context discoverable from one place without changing the behavior of the existing products during migration.

## Product Focus

Orvel is a turnos-first SaaS for beauty businesses. The product is a mobile-first PWA so customers can book and manage turnos from their phones without an app-store install.

## Product Scope

A beauty business can:

- Configure basic services.
- Configure working hours and booking rules.
- Share a public booking URL.
- Receive bookings.
- See a turnos dashboard.
- Create manual admin turnos.
- Cancel and reschedule turnos.
- Block unavailable times.
- Avoid overlaps and double-bookings.

### Desktop-only carve-out

The mobile surface is the primary product target (mobile-first PWA). The desktop dashboard is explicitly a desktop-only surface and is out of the mobile product scope. See `openspec/changes/release-1-0-3-pwa/proposal.md` (Out of Scope) and `docs/diagrams/01-monorepo-architecture.md`.

### Non-goals

- Advanced CRM.
- Marketing automation.
- Inventory.
- Complex payments.
- Advanced reports.
- Payroll or staff performance.
- Recurring appointments.
- Waitlist.
- Complex multi-branch.
- Marketplace.

## Core Cleanup Direction

Plans and business types must come from Supabase/reference catalog sources of truth, not hardcoded application lists.

## Known Current State

- Dashboard repo: active feature-slice migration.
- Landing repo: dirty.
- Functions repo: contains a migration rename.
- Supabase functions are deployed.
- Supabase migration history was repaired and `migration list` is aligned; `db push --dry-run --include-all --yes` reported the remote database up to date. See `infra/context/supabase.md` for current operational notes.

Do not infer product behavior from the target folder structure. Verify against source repos or ask Santi before documenting user-facing guarantees.
