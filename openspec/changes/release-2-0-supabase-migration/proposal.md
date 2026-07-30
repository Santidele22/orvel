# Change: release-2-0-supabase-migration

## Why

Orvel currently depends on the personal Supabase project `tzqgwziyiospmvpdgbnt`. Moving to dedicated Orvel infrastructure removes personal ownership coupling, creates a clean boundary for the product, and provides the right moment to rebuild the schema with operational learnings incorporated. The three-environment delivery model also needs a clean, reproducible database foundation rather than extending the current single-environment setup.

## What Changes

- Replace the current personal Supabase project with dedicated `orvel-dev-qa` and `orvel-main` projects.
- Rebuild the database schema from zero using the approved Option C strategy.
- Inventory and migrate data, storage, policies, triggers, secrets, and all 12 Edge Functions.
- Add multi-professional support: `professionals` and `professional_services` tables, with the client choosing a professional at booking time.
- Introduce local SQLite development, shared remote development/QA, and isolated production.
- Configure three Vercel deployment tracks for `dev`/feature, `qa`, and `main` branches.
- Add GitHub Actions promotion, migration, and deployment automation for QA and production.
- Preserve legacy migrations and document the new canonical architecture and operations.

## Impact

- Existing data and storage in personal Supabase require controlled ETL and cutover.
- All 12 Edge Functions, dependencies, secrets, RLS policies, and integrations must be validated again.
- Mercado Pago, billing, email, authentication, booking, and reminder flows can regress during migration.
- Developer workflow changes from one remote environment to local SQLite plus explicit remote promotion.
- CI/CD, Vercel configuration, branch policy, environment configuration, and operational documentation change.

## Capabilities

### New Capabilities

- `supabase-migration`: Controlled rebuild and migration into dedicated Orvel Supabase projects.
- `three-environment-architecture`: Local, QA, and production isolation with automated promotion.
- `multi-professional-modeling`: Client chooses a professional at booking time, supported by the `professionals` and `professional_services` tables in the new schema. Takes over the work planned for 1.0.3 in `release-1-0-2-cleanup`.

### Modified Capabilities

None.

## Phases

1. **Phase 0 — Inventory & drift analysis:** establish the complete current-state baseline.
2. **Phase 1 — New schema design:** define and review the replacement schema and policies.
3. **Phase 2 — Build new schema:** provision `orvel-dev-qa`, apply migrations, and restore backend capabilities.
4. **Phase 3 — Data migration ETL:** implement and validate repeatable old-to-new transformations.
5. **Phase 4 — Cutover:** provision `orvel-main`, migrate final data, switch runtime configuration, and verify.
6. **Phase 5 — Cleanup:** retain rollback assets, mark the old project read-only, and update references.
7. **Phase 6 — 3-env setup:** complete SQLite, branch, Vercel, GitHub Actions, and environment workflows.

Estimated duration: approximately 3–4 weeks.

## Risks

- Planned downtime during the maintenance window.
- Data loss or integrity drift during ETL and final synchronization.
- Functional regressions across booking, authentication, billing, and notifications.
- Mercado Pago or billing disruption from incorrect credentials, webhooks, or environment routing.
- Delivery opportunity cost while the team focuses on foundational work.
- Shared `dev-remote`/QA contention or test-data leakage within the non-production project.

## Success Criteria

- [ ] Dedicated `orvel-dev-qa` and `orvel-main` Supabase projects are fully functional.
- [ ] The rebuilt schema, RLS policies, indexes, storage, and ETL pass integrity validation.
- [ ] Multi-professional modeling is operational: clients pick a professional at booking time and the `professionals` / `professional_services` tables are populated.
- [ ] All 12 Edge Functions are migrated and verified in their target environments.
- [ ] Booking, login, billing, and other critical user-flow smoke tests pass after cutover.
- [ ] Local SQLite, shared dev/QA, isolated main, and three Vercel deployments are operational.
- [ ] QA and main deployment/migration promotion is automated and documented.
- [ ] The old project remains available as a 30-day rollback source and is no longer canonical.
- [ ] Recurring infrastructure cost remains $0 per month under current free-tier limits.
