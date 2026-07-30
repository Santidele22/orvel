# Tasks: release-2-0-supabase-migration

Rebuild of Orvel from zero into the dedicated Supabase project `orvel-qa-dev` (ref `rloovjtdaqvcgzlbppfr`). The legacy personal project `tzqgwziyiospmvpdgbnt` is operationally abandoned — **no ETL, no parallel cutover, no 30-day cleanup window**. This change is `orvel-qa-dev` filled with the new schema + `orvel-main` provisioned + 3-env automation. Schema is single-tenant MVP with multi-professional support (`professionals`, `professional_services` N:M, `business_settings.auto_assign_professional DEFAULT false`). All code tasks follow **strict TDD** (RED contract → GREEN implementation → REFACTOR). Non-code tasks (inventory, ADR writing, remote provisioning) use the equivalent capture-evidence → produce-artifact → verify cycle. Every task MUST produce the evidence described in its `## Validation:` clause before it is marked done; required by `openspec/config.yaml:require_validation_per_task: true`.

---

## Phase 0 — Inventory & remote baseline

- [ ] `0.1` **RED**: Author `infra/context/migration-inventory/remote-baseline.sh` that probes `orvel-qa-dev` (ref `rloovjtdaqvcgzlbppfr`) on four dimensions — public schema tables, deployed Edge Functions, configured secrets, storage buckets — and exits non-zero if ANY object is present.
  ## Validation: script exits 0 against the actual `orvel-qa-dev` and prints "empty: tables=0 functions=0 secrets=0 buckets=0"; exit codes for each dimension are documented in script header.

- [ ] `0.2` **GREEN**: Run `remote-baseline.sh` against `orvel-qa-dev` and capture stdout into `infra/context/migration-inventory/remote-baseline.txt`.
  ## Validation: `remote-baseline.txt` exists, `grep -c "tables=" remote-baseline.txt` returns 1, every table from `schema.sql` has a corresponding count + size row in `row-counts.txt`; zero-count tables are explicitly documented with a reason. (Note: as of 2026-07-30, the remote is NOT empty — it carries 12 legacy tables with 8 having seed data. Phase 2 will DROP everything before rebuilding from zero.)

- [ ] `0.3` # OPTIONAL — only if legacy is reachable. Run `pg_dump --schema-only --no-owner --no-privileges` against `tzqgwziyiospmvpdgbnt` and save output to `infra/context/migration-inventory/legacy-snapshot.sql`. Otherwise mark DONE with `skip_reason: legacy_unreachable` and capture `pg_dump` connection error verbatim.
  ## Validation: if reachable, file non-empty (`wc -l legacy-snapshot.sql > 0`), file contains at least one `CREATE TABLE`; if unreachable, `legacy-snapshot.sql` does NOT exist and a sibling `legacy-snapshot.skip.md` records the error + timestamp.

- [ ] `0.4` Author `infra/context/migration-inventory/README.md` with: (a) link to `remote-baseline.txt`, (b) optional link/note to `legacy-snapshot.sql` or `legacy-snapshot.skip.md`, (c) explicit statement that the legacy project is operationally abandoned and `orvel-qa-dev` is the canonical empty target.
  ## Validation: README has one section per artifact, every section's `path:` resolves, `grep "operationally abandoned" README.md` returns at least one hit.

- [ ] `0.5` **Validation gate**: Phase 0 frozen. No further inventory work; legacy references from now on are descriptive only.
  ## Validation: explicit freeze commit/tag; Santi sign-off recorded (PR comment, session note, or commit message referencing this task).

---

## Phase 1 — New schema design

- [ ] `1.1` **RED**: Draft `docs/adr/0001-schema-principles.md` outline stating the single-tenant MVP stance (no `tenant_id`, isolation via deployment boundaries), soft deletion, audit metadata, snake_case naming, and the `business_settings` singleton enforcement contract. The outline MUST NOT mention multi-tenant row-level predicates or per-tenant RLS policies.
  ## Validation: `grep -i "tenant_id\|multi.tenant" docs/adr/0001-schema-principles.md` returns zero hits referencing row-level tenant columns; outline has sections for single-tenant, soft-delete, audit, naming.

