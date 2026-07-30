# ADR 0002: Table Design — Release 2.0

## Status

Accepted (release 2.0, 2026-07-30).

## Context

Phase 2 will DROP all 12 legacy tables in `orvel-qa-dev` (see `infra/context/migration-inventory/schema.sql` and `infra/context/migration-inventory/row-counts.txt`) and rebuild from zero. The 12 legacy tables are:

`businesses`, `professionals`, `service_categories`, `services`, `professional_services`, `professional_hours`, `users`, `clients`, `appointments`, `business_settings`, `notifications`, `email_outbox`.

The legacy schema carried the `business_id` FK pattern (every domain table FKed to `businesses.id`), per-rubric variant columns on `business_settings`, and a per-row hex color token on `professionals`. None of those patterns survive into 2.0. The locked decisions in `design.md` and the spec scenarios in `spec.md` (R1–R7) define the target shape.

## Decision

Release 2.0 ships **5 new tables in scope for the migration phase**: `business_types`, `services`, `professionals`, `professional_services`, `business_settings`. `bookings` and `appointments` are deferred to `sdd-apply`; their FK to `professionals.id` is referenced in `design.md` but the table shape is authored in a later phase. `business_types` is the canonical English name (legacy-aligned by intent, not by content).

Every table below has a full column list, constraint set, and documented destination (kept / renamed / merged / dropped) versus the legacy schema.

## Tables

### T1 — `business_types`

Flat catalog of business categories (hair salon, dental clinic, gym, etc.). Each service belongs to exactly one business type. Each professional belongs to exactly one business type.

```sql
CREATE TABLE business_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ
);
```

| Column | Type | Constraints | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | `PRIMARY KEY` | `gen_random_uuid()` | Generated identity. |
| `name` | TEXT | `NOT NULL` | — | Human label. |
| `slug` | TEXT | `NOT NULL UNIQUE` | — | URL-safe identifier. |
| `created_at` | TIMESTAMPTZ | `NOT NULL` | `now()` | P3. |
| `updated_at` | TIMESTAMPTZ | `NOT NULL` | `now()` | P3. |
| `created_by` | UUID | nullable | NULL | P3. |
| `updated_by` | UUID | nullable | NULL | P3. |
| `deleted_at` | TIMESTAMPTZ | nullable | NULL | P2 (soft delete). |

Indexes: implicit PK + implicit UNIQUE on `slug`. Optionally a partial index `WHERE deleted_at IS NULL` for the common "list active business types" query — see ADR 0004.

**Destination vs legacy**: **renamed + reshaped**. The legacy `businesses` table (UUID PK, `name`, `phone`, `email`, `address`, `slug`, audit, `deleted_at`) is replaced by `business_types` with a different semantic: a flat catalog of categories rather than a single-row "the tenant's business entity". The `phone`, `email`, `address` columns are dropped (out of MVP scope; the MVP treats these as application-layer or `business_settings` concerns). The `businesses` table is dropped entirely in Phase 2.

### T2 — `services`

Per-service catalog. Each service belongs to one business type and carries the per-service timing knobs (slot duration, buffer between appointments).

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
```

| Column | Type | Constraints | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | `PRIMARY KEY` | `gen_random_uuid()` | Generated identity. |
| `name` | TEXT | `NOT NULL` | — | Human label. |
| `business_type_id` | UUID | `NOT NULL REFERENCES business_types(id)` | — | FK to T1. |
| `slot_duration_minutes` | INT | `NOT NULL` | — | R6 (per-service timing). |
| `buffer_minutes` | INT | `NOT NULL` | `0` | R6. |
| `created_at` | TIMESTAMPTZ | `NOT NULL` | `now()` | P3. |
| `updated_at` | TIMESTAMPTZ | `NOT NULL` | `now()` | P3. |
| `created_by` | UUID | nullable | NULL | P3. |
| `updated_by` | UUID | nullable | NULL | P3. |
| `deleted_at` | TIMESTAMPTZ | nullable | NULL | P2. |

Indexes: implicit PK + FK index on `business_type_id` (partial `WHERE deleted_at IS NULL`) + an active-services index on `id` (partial `WHERE deleted_at IS NULL`). See ADR 0004.

**Destination vs legacy**: **reshape**. The legacy `services` table (UUID PK, `business_id`, `category_id`, `name`, `description`, `duration_minutes`, `price`, `active`, audit, `deleted_at`) is replaced by `services` with these changes:
- `business_id` FK → `business_type_id` FK (renamed to reflect the new semantic; the legacy `businesses` table is dropped).
- `category_id` FK dropped (the legacy `service_categories` table is dropped in 2.0; the catalog is one-level deep via `business_types`).
- `description` dropped (out of MVP scope).
- `duration_minutes` → `slot_duration_minutes` (locked name, per R6).
- `price` dropped (no price columns in 2.0 MVP; pricing is out of scope per `design.md` line 77).
- `active` dropped (soft delete via `deleted_at` is the single active/inactive mechanism; redundant boolean removed).
- `buffer_minutes` added (locked per R6).

### T3 — `professionals`

Minimum columns: identity, business type, active flag, audit, soft delete. No bio, no photo, no per-row color tokens (theme tokens live in the application layer or shared branding).

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
```

