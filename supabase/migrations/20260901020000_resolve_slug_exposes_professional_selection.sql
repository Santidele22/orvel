-- Public turnero reads allowClientProfessionalSelection from resolve_business_by_slug.
-- The previous body hardcoded false, so the picker never appeared.

BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_business_by_slug(business_slug text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_row record;
BEGIN
  SELECT b.id, b.slug, b.name, b.timezone,
         coalesce(bs.auto_confirm, true) AS auto_confirm,
         coalesce(bs.cancellation_window_minutes, 60) AS cancellation_window_minutes,
         coalesce(bs.allow_client_reschedule, true) AS allow_client_reschedule,
         coalesce(bs.allow_client_cancel, true) AS allow_client_cancel,
         coalesce(bs.allow_client_professional_selection, false) AS allow_client_professional_selection,
         coalesce(bs.slot_interval_minutes, 30) AS slot_interval_minutes,
         coalesce(bs.buffer_minutes, 0) AS buffer_minutes,
         coalesce(bs.min_notice_minutes, 0) AS min_notice_minutes,
         coalesce(bs.working_hours, '{}'::jsonb) AS working_hours
    INTO v_row
  FROM public.businesses b
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  WHERE b.slug = resolve_business_by_slug.business_slug
     OR b.slug_canonical = public.canonical_booking_slug(resolve_business_by_slug.business_slug)
  LIMIT 1;

  IF v_row.id IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'slug', v_row.slug,
    'name', v_row.name,
    'timezone', v_row.timezone,
    'booking_policy', jsonb_build_object(
      'autoConfirm', v_row.auto_confirm,
      'cancellationWindowMinutes', v_row.cancellation_window_minutes,
      'allowClientProfessionalSelection', v_row.allow_client_professional_selection,
      'allowClientReschedule', v_row.allow_client_reschedule,
      'allowClientCancel', v_row.allow_client_cancel
    ),
    'settings', jsonb_build_object(
      'slotIntervalMinutes', v_row.slot_interval_minutes,
      'bufferMinutes', v_row.buffer_minutes,
      'minNoticeMinutes', v_row.min_notice_minutes,
      'workingHours', v_row.working_hours
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_business_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_business_by_slug(text) TO anon, authenticated;

COMMIT;
