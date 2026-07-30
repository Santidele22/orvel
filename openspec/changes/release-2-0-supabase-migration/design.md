# Design: release-2-0-supabase-migration

## Context

The personal legacy Supabase project `tzqgwziyiospmvpdgbnt` is operationally abandoned. The new canonical remote is the dedicated Supabase project `orvel-qa-dev` (ref `rloovjtdaqvcgzlbppfr`), which is empty — no schema, no Edge Functions, no secrets, no storage buckets. The repository contains legacy migrations and 12 Edge Functions, plus no verified end-to-end CI/CD promotion pipeline. Release 2.0 fills `orvel-qa-dev` with the new schema, provisions `orvel-main` from the same migration set, and adds safe environment promotion at a recurring infrastructure cost of $0 under current free-tier assumptions. There is no ETL, no parallel cutover, and no 30-day legacy cleanup window.

### Cross-references

- `release-1-0-2-cleanup` planned `auto_assign_professional` and multi-professional modeling for release 1.0.3. Release 2.0 takes over that work: the `professionals` and `professional_services` tables land here, and `auto_assign_professional` is reintroduced into `business_settings` (default `false`). No code from 1.0.2 cleanup is required to land first.

## Target Architecture

```text
Developer workstation
  Angular/Astro + SQLite
  (local dev, offline, fast)
          |
          | push dev / feature branches
          v
GitHub ---------------------------> Vercel project
  |                                  |- Preview: dev + feature branches
  | push qa                          |- QA: qa.orvel.app
  |                                  `- Main: orvel.app
  v
GitHub Actions
  |- qa   -> migrate/deploy -> Supabase orvel-qa-dev
  |                           (dev-remote + QA, sandbox integrations)
  `- main -> migrate/deploy -> Supabase orvel-main
                              (isolated production integrations)
```

## Migration Strategy

Option C rebuilds the schema from zero inside `orvel-qa-dev` instead of treating historical migrations as the desired design. The legacy is abandoned, so there is no ETL and no parallel cutover. Delivery is sequential:

1. Confirm `orvel-qa-dev` is empty; optionally capture a one-shot read-only `pg_dump --schema-only` of the abandoned legacy as a historical snapshot.
2. Design and peer-review the replacement schema and RLS model (ADRs 0001–0004).
3. Build and validate the schema in `orvel-qa-dev`; redeploy backend assets (12 Edge Functions rebuilt, not migrated); enter sandbox secrets.
4. Provision `orvel-main`, apply the same migrations, redeploy the 12 Edge Functions with production secrets, smoke test critical flows.
5. Complete SQLite, branch, Vercel, GitHub Actions, and environment automation.

## Schema Design Principles

- **Single-tenant MVP.** The 2.0 schema targets one Orvel tenant per deployment. Tenant ownership is implicit in the deployment, not a row-level discriminator. No `tenant_id` column is added to tenant-owned relations in this release. Cross-tenant isolation is provided by deployment separation (dev/qa/main Supabase projects), not by row-level predicates. Multi-tenant modeling (per-row `tenant_id`, cross-tenant isolation tests) is explicitly deferred to a post-2.0 release.
- **`business_settings` is single-row and business-type-flat.** The table stores exactly one configuration row for the tenant. No per-business-type variant columns are carried forward from the legacy schema — explicitly excluded from re-introduction: `slot_interval_minutes`, `buffer_minutes`, `min_notice_minutes`, `selected_business_types`, `allow_client_professional_selection`. Operational knobs that vary per service move to the `services` table. The `business_types` table is a flat catalog; it never parameterizes `business_settings`. `auto_assign_professional` IS reintroduced as a column with `DEFAULT false` (see "Auto-assign toggle" bullet).
- **`business_settings` singleton enforcement.** Postgres enforces the single-row invariant via `id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1)`. Any INSERT other than the singleton row, or any attempt to change `id`, fails. Reads always use `WHERE id = 1`.
- **Auto-assign toggle.** `business_settings.auto_assign_professional` is a `BOOLEAN NOT NULL DEFAULT false`. The MVP mandates that the client always picks a professional at booking time. The toggle exists so that a future release can implement automatic assignment (round-robin, first-available, etc.) without a schema migration.
- **Per-service timing lives on `services`.** `slot_duration_minutes`, `buffer_minutes`, and any equivalent grid/buffer/prep/post timing knobs are columns on the `services` table. `business_settings` SHALL NOT carry any `slot_duration_minutes` column.
- **`professionals` table lands in 2.0; no per-row color tokens.** The 2.0 MVP includes a `professionals` table (no longer deferred to 1.0.3) so the booking UI can offer professional selection. The table still stores no per-record color tokens such as `color_hex`. Theme tokens, where present, live in the application layer or in shared branding fields — never per row.
- **Soft deletion:** domain records use `deleted_at`; ordinary flows do not hard-delete.
- **Auditing:** relevant records expose `created_at`, `updated_at`, `created_by`, `updated_by`.
- **Consistent naming:** snake_case identifiers, explicit foreign-key names, timestamp-prefixed migrations.
- **RLS reviewed per table:** policies include explicit role checks; service-role exceptions are documented. No `tenant` predicate is required in 2.0.
- **Indexes** cover foreign keys and verified high-frequency query predicates.

