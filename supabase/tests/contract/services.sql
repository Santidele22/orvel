-- Contract test: services
-- RED: Fails before migration apply
-- GREEN: Passes after migration apply
--
-- Asserts: table exists with expected columns matching ADR 0002 §T2

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'services'
ORDER BY ordinal_position;

-- Verify FK to business_types exists
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
  AND tc.table_schema = ccu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'services'
  AND tc.constraint_type = 'FOREIGN KEY';

SELECT COUNT(*) AS row_count FROM public.services;
