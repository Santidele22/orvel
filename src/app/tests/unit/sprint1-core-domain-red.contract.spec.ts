import { describe, expect, it } from 'vitest';

type CalendarEntryType = 'appointment' | 'manual-admin-appointment' | 'blocked-time';

type CalendarEntry = {
  id: string;
  type: CalendarEntryType;
  startAtIso: string;
  endAtIso: string;
  status?: 'confirmed' | 'cancelled';
};

type CreateAppointmentInput = {
  id: string;
  source: 'client-self-service' | 'admin-manual';
  startAtIso: string;
  endAtIso: string;
  notes?: string;
};

type BookingCoreModule = {
  createAppointment: (input: CreateAppointmentInput, existingEntries: CalendarEntry[]) => {
    id: string;
    status: 'confirmed' | 'cancelled';
    source: 'client-self-service' | 'admin-manual';
    startAtIso: string;
    endAtIso: string;
    notes?: string;
  };
  computePublicAvailability: (input: {
    date: string;
    serviceDurationMinutes: number;
    slotIntervalMinutes: number;
    workingWindows: Array<{ start: string; end: string }>;
    calendarEntries: CalendarEntry[];
  }) => string[];
  canClientCancelOrReschedule: (input: { appointmentStartAtIso: string; nowIso: string }) => {
    allowed: boolean;
    reason?: 'POLICY_WINDOW_CLOSED';
  };
  validateSelfServiceToken: (input: {
    token: string;
    appointmentId: string;
    appointmentStartAtIso: string;
    nowIso: string;
  }) => {
    valid: boolean;
    reason?: 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'POLICY_WINDOW_CLOSED';
  };
};

async function loadBookingCore(): Promise<BookingCoreModule> {
  try {
    const mod = await import('../../domain/appointments/booking-core');
    return mod as BookingCoreModule;
  } catch {
    throw new Error(
      'TODO(Magnus): missing src/app/domain/appointments/booking-core.ts with createAppointment(), computePublicAvailability(), canClientCancelOrReschedule(), validateSelfServiceToken()'
    );
  }
}

describe('Sprint 1 Core Booking Domain RED contract', () => {
  it('prevents overlap when creating a new appointment', async () => {
    const { createAppointment } = await loadBookingCore();

    const existingEntries: CalendarEntry[] = [
      {
        id: 'appt-existing',
        type: 'appointment',
        status: 'confirmed',
        startAtIso: '2026-04-20T10:00:00.000Z',
        endAtIso: '2026-04-20T10:30:00.000Z'
      }
    ];

    expect(() =>
      createAppointment(
        {
          id: 'appt-new-overlap',
          source: 'client-self-service',
          startAtIso: '2026-04-20T10:15:00.000Z',
          endAtIso: '2026-04-20T10:45:00.000Z'
        },
        existingEntries
      )
    ).toThrow(/APPOINTMENT_OVERLAP|OVERLAP/i);
  });

  it('excludes blocked-time from public availability', async () => {
    const { computePublicAvailability } = await loadBookingCore();

    const slots = computePublicAvailability({
      date: '2026-04-20',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      workingWindows: [{ start: '09:00', end: '12:00' }],
      calendarEntries: [
        {
          id: 'block-1',
          type: 'blocked-time',
          startAtIso: '2026-04-20T10:00:00.000Z',
          endAtIso: '2026-04-20T11:00:00.000Z'
        }
      ]
    });

    expect(slots).toEqual(['09:00', '09:30', '11:00', '11:30']);
  });

  it('excludes manual admin appointments from public availability', async () => {
    const { computePublicAvailability } = await loadBookingCore();

    const slots = computePublicAvailability({
      date: '2026-04-20',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      workingWindows: [{ start: '09:00', end: '11:00' }],
      calendarEntries: [
        {
          id: 'admin-manual-1',
          type: 'manual-admin-appointment',
          startAtIso: '2026-04-20T09:30:00.000Z',
          endAtIso: '2026-04-20T10:00:00.000Z'
        }
      ]
    });

    expect(slots).toEqual(['09:00', '10:00', '10:30']);
  });

  it('auto-confirms appointment on creation (MVP policy)', async () => {
    const { createAppointment } = await loadBookingCore();

    const created = createAppointment(
      {
        id: 'appt-auto-confirm',
        source: 'client-self-service',
        startAtIso: '2026-04-20T12:00:00.000Z',
        endAtIso: '2026-04-20T12:30:00.000Z',
        notes: 'Client note visible to all staff'
      },
      []
    );

    expect(created.status).toBe('confirmed');
  });

  it('allows cancel/reschedule exactly at 1 hour before, denies below 1 hour', async () => {
    const { canClientCancelOrReschedule } = await loadBookingCore();

    const atBoundary = canClientCancelOrReschedule({
      appointmentStartAtIso: '2026-04-20T15:00:00.000Z',
      nowIso: '2026-04-20T14:00:00.000Z'
    });

    const belowBoundary = canClientCancelOrReschedule({
      appointmentStartAtIso: '2026-04-20T15:00:00.000Z',
      nowIso: '2026-04-20T14:01:00.000Z'
    });

    expect(atBoundary).toEqual({ allowed: true });
    expect(belowBoundary).toEqual({ allowed: false, reason: 'POLICY_WINDOW_CLOSED' });
  });

  it('accepts a valid self-service token before policy window closes', async () => {
    const { validateSelfServiceToken } = await loadBookingCore();

    const result = validateSelfServiceToken({
      token: 'tok_valid_appt-001',
      appointmentId: 'appt-001',
      appointmentStartAtIso: '2026-04-20T15:00:00.000Z',
      nowIso: '2026-04-20T13:30:00.000Z'
    });

    expect(result).toEqual({ valid: true });
  });

  it('rejects invalid tokens and expired tokens with deterministic reasons', async () => {
    const { validateSelfServiceToken } = await loadBookingCore();

    const invalidToken = validateSelfServiceToken({
      token: 'bad-token',
      appointmentId: 'appt-001',
      appointmentStartAtIso: '2026-04-20T15:00:00.000Z',
      nowIso: '2026-04-20T13:30:00.000Z'
    });

    const expiredToken = validateSelfServiceToken({
      token: 'tok_valid_appt-001',
      appointmentId: 'appt-001',
      appointmentStartAtIso: '2026-04-20T15:00:00.000Z',
      nowIso: '2026-04-20T15:05:00.000Z'
    });

    expect(invalidToken).toEqual({ valid: false, reason: 'INVALID_TOKEN' });
    expect(expiredToken).toEqual({ valid: false, reason: 'TOKEN_EXPIRED' });
  });

  it('rejects valid token when policy window is closed (< 1h before)', async () => {
    const { validateSelfServiceToken } = await loadBookingCore();

    const result = validateSelfServiceToken({
      token: 'tok_valid_appt-001',
      appointmentId: 'appt-001',
      appointmentStartAtIso: '2026-04-20T15:00:00.000Z',
      nowIso: '2026-04-20T14:15:00.000Z'
    });

    expect(result).toEqual({ valid: false, reason: 'POLICY_WINDOW_CLOSED' });
  });
});
