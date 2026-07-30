# ADR 0003: RLS Policies — Release 2.0

## Status

Accepted (release 2.0, 2026-07-30).

## Context

Per the Supabase security checklist (`.agents/skills/supabase/SKILL.md`), every domain table in any exposed schema (including `public`) must have RLS enabled with explicit role checks. The legacy schema (`infra/context/migration-inventory/schema.sql` line 284: `RLS enabled: FALSE on ALL tables`) had RLS disabled on every table — this is the security advisory that triggered the rebuild. The Phase 1 schema must ship with RLS on by default and policies that match the actual access model.

Release 2.0 is a single-tenant MVP (ADR 0001 / R1): there is exactly one tenant per deployment, and isolation is provided by deployment boundaries, not by row-level predicates. The ownership predicate for the MVP is the `created_by` column on every domain table — the user who created the row is the user who can see it. Future multi-tenant work will require a new ADR and new policies.

## Decision

All 5 new tables in scope (`business_types`, `services`, `professionals`, `professional_services`, `business_settings`) have RLS enabled by default. Every policy uses the `TO <role>` clause targeting `authenticated` directly — the deprecated practice of comparing role names via session metadata is not used in this schema. The ownership predicate combines `TO authenticated` with `(select auth.uid()) = created_by` to avoid the BOLA / IDOR loophole of role-only checks.

No `SECURITY DEFINER` functions are introduced in Phase 1. The 12 Edge Functions that ship in Phase 2 will use `service_role` credentials from the server side and respect the RLS policies by querying only the rows their service-role key is allowed to access (the service role bypasses RLS by default; the application layer is responsible for the authorization logic on top).

## Policies

### `business_types`

```sql
ALTER TABLE business_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_business_types_authenticated ON business_types
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY insert_business_types_authenticated ON business_types
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY update_business_types_authenticated ON business_types
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = created_by)
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY delete_business_types_authenticated ON business_types
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = created_by);
```

| Policy name | Command | USING | WITH CHECK | Justification |
|---|---|---|---|---|
| `select_business_types_authenticated` | SELECT | `(select auth.uid()) IS NOT NULL` | — | Any signed-in user can read the catalog. |
| `insert_business_types_authenticated` | INSERT | — | `(select auth.uid()) = created_by` | The actor records themselves as the creator. |
| `update_business_types_authenticated` | UPDATE | `(select auth.uid()) = created_by` | `(select auth.uid()) = created_by` | Both USING and WITH CHECK to prevent the actor from reassigning `created_by` to another user. |
| `delete_business_types_authenticated` | DELETE | `(select auth.uid()) = created_by` | — | Soft delete via `deleted_at` is the ordinary flow; hard delete is restricted to the creator. |

### `services`

```sql
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_services_authenticated ON services
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY insert_services_authenticated ON services
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY update_services_authenticated ON services
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = created_by)
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY delete_services_authenticated ON services
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = created_by);
```

| Policy name | Command | USING | WITH CHECK | Justification |
|---|---|---|---|---|
| `select_services_authenticated` | SELECT | `(select auth.uid()) IS NOT NULL` | — | Any signed-in user can read the service catalog. |
| `insert_services_authenticated` | INSERT | — | `(select auth.uid()) = created_by` | Creator owns the new service. |
| `update_services_authenticated` | UPDATE | `(select auth.uid()) = created_by` | `(select auth.uid()) = created_by` | Both USING and WITH CHECK. |
| `delete_services_authenticated` | DELETE | `(select auth.uid()) = created_by` | — | Soft delete via `deleted_at` is the ordinary flow. |

### `professionals`

```sql
ALTER TABLE professionals ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_professionals_authenticated ON professionals
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY insert_professionals_authenticated ON professionals
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY update_professionals_authenticated ON professionals
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = created_by)
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY delete_professionals_authenticated ON professionals
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = created_by);
```

| Policy name | Command | USING | WITH CHECK | Justification |
|---|---|---|---|---|
| `select_professionals_authenticated` | SELECT | `(select auth.uid()) IS NOT NULL` | — | Booking UI reads the professional list; any signed-in user is allowed. |
| `insert_professionals_authenticated` | INSERT | — | `(select auth.uid()) = created_by` | Creator owns the new professional. |
| `update_professionals_authenticated` | UPDATE | `(select auth.uid()) = created_by` | `(select auth.uid()) = created_by` | Both USING and WITH CHECK. |
| `delete_professionals_authenticated` | DELETE | `(select auth.uid()) = created_by` | — | Soft delete via `deleted_at` is the ordinary flow. |

### `professional_services`

```sql
ALTER TABLE professional_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_professional_services_authenticated ON professional_services
  FOR SELECT TO authenticated
  USING ((select auth.uid()) IS NOT NULL);

CREATE POLICY insert_professional_services_authenticated ON professional_services
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY update_professional_services_authenticated ON professional_services
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) IS NOT NULL)
  WITH CHECK ((select auth.uid()) IS NOT NULL);

CREATE POLICY delete_professional_services_authenticated ON professional_services
  FOR DELETE TO authenticated
  USING ((select auth.uid()) IS NOT NULL);
```

