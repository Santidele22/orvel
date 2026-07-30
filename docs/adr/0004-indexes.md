# ADR 0004: Indexes — Release 2.0

## Status

Accepted (release 2.0, 2026-07-30).

## Context

Per ADR 0001 P7, every foreign-key column gets a btree index and every soft-deletable table gets a partial index `WHERE deleted_at IS NULL` on the FK columns used by ordinary queries. Per `spec.md` R10 (ordered migrations), every index migration is authored in a standalone timestamp-prefixed file and applied in order.

The release 2.0 schema has 4 foreign-key columns across 5 tables (T1 `business_types` has no FK; T2 `services.business_type_id`; T3 `professionals.business_type_id`; T4 `professional_services` has two FKs `(professional_id, service_id)`). The PK on T4 is composite, so the reverse lookup (the booking UI asking "which professionals offer service X?") needs an explicit index on `service_id` alone. The `business_settings` singleton has no FK but the PK on `id` is the only index needed.

## Decision

Every FK gets a btree index. Every soft-deletable table gets a partial index `WHERE deleted_at IS NULL` on the FK column. The composite PK on `professional_services` covers the `(professional_id, service_id)` lookup; an explicit index on `service_id` covers the reverse lookup. The `business_types.slug` UNIQUE constraint creates an implicit index; a partial index `WHERE deleted_at IS NULL` is added for the "list active business types" query.

## Indexes

### `business_types`

```sql
CREATE INDEX idx_business_types_active ON business_types(id) WHERE deleted_at IS NULL;
```

The implicit UNIQUE index on `slug` (from `slug TEXT NOT NULL UNIQUE`) covers the `business_types.slug_key` constraint. The partial index above covers the "list active business types" query.

| Index name | Columns | WHERE | Justification |
|---|---|---|---|
| `idx_business_types_active` | `(id)` | `deleted_at IS NULL` | "List active business types" query. |

### `services`

```sql
CREATE INDEX idx_services_business_type ON services(business_type_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_services_active ON services(id) WHERE deleted_at IS NULL;
```

| Index name | Columns | WHERE | Justification |
|---|---|---|---|
| `idx_services_business_type` | `(business_type_id)` | `deleted_at IS NULL` | FK to `business_types.id` + soft-delete filter. |
| `idx_services_active` | `(id)` | `deleted_at IS NULL` | "List active services" query. |

### `professionals`

```sql
CREATE INDEX idx_professionals_business_type ON professionals(business_type_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_professionals_active ON professionals(id) WHERE deleted_at IS NULL;
```

| Index name | Columns | WHERE | Justification |
|---|---|---|---|
| `idx_professionals_business_type` | `(business_type_id)` | `deleted_at IS NULL` | FK to `business_types.id` + soft-delete filter. |
| `idx_professionals_active` | `(id)` | `deleted_at IS NULL` | "List active professionals" query. |

### `professional_services`

```sql
CREATE INDEX idx_professional_services_service ON professional_services(service_id);
```

The composite PK `professional_services_pkey (professional_id, service_id)` covers the lookup from `professional_id`. The reverse lookup (which professionals offer service X?) needs an explicit index on `service_id` alone.

| Index name | Columns | WHERE | Justification |
|---|---|---|---|
| `idx_professional_services_service` | `(service_id)` | — | Reverse lookup: "which professionals offer service X?". The composite PK is read-mostly from `professional_id`; the reverse direction needs an explicit index. |

### `business_settings`

No additional indexes required. The singleton PK on `id` is the only index needed.

| Index name | Columns | WHERE | Justification |
|---|---|---|---|
| `business_settings_pkey` (implicit) | `(id)` | — | Singleton PK. |

## Summary

| Table | Explicit `CREATE INDEX` count | FK columns | Indexes covering FKs |
|---|---|---|---|
| `business_types` | 1 | 0 | n/a |
| `services` | 2 | 1 (`business_type_id`) | `idx_services_business_type` |
| `professionals` | 2 | 1 (`business_type_id`) | `idx_professionals_business_type` |
| `professional_services` | 1 | 2 (`professional_id`, `service_id`) | `professional_services_pkey` (composite) + `idx_professional_services_service` |
| `business_settings` | 0 | 0 | n/a |
| **Total** | **6** | **4** | **4 FKs covered** |

Every FK from ADR 0002 has a matching index. The validation `grep "CREATE INDEX" docs/adr/0004-indexes.md | wc -l` returns 6, which is greater than the FK count of 4 (the extra 2 are the "list active" partial indexes that combine the FK with a soft-delete filter, plus the `professional_services.service_id` reverse lookup).

## Cross-references

- ADR 0001 P7 — every FK gets a btree index; every soft-deletable table gets a partial index `WHERE deleted_at IS NULL`.
- ADR 0002 — every FK column above is defined in the corresponding table's column list.
- ADR 0003 — the RLS policies use the indexed columns so the policy predicates can be satisfied with an index scan. The `(select auth.uid()) = created_by` predicate is checked post-scan; the indexed columns (`business_type_id`, `service_id`, `professional_id`) are read first and the predicate is applied to the result.
- `design.md` lines 72-73, 98-99, 117 — sketch indexes for `services`, `professionals`, `professional_services` are reproduced with the locked decisions preserved.
- `infra/context/migration-inventory/schema.sql` — legacy indexes (e.g., `idx_businesses_slug`, `idx_professionals_business`) are dropped in Phase 2 along with the legacy tables. The new schema does not inherit any of them.