## Services table (sketch)

```sql
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_type_id UUID NOT NULL REFERENCES business_types(id),
  slot_duration_minutes INT NOT NULL,
  buffer_minutes INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_services_business_type ON services(business_type_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_services_active ON services(id) WHERE deleted_at IS NULL;
```

Notes:
- No price columns in 2.0 MVP; pricing is out of scope and handled at a higher layer if needed.
- `slot_duration_minutes` is NOT NULL; `buffer_minutes` defaults to 0 (no buffer between appointments).
- Every service belongs to exactly one `business_type` (FK required, not nullable).
- Soft delete via `deleted_at`, per existing principles.
- Future booking/appointment tables will FK to `services.id`.

## Professionals table (sketch)

```sql
CREATE TABLE professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_type_id UUID NOT NULL REFERENCES business_types(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_professionals_business_type ON professionals(business_type_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_professionals_active ON professionals(id) WHERE deleted_at IS NULL;
```

Notes:
- Minimum columns: identity, business_type, active flag, audit, soft delete. No bio, no photo (out of scope for MVP).
- `is_active` defaults to `true`; soft-deleted rows keep `is_active` as it was at deletion time.
- A professional belongs to exactly one `business_type` (FK required, not nullable). A professional can offer multiple services via `professional_services`.

## Professional services (N:M) table (sketch)

```sql
CREATE TABLE professional_services (
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (professional_id, service_id)
);

CREATE INDEX idx_professional_services_service ON professional_services(service_id);
```

Notes:
- Composite PK on `(professional_id, service_id)` enforces the N:M invariant at the table level.
- `ON DELETE CASCADE` keeps referential integrity when a professional or service is hard-deleted. Soft deletes (via `deleted_at`) keep rows intact and rely on filtered queries.
- The booking UI will join `professional_services` to filter eligible professionals per service.
- Future `bookings` / `appointments` tables (deferred to `sdd-apply`) will FK to `professionals.id` and `services.id`.

## Cutover Strategy

There is no dual-write window. The legacy project is operationally abandoned. `orvel-qa-dev` is filled with the new schema; `orvel-main` is provisioned by applying the same migration set and the 12 Edge Functions with production secrets, then smoke-tested. Before provisioning `orvel-main`, the team takes a pre-provisioning backup of `orvel-qa-dev` so rollback has a concrete restore point. If smoke tests fail on `orvel-main`, the deployment is rolled back within the Supabase project layer: re-apply migrations to return the schema to a known-good state, or restore from the pre-provisioning backup. The rollback triggers, owners, and configuration reversal are documented in `infra/context/migration-inventory/main-rollback.md`.

## 3-Env Strategy

| Environment | Data platform | Integration mode | Deployment source |
|---|---|---|---|
| Local dev | SQLite | Local/fake or sandbox | Developer workstation |
| dev-remote + QA | Shared `orvel-qa-dev` Supabase | Sandbox | `dev`, feature, and `qa` workflows |
| Main | Isolated `orvel-main` Supabase | Production | `main` |

SQLite optimizes local iteration, while remote QA exercises PostgreSQL, RLS, Edge Functions, storage, and external integration boundaries before production promotion. Test data and credentials remain environment-scoped.

## Trade-offs Considered

| Alternative | Benefit | Cost / risk | Decision |
|---|---|---|---|
| Three separate Supabase projects | Maximum isolation | At least one paid project, approximately $25/month | Rejected to preserve $0/month target |
| Pure SQLite across non-production | Lowest cost and simplest local loop | Cannot faithfully validate PostgreSQL, RLS, storage, or Edge Functions | Rejected due to production-parity risk |
| Option B hybrid schema migration | Lower initial rewrite effort | Preserves historical inconsistencies and complicates ownership boundaries | Rejected in favor of Option C |
| Option C full rebuild from zero in `orvel-qa-dev` | Clean model and explicit invariants | Highest short-term effort; requires rebuild of the 12 Edge Functions | Accepted with documented rollback for `orvel-main` |

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Smoke-test failures during `orvel-main` cutover | Documented rollback (re-apply migrations or restore from pre-provisioning backup); smoke tests for booking, login, billing, notifications before sign-off |
| Booking/auth regression | Automated integration tests plus post-provisioning critical-flow smoke tests in both `orvel-qa-dev` and `orvel-main` |
| Mercado Pago/billing disruption | Environment-scoped credentials, webhook verification, sandbox rehearsal before production credentials are entered |
| RLS authorization gaps | RLS per-table review, role checks; explicit non-multi-tenant stance documented so future multi-tenant work does not silently regress; no `tenant_id` column in 2.0. |
| SQLite/PostgreSQL behavioral drift | Keep SQLite for fast local work; require remote QA before promotion |
| Shared dev/QA interference | Namespace test data, reset procedures, QA windows, and environment ownership rules |
| Free-tier limits exceeded | Monitor quotas; treat $0/month as conditional on current usage and provider limits |