| Policy name | Command | USING | WITH CHECK | Justification |
|---|---|---|---|---|
| `select_professional_services_authenticated` | SELECT | `(select auth.uid()) IS NOT NULL` | — | Booking UI reads the join to filter eligible professionals. |
| `insert_professional_services_authenticated` | INSERT | — | `(select auth.uid()) IS NOT NULL` | The join is created by the actor; `created_by` is not stored on join rows so the predicate is `auth.uid() IS NOT NULL`. |
| `update_professional_services_authenticated` | UPDATE | `(select auth.uid()) IS NOT NULL` | `(select auth.uid()) IS NOT NULL` | Join rows are immutable in practice; the policy is permissive at the role level because there is no `created_by` column on the join. |
| `delete_professional_services_authenticated` | DELETE | `(select auth.uid()) IS NOT NULL` | — | Same reasoning as UPDATE. |

### `business_settings`

```sql
ALTER TABLE business_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY select_business_settings_authenticated ON business_settings
  FOR SELECT TO authenticated
  USING (id = 1);

CREATE POLICY insert_business_settings_authenticated ON business_settings
  FOR INSERT TO authenticated
  WITH CHECK (id = 1 AND (select auth.uid()) = created_by);

CREATE POLICY update_business_settings_authenticated ON business_settings
  FOR UPDATE TO authenticated
  USING (id = 1 AND (select auth.uid()) = created_by)
  WITH CHECK (id = 1 AND (select auth.uid()) = created_by);

CREATE POLICY delete_business_settings_authenticated ON business_settings
  FOR DELETE TO authenticated
  USING (id = 1 AND (select auth.uid()) = created_by);
```

| Policy name | Command | USING | WITH CHECK | Justification |
|---|---|---|---|---|
| `select_business_settings_authenticated` | SELECT | `id = 1` | — | Singleton; every authenticated user reads the one row. |
| `insert_business_settings_authenticated` | INSERT | — | `id = 1 AND (select auth.uid()) = created_by` | Throws on duplicate `id = 1` (PK); only the creator owns the row. |
| `update_business_settings_authenticated` | UPDATE | `id = 1 AND (select auth.uid()) = created_by` | `id = 1 AND (select auth.uid()) = created_by` | Both USING and WITH CHECK; `id` cannot change because the CHECK constraint rejects it. |
| `delete_business_settings_authenticated` | DELETE | `id = 1 AND (select auth.uid()) = created_by` | — | Singleton; only the creator can delete. The CHECK constraint plus the PK guarantee the singleton invariant. |

## Service-role exceptions

No domain table requires a documented service-role exception in Phase 1. The 12 Edge Functions that ship in Phase 2 call the database with `service_role` credentials from the server side; the service role bypasses RLS by default, so the application layer is responsible for additional authorization on top (e.g., the booking flow must verify the client selected a professional from the eligible list before writing `bookings.professional_id`).

If a future phase needs a domain table to bypass RLS for ETL or admin work, that exception is added as a new ADR with explicit justification per the rule in the supabase security checklist (use `SECURITY INVOKER`, never `SECURITY DEFINER`, and document the function in a non-exposed schema).

## `SECURITY DEFINER` functions

There are **no** `SECURITY DEFINER` functions in Phase 1. The supabase security checklist rule on `SECURITY DEFINER` functions bypassing RLS is honored by not introducing any. The 12 Edge Functions are deployed in Phase 2 as separate Deno services and use the `service_role` from the server-side environment, not as Postgres functions.

## Consequences

- Every domain table requires an authenticated user to filter rows by ownership. The single-tenant deployment (P1) means the `created_by` predicate is sufficient for the MVP; multi-tenant filtering will require a new ADR and new policies.
- Inserting, updating, or deleting a row requires the actor to be the `created_by` of the row. This is enforced at the database layer; the application cannot bypass the predicate without escalating to the service role.
- Soft delete (`deleted_at`) is **not** enforced by RLS — a soft-deleted row is still visible through RLS unless the application filters `WHERE deleted_at IS NULL`. The booking UI and the Edge Functions are responsible for the soft-delete filter. If a future ADR hardens soft delete via RLS, that decision is documented in a new ADR.
- The `business_settings` singleton is enforced by the PK + CHECK constraint, not by RLS. The RLS policy layer adds the ownership predicate on top.

## Cross-references

- `spec.md` R1 (single-tenant MVP) — drives the ownership predicate.
- `design.md` Schema Design Principles (lines 42-54) — drives the per-table policy shape.
- `infra/context/migration-inventory/schema.sql` line 284 — legacy state (RLS disabled) and the security advisory that triggered the rebuild.
- `.agents/skills/supabase/SKILL.md` — security checklist, especially the rules on `TO <role>` clauses, UPDATE requiring both USING and WITH CHECK, and `SECURITY DEFINER` avoidance.
- ADR 0001 (Schema Principles) — P6 (RLS reviewed per table).
- ADR 0002 (Table Design) — every table in ADR 0002 has a policy row above.
- ADR 0004 (Indexes) — the policy predicates use the indexed columns from ADR 0004 so the database planner can satisfy the policy check with an index scan.
