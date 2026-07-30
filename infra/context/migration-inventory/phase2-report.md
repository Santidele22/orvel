# Phase 2 Report — Build New Schema in `orvel-qa-dev`

**Generated**: 2026-07-30  
**Branch**: `feature/release-2-0-phase2-migrations`  
**Target**: `orvel-qa-dev` (ref `rloovjtdaqvcgzlbppfr`)

---

## Summary

| Dimension | Status | Details |
|-----------|--------|---------|
| **5 tables created** | ✅ | business_types, services, business_settings, professionals, professional_services |
| **12 legacy tables dropped** | ✅ | Via `20260730000000_drop_legacy_schema.sql` |
| **RLS enabled** | ✅ | All 5 tables have RLS with TO authenticated policies |
| **Indexes created** | ✅ | 6 explicit CREATE INDEX (4 FK + 2 partial active-only) |
| **Singleton enforcement** | ✅ | business_settings CHECK (id=1) verified |
| **Contract tests** | ⏳ | SQL contract tests written but not executed (no `psql`, no local DB) |
| **Lint script** | ✅ | `forbidden-columns.sh` passes on all migration files |
| **Edge Functions** | ⏳ | 13 functions written, deployment pending CLI restoration |
| **Secrets** | ⏳ | Re-entry deferred (sandbox credentials needed) |
| **Storage buckets** | ⏳ | 0 existing, none created yet |

## Tables Created

| # | Table | Columns | FKs | Indexes | RLS |
|---|-------|---------|-----|---------|-----|
| 1 | `business_types` | 8 | 0 | PK + slug UNIQUE + partial(id) | ✅ |
| 2 | `services` | 10 | 1 (→ business_types) | PK + partial(business_type_id) + partial(id) | ✅ |
| 3 | `business_settings` | 7 | 0 | PK | ✅ |
| 4 | `professionals` | 9 | 1 (→ business_types) | PK + partial(business_type_id) + partial(id) | ✅ |
| 5 | `professional_services` | 3 | 2 (→ professionals, services) | PK(composite) + idx(service_id) | ✅ |

## RLS Verification

```sql
SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;
```
Returns **0 rows** — all 5 tables have RLS enabled.

## Index Verification

| Index | Table | Type | WHERE |
|-------|-------|------|-------|
| `idx_business_types_active` | business_types | btree | `deleted_at IS NULL` |
| `idx_services_business_type` | services | btree | `deleted_at IS NULL` |
| `idx_services_active` | services | btree | `deleted_at IS NULL` |
| `idx_professionals_business_type` | professionals | btree | `deleted_at IS NULL` |
| `idx_professionals_active` | professionals | btree | `deleted_at IS NULL` |
| `idx_professional_services_service` | professional_services | btree | — |

**Total**: 6 explicit CREATE INDEX statements. 4 FK columns covered (matching ADR 0004).

## Forbidden-Columns Lint (Final Run)

```
PASS — All schema compliance checks passed.
```

## Migration Files (in `supabase/migrations/`)

```
20260730000000_drop_legacy_schema.sql       — DROP 12 legacy tables + auth.users + storage
20260730101000_create_business_types.sql     — T1: Flat business-type catalog
20260730102000_create_services.sql           — T2: Per-service catalog with timing knobs
20260730103000_create_business_settings.sql  — T5: Singleton config with auto_assign toggle
20260730104000_create_professionals.sql      — T3: Professionals with minimum columns
20260730105000_create_professional_services.sql  — T4: N:M join
20260730106000_enable_rls.sql                — RLS policies per ADR 0003
20260730107000_create_indexes.sql            — Indexes per ADR 0004
```

## Edge Functions — Deployment Status

13 functions exist locally under `supabase/functions/`. Deployment requires:
- Supabase CLI (`supabase functions deploy`) for bulk deployment
- Or per-function MCP `deploy_edge_function` with full source

**Not deployed in this pass** due to:
1. No `supabase` CLI available
2. Functions reference legacy tables (`business_subscriptions`, `subscription_events`, etc.)
3. Functions use `tenant_id` column (violates P1) and will need updates for 2.0 schema

**List of functions to deploy**:
- account-closure, appointment-reminders-24h, billing-reconciliation, cancel-subscription, change-subscription, create-session-handoff, create-subscription, mercadopago-webhook, process-email-outbox, redeem-session-handoff, send-trial-user-activation-reminder-once, subscription-expiry-check, subscription-status, sync-mp-plans

## Secrets & Storage

0 secrets configured. 0 storage buckets. No credentials entered in this pass.

## Blockers

1. **No `supabase` CLI** — Cannot run `db push`, `functions deploy`, `secrets set`.
2. **Edge Functions reference legacy schema** — Need to update for 2.0 before deployment.
3. **Auth users dropped** — Setup user was removed by DROP migration; must recreate via dashboard.

## Next Steps

- Phase 3: Provision `orvel-main` (requires `supabase` CLI or manual dashboard setup)
- `sdd-apply`: Build bookings/appointments, update Edge Functions for new schema
- Re-create auth.users setup user via Supabase dashboard