| Column | Type | Constraints | Default | Notes |
|---|---|---|---|---|
| `id` | UUID | `PRIMARY KEY` | `gen_random_uuid()` | Generated identity. |
| `name` | TEXT | `NOT NULL` | — | Human label. |
| `business_type_id` | UUID | `NOT NULL REFERENCES business_types(id)` | — | FK to T1. |
| `is_active` | BOOLEAN | `NOT NULL` | `true` | Independent of soft delete. |
| `created_at` | TIMESTAMPTZ | `NOT NULL` | `now()` | P3. |
| `updated_at` | TIMESTAMPTZ | `NOT NULL` | `now()` | P3. |
| `created_by` | UUID | nullable | NULL | P3. |
| `updated_by` | UUID | nullable | NULL | P3. |
| `deleted_at` | TIMESTAMPTZ | nullable | NULL | P2. |

Indexes: implicit PK + FK index on `business_type_id` (partial `WHERE deleted_at IS NULL`) + an active-professionals index on `id` (partial `WHERE deleted_at IS NULL`). See ADR 0004.

**Destination vs legacy**: **reshape**. The legacy `professionals` table (UUID PK, `business_id`, `name`, `phone`, `email`, `active`, audit, `deleted_at`) is replaced with:
- `business_id` FK → `business_type_id` FK (renamed to reflect the new semantic).
- `phone`, `email` columns dropped (out of MVP scope; can be added later if needed).
- `active` → `is_active` (column renamed for clarity; same default `true`).
- No per-row color tokens are added (R2; per-row hex color tokens and equivalent are explicitly out).
- Bio, photo, and other profile fields are deferred to a post-2.0 release.

### T4 — `professional_services`

N:M join between `professionals` and `services`. The booking UI joins through this table to filter eligible professionals per service.

```sql
CREATE TABLE professional_services (
  professional_id UUID NOT NULL REFERENCES professionals(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (professional_id, service_id)
);
```

| Column | Type | Constraints | Default | Notes |
|---|---|---|---|---|
| `professional_id` | UUID | `NOT NULL REFERENCES professionals(id) ON DELETE CASCADE` | — | Composite PK part. |
| `service_id` | UUID | `NOT NULL REFERENCES services(id) ON DELETE CASCADE` | — | Composite PK part. |
| `created_at` | TIMESTAMPTZ | `NOT NULL` | `now()` | P3 (creation time). |

Constraints: `PRIMARY KEY (professional_id, service_id)`. `ON DELETE CASCADE` on both FKs so hard-delete of a professional or service cleans up the join. Soft deletes (via `deleted_at`) keep the join rows intact; booking-time queries join through `professionals` and `services` filtered by `deleted_at IS NULL`.

Indexes: implicit composite PK + an index on `service_id` alone for the reverse lookup (the booking UI asks "which professionals offer service X?"). See ADR 0004.

**Destination vs legacy**: **reshape**. The legacy `professional_services` table (composite PK `(professional_id, service_id)`, `custom_price`, audit) is replaced with:
- `custom_price` dropped (no price columns in 2.0 MVP).
- `created_at` retained.
- `ON DELETE CASCADE` added on both FKs (the legacy schema did not specify ON DELETE; this is a hardening fix).
- `created_by` / `updated_by` not added (a join row has no meaningful update workflow; only the immutable creation timestamp is tracked).

### T5 — `business_settings`

Singleton configuration row. Postgres enforces the single-row invariant. The MVP carries only `auto_assign_professional`; all per-business-type variant columns from the legacy schema are dropped.

```sql
CREATE TABLE business_settings (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_assign_professional BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ
);
```

| Column | Type | Constraints | Default | Notes |
|---|---|---|---|---|
| `id` | INT | `PRIMARY KEY DEFAULT 1 CHECK (id = 1)` | `1` | Singleton enforcement (P5). |
| `auto_assign_professional` | BOOLEAN | `NOT NULL` | `false` | R7 (deferred auto-assignment toggle). |
| `created_at` | TIMESTAMPTZ | `NOT NULL` | `now()` | P3. |
| `updated_at` | TIMESTAMPTZ | `NOT NULL` | `now()` | P3. |
| `created_by` | UUID | nullable | NULL | P3. |
| `updated_by` | UUID | nullable | NULL | P3. |
| `deleted_at` | TIMESTAMPTZ | nullable | NULL | P2 (kept for consistency; never set in practice). |

