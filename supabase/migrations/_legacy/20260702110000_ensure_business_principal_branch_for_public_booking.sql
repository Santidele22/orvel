-- Ensure public booking businesses without branch rows get an active principal branch.
-- Default services can be materialized for newly onboarded businesses before
-- any branch UI is touched; public submit then needs a branch for atomic booking
-- visibility and notifications.

BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_business_principal_branch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.branches (business_id, name, slug, timezone, is_active)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(btrim(NEW.name), ''), 'Sucursal principal'),
      'principal',
      COALESCE(NULLIF(btrim(NEW.timezone), ''), 'America/Argentina/Buenos_Aires'),
      true
    )
    ON CONFLICT (business_id, slug) WHERE slug IS NOT NULL DO UPDATE SET
      timezone = COALESCE(public.branches.timezone, EXCLUDED.timezone),
      updated_at = now();
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE public.branches
    SET
      timezone = COALESCE(NULLIF(btrim(public.branches.timezone), ''), COALESCE(NULLIF(btrim(NEW.timezone), ''), 'America/Argentina/Buenos_Aires')),
      updated_at = now()
    WHERE business_id = NEW.id
      AND slug = 'principal'
      AND timezone IS DISTINCT FROM COALESCE(NULLIF(btrim(public.branches.timezone), ''), COALESCE(NULLIF(btrim(NEW.timezone), ''), 'America/Argentina/Buenos_Aires'));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS businesses_ensure_principal_branch ON public.businesses;
CREATE TRIGGER businesses_ensure_principal_branch
AFTER INSERT OR UPDATE OF timezone ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.ensure_business_principal_branch();

INSERT INTO public.branches (business_id, name, slug, timezone, is_active)
SELECT
  b.id,
  COALESCE(NULLIF(btrim(b.name), ''), 'Sucursal principal'),
  'principal',
  COALESCE(NULLIF(btrim(b.timezone), ''), 'America/Argentina/Buenos_Aires'),
  true
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1
  FROM public.branches br
  WHERE br.business_id = b.id
)
ON CONFLICT (business_id, slug) WHERE slug IS NOT NULL DO UPDATE SET
  timezone = COALESCE(public.branches.timezone, EXCLUDED.timezone),
  updated_at = now();

COMMIT;
NOTIFY pgrst, 'reload schema';
