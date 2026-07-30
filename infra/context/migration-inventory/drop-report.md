# DROP Report — Legacy Schema Removal

Generated: 2026-07-30
Migration: `20260730000000_drop_legacy_schema.sql`

## Tables Dropped

All 12 legacy public tables from `infra/context/migration-inventory/schema.sql`:

| # | Table | Rows Before | Size | FK Dependencies |
|---|-------|-------------|------|-----------------|
| 1 | `email_outbox` | 0 | 32 kB | business_id → businesses (dropped) |
| 2 | `notifications` | 0 | 32 kB | business_id → businesses, user_id → users |
| 3 | `appointments` | 3 | 96 kB | business_id → businesses, client_id → clients, professional_id → professionals, service_id → services |
| 4 | `clients` | 2 | 48 kB | business_id → businesses |
| 5 | `users` | 1 | 64 kB | business_id → businesses, professional_id → professionals, created_by/updated_by → users (self-ref) |
| 6 | `professional_hours` | 0 | 24 kB | professional_id → professionals |
| 7 | `professional_services` | 0 | 8 kB | professional_id → professionals, service_id → services |
| 8 | `services` | 2 | 64 kB | business_id → businesses, category_id → service_categories |
| 9 | `service_categories` | 1 | 48 kB | business_id → businesses |
| 10 | `professionals` | 1 | 48 kB | business_id → businesses |
| 11 | `business_settings` | 1 | 56 kB | business_id → businesses |
| 12 | `businesses` | 1 | 64 kB | (root table, no FKs to other domain tables) |

**Total rows dropped**: ~11 (8 tables with data, 4 empty)

## Side Effects

- **`auth.users`**: 1 setup user record removed. Will be recreated via Supabase dashboard after rebuild.
- **Storage buckets**: 0 dropped (none existed).
- **Functions/triggers**: Any SQL functions and triggers attached to public schema are implicitly dropped via CASCADE.

## Verification

After DROP, the public schema is empty. Verified via:
```sql
SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE schemaname = 'public';
```
Expected result: 0.

## Cross-reference

- `infra/context/migration-inventory/schema.sql` — full legacy DDL
- `infra/context/migration-inventory/row-counts.txt` — exact row counts before DROP
- `infra/context/migration-inventory/remote-baseline.sh` — remote probing script
- ADR 0002 §Dropped entirely — legacy items not replaced
