# Orvel Architecture Context

This repository is the target Orvel monorepo. It is intended to collect the dashboard, landing site, Supabase assets, shared packages, and operational documentation.

## Target Repository Shape

```text
apps/
  dashboard/          # Angular dashboard
  landing/            # Astro landing site
supabase/
  functions/          # Supabase Edge Functions
  migrations/         # Supabase database migrations
packages/
  shared/
    domain/
    types/
    config/
    billing/
    booking/
    auth/
infra/
  context/            # Global project context for agents and humans
docs/
  adr/                # Architecture Decision Records
  runbooks/           # Operational procedures
```

## Boundary Rules

- Treat this monorepo as the migration target, not proof that all code has already moved.
- Do not edit the existing repos from this workspace task.
- Keep application code, Supabase assets, and shared packages separated by the target structure above.
- Shared packages should contain cross-surface contracts or utilities only when the source of truth is clear.

## Agent Context Priority

Use files under `infra/context/` for current monorepo context. If a fact is not present there or in checked-in source, say so and ask Santi before assuming.
