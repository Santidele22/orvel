# Orvel Product Context

Orvel is a shipped turnos-first SaaS for beauty businesses. The customer-facing product is a mobile-first PWA (`@angular/pwa`) so people can book and manage turnos from a phone without an app-store install. The operator dashboard is an explicit desktop-only carve-out.

This file is the product contract. It does not record git topology, migration history, or “how close we are to done.” Verify user-facing claims against this file plus checked-in source — not against folder names, the marketing README, or stale diagrams.

## Current Surfaces

- `apps/dashboard` — Angular 21 PWA (public booking + operator dashboard).
- `apps/landing` — Astro landing and signup.
- `supabase/` — Edge Functions and database migrations.

This monorepo is the source of truth for those surfaces.

## Product Focus

Turnos for beauty businesses (uñas, barbería, estética, and similar appointment work). Replace the notebook / WhatsApp / spreadsheet with a shareable booking URL and an operator agenda.

## Shipped Scope

A beauty business can:

- Configure services (duration and price).
- Configure working hours and booking rules.
- Share a public booking URL.
- Receive bookings.
- See a turnos dashboard.
- Create manual / walk-in turnos.
- Cancel and reschedule turnos.
- Block unavailable times.
- Avoid overlaps and double-bookings.
- Manage clients.
- Operate with multiple professionals (client may or may not pick one, per booking policy).
- Collect señas as alias/CBU deposits (hold, amount or percent, expiry) — not Mercado Pago and not a full payments stack.

### Desktop-only carve-out

The mobile surface is the primary product target. The desktop dashboard is out of the mobile product scope. See `docs/diagrams/01-monorepo-architecture.md`. The historical PWA change lives under `openspec/changes/archive/`.

### Non-goals

These are out of v1 even though the core product is shipped:

- Advanced CRM.
- Marketing automation.
- Inventory.
- Complex payments / Mercado Pago checkout.
- Advanced reports.
- Payroll or staff performance.
- Recurring appointments.
- Waitlist.
- Complex multi-branch.
- Marketplace.

## Core Cleanup Direction

Plans and business types must come from Supabase/reference catalog sources of truth, not hardcoded application lists.

## Known Current State

- This repository is live Orvel, not a migration target.
- Treat `main` as production; `dev` / `qa` / `main` is the 3-env path.
- Supabase operational notes (linked project, migrations, safety) live in `infra/context/supabase.md`.
- Architecture snapshots and C4 diagrams can lag; do not copy their “current vs target” footnotes into product claims.

Do not infer extra user-facing guarantees from the README or from `apps/` folder names. If a behavior is not in this scope list and not in source, ask Santi.
