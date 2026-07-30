# ADR 0001: Schema Principles — Release 2.0

## Status

Accepted (release 2.0, 2026-07-30).

## Context

Orvel migrates from a personal Supabase project to dedicated Orvel infrastructure. The new canonical remote is `orvel-qa-dev` (ref `rloovjtdaqvcgzlbppfr`), which currently carries 12 legacy tables built with the `business_id` FK pattern and no row-level security. The legacy project is operationally abandoned and `orvel-qa-dev` will be reset to empty in Phase 2 before the new schema is applied. See `infra/context/migration-inventory/README.md` for the current state and `infra/context/migration-inventory/schema.sql` for the legacy DDL.

The 2.0 schema must be rebuildable from zero against an empty `orvel-qa-dev`, must support the multi-professional booking flow that release 1.0.3 originally planned to own, and must keep the recurring infrastructure cost at $0/month under free-tier limits. The principles in this ADR are the source of truth for every later table, RLS policy, and index decision in this release.

## Decision

Release 2.0 ships a **single-tenant MVP** schema. No row-level tenant discriminator column is added to any tenant-owned relation. Cross-tenant isolation is provided by deployment separation across the three dedicated Supabase projects, not by row-level predicates. Multi-tenant modeling (per-row discriminator columns, cross-tenant isolation tests) is explicitly deferred to a post-2.0 release and will require a new ADR if it lands.

## Principles

Each principle is paired with a testable predicate. The predicates are the RED contract for Phase 2 migrations and the lint script `supabase/migrations/lint/forbidden-columns.sh` (task 2.1).

### P1 — Single-tenant MVP

No row-level tenant discriminator column is added to any tenant-owned relation in 2.0. Cross-tenant isolation is provided by deployment separation.

**Predicate**: `SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name ~ '^(tenant_id|tenant_uuid|tenant)$'` returns 0 rows.

### P2 — Soft deletion

Domain records use a nullable `deleted_at TIMESTAMPTZ` column. Ordinary application flows do not hard-delete; recovery and audit flows read `WHERE deleted_at IS NULL`.

**Predicate**: every domain table in `public` has a `deleted_at TIMESTAMPTZ` column with NULL default. Verified via `information_schema.columns`.

### P3 — Audit metadata

Every relevant mutable domain table includes `created_at`, `updated_at`, `created_by`, `updated_by`. `created_at` and `updated_at` default to `now()` and are NOT NULL. `created_by` and `updated_by` are nullable UUIDs and reference the actor.

**Predicate**: every domain table exposes all four columns; `created_at` and `updated_at` are NOT NULL with `DEFAULT now()`.

### P4 — Snake_case naming

All identifiers (table names, column names, indexes, constraints, policy names) match `^[a-z][a-z0-9_]*$`. Foreign-key constraint names follow the `<child_table>_<column>_fkey` convention. Timestamps are recorded as `TIMESTAMPTZ` (timezone-aware).

**Predicate**: every identifier in `public` matches the regex; verified via `pg_get_userbyid` + `information_schema` introspection in the lint script.

### P5 — `business_settings` singleton

The `business_settings` table holds exactly one row. Postgres enforces the invariant via `id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1)`. Any INSERT other than `id = 1`, or any UPDATE that changes `id`, fails at the database layer.

**Predicate**: `SELECT count(*) FROM business_settings` returns exactly 1; `INSERT INTO business_settings(id) VALUES (2)` fails; `UPDATE business_settings SET id = 2 WHERE id = 1` fails.

### P6 — RLS reviewed per table

Every table in `public` (and any other exposed schema) has RLS **enabled**. Every policy uses the `TO <role>` clause (the deprecated comparison of role names via session metadata is not used in this schema). Policies include explicit ownership predicates so the role check is not a BOLA / IDOR loophole. Service-role exceptions are justified on a per-table basis.

**Predicate**: `SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity = false` returns 0 rows for domain tables. Verified per ADR 0003.

### P7 — Indexes cover foreign keys and verified high-frequency predicates

Every foreign-key column gets a btree index. Every soft-deletable table gets a partial index `WHERE deleted_at IS NULL` on the FK columns used by ordinary queries. High-frequency query predicates (verified by the booking, login, and billing flows) get matching btree indexes.

**Predicate**: every FK column referenced in `information_schema.key_column_usage` has a corresponding row in `pg_indexes`. Verified via the join in `supabase/migrations/lint/forbidden-columns.sh` and documented in ADR 0004.

### Additional locked decisions from `design.md`

These are not strictly principles but are inherited from the locked design and govern the schema:

- `business_types` is a flat catalog; it never parameterizes `business_settings` (R5 in spec).
- Per-service timing lives on `services`: `slot_duration_minutes INT NOT NULL`, `buffer_minutes INT NOT NULL DEFAULT 0`. `business_settings` SHALL NOT carry any `slot_interval_minutes` or `buffer_minutes` column (R6 in spec).
- `professionals` carries no per-row color tokens. Theme tokens live in the application layer or shared branding fields, never per row (R2 in spec).
- `professional_services` is the N:M join between `professionals` and `services`; the booking UI joins through it to filter eligible professionals per service (R3 in spec).
- `business_settings.auto_assign_professional` is `BOOLEAN NOT NULL DEFAULT false`. The MVP mandates that the client picks a professional; the toggle exists so a future release can implement automatic assignment without a schema migration (R7 in spec).
- `bookings` / `appointments` are deferred to `sdd-apply`. The FK from `bookings.professional_id` to `professionals.id` is referenced in `design.md` but the table itself is not designed in Phase 1.

## Consequences

- We are locked out of true multi-tenant until a post-2.0 release. Acceptable because the release is explicitly single-tenant MVP and the deployment boundary (one Supabase project per tenant-environment) provides the isolation we need today.
- Every domain table must be reviewed for RLS before it ships. Publishing a table without RLS is a security advisory and a CI failure.
- Every FK must be indexed. Forgetting an index is a performance regression and a Phase 2 task 2.14 validation failure.
- The forbidden-columns lint script is the single source of truth for these principles at the SQL level. Any migration that violates a principle fails the lint and is rejected before it is applied.

## Review notes

- P1 cross-references `design.md` line 44 (single-tenant MVP principle).
- P2 / P3 cross-reference `design.md` lines 50-51 (soft deletion + auditing).
- P4 cross-references `design.md` line 52 (consistent naming).
- P5 cross-references `design.md` line 46 (`business_settings` singleton enforcement).
- P6 cross-references `design.md` line 53 (RLS reviewed per table).
- P7 cross-references `design.md` line 54 (indexes cover FKs and high-frequency predicates).
- The "Additional locked decisions" block cross-references `design.md` lines 45, 47, 48, 49 and `spec.md` Requirements R2, R3, R5, R6, R7.
- The 12 legacy tables in `infra/context/migration-inventory/schema.sql` are NOT the source of truth for table shape. The principles in this ADR are. The legacy schema is dropped in Phase 2 before the new tables are created.

## Phase 1 freeze

- **Timestamp**: 2026-07-30
- **Status**: **Frozen — schema design locked**
- **Approval record**: Santi approved schema design on 2026-07-30 via the chain PR for Phase 1 ADRs.
- **Forward reference**: No further table structure changes without a new ADR. Any column addition, drop, or rename beyond the locked decisions in `design.md` and `spec.md` requires a new ADR that supersedes 0001.
