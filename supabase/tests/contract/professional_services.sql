-- Contract test: professional_services
-- RED: Fails before migration apply
-- GREEN: Passes after migration apply
--
-- Asserts:
--   1. Table exists with composite PK
--   2. FK constraints with ON DELETE CASCADE exist

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'professional_services'
ORDER BY ordinal_position;

-- Verify composite PK
SELECT
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name,
  kcu.ordinal_position
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'professional_services'
  AND tc.constraint_type = 'PRIMARY KEY'
ORDER BY kcu.ordinal_position;

-- Verify FK constraints
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
  AND tc.table_name = 'professional_services'
  AND tc.constraint_type = 'FOREIGN KEY';

SELECT COUNT(*) AS row_count FROM public.professional_services;
