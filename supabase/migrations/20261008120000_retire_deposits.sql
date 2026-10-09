-- Retire the seña (manual alias/CBU deposit) requirement from the product.
--
-- Scope of this change: the seña stops existing for customers and for operators.
-- The objects that support it are intentionally NOT dropped (bookings.deposit_*,
-- business_settings.deposit_*, the deposit RPCs, booking_deposit_evidence /
-- booking_deposit_strikes and the two email templates): turning the flag back on
-- is all that a revert needs, and the destructive cleanup is a separate change.
--
-- Three effects:
--
--   1. Every business is left with deposit_enabled = false. Only the on/off
--      switch is written; deposit_percent / deposit_alias / deposit_cbu keep the
--      operator's configuration for a possible revert.
--
--   2. A BEFORE INSERT OR UPDATE trigger pins deposit_enabled to false for good.
--      The operator dashboard is a PWA, so a stale bundle in the field still
--      knows how to write deposit_enabled = true; the trigger makes that write
--      a no-op instead of resurrecting the seña. With the flag pinned to false,
--      public._read_business_booking_config() reports no deposit to
--      create_public_booking() (no hold row, no BOOKING_DEPOSIT_SETTINGS_
--      INCOMPLETE failure) and public.resolve_business_by_slug() reports no
--      deposit to the public portal (no required-seña banner, no quote, no
--      alias/CBU exposure to anonymous visitors).
--
--   3. Bookings still holding a slot for an unconfirmed seña become normal
--      confirmed bookings (deposit_status = 'paid', which is what the operator's
--      "Confirmar seña" action wrote) and their customers receive the
--      appointment_confirmation email that action would have enqueued. No
--      reservation is lost to the hold sweep, and 'paid' keeps the row inside
--      the occupancy filter in _assert_no_slot_conflict() / the availability
--      query, so the slot stays taken.

BEGIN;

UPDATE public.business_settings
SET deposit_enabled = false,
    updated_at = now()
WHERE deposit_enabled IS DISTINCT FROM false;

CREATE OR REPLACE FUNCTION public._business_deposits_retired()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.deposit_enabled := false;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public._business_deposits_retired() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_business_deposits_retired ON public.business_settings;
CREATE TRIGGER trg_business_deposits_retired
BEFORE INSERT OR UPDATE ON public.business_settings
FOR EACH ROW
EXECUTE FUNCTION public._business_deposits_retired();

WITH converted AS (
  UPDATE public.bookings
  SET deposit_status = 'paid',
      updated_at = now()
  WHERE deposit_status IN ('pending', 'claim_pending')
  RETURNING id, business_id, customer_id, starts_at, service_id
)
INSERT INTO public.notification_email_outbox (business_id, booking_id, to_email, template_key, payload)
SELECT
  converted.business_id,
  converted.id,
  customers.email,
  'appointment_confirmation',
  jsonb_build_object(
    'booking_id', converted.id,
    'starts_at', converted.starts_at,
    'customer_name', COALESCE(customers.full_name, 'Cliente'),
    'service_name', COALESCE(services.name, 'Servicio')
  )
FROM converted
INNER JOIN public.customers ON customers.id = converted.customer_id
LEFT JOIN public.services ON services.id = converted.service_id
WHERE nullif(btrim(customers.email), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.notification_email_outbox existing
    WHERE existing.booking_id = converted.id
      AND existing.template_key = 'appointment_confirmation'
  );

COMMIT;
NOTIFY pgrst, 'reload schema';