- [ ] `1.2` **GREEN**: Complete ADR 0001 with concrete principles testable against each new table. Include the `business_settings` singleton enforcement: `id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1)`. Reference `design.md` Schema Design Principles section as the source of truth.
  ## Validation: ADR 0001 lists every principle in `design.md` lines 46–56; each principle has a testable predicate (e.g., "no table in public schema has a `tenant_id` column").

- [ ] `1.3` **REFACTOR**: Peer-review ADR 0001 against the inventory (Phase 0). Document any exceptions in the ADR. Freeze after Santi approval.
  ## Validation: review comments resolved or documented as exceptions; Santi sign-off recorded.

- [ ] `1.4` **RED**: Draft `docs/adr/0002-table-design.md` skeleton listing every table in scope plus the new 2.0 tables: `business_types` (flat catalog), `services` (with `slot_duration_minutes NOT NULL`, `buffer_minutes DEFAULT 0`), `professionals` (minimum: `id`, `name`, `business_type_id` FK NOT NULL, `is_active DEFAULT true`, audit, soft delete; NO `color_hex`), `professional_services` N:M join (composite PK `(professional_id, service_id)`, `ON DELETE CASCADE` both sides), `business_settings` singleton (`id=1 CHECK (id=1)`, `auto_assign_professional BOOLEAN NOT NULL DEFAULT false`). Document that `bookings` / `appointments` FK to `professionals.id` is deferred to `sdd-apply`.
  ## Validation: `grep -c "professionals\|professional_services\|business_settings\|services\|business_types" docs/adr/0002-table-design.md` returns >= 5; `grep "color_hex" docs/adr/0002-table-design.md` returns zero; singleton enforcement contract present.

- [ ] `1.5` **GREEN**: Complete ADR 0002 with full column definitions, FK constraints, DEFAULT values, and rationale for renames/splits/merges vs. legacy. Every in-scope table must have a documented destination.
  ## Validation: ADR 0002 has a row per table with a destination (kept, renamed, merged, dropped); gaps explained.

- [ ] `1.6` **REFACTOR**: Peer-review ADR 0002 against the locked decisions (multi-professional in scope, `auto_assign_professional` default false, N:M not 1:N array, no `color_hex`). Freeze after Santi approval.
  ## Validation: review comments resolved; Santi sign-off recorded.

- [ ] `1.7` Author `docs/adr/0003-rls-policies.md`: per-table RLS policies with explicit `TO authenticated` + ownership predicate (per Supabase security checklist in `.agents/skills/supabase/SKILL.md`). Document any service-role exceptions.
  ## Validation: every table in ADR 0002 has a policy row; policies use `TO authenticated` (not deprecated `auth.role()`); `SECURITY DEFINER` functions explicitly documented with justification.

- [ ] `1.8` Author `docs/adr/0004-indexes.md`: indexes covering all FKs, soft-delete filtered indexes (`WHERE deleted_at IS NULL`), and verified high-frequency query predicates.
  ## Validation: every FK from ADR 0002 has a matching index; `grep "CREATE INDEX" docs/adr/0004-indexes.md | wc -l` >= FK count from ADR 0002.

- [ ] `1.9` **Validation gate**: Schema design frozen. All 4 ADRs peer-reviewed and approved. No further table structure changes without a new ADR.
  ## Validation: explicit freeze commit/tag on the design branch; Santi sign-off on all 4 ADRs.

---

## Phase 2 — Build new schema in `orvel-qa-dev`

