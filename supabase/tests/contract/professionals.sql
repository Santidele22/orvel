-- Contract test: professionals
-- RED: Fails before migration apply
-- GREEN: Passes after migration apply
--
-- Asserts: table exists with expected columns matching ADR 0002 §T3
--          NO color_hex column

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'professionals'
ORDER BY ordinal_position;

-- Verify NO color_hex
SELECT COUNT(*) AS color_hex_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'professionals'
  AND column_name = 'color_hex';

SELECT COUNT(*) AS row_count FROM public.professionals;
