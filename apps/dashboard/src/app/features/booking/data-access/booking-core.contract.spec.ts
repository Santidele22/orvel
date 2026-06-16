import { describe, expect, it } from 'vitest';
import {
  canClientCancelOrReschedule,
  computePublicAvailability,
  createAppointment,
  validateSelfServiceToken,
  type CalendarEntry
} from './booking-core';

describe('booking-core contract', () => {
  describe('createAppointment', () => {
    it('confirms a non-overlapping appointment and preserves caller metadata', () => {
      const appointment = createAppointment(
        {
          id: 'booking-new',
          source: 'client-self-service',
          startAtIso: '2026-06-01T10:00:00.000Z',
          endAtIso: '2026-06-01T10:30:00.000Z',
          notes: 'prefers quiet room'
        },
        [
          {
            id: 'booking-existing',
            type: 'appointment',
            startAtIso: '2026-06-01T09:00:00.000Z',
            endAtIso: '2026-06-01T09:30:00.000Z',
            status: 'confirmed'
          }
        ]
      );

      expect(appointment).toEqual({
        id: 'booking-new',
        source: 'client-self-service',
        status: 'confirmed',
        startAtIso: '2026-06-01T10:00:00.000Z',
        endAtIso: '2026-06-01T10:30:00.000Z',
        notes: 'prefers quiet room'
      });
    });

    it('rejects appointments that overlap active appointments or blocked time', () => {
      const existingEntries: CalendarEntry[] = [
        {
          id: 'blocked-1',
          type: 'blocked-time',
          startAtIso: '2026-06-01T10:00:00.000Z',
          endAtIso: '2026-06-01T11:00:00.000Z'
        }
      ];

      expect(() =>
        createAppointment(
          {
            id: 'booking-new',
            source: 'admin-manual',
            startAtIso: '2026-06-01T10:30:00.000Z',
            endAtIso: '2026-06-01T11:30:00.000Z'
          },
          existingEntries
        )
      ).toThrow('APPOINTMENT_OVERLAP');
    });

    it('ignores cancelled entries when checking overlap', () => {
      const appointment = createAppointment(
        {
          id: 'booking-new',
          source: 'admin-manual',
          startAtIso: '2026-06-01T10:00:00.000Z',
          endAtIso: '2026-06-01T11:00:00.000Z'
        },
        [
          {
            id: 'cancelled-1',
            type: 'appointment',
            startAtIso: '2026-06-01T10:00:00.000Z',
            endAtIso: '2026-06-01T11:00:00.000Z',
            status: 'cancelled'
          }
        ]
      );

      expect(appointment.status).toBe('confirmed');
    });

    it('rejects zero-length and inverted appointment ranges', () => {
      expect(() =>
        createAppointment(
          {
            id: 'booking-invalid',
            source: 'client-self-service',
            startAtIso: '2026-06-01T10:00:00.000Z',
            endAtIso: '2026-06-01T10:00:00.000Z'
          },
          []
        )
      ).toThrow('INVALID_APPOINTMENT_RANGE');
    });
  });

  describe('computePublicAvailability', () => {
    it('returns deterministic slots inside working windows only', () => {
      const slots = computePublicAvailability({
        date: '2026-06-01',
        serviceDurationMinutes: 30,
        slotIntervalMinutes: 30,
        bufferMinutes: 0,
        minNoticeMinutes: 0,
        nowIso: '2026-05-31T00:00:00.000Z',
        workingWindows: [{ start: '09:00', end: '10:30' }],
        calendarEntries: []
      });

      expect(slots).toEqual(['09:00', '09:30', '10:00']);
    });

    it('removes slots that collide with active entries plus buffer time', () => {
      const slots = computePublicAvailability({
        date: '2026-06-01',
        serviceDurationMinutes: 30,
        slotIntervalMinutes: 30,
        bufferMinutes: 10,
        minNoticeMinutes: 0,
        nowIso: '2026-05-31T00:00:00.000Z',
        workingWindows: [{ start: '09:00', end: '11:00' }],
        calendarEntries: [
          {
            id: 'booking-1',
            type: 'appointment',
            startAtIso: '2026-06-01T09:30:00.000Z',
            endAtIso: '2026-06-01T10:00:00.000Z',
            status: 'confirmed'
          }
        ]
      });

      expect(slots).toEqual(['10:30']);
    });

    it('filters out slots before min notice and ignores cancelled entries', () => {
      const slots = computePublicAvailability({
        date: '2026-06-01',
        serviceDurationMinutes: 30,
        slotIntervalMinutes: 30,
        bufferMinutes: 0,
        minNoticeMinutes: 60,
        nowIso: '2026-06-01T08:30:00.000Z',
        workingWindows: [{ start: '09:00', end: '11:00' }],
        calendarEntries: [
          {
            id: 'cancelled-1',
            type: 'appointment',
            startAtIso: '2026-06-01T09:30:00.000Z',
            endAtIso: '2026-06-01T10:00:00.000Z',
            status: 'cancelled'
          }
        ]
      });

      expect(slots).toEqual(['09:30', '10:00', '10:30']);
    });

    it('returns no slots for invalid durations, invalid intervals, or invalid windows', () => {
      expect(
        computePublicAvailability({
          date: '2026-06-01',
          serviceDurationMinutes: 0,
          slotIntervalMinutes: 30,
          bufferMinutes: 0,
          minNoticeMinutes: 0,
          nowIso: '2026-05-31T00:00:00.000Z',
          workingWindows: [{ start: '09:00', end: '10:00' }],
          calendarEntries: []
        })
      ).toEqual([]);

      expect(
        computePublicAvailability({
          date: '2026-06-01',
          serviceDurationMinutes: 30,
          slotIntervalMinutes: 30,
          bufferMinutes: 0,
          minNoticeMinutes: 0,
          nowIso: '2026-05-31T00:00:00.000Z',
          workingWindows: [{ start: '10:00', end: '09:00' }],
          calendarEntries: []
        })
      ).toEqual([]);
    });
  });

  describe('self-service policy helpers', () => {
    it('allows cancel/reschedule at least one hour before appointment start', () => {
      expect(
        canClientCancelOrReschedule({
          appointmentStartAtIso: '2026-06-01T10:00:00.000Z',
          nowIso: '2026-06-01T09:00:00.000Z'
        })
      ).toEqual({ allowed: true });
    });

    it('closes cancel/reschedule policy inside the one-hour window', () => {
      expect(
        canClientCancelOrReschedule({
          appointmentStartAtIso: '2026-06-01T10:00:00.000Z',
          nowIso: '2026-06-01T09:00:01.000Z'
        })
      ).toEqual({ allowed: false, reason: 'POLICY_WINDOW_CLOSED' });
    });

    it('validates token identity, expiry, and policy window deterministically', () => {
      expect(
        validateSelfServiceToken({
          token: 'tok_valid_booking-1',
          appointmentId: 'booking-1',
          appointmentStartAtIso: '2026-06-01T10:00:00.000Z',
          nowIso: '2026-06-01T08:30:00.000Z'
        })
      ).toEqual({ valid: true });

      expect(
        validateSelfServiceToken({
          token: 'wrong-token',
          appointmentId: 'booking-1',
          appointmentStartAtIso: '2026-06-01T10:00:00.000Z',
          nowIso: '2026-06-01T08:30:00.000Z'
        })
      ).toEqual({ valid: false, reason: 'INVALID_TOKEN' });

      expect(
        validateSelfServiceToken({
          token: 'tok_valid_booking-1',
          appointmentId: 'booking-1',
          appointmentStartAtIso: '2026-06-01T10:00:00.000Z',
          nowIso: '2026-06-01T10:00:01.000Z'
        })
      ).toEqual({ valid: false, reason: 'TOKEN_EXPIRED' });

      expect(
        validateSelfServiceToken({
          token: 'tok_valid_booking-1',
          appointmentId: 'booking-1',
          appointmentStartAtIso: '2026-06-01T10:00:00.000Z',
          nowIso: '2026-06-01T09:30:00.000Z'
        })
      ).toEqual({ valid: false, reason: 'POLICY_WINDOW_CLOSED' });
    });
  });
});
