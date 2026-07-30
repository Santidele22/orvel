# Tasks: release-2-0-supabase-migration

Complete rebuild + migration of Orvel from personal Supabase (`tzqgwziyiospmvpdgbnt`) to dedicated `orvel-dev-qa` / `orvel-main` infrastructure. The 2.0 schema is single-tenant MVP with multi-professional support (`professionals`, `professional_services` N:M join, `business_settings.auto_assign_professional DEFAULT false`). All code tasks follow **strict TDD** (RED → GREEN → REFACTOR). Non-code tasks use the equivalent capture-evidence → produce-artifact → verify cycle. Every task MUST produce the evidence described in its `## Validation:` clause before it is marked done.

---

## Phase 0 — Inventory & drift analysis

- [ ] `0.1` Run `pg_dump --schema-only` against `tzqgwziyiospmvpdgbnt` and store under `infra/context/migration-inventory/schema.sql`
  ## Validation: pg_dump exits 0, file non-empty, all schemas captured (public + auth + storage); `wc -l schema.sql > 0`

- [ ] `0.2` Dump row counts and table sizes per relation into `infra/context/migration-inventory/row-counts.txt`
  ## Validation: every table from schema.sql has a count + size row; zero-count tables have a documented reason

- [ ] `0.3` Inventory all 12 Edge Functions (source path, import_map.json, deno.json, env vars used) into `infra/context/migration-inventory/functions.md`
  ## Validation: 12/12 functions catalogued; each entry has code path, deps list, secrets list; `grep -c "^### " functions.md` returns 12

- [ ] `0.4` Inventory all secrets by environment (Mercado Pago, email, OpenAI, SendGrid, etc.) into `infra/context/migration-inventory/secrets.md` (names only, never values)
  ## Validation: secrets grouped by integration + env; `grep -c "secret:" secrets.md` matches expected count per env

- [ ] `0.5` Inventory storage buckets and their RLS policies into `infra/context/migration-inventory/storage.md`
  ## Validation: every bucket listed with policy set + object count; sample upload + signed-URL test from at least one bucket passes against old project

- [ ] `0.6` Diff `supabase/migrations/` (local) against `pg_dump` output (remote); record every drift item in `infra/context/migration-inventory/drift.md`
  ## Validation: drift.md has at least one section per schema; every drift item has an explanation (legacy short version, manual hotfix, missing local migration, etc.)

- [ ] `0.7` Write inventory summary in `infra/context/migration-inventory/README.md` with links to every artifact above and totals (N tables, 12 functions, M buckets)
  ## Validation: README.md links resolve; `grep -E "Tables:|Functions:|Buckets:" README.md` returns 3 lines with matching counts

- [ ] `0.8` **Validation gate**: Santi signs off on inventory completeness before Phase 1 begins
  ## Validation: explicit approval recorded (PR comment, session note, or commit message referencing this task)

---

## Phase 1 — New schema design

- [ ] `1.1` **RED**: Draft `docs/adr/0001-schema-principles.md` outline stating the single-tenant MVP stance (no `tenant_id`, isolation via deployment boundaries), soft deletion, audit metadata, snake_case naming, and the `business_settings` singleton enforcement contract. Confirm the outline does NOT mention multi-tenant row-level predicates or per-tenant RLS policies.
  ## Validation: `grep -i "tenant_id\|multi.tenant" docs/adr/0001-schema-principles.md` returns zero hits referencing row-level tenant columns; outline has sections for single-tenant, soft-delete, audit, naming

- [ ] `1.2` **GREEN**: Complete ADR 0001 with concrete principles testable against each new table. Include the `business_settings` singleton enforcement: `id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1)`. Reference `design.md` Schema Design Principles section as the source of truth.
  ## Validation: ADR 0001 lists every principle in design.md lines 46–56; each principle has a testable predicate (e.g., "no table in public schema has a `tenant_id` column")

- [ ] `1.3` **REFACTOR**: Peer-review ADR 0001 against the inventory (Phase 0) — does any legacy table violate a principle? Document any exceptions in the ADR. Freeze after Santi approval.
  ## Validation: review comments resolved or documented as exceptions; Santi sign-off recorded

