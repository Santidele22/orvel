import { afterEach, describe, expect, it, vi } from 'vitest';
import { logMutationFailure, type MutationErrorLog } from '../../core/observability/mutation-error-log';

const EMAIL = 'client@example.com';
const PHONE = '+5491112345678';
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFBPVxDhxPA';
const BUSINESS_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const BRANCH_ID = '11111111-2222-4333-8444-555555555555';
const BOOKING_ID = '99999999-8888-4777-8666-555555555555';

function loggedPayload(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const payload = spy.mock.calls.at(-1)?.[1];
  expect(payload).toEqual(expect.any(Object));
  return payload as Record<string, unknown>;
}

describe('mutation error log', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs operation + status + domain code', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = logMutationFailure({
      operation: 'create_admin_manual_booking',
      response: { status: 401, error: { code: 'UNAUTHORIZED', message: 'UNAUTHORIZED: session missing' } },
      ids: { businessId: BUSINESS_ID, branchId: BRANCH_ID }
    });

    expect(result).toEqual<MutationErrorLog>({
      operation: 'create_admin_manual_booking',
      status: 401,
      code: 'UNAUTHORIZED',
      businessId: BUSINESS_ID,
      branchId: BRANCH_ID
    });
    expect(consoleError).toHaveBeenCalledWith('[Orvel] mutation failed', result);
  });

  it('extracts UNAUTHORIZED from Error message and 42804 from PostgREST-like code', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(
      logMutationFailure({
        operation: 'query_admin_slot_availability',
        error: new Error('UNAUTHORIZED: auth.uid() is null')
      })
    ).toMatchObject({ operation: 'query_admin_slot_availability', code: 'UNAUTHORIZED' });

    expect(
      logMutationFailure({
        operation: 'create_public_booking',
        error: { code: '42804', message: 'datatype mismatch' }
      })
    ).toMatchObject({ operation: 'create_public_booking', code: '42804' });

    expect(
      logMutationFailure({
        operation: 'create_admin_manual_booking',
        error: new Error('PostgREST 42804 datatype mismatch')
      })
    ).toMatchObject({ operation: 'create_admin_manual_booking', code: '42804' });
  });

  it('does not treat Spanish or English prose fragments as mutation codes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(
      logMutationFailure({
        operation: 'create_admin_manual_booking',
        error: new Error('No se pudo crear el turno')
      })
    ).toEqual<MutationErrorLog>({ operation: 'create_admin_manual_booking' });

    expect(
      logMutationFailure({
        operation: 'create_admin_manual_booking',
        error: new Error('Error al guardar turno')
      })
    ).toEqual<MutationErrorLog>({ operation: 'create_admin_manual_booking' });

    expect(
      logMutationFailure({
        operation: 'create_admin_manual_booking',
        error: new Error('Failed to create booking')
      })
    ).toEqual<MutationErrorLog>({ operation: 'create_admin_manual_booking' });

    expect(
      logMutationFailure({
        operation: 'create_admin_manual_booking',
        error: new Error('Si el horario no está disponible')
      })
    ).toEqual<MutationErrorLog>({ operation: 'create_admin_manual_booking' });
  });

  it('prefers structured code and status on a thrown Error over Spanish message scrape', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const error = Object.assign(new Error('No se pudo crear el turno'), {
      code: 'UNAUTHORIZED',
      status: 401
    });

    expect(
      logMutationFailure({
        operation: 'create_admin_manual_booking',
        error
      })
    ).toEqual<MutationErrorLog>({
      operation: 'create_admin_manual_booking',
      status: 401,
      code: 'UNAUTHORIZED'
    });
  });

  it('never includes email, phone, jwt, token, or raw payload in the console.error second argument', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    logMutationFailure({
      operation: 'customers.insert',
      error: {
        status: 400,
        code: 'P0001',
        message: `duplicate key for ${EMAIL} ${PHONE}`,
        details: { email: EMAIL, phone: PHONE, token: 'secret-token', jwt: JWT },
        raw: { client: { email: EMAIL, phone: PHONE }, authorization: `Bearer ${JWT}` },
        stack: 'Error: leak\n    at insert'
      },
      response: {
        status: 400,
        error: { code: 'P0001', message: `failed for ${EMAIL}` }
      },
      ids: {
        businessId: BUSINESS_ID,
        branchId: EMAIL,
        bookingId: JWT
      }
    });

    const payload = loggedPayload(consoleError);
    const serialized = JSON.stringify(payload);

    expect(Object.keys(payload).sort()).toEqual(['businessId', 'code', 'operation', 'status']);
    expect(serialized).not.toMatch(/email|phone|jwt|token|raw|stack|Bearer|secret-token/i);
    expect(serialized).not.toContain(EMAIL);
    expect(serialized).not.toContain(PHONE);
    expect(serialized).not.toContain(JWT);
    expect(serialized).not.toContain('duplicate key');
  });

  it('ignores non-uuid ids', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = logMutationFailure({
      operation: 'cancel_admin_booking',
      error: { status: 409, code: 'SLOT_CONFLICT' },
      ids: {
        businessId: 'not-a-uuid',
        branchId: PHONE,
        bookingId: BOOKING_ID
      }
    });

    expect(result).toEqual<MutationErrorLog>({
      operation: 'cancel_admin_booking',
      status: 409,
      code: 'SLOT_CONFLICT',
      bookingId: BOOKING_ID
    });
    expect(result).not.toHaveProperty('businessId');
    expect(result).not.toHaveProperty('branchId');
  });
});
