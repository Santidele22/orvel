# Supabase Migration Specification

## Purpose

Migrate Orvel from the personal Supabase project to dedicated Orvel infrastructure, rebuild the schema from zero, preserve validated data and backend behavior, and provide the database foundation for the three-environment architecture.

## Requirements

### Requirement: Single-tenant MVP schema

The 2.0 schema SHALL target a single Orvel tenant per deployment and SHALL NOT introduce a `tenant_id` column on tenant-owned tables. Cross-tenant isolation SHALL be provided by deployment separation (dev / qa / main Supabase projects), not by row-level predicates. Multi-tenant modeling (per-row `tenant_id`, cross-tenant isolation tests) is explicitly out of scope for release 2.0 and is deferred to a post-2.0 release.

#### Scenario: A tenant-owned record is created

- GIVEN the deployment serves a single Orvel tenant
- WHEN an authorized actor creates a tenant-scoped record
- THEN the record is stored without a `tenant_id` discriminator
- AND isolation is guaranteed by the deployment boundary, not by a row-level predicate

### Requirement: `professionals` table exists in 2.0

The 2.0 schema SHALL include a `professionals` table to support client selection of a professional at booking time. The table is no longer deferred to release 1.0.3; it lands in 2.0. Per-record color tokens such as `color_hex` SHALL NOT be added to `professionals` (theme tokens live in the application layer or in shared branding fields, never per row).

#### Scenario: A contributor proposes deferring `professionals` to 1.0.3

- GIVEN the 2.0 schema is being implemented
- WHEN a contributor proposes deferring `professionals` to release 1.0.3
- THEN the proposal is rejected
- AND the contributor is informed that multi-professional support is in scope for 2.0

### Requirement: `professional_services` is an N:M join

The 2.0 schema SHALL include a `professional_services` table implementing a many-to-many relationship between `professionals` and `services`. The booking UI SHALL use this table to filter eligible professionals per service. The composite primary key `(professional_id, service_id)` SHALL enforce the N:M invariant at the table level.

#### Scenario: A contributor proposes a 1:N `professional.services` array

- GIVEN the 2.0 schema is being implemented
- WHEN a contributor proposes storing services as an array column on `professionals` instead of an N:M join
- THEN the proposal is rejected
- AND the contributor is redirected to use the `professional_services` join table

### Requirement: Client chooses a professional at booking time

In the 2.0 MVP, the booking flow SHALL require the client to choose a professional from the eligible list (filtered via `professional_services`). `business_settings.auto_assign_professional` SHALL default to `false` and SHALL NOT trigger automatic assignment in the MVP. Future booking / appointment tables (deferred to `sdd-apply`) SHALL FK to `professionals.id`.

#### Scenario: A booking is created without a professional selection

- GIVEN a client starts a booking flow
- WHEN the booking is created without a `professional_id` selected from the eligible list
- THEN the booking is rejected
- AND no automatic assignment is performed by the MVP

### Requirement: `business_settings` is single-row and business-type-flat

The `business_settings` table SHALL contain exactly one configuration row for the tenant. It SHALL NOT carry per-business-type variant columns. The following legacy columns SHALL NOT be reintroduced in 2.0: `slot_interval_minutes`, `buffer_minutes`, `min_notice_minutes`, `selected_business_types`, `allow_client_professional_selection`, or any equivalent. `auto_assign_professional` IS reintroduced as a `BOOLEAN NOT NULL DEFAULT false` column; see its dedicated Requirement. The `business_types` table is a flat catalog; it never parameterizes `business_settings`.

#### Scenario: A contributor proposes a per-business-type variant column on `business_settings`

- GIVEN the 2.0 schema is being implemented
- WHEN a contributor proposes adding a per-business-type variant column to `business_settings`
- THEN the proposal is rejected
- AND the variant data, if genuinely per-business-type, is redirected to the `business_types` catalog table (or, if per-service, to the `services` table)

### Requirement: Per-service timing lives on `services`

The `services` table SHALL carry per-service timing columns including `slot_duration_minutes`. The `business_settings` table SHALL NOT carry any `slot_duration_minutes` column. Equivalent timing knobs (`buffer_minutes`, prep/post, grid size) live on `services` as well.

