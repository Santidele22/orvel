import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { getPublicBookingSubmitErrorMessage, logPublicBookingSubmitFailure } from './public-booking-error-messages';

describe('public booking submit error messages', () => {
  it('maps slot conflicts to a safe actionable message', () => {
    expect(getPublicBookingSubmitErrorMessage({ code: 'SLOT_CONFLICT', message: 'SLOT_CONFLICT' })).toContain('horario');
  });

  it('maps business, branch, service, and contract failures without leaking internal table names', () => {
    const message = getPublicBookingSubmitErrorMessage({ code: 'BRANCH_NOT_FOUND', message: 'BRANCH_NOT_FOUND in public.create_public_booking' });

    expect(message).toContain('negocio');
    expect(message).not.toMatch(/BRANCH_NOT_FOUND|create_public_booking|public\./i);
  });

  it('maps BOOKING_TOO_SOON to a safe message without leaking internals', () => {
    const message = getPublicBookingSubmitErrorMessage({ code: 'BOOKING_TOO_SOON', message: 'BOOKING_TOO_SOON' });

    expect(message).toMatch(/pronto|anticipación/i);
    expect(message).not.toMatch(/BOOKING_TOO_SOON|create_public_booking/i);
  });

  it('maps BOOKING_TOO_FAR_ADVANCE to a safe message without leaking internals', () => {
    const message = getPublicBookingSubmitErrorMessage({ code: 'BOOKING_TOO_FAR_ADVANCE', message: 'BOOKING_TOO_FAR_ADVANCE' });

    expect(message).toMatch(/horizonte|cercana/i);
    expect(message).not.toMatch(/BOOKING_TOO_FAR_ADVANCE|create_public_booking/i);
  });

  it('public booking page honors PUBLIC_TURNERO_DISABLED as unavailable', () => {
    const pageSource = readFileSync(new URL('./public-booking.page.ts', import.meta.url), 'utf8');

    expect(pageSource).toMatch(/PUBLIC_TURNERO_DISABLED/);
    expect(pageSource).toMatch(/getPublicBookingSubmitErrorMessage|unavailable|No pudimos/);
  });

  it('maps PUBLIC_TURNERO_DISABLED to a generic unavailable message without leaking internals', () => {
    const message = getPublicBookingSubmitErrorMessage({
      code: 'PUBLIC_TURNERO_DISABLED',
      message: 'PUBLIC_TURNERO_DISABLED'
    });

    expect(message).toMatch(/no (est[aá]|disponib)|unavailable|negocio|reserv/i);
    expect(message).not.toMatch(/PUBLIC_TURNERO_DISABLED|create_public_booking|public_turnero_disabled_at/i);
  });

  it.each(['BUSINESS_EMAIL_RECIPIENT_REQUIRED', 'BOOKING_BRANCH_CONFIGURATION_REQUIRED'] as const)(
    'maps %s to a non-form unavailable message before VALIDATION_ERROR',
    (code) => {
      const message = getPublicBookingSubmitErrorMessage({
        code: 'VALIDATION_ERROR',
        message: `${code} in public.create_public_booking`
      });

      expect(message).toBe(
        'No pudimos completar la reserva para este negocio o servicio. Contactá al negocio para coordinar tu turno.'
      );
      expect(message).not.toMatch(/datos obligatorios/i);
      expect(message).not.toMatch(new RegExp(code, 'i'));
    }
  );

  it('keeps raw backend details in diagnostics logs', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logPublicBookingSubmitFailure({
      response: {
        status: 409,
        error: {
          code: 'SLOT_CONFLICT',
          message: 'SLOT_CONFLICT from RPC',
          details: { rpc: 'create_public_booking' }
        }
      }
    });

    expect(consoleError).toHaveBeenCalledWith('[PublicBooking] Booking submit failed', expect.objectContaining({
      status: 409,
      code: 'SLOT_CONFLICT',
      message: 'SLOT_CONFLICT from RPC',
      details: { rpc: 'create_public_booking' }
    }));

    consoleError.mockRestore();
  });
});