- [ ] `2.1` **RED**: Write the "forbidden columns lint" script at `supabase/migrations/lint/forbidden-columns.sh`. Script MUST fail (exit 1) if any of these patterns appear in `supabase/migrations/*.sql`: `color_hex`, `slot_interval_minutes` (in `business_settings` context), `buffer_minutes` (in `business_settings` context), `min_notice_minutes`, `selected_business_types`, `allow_client_professional_selection`, `tenant_id`. Script MUST also fail if `auto_assign_professional` appears on `business_settings` without `DEFAULT false`. The script produces a human-readable report of violations. Cite the spec Scenarios this enforces: professionals table (R2), professional_services N:M (R3), business_settings single-row flat (R5), per-service timing on services (R6), single-tenant MVP (R1).
  ## Validation: temp file with `color_hex` column → script exits 1; temp file with `slot_interval_minutes` inside `CREATE TABLE business_settings` → script exits 1; temp file with `auto_assign_professional BOOLEAN NOT NULL` (no DEFAULT false) → script exits 1; temp file with `auto_assign_professional BOOLEAN NOT NULL DEFAULT false` → script exits 0.

- [ ] `2.2` **GREEN**: Run `forbidden-columns.sh` against current `supabase/migrations/*.sql`. Commit the lint script. Wire the script into the project as the FIRST migration-related check; it MUST run before any new migration is applied.
  ## Validation: `bash supabase/migrations/lint/forbidden-columns.sh` exits 0; script committed; lint script is the first step in CI for any PR that touches `supabase/migrations/`.

- [ ] `2.3` Confirm `orvel-qa-dev` (ref `rloovjtdaqvcgzlbppfr`) is the canonical remote target. Record the ref + access status in `infra/context/environments.md`. Confirm free tier (no paid plan needed).
  ## Validation: `infra/context/environments.md` has a row for `orvel-qa-dev` with the ref `rloovjtdaqvcgzlbppfr`; `supabase --version` reports CLI version used; free-tier assumption documented.

- [ ] `2.4` **RED**: Write `supabase/migrations/YYYYMMDDHHMMSS_create_business_types.sql` per ADR 0002 (flat catalog table). Write a RED contract test that asserts the table exists with the expected columns. The contract test MUST fail before the migration is applied.
  ## Validation: migration file uses full timestamp prefix; contract test fails when run against pre-migration DB; `forbidden-columns.sh` passes; lint output shows "PASS".

- [ ] `2.5` **GREEN**: Apply the `business_types` migration to `orvel-qa-dev`. Run the contract test — must pass. Run `forbidden-columns.sh` — must pass.
  ## Validation: `business_types` table exists in `orvel-qa-dev`; `SELECT column_name FROM information_schema.columns WHERE table_name='business_types'` returns the exact expected set; lint passes; contract test passes.

- [ ] `2.6` Author `supabase/migrations/YYYYMMDDHHMMSS_create_services.sql` per ADR 0002 with `slot_duration_minutes INT NOT NULL`, `buffer_minutes INT NOT NULL DEFAULT 0`, FK to `business_types`, audit columns, `deleted_at`. Apply + lint + contract test.
  ## Validation: migration creates `services` with the locked column shape; `grep "slot_interval_minutes\|min_notice_minutes" <file>` returns zero; FK to `business_types` present; lint passes; contract test passes.

- [ ] `2.7` Author `supabase/migrations/YYYYMMDDHHMMSS_create_business_settings.sql` — singleton with `id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1)`, `auto_assign_professional BOOLEAN NOT NULL DEFAULT false`. NO `slot_interval_minutes`, NO `buffer_minutes`, NO `selected_business_types`, NO `min_notice_minutes`, NO `allow_client_professional_selection`. Apply + lint + contract test that asserts INSERT with `id=2` fails and UPDATE of `id` fails.
  ## Validation: `grep "slot_duration_minutes\|slot_interval_minutes\|buffer_minutes\|selected_business_types\|min_notice_minutes" <file>` returns zero; singleton `CHECK (id = 1)` present; lint passes; `INSERT INTO business_settings(id) VALUES (2)` fails; `UPDATE business_settings SET id=2 WHERE id=1` fails.

