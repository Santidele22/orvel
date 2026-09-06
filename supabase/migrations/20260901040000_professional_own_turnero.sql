-- Dedicated public turnero per professional, optional own hours (else inherit salon).

BEGIN;

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.professionals p
SET slug = COALESCE(
  NULLIF(public.canonical_booking_slug(p.name), ''),
  substr(replace(p.id::text, '-', ''), 1, 12)
)
WHERE p.slug IS NULL;

WITH ranked AS (
  SELECT
    id,
    slug,
    row_number() OVER (PARTITION BY business_id, slug ORDER BY created_at, id) AS n
  FROM public.professionals
  WHERE deleted_at IS NULL
)
UPDATE public.professionals p
SET slug = ranked.slug || '-' || substr(replace(p.id::text, '-', ''), 1, 6)
FROM ranked
WHERE p.id = ranked.id
  AND ranked.n > 1;

CREATE UNIQUE INDEX IF NOT EXISTS professionals_business_slug_unique
  ON public.professionals (business_id, slug)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.professional_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL CHECK (end_time > start_time),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (professional_id, day_of_week)
);

ALTER TABLE public.professional_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Business managers manage professional hours" ON public.professional_hours;
CREATE POLICY "Business managers manage professional hours"
  ON public.professional_hours
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_id
        AND public.can_manage_business(p.business_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_id
        AND public.can_manage_business(p.business_id)
    )
  );

CREATE OR REPLACE FUNCTION public._professional_slug_from_name(p_name text, p_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    NULLIF(public.canonical_booking_slug(p_name), ''),
    substr(replace(p_id::text, '-', ''), 1, 12)
  );
$$;

