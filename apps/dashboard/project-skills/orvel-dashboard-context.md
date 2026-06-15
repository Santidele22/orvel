---
name: orvel-dashboard-context
description: Workspace-only repository context for orvel-dashboard; use when any agent works in this repo to align on architecture, migration campaign, Supabase rules, testing gates, and known blockers.
triggers: "orvel-dashboard, Orvel dashboard, salon dashboard, turnos, booking, Supabase, feature slices, migration, tenant scoping, branch scoping"
---

# Orvel Dashboard Context

## Scope

This skill is **only for `/home/santid/santi/orvel-dashboard`**. Use it when an agent starts or continues work in this repository so everyone shares the same map, vocabulary, and working rules.

## What We Are Building

Orvel is a salon business dashboard and booking platform. The product includes:

- Public booking flows for clients.
- Admin `turnos` management for salon staff.
- Onboarding for new businesses.
- Billing, payment, subscription, and plan flows.
- Tenant and branch scoping so data stays isolated per business/location.

## Repository Architecture

This is an **Angular / TypeScript** application backed by **Supabase**.

Important areas:

- `src/app/features/*`: target feature-slice architecture. New or migrated product code should live here when it belongs to a feature.
- `src/app/core`: remaining shared runtime, auth, billing, payment, API, and infrastructure code that is still being reduced or migrated.
- `src/app/shared`: shared UI/layout/components used across features.
- `src/app/pages/auth`: auth pages that still remain outside feature slices.
- `supabase/migrations`: database schema, RLS, policies, triggers, and data migrations.
- `supabase/functions`: Supabase Edge Functions and server-side integration code.

## Current Campaign: Feature-Slice Migration

The active path is a migration away from legacy locations into `src/app/features/*`.

Legacy or transitional areas include:

- `src/app/pages`
- `src/app/services`
- `src/app/facades`
- `src/app/domain`
- `src/app/core/onboarding`
- `src/app/core/billing`
- `src/app/core/payments`

When touching these areas, first identify whether the work should migrate into a feature slice instead of adding more legacy surface. Keep changes surgical and avoid broad refactors without Santi's approval.

## Current Session State / Solved Work

In the current migration session, the repository has advanced through these solved items:

- Build/typecheck is green for the current intended checkpoint.
- Mercado Pago browser-secret exposure was remediated: secrets must not be exposed to browser bundles.
- Public booking slug resolver now has database enforcement.
- Pricing was aligned to a 3-plan model.
- Billing has safe-unavailable UX instead of unsafe failure behavior.
- Admin `turnos` UI gained markers/actions for operational workflows.
- Cancel notification behavior was added/fixed.
- Many tests were migrated alongside feature-slice movement.

Do not assume this means every broad suite is clean; always run the relevant gate for the area being touched.

## Supabase Rule: Update Immediately

Every time an agent changes any of the following, update/push Supabase immediately before continuing:

- `supabase/migrations/*`
- `supabase/functions/*`
- database schema, RLS policies, triggers, RPCs, or function contracts
- app code whose contract requires a matching database/function deployment

Use the project CLI through `npx` or `bunx` as appropriate for this repo. Never invent secrets and never print secret values. Verify with CLI status where possible before and/or after the update.

Minimum discipline:

1. Inspect the Supabase-related diff.
2. Run the appropriate Supabase CLI command from the repo.
3. Verify status when the CLI supports it.
4. Report what was updated without exposing secret values.

If credentials, project ref, or environment context are missing, stop and ask Santi instead of guessing.

## Agent Working Rules

- Communicate with **Santi in Spanish**.
- Communicate **agent-to-agent in English**.
- **Tyrion orchestrates and delegates**; specialists implement their scoped work.
- Use the right specialist: Magnus for backend/core, Aurora for frontend, Bruno for QA/tests, Gabriela for security, Daedalus for architecture, Almendra for documentation/agent knowledge.
- Do not push directly to `main`.
- Use branch/PR workflow unless Santi explicitly says otherwise.
- Do not commit generated artifacts, private metadata, secrets, `.funemon/`, local caches, or unrelated user changes.
- Preserve existing uncommitted work; inspect status before editing.

## Testing Gates

Before reporting completion, run the smallest reliable gate that proves the change:

- Typecheck/build for structural or Angular migration changes.
- Targeted unit/integration suites for the feature being touched.
- Supabase verification for database/function changes.

When failures appear, classify them clearly:

- **Caused by this change**: fix before handing back.
- **Pre-existing baseline drift**: document exact command and failure.
- **Unrelated broad-suite noise**: do not hide it; report it separately.
- **Blocked by missing environment/secrets**: ask Santi and avoid guessing.

## Current Known Blockers

- **KB011**: public booking API/manage gaps remain.
- **Auth RED / baseline drift**: auth-related tests or expectations may still be intentionally red or drifting from the new baseline.
- **Broad spec typecheck noise**: broad spec typechecking can surface unrelated migration noise; classify instead of overclaiming.

## Practical Agent Checklist

At task start:

1. Confirm you are in `/home/santid/santi/orvel-dashboard`.
2. Inspect current branch/status and protect unrelated changes.
3. Load this workspace context and any more specific `project-skills/*` skill relevant to the area.
4. Identify whether the work belongs in `src/app/features/*` or a remaining transitional area.

During work:

1. Keep changes narrow.
2. Respect tenant/branch scoping in data paths.
3. Never put payment secrets in browser code.
4. Push/update Supabase immediately after schema/function changes.
5. Run targeted gates before handoff.

At handoff:

1. Summarize files changed.
2. Summarize tests/checks run and exact failures, if any.
3. Call out blockers and decisions needed from Santi.
4. Remind the orchestrator if a new local skill requires restarting the current tool session before auto-loading.
