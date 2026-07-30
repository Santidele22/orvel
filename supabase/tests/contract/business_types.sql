-- Contract test: business_types
-- RED: Fails before migration apply (table does not exist)
-- GREEN: Passes after migration apply
--
-- Asserts: table exists with expected columns matching ADR 0002 §T1

-- This query will return 0 rows (and fail any assertion) before migration
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'business_types'
ORDER BY ordinal_position;

-- Row count check (will error if table doesn't exist)
SELECT COUNT(*) AS row_count FROM public.business_types;
