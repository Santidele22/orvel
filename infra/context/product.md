# Orvel Product Context

Orvel is being consolidated into a clean monorepo for the existing Orvel surfaces and Supabase backend assets.

## Current Surfaces

- `orvel-dashboard`: Angular dashboard.
- `orvel-landing`: Astro landing site.
- `orvel-functions`: Supabase functions and database migrations.

## Monorepo Goal

The monorepo should make product, domain, Supabase, deployment, and operational context discoverable from one place without changing the behavior of the existing products during migration.

## Known Current State

- Dashboard repo: dirty active feature-slice migration.
- Landing repo: dirty.
- Functions repo: contains a migration rename.
- Supabase functions are deployed.
- Supabase DB push is currently blocked by remote migration history mismatch involving versions `20260508`, `20260508000000`, and `20260524`.

Do not infer product behavior from the target folder structure. Verify against source repos or ask Santi before documenting user-facing guarantees.
