# Legacy Migrations Archive

## Rationale

These migrations precede the Release 2.0 schema rebuild. They are preserved for
audit and historical reference but are NOT applied to new environments.

- They reference the legacy `business_id` FK pattern, `businesses` table,
  per-rubric variant columns on `business_settings`, `color_hex` on `professionals`,
  and other patterns that do not survive into Release 2.0.
- All 100 files were moved here from `supabase/migrations/` on 2026-07-30 as
  part of Phase 2 of the Release 2.0 rebuild.

## Reference

- Phase 0 inventory: `infra/context/migration-inventory/legacy-snapshot.skip.md`
- Remote schema snapshot: `infra/context/migration-inventory/schema.sql`
- Row counts: `infra/context/migration-inventory/row-counts.txt`

## Fresh application

These files are excluded from `supabase db push` by the `_legacy/` directory name.
Only migrations directly in `supabase/migrations/` are applied.