Indexes: implicit PK on `id`.

**Destination vs legacy**: **reshape**. The legacy `business_settings` table (UUID PK, `business_id` UNIQUE FK, `booking_buffer_minutes`, `prep_time_minutes`, `post_time_minutes`, `max_advance_days`, `min_notice_minutes`, `auto_assign_professional`, audit) is replaced with:
- UUID PK → `INT PRIMARY KEY DEFAULT 1 CHECK (id = 1)` (singleton enforcement).
- `business_id` FK dropped (the legacy `businesses` table is dropped; the singleton is the tenant's only configuration row).
- `booking_buffer_minutes` dropped (per-service timing lives on `services`; see T2).
- `prep_time_minutes`, `post_time_minutes`, `max_advance_days`, `min_notice_minutes` dropped (per-R5 / per-R6; explicitly out of 2.0 MVP).
- `auto_assign_professional` retained (R7), kept `BOOLEAN NOT NULL DEFAULT false`.
- Audit columns `created_by`, `updated_by` added (the legacy table was missing them).

## Deferred to `sdd-apply`

The following tables are referenced in `design.md` (as FK targets for `bookings` / `appointments`) but are NOT designed in Phase 1. They will be authored in `sdd-apply` against the AGENTS.md validation gate for that phase.

- `bookings` — FK to `professionals.id` + `services.id` (per `design.md` line 81 / line 124).
- `appointments` — same FKs as `bookings` (per `design.md` line 124).
- `notifications`, `email_outbox` — legacy tables deferred to a future ADR; not in 2.0 MVP.

## Dropped entirely

These items from the legacy schema are dropped in Phase 2 and are NOT replaced.

- Legacy `businesses` table (replaced by T1 `business_types`).
- Legacy `service_categories` table (the catalog is one-level deep via `business_types`; categories are merged into the `business_types` semantic).
- Legacy `professional_hours` table (working hours are deferred to a post-2.0 release; the MVP bookings do not require them).
- Legacy `users` / `clients` tables (the legacy `users` table was a custom duplicate of `auth.users`; the legacy `clients` table is deferred to `sdd-apply`).
- Legacy `business_id` FK pattern (renamed to `business_type_id` everywhere; the `businesses` table is dropped).
- Per-row color tokens on `professionals` (R2; per-row hex color tokens and equivalent are explicitly out).
- Per-rubric variant columns on `business_settings`: `slot_interval_minutes`, `buffer_minutes`, `min_notice_minutes`, `selected_business_types`, `allow_client_professional_selection`.
- Multi-tenant row-level discriminator columns (P1; deployment separation provides isolation).
- Legacy `business_settings` definition that allowed `auto_assign_professional` default NULL — replaced with `NOT NULL DEFAULT false` plus the singleton CHECK.

## Consequences

- Bookings work needs `professionals` + `services` data. Until `sdd-apply` ships seed data, the booking flow will return an empty professional list. The Phase 1 freeze acknowledges this and the seed data is owned by `sdd-apply`.
- Any column the legacy schema carried but the new schema does not (`description`, `price`, `custom_price`, `phone`, `email`, `bio`, `photo`, hex color tokens, `address`, per-rubric variant knobs) is gone. None of those columns are reintroduced in 2.0 without a new ADR.
- The `business_settings` singleton is enforced by the database, not by the application. A buggy migration that tries to insert a second row fails at the database layer; the application cannot bypass the invariant.

## Review notes

- Every in-scope table has a documented destination (kept / renamed / merged / dropped) in the table body above.
- The locked decisions from `design.md` (lines 44-54) are respected: no row-level tenant discriminator, soft delete via `deleted_at`, audit columns, snake_case naming, business-type-flat singleton, per-service timing on `services`, no per-row color tokens, N:M join for `professional_services`.
- The spec scenarios R1-R7 are the source of truth for these decisions; `design.md` is the source of truth for the DDL sketches.
- `design.md` sketches for `services`, `professionals`, and `professional_services` are reproduced with the locked decisions preserved. `business_types` and `business_settings` are derived from the principles in ADR 0001 because `design.md` does not provide a full sketch.
- Bookings / appointments are referenced in `design.md` but are not designed in Phase 1. Phase 2 builds the 5 tables above; `sdd-apply` builds the rest.
