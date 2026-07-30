# Change: release-2-0-supabase-migration

## Why

The personal legacy Supabase project `tzqgwziyiospmvpdgbnt` is operationally abandoned. The new canonical remote is the dedicated Supabase project `orvel-qa-dev` (ref `rloovjtdaqvcgzlbppfr`), which is **empty** — no schema, no functions, no secrets, no buckets. Release 2.0 is therefore a **rebuild from zero** in the dedicated project, not an ETL from legacy. Moving to dedicated Orvel infrastructure removes personal ownership coupling, creates a clean boundary for the product, and provides the right moment to rebuild the schema with operational learnings incorporated. The three-environment delivery model also needs a clean, reproducible database foundation rather than extending the current single-environment setup.

## What Changes

- Rebuild the database schema from zero using the approved Option C strategy inside `orvel-qa-dev` (already empty) and provision `orvel-main` from the same migration set.
- Inventory and migrate data, storage, policies, triggers, secrets, and all 12 Edge Functions. (Data inventory is a one-shot read-only `pg_dump` snapshot of the abandoned legacy — no ETL.)
- Add multi-professional support: `professionals` and `professional_services` tables, with the client choosing a professional at booking time.
- Introduce local SQLite development, shared remote development/QA, and isolated production.
- Configure three Vercel deployment tracks for `dev`/feature, `qa`, and `main` branches.
- Add GitHub Actions promotion, migration, and deployment automation for QA and production.
- Preserve legacy migrations under `supabase/migrations/_legacy/` and document the new canonical architecture and operations.

## Impact

- The new build starts from an empty project, so the schema is rebuilt from first principles without an ETL step.
- All 12 Edge Functions, dependencies, secrets, RLS policies, and integrations must be redeployed and validated in both `orvel-qa-dev` and `orvel-main`.
- Mercado Pago, billing, email, authentication, booking, and reminder flows can regress during migration.
- Developer workflow changes from one remote environment to local SQLite plus explicit remote promotion.
- CI/CD, Vercel configuration, branch policy, environment configuration, and operational documentation change.

## Capabilities

### New Capabilities

- `orvel-supabase-rebuild-from-zero`: Schema rebuild in the dedicated `orvel-qa-dev` project (no ETL, no parallel cutover, no legacy cleanup window).
- `three-environment-architecture`: Local, QA, and production isolation with automated promotion.
- `multi-professional-modeling`: Client chooses a professional at booking time, supported by the `professionals` and `professional_services` tables in the new schema. Takes over the work planned for 1.0.3 in `release-1-0-2-cleanup`.

### Modified Capabilities

None.

## Phases

1. **Phase 0 — Inventory & remote baseline:** confirm `orvel-qa-dev` is empty; capture an optional one-shot read-only `pg_dump` of the abandoned legacy as a historical snapshot.
2. **Phase 1 — New schema design:** author ADRs 0001–0004 (schema principles, table design, RLS, indexes) and freeze the shape.
3. **Phase 2 — Build new schema in `orvel-qa-dev`:** write the forbidden-columns lint, apply migrations, deploy RLS + indexes, redeploy the 12 Edge Functions, re-enter sandbox secrets.
4. **Phase 3 — Provision `orvel-main`:** create the project, apply the same migrations, redeploy the 12 Edge Functions with production secrets, smoke test critical flows, document rollback.
5. **Phase 4 — 3-env setup:** complete local SQLite, branch policy, Vercel 3-track setup, GitHub Actions promotion workflow, Angular environment separation, client wiring to `professionals` / `professional_services`.

Estimated duration: approximately 1–2 weeks.

## Risks

- Functional regressions across booking, authentication, billing, and notifications when the rebuilt backend comes online in `orvel-main`.
- Smoke-test failures during cutover that trigger the documented rollback (re-apply migrations or restore from pre-provisioning backup).
- Mercado Pago or billing disruption from incorrect credentials, webhooks, or environment routing.
- Delivery opportunity cost while the team focuses on foundational work.
- Shared `orvel-qa-dev` contention or test-data leakage within the non-production project.

## Success Criteria

- [ ] Dedicated `orvel-qa-dev` and `orvel-main` Supabase projects are fully functional.
- [ ] The rebuilt schema, RLS policies, indexes, and storage pass integrity validation in both projects.
- [ ] Multi-professional modeling is operational: clients pick a professional at booking time and the `professionals` / `professional_services` tables are populated.
- [ ] All 12 Edge Functions are redeployed and verified in `orvel-qa-dev` and `orvel-main`.
- [ ] Booking, login, billing, and other critical user-flow smoke tests pass against `orvel-main`.
- [ ] Local SQLite, shared dev/QA, isolated main, and three Vercel deployments are operational.
- [ ] QA and main deployment/migration promotion is automated and documented.
- [ ] A documented rollback plan exists for `orvel-main` (re-apply migrations or restore from pre-provisioning backup).
- [ ] Recurring infrastructure cost remains $0 per month under current free-tier limits.