CREATE OR REPLACE FUNCTION public.resolve_public_professional(
  business_slug text,
  professional_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_row record;
BEGIN
  IF nullif(btrim(business_slug), '') IS NULL OR nullif(btrim(professional_slug), '') IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  SELECT b.id
    INTO v_business_id
  FROM public.businesses b
  WHERE b.slug = resolve_public_professional.business_slug
     OR b.slug_canonical = public.canonical_booking_slug(resolve_public_professional.business_slug)
  LIMIT 1;

  IF v_business_id IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  SELECT
    p.id,
    p.name,
    p.slug,
    COALESCE(
      (
        SELECT array_agg(ps.service_id ORDER BY ps.service_id)
        FROM public.professional_services ps
        WHERE ps.professional_id = p.id
      ),
      '{}'::uuid[]
    ) AS service_ids
    INTO v_row
  FROM public.professionals p
  WHERE p.business_id = v_business_id
    AND p.slug = public.canonical_booking_slug(resolve_public_professional.professional_slug)
    AND p.active = true
    AND p.deleted_at IS NULL
  LIMIT 1;

  IF v_row.id IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'slug', v_row.slug,
    'service_ids', to_jsonb(v_row.service_ids)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_public_professional(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_public_professional(text, text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.list_business_professionals(uuid);

CREATE FUNCTION public.list_business_professionals(p_business_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  slug text,
  phone text,
  email text,
  active boolean,
  service_ids uuid[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_business_id IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF NOT public.can_manage_business(p_business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.slug,
    p.phone,
    p.email,
    p.active,
    COALESCE(
      (
        SELECT array_agg(ps.service_id ORDER BY ps.service_id)
        FROM public.professional_services ps
        WHERE ps.professional_id = p.id
      ),
      '{}'::uuid[]
    )
  FROM public.professionals p
  WHERE p.business_id = p_business_id
    AND p.deleted_at IS NULL
  ORDER BY p.name ASC, p.id ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_business_professionals(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_business_professionals(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.upsert_business_professional(
  p_business_id uuid,
  p_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_active boolean DEFAULT true,
  p_service_ids uuid[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
  v_name text;
  v_slug text;
  v_base text;
  v_n integer := 0;
BEGIN
  IF p_business_id IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF NOT public.can_manage_business(p_business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  v_name := nullif(btrim(p_name), '');
  IF v_name IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_service_ids, '{}'::uuid[])) AS sid
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.services s
      WHERE s.id = sid
        AND s.business_id = p_business_id
    )
  ) THEN
    PERFORM public._raise_rpc('INVALID_SERVICE');
  END IF;

  IF p_id IS NULL THEN
    v_id := gen_random_uuid();
    v_base := public._professional_slug_from_name(v_name, v_id);
    v_slug := v_base;
    WHILE EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.business_id = p_business_id AND p.slug = v_slug AND p.deleted_at IS NULL
    ) LOOP
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n::text;
    END LOOP;

    INSERT INTO public.professionals (id, business_id, name, slug, phone, email, active, created_by, updated_by)
    VALUES (
      v_id,
      p_business_id,
      v_name,
      v_slug,
      nullif(btrim(p_phone), ''),
      nullif(btrim(p_email), ''),
      COALESCE(p_active, true),
      auth.uid(),
      auth.uid()
    );
  ELSE
    UPDATE public.professionals p
    SET
      name = v_name,
      phone = nullif(btrim(p_phone), ''),
      email = nullif(btrim(p_email), ''),
      active = COALESCE(p_active, p.active),
      updated_by = auth.uid(),
      updated_at = now(),
      slug = COALESCE(p.slug, public._professional_slug_from_name(v_name, p.id))
    WHERE p.id = p_id
      AND p.business_id = p_business_id
      AND p.deleted_at IS NULL
    RETURNING p.id INTO v_id;

    IF v_id IS NULL THEN
      PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
    END IF;
  END IF;

  DELETE FROM public.professional_services ps
  WHERE ps.professional_id = v_id;

  INSERT INTO public.professional_services (professional_id, service_id)
  SELECT v_id, sid
  FROM unnest(COALESCE(p_service_ids, '{}'::uuid[])) AS sid
  ON CONFLICT DO NOTHING;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_professional_hours(
  p_professional_id uuid,
  p_hours jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  IF p_professional_id IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  SELECT p.business_id INTO v_business_id
  FROM public.professionals p
  WHERE p.id = p_professional_id
    AND p.deleted_at IS NULL;

  IF v_business_id IS NULL THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  IF NOT public.can_manage_business(v_business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  DELETE FROM public.professional_hours WHERE professional_id = p_professional_id;

  INSERT INTO public.professional_hours (professional_id, day_of_week, start_time, end_time)
  SELECT
    p_professional_id,
    (item->>'day_of_week')::smallint,
    (item->>'start')::time,
    (item->>'end')::time
  FROM jsonb_array_elements(COALESCE(p_hours, '[]'::jsonb)) AS item
  WHERE COALESCE((item->>'enabled')::boolean, true)
    AND nullif(item->>'start', '') IS NOT NULL
    AND nullif(item->>'end', '') IS NOT NULL
    AND (item->>'end')::time > (item->>'start')::time
    AND (item->>'day_of_week')::smallint BETWEEN 0 AND 6;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_professional_hours(p_professional_id uuid)
RETURNS TABLE(day_of_week smallint, start_time time, end_time time)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT p.business_id INTO v_business_id
  FROM public.professionals p
  WHERE p.id = p_professional_id
    AND p.deleted_at IS NULL;

  IF v_business_id IS NULL OR NOT public.can_manage_business(v_business_id) THEN
    PERFORM public._raise_rpc('UNAUTHORIZED');
  END IF;

  RETURN QUERY
  SELECT ph.day_of_week, ph.start_time, ph.end_time
  FROM public.professional_hours ph
  WHERE ph.professional_id = p_professional_id
  ORDER BY ph.day_of_week;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_professional_hours(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_professional_hours(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_professional_hours(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_professional_hours(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.query_public_slot_availability(
  business_slug text,
  service_id text,
  date_iso text,
  professional_id text
)
RETURNS TABLE(starts_at_iso text, ends_at_iso text, remaining_capacity integer)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_business_id uuid;
  v_service_id uuid;
  v_professional_id uuid;
  v_timezone text;
  v_has_hours boolean := false;
  v_dow smallint;
  v_start time;
  v_end time;
BEGIN
  IF nullif(btrim(professional_id), '') IS NULL THEN
    RETURN QUERY
    SELECT q.starts_at_iso, q.ends_at_iso, q.remaining_capacity
    FROM public.query_public_slot_availability(
      query_public_slot_availability.business_slug,
      query_public_slot_availability.service_id,
      query_public_slot_availability.date_iso
    ) AS q;
    RETURN;
  END IF;

  BEGIN
    v_service_id := service_id::uuid;
    v_professional_id := btrim(professional_id)::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END;

  SELECT b.id, b.timezone
    INTO v_business_id, v_timezone
  FROM public.businesses b
  WHERE b.slug = query_public_slot_availability.business_slug
     OR b.slug_canonical = public.canonical_booking_slug(query_public_slot_availability.business_slug)
  LIMIT 1;

  IF v_business_id IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.professionals p
    INNER JOIN public.professional_services ps ON ps.professional_id = p.id
    WHERE p.id = v_professional_id
      AND p.business_id = v_business_id
      AND p.active = true
      AND p.deleted_at IS NULL
      AND ps.service_id = v_service_id
  ) THEN
    PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.professional_hours ph WHERE ph.professional_id = v_professional_id
  ) INTO v_has_hours;

  IF v_has_hours THEN
    BEGIN
      v_dow := extract(dow FROM date_iso::date)::smallint;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      PERFORM public._raise_rpc('BOOKING_VALIDATION_ERROR');
    END;

    SELECT ph.start_time, ph.end_time
      INTO v_start, v_end
    FROM public.professional_hours ph
    WHERE ph.professional_id = v_professional_id
      AND ph.day_of_week = v_dow;

    IF v_start IS NULL THEN
      RETURN;
    END IF;
  END IF;

  RETURN QUERY
  SELECT q.starts_at_iso, q.ends_at_iso, 1
  FROM public.query_public_slot_availability(
    query_public_slot_availability.business_slug,
    query_public_slot_availability.service_id,
    query_public_slot_availability.date_iso
  ) AS q
  WHERE public._professional_is_free(
      v_business_id,
      v_professional_id,
      q.starts_at_iso::timestamptz,
      q.ends_at_iso::timestamptz
    )
    AND (
      NOT v_has_hours
      OR (
        (q.starts_at_iso::timestamptz AT TIME ZONE COALESCE(v_timezone, 'UTC'))::time >= v_start
        AND (q.starts_at_iso::timestamptz AT TIME ZONE COALESCE(v_timezone, 'UTC'))::time < v_end
        AND (q.ends_at_iso::timestamptz AT TIME ZONE COALESCE(v_timezone, 'UTC'))::time <= v_end
      )
    );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