- [ ] `2.8` **RED**: Author `supabase/migrations/YYYYMMDDHHMMSS_create_professionals.sql` per ADR 0002 — minimum columns `id`, `name`, `business_type_id` FK NOT NULL, `is_active BOOLEAN NOT NULL DEFAULT true`, audit columns, `deleted_at`. NO `color_hex`, NO bio, NO photo. Write RED contract test that asserts the table has exactly the expected column set; the test MUST fail pre-migration.
  ## Validation: migration file standalone (not bundled with `services`); `grep "color_hex" <file>` returns zero; lint passes; RED contract test fails before apply.

- [ ] `2.9` **GREEN**: Apply the `professionals` migration to `orvel-qa-dev`. Contract test passes. Lint passes.
  ## Validation: `professionals` table exists in `orvel-qa-dev`; `SELECT column_name FROM information_schema.columns WHERE table_name='professionals'` returns the exact expected set (no `color_hex`); contract test passes; lint passes.

- [ ] `2.10` **RED**: Author `supabase/migrations/YYYYMMDDHHMMSS_create_professional_services.sql` — composite PK `(professional_id, service_id)`, `ON DELETE CASCADE` on both FKs, `created_at` audit column. Standalone migration file. Write RED contract test that asserts the composite PK enforces uniqueness.
  ## Validation: migration file standalone; lint passes; RED contract test fails pre-migration.

- [ ] `2.11` **GREEN**: Apply the `professional_services` migration. Contract test passes. Attempt duplicate `(professional_id, service_id)` insert — must fail with unique violation. `INSERT ... ON CONFLICT DO NOTHING` works.
  ## Validation: `professional_services` table exists; composite PK enforced; duplicate insert rejected with unique-violation error code; lint passes.

- [ ] `2.12` Author remaining migration files for all other in-scope tables (bookings, clients, appointments, etc.) per ADR 0002. Every migration uses full timestamp-prefix naming. Run lint after each migration file is added.
  ## Validation: `supabase migration list --local` returns all migrations in timestamp order; `forbidden-columns.sh` passes; `supabase db push --dry-run` shows zero unexpected diffs.

- [ ] `2.13` Author RLS policy migrations per ADR 0003. Every policy uses `TO authenticated` (not deprecated `auth.role()`). All tables in exposed schemas have RLS enabled.
  ## Validation: `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false` returns zero rows; every policy file references a matching ADR 0003 entry; no `auth.role()` usage in policy bodies.

- [ ] `2.14` Author index migrations per ADR 0004. Every FK has an index; soft-delete filtered indexes present on every domain table with `deleted_at`.
  ## Validation: every FK from `information_schema.key_column_usage` has a matching index in `pg_indexes`; `grep "WHERE deleted_at IS NULL" supabase/migrations/*.sql | wc -l` matches ADR 0004 filtered-index count.

- [ ] `2.15` Move legacy migrations from `supabase/migrations/` to `supabase/migrations/_legacy/`. Add `_legacy/README.md` explaining retention. Verify legacy files are excluded from fresh application.
  ## Validation: `supabase db push --dry-run` does not reference any `_legacy/` file; `_legacy/README.md` exists with retention rationale + reference to `legacy-snapshot.sql` or `legacy-snapshot.skip.md` from Phase 0.

- [ ] `2.16` Apply all migrations to `orvel-qa-dev`: `supabase db push`. Run the full contract test suite.
  ## Validation: `supabase migration list` aligned between local and `orvel-qa-dev`; schema matches ADR 0002; full contract test suite passes; `forbidden-columns.sh` passes against every migration file.

- [ ] `2.17` Redeploy all 12 Edge Functions to `orvel-qa-dev`. Run integration smoke tests (at minimum: booking, login, billing webhook, notification dispatch).
  ## Validation: `supabase functions list` shows 12 functions; each responds 200 to a health check with a service-role JWT; Mercado Pago sandbox webhook handshake succeeds.

- [ ] `2.18` Re-enter all secrets per env into `orvel-qa-dev` using sandbox credentials only (never production). Recreate storage buckets with RLS policies matching ADR 0003.
  ## Validation: secrets present (names only verified, never values); storage upload + signed-URL round-trip succeeds; bucket policies match ADR 0003; production credentials absent from `orvel-qa-dev`.

