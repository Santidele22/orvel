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