- [ ] `1.4` **RED**: Draft `docs/adr/0002-table-design.md` skeleton listing every table from inventory plus the new 2.0 tables: `business_types` (flat catalog), `services` (with `slot_duration_minutes`, `buffer_minutes`), `professionals` (minimum: `id`, `name`, `business_type_id` FK, `is_active DEFAULT true`, audit, soft delete; NO `color_hex`), `professional_services` N:M join (composite PK `(professional_id, service_id)`, `ON DELETE CASCADE`), `business_settings` singleton (`id=1`, `auto_assign_professional BOOLEAN NOT NULL DEFAULT false`). Document that `bookings`/`appointments` FK to `professionals.id` is deferred to `sdd-apply`.
  ## Validation: `grep -c "professionals\|professional_services\|business_settings\|services\|business_types" docs/adr/0002-table-design.md` returns >= 5; `grep "color_hex"` returns zero; singleton enforcement contract is present

- [ ] `1.5` **GREEN**: Complete ADR 0002 with full column definitions, FK constraints, DEFAULT values, and rationale for renames/splits/merges vs. legacy. Every inventory table must have a documented destination.
  ## Validation: every table from `row-counts.txt` appears in ADR 0002 with a destination (kept, renamed, merged, dropped); gaps are explained

- [ ] `1.6` **REFACTOR**: Peer-review ADR 0002 against the locked decisions (#3803) — verify `auto_assign_professional` default false, `professionals` NOT deferred, `professional_services` is N:M not 1:N array. Freeze after Santi approval.
  ## Validation: review comments resolved; Santi sign-off recorded

- [ ] `1.7` Author `docs/adr/0003-rls-policies.md`: per-table RLS policies with explicit `TO authenticated` + ownership predicate (per Supabase security checklist). Document any service-role exceptions.
  ## Validation: every table in ADR 0002 has a policy row; policies use `TO authenticated` (not deprecated `auth.role()`); `SECURITY DEFINER` functions are explicitly documented with justification

- [ ] `1.8` Author `docs/adr/0004-indexes.md`: indexes covering all FKs, soft-delete filtered indexes (`WHERE deleted_at IS NULL`), and verified high-frequency query predicates.
  ## Validation: every FK from ADR 0002 has an index; `grep "CREATE INDEX" docs/adr/0004-indexes.md | wc -l` >= FK count from ADR 0002

- [ ] `1.9` **Validation gate**: Schema design frozen. All 4 ADRs peer-reviewed and approved. No further table structure changes without a new ADR.
  ## Validation: explicit freeze commit/tag on the design branch; Santi sign-off on all 4 ADRs

---

## Phase 2 — Build new schema

- [ ] `2.1` **RED**: Write the "forbidden columns lint" script at `supabase/migrations/lint/forbidden-columns.sh`. Script MUST fail (exit 1) if any of these columns appear in `supabase/migrations/*.sql`: `color_hex`, `slot_interval_minutes` (in `business_settings` context), `buffer_minutes` (in `business_settings` context), `min_notice_minutes`, `selected_business_types`, `allow_client_professional_selection`, `tenant_id`. Script MUST also fail if `auto_assign_professional` appears on `business_settings` without `DEFAULT false`. The script produces a human-readable report of violations. Cite the spec Scenarios this enforces: professionals table existence (R2), professional_services N:M join (R3), business_settings single-row flat (R5), per-service timing on services (R6), single-tenant MVP (R1).
  ## Validation: create a temp file with a forbidden column → script exits 1 with the column name in output; create a temp file with `auto_assign_professional BOOLEAN NOT NULL` (no DEFAULT false) → script exits 1; temp file with `auto_assign_professional BOOLEAN NOT NULL DEFAULT false` → script exits 0

- [ ] `2.2` **GREEN**: Run `forbidden-columns.sh` against current `supabase/migrations/*.sql` (should pass since migrations not yet created). Commit the lint script.
  ## Validation: `bash supabase/migrations/lint/forbidden-columns.sh` exits 0 before migrations exist; script is committed

- [ ] `2.3` Create new Supabase free-tier project `orvel-dev-qa`. Capture project ref. Confirm free tier.
  ## Validation: project visible in Supabase dashboard; `supabase --version` reports CLI version; project ref recorded in `infra/context/environments.md`

- [ ] `2.4` **RED**: Write `supabase/migrations/YYYYMMDDHHMMSS_create_business_types.sql` per ADR 0002. Run `forbidden-columns.sh` → fails if any forbidden pattern detected.
  ## Validation: migration creates `business_types` table; `forbidden-columns.sh` passes; `supabase db push --dry-run` shows expected DDL

- [ ] `2.5` **GREEN**: Write `supabase/migrations/YYYYMMDDHHMMSS_create_services.sql` with `slot_duration_minutes NOT NULL` and `buffer_minutes DEFAULT 0`. Run lint.
  ## Validation: migration creates `services` table with correct columns; lint passes; FK to `business_types` is present

- [ ] `2.6` Write `supabase/migrations/YYYYMMDDHHMMSS_create_business_settings.sql` — singleton with `id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1)`, `auto_assign_professional BOOLEAN NOT NULL DEFAULT false`. No `slot_interval_minutes`, no `buffer_minutes`, no `selected_business_types`, no `min_notice_minutes`, no `allow_client_professional_selection`. Run lint.
  ## Validation: `grep "slot_duration_minutes\|slot_interval_minutes\|buffer_minutes\|selected_business_types\|min_notice_minutes" <migration_file>` returns zero; singleton constraint `CHECK (id = 1)` is present; lint passes

- [ ] `2.7` **RED**: Write `supabase/migrations/YYYYMMDDHHMMSS_create_professionals.sql` — `id`, `name`, `business_type_id` FK, `is_active DEFAULT true`, audit columns, `deleted_at`. NO `color_hex`, NO bio, NO photo. Run lint. Then write the RED contract test: a SQL script that verifies the `professionals` table exists and has exactly the expected columns — the script must fail before the migration is applied.
  ## Validation: migration creates `professionals` with required columns; lint passes; RED test script fails against pre-migration DB (expected)

- [ ] `2.8` **GREEN**: Apply the `professionals` migration. Run the contract test — must pass. Run `forbidden-columns.sh` — must pass.
  ## Validation: `professionals` table exists in `orvel-dev-qa`; `SELECT column_name FROM information_schema.columns WHERE table_name='professionals'` returns exact expected set; lint passes; contract test passes

- [ ] `2.9` **RED**: Write `supabase/migrations/YYYYMMDDHHMMSS_create_professional_services.sql` — composite PK `(professional_id, service_id)`, `ON DELETE CASCADE` both sides, `created_at`. This is a separate migration file (not bundled with `professionals`). Run lint. Write RED contract test that verifies the composite PK enforces uniqueness.
  ## Validation: migration file is standalone; lint passes; RED test fails before migration applied

- [ ] `2.10` **GREEN**: Apply the `professional_services` migration. Run contract test — must pass. Attempt duplicate `(professional_id, service_id)` insert → must fail with unique violation.
  ## Validation: `professional_services` table exists; composite PK enforced; `INSERT ... ON CONFLICT DO NOTHING` pattern works; duplicate insert rejected

- [ ] `2.11` Write remaining migration files for all other inventory tables (bookings, clients, appointments, etc.) per ADR 0002. Every migration follows timestamp-prefix naming. Run lint after each migration file.
  ## Validation: `supabase migration list --local` returns all migrations in timestamp order; `forbidden-columns.sh` passes; `supabase db push --dry-run` shows zero unexpected diffs

- [ ] `2.12` Write RLS policy migrations per ADR 0003. Every policy uses `TO authenticated` (not deprecated `auth.role()`). All tables in exposed schemas have RLS enabled.
  ## Validation: `SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false` returns zero rows; every policy file references a matching ADR 0003 entry

- [ ] `2.13` Write index migrations per ADR 0004. Every FK has an index; soft-delete filtered indexes present.
  ## Validation: `SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY'` — every returned column has a matching index from `pg_indexes`

- [ ] `2.14` Move legacy migrations from `supabase/migrations/` to `supabase/migrations/_legacy/`. Add `_legacy/README.md` explaining retention. Verify legacy files are excluded from fresh application.
  ## Validation: `supabase db push --dry-run` does not reference any `_legacy/` file; `_legacy/README.md` exists with retention rationale

- [ ] `2.15` Apply all migrations to `orvel-dev-qa`: `supabase db push`. Run the full contract test suite.
  ## Validation: `supabase migration list` aligned with local; schema matches ADR 0002; full contract test suite passes; `forbidden-columns.sh` passes against all migration files

- [ ] `2.16` Re-deploy all 12 Edge Functions to `orvel-dev-qa`. Run integration smoke tests (at minimum: booking, login, billing webhook, notification dispatch).
  ## Validation: `supabase functions list` shows 12 functions; each responds 200 to a health check (GET with service-role JWT); Mercado Pago sandbox webhook handshake succeeds

- [ ] `2.17` Re-enter all secrets per env into `orvel-dev-qa` using sandbox credentials. Recreate storage buckets with RLS policies matching ADR 0003.
  ## Validation: secrets present (names only verified); storage upload + signed-URL round-trip succeeds; bucket policies match ADR 0003

- [ ] `2.18` **Validation gate**: Backend fully operational in `orvel-dev-qa`. All 12 Edge Functions smoke-tested. Schema frozen. Lint script added to CI.
  ## Validation: CI pipeline includes `forbidden-columns.sh` check; test report committed; Santi sign-off

---

## Phase 3 — Data migration ETL

- [ ] `3.1` Author `supabase/migrations/etl/MAPPING.md` documenting old → new column mapping for every table (renames, splits, merges, type coercions). Include new mappings for `professionals` and `professional_services` (seeded from legacy data if available, otherwise bootstrapped).
  ## Validation: every source column from Phase 0 inventory has a destination row in MAPPING.md; `grep -c "^|" MAPPING.md` >= column count from inventory

- [ ] `3.2` Write idempotent ETL scripts under `supabase/migrations/etl/` (parametrized by source/dest URLs, dry-run mode available).
  ## Validation: scripts run twice against same source/dest without duplicating data; `--dry-run` mode prints intended changes without executing

- [ ] `3.3` **RED**: Test ETL against a 10% random sample in a scratch Supabase branch. Row counts and checksums expected to match proportionally.
  ## Validation: destination row counts ≈ 10% of source for every mapped table (within 1% tolerance for small tables); sample queries return expected shapes

- [ ] `3.4` **GREEN**: Fix any ETL defects found in 10% run. Re-run and verify.
  ## Validation: 10% run passes clean; zero FK violations; NOT NULL constraints preserved

- [ ] `3.5` Test ETL against 50% subset. Validate FK integrity and checksums on payment/subscription/booking tables.
  ## Validation: counts match proportionally; FK violations = 0; checksums for critical tables match source-derived expectations

- [ ] `3.6` Test ETL against 100% staging dataset (full copy of `tzqgwziyiospmvpdgbnt` snapshot). Spot-check 100 random records per critical table.
  ## Validation: every critical table count matches source within 0% tolerance; 100-record spot-check passes; checksum report attached

- [ ] `3.7` Time the full ETL run and record duration in `infra/context/migration-inventory/etl-timing.md`. If it exceeds the planned maintenance window, raise with Santi.
  ## Validation: ETL duration recorded; comparison against maintenance window budget; escalation documented if exceeded

- [ ] `3.8` **Validation gate**: ETL is repeatable, idempotent, and verified at 100% scale. Re-running ETL on the same source produces identical row counts and checksums.
  ## Validation: two consecutive full runs produce identical outputs; `diff` of checksum reports returns empty; Santi sign-off

---

## Phase 4 — Cutover

- [ ] `4.1` Create new Supabase free-tier project `orvel-main`. Capture project ref. Confirm free tier.
  ## Validation: project visible in Supabase dashboard; project ref recorded in `infra/context/environments.md`

- [ ] `4.2` Apply all migrations to `orvel-main`: `supabase db push`. Verify schema matches `orvel-dev-qa` exactly.
  ## Validation: `supabase db diff --linked` returns zero differences between linked projects; `forbidden-columns.sh` passes

- [ ] `4.3` Take and verify complete backup of `tzqgwziyiospmvpdgbnt` (pg_dump schema + data + storage snapshot).
  ## Validation: backup file sizes > 0; restore dry-run against a scratch project succeeds; checksums match source

- [ ] `4.4` Schedule maintenance window with Santi. Notify stakeholders. Prepare the cutover runbook.
  ## Validation: window start/end recorded; comms artifact in `infra/context/migration-inventory/cutover-comms.md`; runbook covers every step with rollback triggers

- [ ] `4.5` Freeze writes on `tzqgwziyiospmvpdgbnt` (read-only mode via dashboard toggle). Verify freeze holds.
  ## Validation: any non-system write attempt fails; freeze time recorded; documented in runbook

- [ ] `4.6` Final data sync: run ETL against `orvel-main`. Validate row counts, FK integrity, and checksums against pre-freeze snapshot.
  ## Validation: counts match pre-freeze snapshot; integrity checks green; zero FK violations

- [ ] `4.7` Redeploy all 12 Edge Functions to `orvel-main` with production secrets. Verify Mercado Pago webhook handshake with production credentials.
  ## Validation: `supabase functions list` shows 12; each health check returns 200; MP webhook handshake succeeds

- [ ] `4.8` Switch runtime env vars in Vercel + dashboard config to point at `orvel-main`. Verify production app initializes with new project ref.
  ## Validation: production app logs show `orvel-main` ref; no fallback to `tzqgwziyiospmvpdgbnt`; `grep -r "tzqgwziyiospmvpdgbnt" apps/` returns zero (except historical docs)

- [ ] `4.9` Smoke test production: booking, login, billing, notifications, Mercado Pago webhook delivery.
  ## Validation: every critical flow passes; failures trigger rollback per task 4.10

- [ ] `4.10` Execute rollback plan if any critical smoke test fails: revert env vars to old project, restore write mode, document trigger and resolution.
  ## Validation: rollback triggers defined in runbook; rollback rehearsal result documented; actual rollback (if needed) recorded with root cause

---

## Phase 5 — Cleanup

- [ ] `5.1` Mark `tzqgwziyiospmvpdgbnt` as read-only permanently. Verify write blocks persist.
  ## Validation: any write attempt from app is blocked; only admin can override; read-only setting visible in Supabase dashboard

- [ ] `5.2` Schedule backup retention of old project for 30 days. Document restore procedure in runbook.
  ## Validation: retention job in place (or calendar reminder); restore procedure step-by-step in `infra/context/migration-inventory/rollback-restore.md`

- [ ] `5.3` Update `infra/context/supabase.md`: mark `orvel-dev-qa` and `orvel-main` as canonical. Note `tzqgwziyiospmvpdgbnt` as historical (read-only, 30-day retention).
  ## Validation: doc lists new refs as canonical; old ref in a "Historical" section only; links resolve

- [ ] `5.4` Replace all references to `tzqgwziyiospmvpdgbnt` in repo source/docs (excluding `_legacy/` and historical notes) with new project refs.
  ## Validation: `rg tzqgwziyiospmvpdgbnt` returns only hits in `_legacy/`, `infra/context/migration-inventory/`, and the historical note in `infra/context/supabase.md`

- [ ] `5.5` Update `README.md` and onboarding docs to reflect the new architecture and dedicated Supabase projects.
  ## Validation: new dev onboarding instructions reference `orvel-dev-qa` only; no instructions require access to personal project

- [ ] `5.6` Notify team and stakeholders of cutover completion + 30-day rollback window.
  ## Validation: notification sent; archive link recorded in `infra/context/migration-inventory/cutover-comms.md`

- [ ] `5.7` Close Phase 0–4 issues/PRs. Link outcomes to this change proposal.
  ## Validation: all related PRs merged or explicitly closed; audit trail preserved in GitHub

- [ ] `5.8` **Validation gate**: Old project retired as canonical. New projects are sole source of truth. 30-day rollback window active.
  ## Validation: Santi sign-off; rollback window expiry date recorded; monitoring alert configured for free-tier quota

---

## Phase 6 — 3-env setup

- [ ] `6.1` Confirm `orvel-main` exists (created in Phase 4) and `orvel-dev-qa` exists (created in Phase 2). Record both project refs in `infra/context/environments.md`.
  ## Validation: both projects visible in Supabase dashboard; refs match those recorded in earlier phases

- [ ] `6.2` Update `apps/dashboard/src/environments/environment.ts` with Supabase URL + anon key for each env. Create `environment.qa.ts` pointing at `orvel-dev-qa`. Create `environment.prod.ts` pointing at `orvel-main`.
  ## Validation: `ng build --configuration=qa` bundles `environment.qa.ts`; `ng build --configuration=production` bundles `environment.prod.ts`; QA bundle does NOT contain production Supabase URL

- [ ] `6.3` Update `apps/dashboard/angular.json` with `configurations.qa` block and correct `fileReplacements` for `environment.qa.ts`.
  ## Validation: `ng build --configuration=qa` succeeds; `grep "orvel-dev-qa" dist/` returns hits; `grep "orvel-main" dist/` returns zero for QA build

- [ ] `6.4` Author `.env.example` at repo root documenting every required env var name per environment (no values). Sections: local (SQLite), dev-remote/QA, main.
  ## Validation: every var used by `apps/dashboard`, `apps/landing`, and all 12 Edge Functions appears; `grep -c "=" .env.example` >= total secret count from Phase 0 inventory

- [ ] `6.5` Update `apps/dashboard/src/app/core/config/dashboard-env.ts` with SQLite fallback for local dev. Update `apps/landing` env setup similarly.
  ## Validation: `npm run dev` in `apps/dashboard` starts against SQLite without Supabase network calls; verify by disconnecting network

- [ ] `6.6` Create `qa` branch from `dev`. Configure GitHub branch protection on `qa` (required CI checks, no direct push).
  ## Validation: `qa` branch exists; branch protection rule visible in GitHub repo settings; direct push to `qa` is rejected

- [ ] `6.7` Author `.github/workflows/deploy-promotion.yml`: on push to `qa` → migrate `orvel-dev-qa` + deploy Edge Functions + deploy Vercel QA; on push to `main` → migrate `orvel-main` + deploy Edge Functions + deploy Vercel production. Include `forbidden-columns.sh` as a mandatory CI check.
  ## Validation: workflow file passes YAML lint; `act --dry-run` shows intended jobs; secrets referenced by name only (never values); `forbidden-columns.sh` step is present in the migration job

- [ ] `6.8` Configure Vercel: 3 deployment tracks — production (`main` → `orvel.app`), QA (`qa` → `qa.orvel.app`), preview (`dev` + feature branches). Update `vercel.json` if needed.
  ## Validation: each domain deploys from the correct branch; Vercel dashboard shows 3 active tracks; `vercel.json` in repo is consistent

- [ ] `6.9` Update `infra/context/environments.md` and `infra/context/deployment.md` with the 3-env model, required var names, and promotion workflow. Cross-reference ADR 0001 (single-tenant isolation via deployment boundaries).
  ## Validation: docs are internally consistent; `grep "orvel-dev-qa\|orvel-main" infra/context/environments.md` returns expected references; env isolation matches ADR 0001

- [ ] `6.10` End-to-end smoke: push a test commit to `qa` → GitHub Action auto-deploys + auto-migrates → Vercel QA URL serves the change. Verify `forbidden-columns.sh` runs and passes in CI.
  ## Validation: CI run passes (green check on `qa`); QA URL loads and smoke tests pass; CI log includes `forbidden-columns.sh` output showing "PASS"

- [ ] `6.11` Update `apps/dashboard` and `apps/landing` clients to consume the new `professionals` / `professional_services` tables. Replace any legacy FK patterns that pointed to the pre-2.0 structure. Reference PR #198 for the env var wiring already completed; do NOT re-implement that wiring.
  ## Validation: `rg "professionals\|professional_services" apps/dashboard/src apps/landing/src` returns at least one import/usage per app; TypeScript compilation passes; no import references the legacy schema equivalents

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 5000–7000 (spanning 6 phases, ~40+ migration files, 12 edge functions, 4 ADRs, ETL scripts, CI/CD, env config, client updates) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: Phase 0 inventory (~600 lines docs) → PR 2: Phase 1 ADRs 0001–0004 (~800 lines docs) → PR 3: Phase 2 new schema migrations + lint (~1200 lines SQL/sh) → PR 4: Phase 2 edge functions redeploy (~800 lines config/fixes) → PR 5: Phase 3 ETL scripts + validation (~1000 lines scripts/docs) → PR 6: Phase 4–5 cutover + cleanup runbooks (~600 lines docs) → PR 7: Phase 6 3-env CI/CD + client updates (~1200 lines yaml/ts/config) |
| Delivery strategy | ask-always |
| Decision needed before apply | Yes |
| Chain strategy | pending (ask user: stacked-to-main vs feature-branch-chain vs size:exception) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High