- [ ] `2.19` **Validation gate**: Backend fully operational in `orvel-qa-dev`. All 12 Edge Functions smoke-tested. Schema frozen. Lint script wired into CI as a required check.
  ## Validation: CI pipeline includes `forbidden-columns.sh` as a required check for any PR touching `supabase/migrations/`; test report committed; Santi sign-off.

---

## Phase 3 — Provision `orvel-main`

- [ ] `3.1` Create new Supabase free-tier project `orvel-main`. Capture project ref. Confirm free tier. Record ref in `infra/context/environments.md`.
  ## Validation: `orvel-main` visible in Supabase dashboard; project ref recorded; free-tier assumption documented.

- [ ] `3.2` Apply all migrations to `orvel-main`: `supabase db push`. Verify schema matches `orvel-qa-dev` exactly.
  ## Validation: `supabase db diff --linked` returns zero differences between linked projects; `forbidden-columns.sh` passes; full contract test suite passes against `orvel-main`.

- [ ] `3.3` Redeploy all 12 Edge Functions to `orvel-main` with production secrets. Verify Mercado Pago webhook handshake with production credentials.
  ## Validation: `supabase functions list` shows 12; each health check returns 200; MP production webhook handshake succeeds; production secrets present (names only verified).

- [ ] `3.4` Smoke test critical flows against `orvel-main`: booking, login, billing, notifications, Mercado Pago webhook delivery.
  ## Validation: every critical flow passes; failures trigger the rollback plan from task 3.5; smoke-test report committed.

- [ ] `3.5` Document rollback plan in `infra/context/migration-inventory/main-rollback.md`: triggers (which smoke-test failures), owners, configuration reversal (re-apply migrations or restore from pre-provisioning backup), and data-consistency checks. There is no dual-write window — rollback operates within the Supabase project layer only.
  ## Validation: rollback doc lists every Phase 3 task, names rollback owners, names at least 2 rollback triggers, names the re-apply-migrations path and the restore-from-backup path.

- [ ] `3.6` **Validation gate**: `orvel-main` smoke tests pass; rollback plan documented; no parallel legacy to maintain.
  ## Validation: Santi sign-off; `main-rollback.md` linked from `infra/context/environments.md`; monitoring alert configured for free-tier quota on both projects.

---

## Phase 4 — 3-env setup

- [ ] `4.1` Confirm `orvel-main` exists (Phase 3) and `orvel-qa-dev` exists (Phase 2). Record both project refs in `infra/context/environments.md`.
  ## Validation: both projects visible in Supabase dashboard; refs match those recorded in earlier phases.

- [ ] `4.2` Update `apps/dashboard/src/environments/environment.ts` with Supabase URL + anon key for each env. Create `environment.qa.ts` pointing at `orvel-qa-dev` (ref `rloovjtdaqvcgzlbppfr`). Create `environment.prod.ts` pointing at `orvel-main`.
  ## Validation: `ng build --configuration=qa` bundles `environment.qa.ts`; `ng build --configuration=production` bundles `environment.prod.ts`; QA bundle does NOT contain production Supabase URL.

- [ ] `4.3` Update `apps/dashboard/angular.json` with `configurations.qa` block and correct `fileReplacements` for `environment.qa.ts`.
  ## Validation: `ng build --configuration=qa` succeeds; `grep "rloovjtdaqvcgzlbppfr" dist/` returns hits for QA build; `grep "orvel-main" dist/` returns zero for QA build.

- [ ] `4.4` Author `.env.example` at repo root documenting every required env var name per environment (no values). Sections: local (SQLite), `orvel-qa-dev` (sandbox), `orvel-main` (production).
  ## Validation: every var used by `apps/dashboard`, `apps/landing`, and all 12 Edge Functions appears; `grep -c "=" .env.example` >= total secret count from Phase 2 task 2.18.