#### Scenario: A contributor proposes `slot_duration_minutes` on `business_settings`

- GIVEN the 2.0 schema is being implemented
- WHEN a contributor proposes adding `slot_duration_minutes` to `business_settings`
- THEN the proposal is rejected
- AND the value is redirected to the `services` table as a per-service column

### Requirement: `business_settings.auto_assign_professional` defaults to `false`

`business_settings.auto_assign_professional` SHALL be a `BOOLEAN NOT NULL DEFAULT false` column. When `false`, the booking flow requires the client to choose a professional. When `true`, automatic assignment MAY be performed by code that runs in a future release; the MVP SHALL NOT implement the auto-assignment logic.

#### Scenario: The single `business_settings` row is inserted

- GIVEN the 2.0 schema has been applied to a fresh database
- WHEN the singleton row is inserted (e.g. `INSERT INTO business_settings (id) VALUES (1)`)
- THEN `auto_assign_professional` defaults to `false`
- AND no booking can be auto-assigned until the column is explicitly set to `true` and assignment logic is shipped

### Requirement: Soft deletion

The schema SHALL use nullable `deleted_at` columns for deletable domain records, and ordinary application operations SHALL NOT hard-delete those records.

#### Scenario: Domain record is deleted

- GIVEN an active domain record exists
- WHEN an authorized actor deletes it through an application flow
- THEN `deleted_at` is populated
- AND the record remains available for audit or recovery

### Requirement: Audit metadata

Every relevant mutable domain table SHALL include `created_at`, `updated_at`, `created_by`, and `updated_by` audit columns.

#### Scenario: Record is updated

- GIVEN an audited record exists
- WHEN an authorized actor changes it
- THEN `updated_at` and `updated_by` identify the change
- AND the creation metadata remains unchanged

### Requirement: Ordered migrations

Every new migration SHALL use a full timestamp-prefixed filename and SHALL be applied in deterministic chronological order.

#### Scenario: Fresh database is provisioned

- GIVEN an empty target database
- WHEN the migration set is applied
- THEN migrations execute in timestamp order
- AND the resulting schema matches the reviewed design

### Requirement: Legacy migration preservation

Historical migrations SHALL be preserved under `supabase/migrations/_legacy/` and SHALL NOT participate in fresh schema application.

#### Scenario: Migration history is audited

- GIVEN the replacement migration set exists
- WHEN an operator inspects historical migrations
- THEN legacy files remain available under `_legacy/`
- AND only the replacement set is used for new environments

### Requirement: Edge Function migration

All 12 inventoried Edge Functions SHALL be redeployed to each required target Supabase environment with validated dependencies and configuration.

#### Scenario: Target backend is validated

- GIVEN the new Supabase project is provisioned
- WHEN Edge Function deployment completes
- THEN all 12 inventoried functions are present
- AND their integration smoke tests pass

### Requirement: Environment-scoped secrets

All required secrets SHALL be re-entered per environment; dev-remote and QA SHALL use sandbox credentials, while main SHALL use production credentials.

#### Scenario: Billing integration is configured

- GIVEN dev/QA and main target projects exist
- WHEN Mercado Pago secrets are configured
- THEN dev/QA receives sandbox credentials
- AND main receives production credentials without values being committed

### Requirement: Recoverable data migration

The data migration SHALL be repeatable and SHALL have a verified complete backup before production cutover.

#### Scenario: ETL fails during cutover

- GIVEN a verified pre-cutover backup exists
- WHEN ETL or integrity validation fails
- THEN canonical traffic is not switched to the new project
- AND the prior state can be restored or retained

### Requirement: Documented cutover rollback

The cutover SHALL have a documented rollback plan that identifies triggers, owners, configuration reversal, and data-consistency checks.

#### Scenario: Critical post-cutover check fails

- GIVEN production points to the new project
- WHEN a critical smoke test fails
- THEN the rollback plan restores the previous environment configuration
- AND writes remain controlled until consistency is confirmed

### Requirement: Critical-flow validation

Validation SHALL include smoke tests for booking, login, billing, and every other flow classified as critical during inventory.

#### Scenario: Production cutover completes

- GIVEN migration and configuration switching succeeded
- WHEN post-cutover validation runs
- THEN every critical flow passes
- AND failed validation blocks migration completion
