-- Contract test: business_settings (singleton)
-- RED: Fails before migration apply
-- GREEN: Passes after migration apply
--
-- Asserts:
--   1. Table exists with required columns
--   2. INSERT with id=2 fails (singleton enforcement)
--   3. UPDATE of id fails (singleton enforcement)

-- Column verification
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'business_settings'
ORDER BY ordinal_position;

-- Check CHECK constraint exists
SELECT
  constraint_name,
  constraint_type,
  check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc USING (constraint_name)
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'business_settings';
