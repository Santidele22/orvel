-- Public turnero needs the business phone, alias and CBU so the client can
-- send the seña receipt. Prefer business_settings.support_phone, then owner profile phone.

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
  v_receipt_phone text;
BEGIN
  SELECT b.id, b.slug, b.name, b.timezone, b.owner_id,
         coalesce(bs.auto_confirm, true) AS auto_confirm,
         coalesce(bs.cancellation_window_minutes, 60) AS cancellation_window_minutes,
         coalesce(bs.allow_client_reschedule, true) AS allow_client_reschedule,
         coalesce(bs.allow_client_cancel, true) AS allow_client_cancel,
         coalesce(bs.allow_client_professional_selection, false) AS allow_client_professional_selection,
         coalesce(bs.slot_interval_minutes, 30) AS slot_interval_minutes,
         coalesce(bs.buffer_minutes, 0) AS buffer_minutes,
         coalesce(bs.min_notice_minutes, 0) AS min_notice_minutes,
         coalesce(bs.max_advance_days, 30) AS max_advance_days,
         coalesce(bs.working_hours, '{}'::jsonb) AS working_hours,
         coalesce(bs.deposit_enabled, false) AS deposit_enabled,
         coalesce(bs.deposit_percent, 0) AS deposit_percent,
         nullif(btrim(bs.deposit_alias), '') AS deposit_alias,
         nullif(btrim(bs.deposit_cbu), '') AS deposit_cbu,
         nullif(btrim(bs.support_phone), '') AS support_phone,
         nullif(btrim(bs.whatsapp), '') AS whatsapp
    INTO v_row
  FROM public.businesses b
  LEFT JOIN public.business_settings bs ON bs.business_id = b.id
  WHERE b.slug = resolve_business_by_slug.business_slug
     OR b.slug_canonical = public.canonical_booking_slug(resolve_business_by_slug.business_slug)
  LIMIT 1;

  IF v_row.id IS NULL THEN
    PERFORM public._raise_rpc('BUSINESS_NOT_FOUND');
  END IF;

  SELECT nullif(btrim(p.phone), '')
    INTO v_receipt_phone
  FROM public.profiles p
  WHERE p.id = v_row.owner_id;

  v_receipt_phone := coalesce(v_row.support_phone, v_row.whatsapp, v_receipt_phone);

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
      'maxAdvanceDays', v_row.max_advance_days,
      'workingHours', v_row.working_hours,
      'depositEnabled', v_row.deposit_enabled,
      'depositPercent', v_row.deposit_percent,
      'depositAlias', v_row.deposit_alias,
      'depositCbu', v_row.deposit_cbu,
      'supportPhone', v_receipt_phone
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_business_by_slug(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_business_by_slug(text) TO anon, authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