- [ ] `4.5` Update `apps/dashboard/src/app/core/config/dashboard-env.ts` with SQLite fallback for local dev. Update `apps/landing` env setup similarly.
  ## Validation: `npm run dev` in `apps/dashboard` starts against SQLite without Supabase network calls; verify by disconnecting network; smoke flow renders.

- [ ] `4.6` Create `qa` branch from `dev`. Configure GitHub branch protection on `qa` (required CI checks, no direct push). Apply matching branch protection to `main` per existing rules.
  ## Validation: `qa` branch exists; branch protection rules visible in GitHub repo settings; direct push to `qa` is rejected; `main` protection unchanged from PR #201 baseline.

- [ ] `4.7` Author `.github/workflows/deploy-promotion.yml`: on push to `qa` → migrate `orvel-qa-dev` + deploy Edge Functions + deploy Vercel QA; on push to `main` → migrate `orvel-main` + deploy Edge Functions + deploy Vercel production. Include `forbidden-columns.sh` as a mandatory CI check in the migration job.
  ## Validation: workflow file passes YAML lint; secrets referenced by name only (never values); `forbidden-columns.sh` step is present in the migration job and fails the job on violation.

- [ ] `4.8` Configure Vercel: 3 deployment tracks — production (`main` → `orvel.app`), QA (`qa` → `qa.orvel.app`), preview (`dev` + feature branches). Update `vercel.json` if needed.
  ## Validation: each domain deploys from the correct branch; Vercel dashboard shows 3 active tracks; `vercel.json` in repo is consistent.

- [ ] `4.9` Update `infra/context/environments.md` and `infra/context/deployment.md` with the 3-env model, required var names, and promotion workflow. Cross-reference ADR 0001 (single-tenant isolation via deployment boundaries).
  ## Validation: docs are internally consistent; `grep "orvel-qa-dev\|orvel-main" infra/context/environments.md` returns expected references; env isolation matches ADR 0001.

- [ ] `4.10` End-to-end smoke: push a test commit to `qa` → GitHub Action auto-deploys + auto-migrates → Vercel QA URL serves the change. Verify `forbidden-columns.sh` runs and passes in CI.
  ## Validation: CI run passes (green check on `qa`); QA URL loads and smoke tests pass; CI log includes `forbidden-columns.sh` output showing "PASS".

- [ ] `4.11` Update `apps/dashboard` and `apps/landing` clients to consume the new `professionals` / `professional_services` tables. Replace any legacy FK patterns that pointed to the pre-2.0 structure. Reference PR #198 for the env var wiring already completed; do NOT re-implement that wiring.
  ## Validation: `rg "professionals\|professional_services" apps/dashboard/src apps/landing/src` returns at least one import/usage per app; TypeScript compilation passes; no import references the legacy schema equivalents.

- [ ] `4.12` **Validation gate**: 3-env pipeline operational end-to-end. Promotion workflow tested on `qa`. Production promotion unblocked.
  ## Validation: Santi sign-off; pipeline run logs committed; rollback path from task 3.5 referenced in the workflow README.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 2500–3500 (5 phases, ~25 migration files, 12 edge functions, 4 ADRs, 1 lint script, CI/CD, env config, client updates — no ETL scripts) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | Slice A: Phase 0 inventory + Phase 1 ADRs (~700 lines docs) → Slice B: Phase 2 lint + `business_types` + `services` + `business_settings` (~900 lines SQL/sh) → Slice C: Phase 2 `professionals` + `professional_services` + remaining tables + RLS + indexes (~1000 lines SQL) → Slice D: Phase 2 Edge Functions redeploy + secrets + Phase 3 `orvel-main` provision (~600 lines config) → Slice E: Phase 4 3-env CI/CD + Angular env separation + client wiring (~700 lines yaml/ts) |
| Delivery strategy | ask-always |
| Decision needed before apply | Yes |
| Chain strategy | pending (ask user: stacked-to-main vs feature-branch-chain vs size:exception) |
