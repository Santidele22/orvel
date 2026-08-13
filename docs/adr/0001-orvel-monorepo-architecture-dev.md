# ADR 0001: Orvel Monorepo Architecture

## Status

Accepted for migration target, pending implementation verification.

Renamed for release-2.0 ADR 0001 collision; slot reserved for `0001-schema-principles.md` from `origin/feature/release-2-0-phase1-adrs-part1` when that branch merges to dev.

## Context

Orvel currently exists across separate repositories:

- `orvel-dashboard`: Angular dashboard.
- `orvel-landing`: Astro landing site.
- `orvel-functions`: Supabase functions and migrations.

The current repos are not clean: dashboard has an active feature-slice migration, landing is dirty, and functions includes a migration rename. Recorded Supabase context says functions are deployed, migration history was repaired, `migration list` is aligned, and `db push --dry-run --include-all --yes` reported the remote database up to date.

## Decision

Create a clean Orvel monorepo with this target shape:

- `apps/dashboard`
- `apps/landing`
- `supabase/functions`
- `supabase/migrations`
- `packages/shared/domain/types/config/billing/booking/auth`
- `infra/context`
- `docs/adr`
- `docs/runbooks`

## Consequences

- Agents and humans have one canonical place for global context and runbooks.
- Migration can proceed without treating current dirty source repos as already migrated.
- Supabase work remains explicit and guarded by operational rules.
- Shared package extraction must be verified; folder names alone do not define contracts.

## Guardrails

- No destructive Supabase command or migration repair without Santi approval.
- No secrets in repo documentation.
- No claims about deployment or runtime behavior unless verified.
