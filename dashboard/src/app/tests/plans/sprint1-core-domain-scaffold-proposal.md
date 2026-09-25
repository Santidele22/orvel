# Sprint 1 Core Domain - Minimal Scaffold Proposal (for Magnus)

## Blocker

`src/app/features/booking/data-access/booking-core.ts` does not exist yet.

Current RED tests depend on this module and intentionally fail until implementation is added.

## Proposed minimal API contract

```ts
export type CalendarEntryType = 'appointment' | 'manual-admin-appointment' | 'blocked-time';

export type CalendarEntry = {
  id: string;
  type: CalendarEntryType;
  startAtIso: string;
  endAtIso: string;
  status?: 'confirmed' | 'cancelled';
};

export type CreateAppointmentInput = {
  id: string;
  source: 'client-self-service' | 'admin-manual';
  startAtIso: string;
  endAtIso: string;
  notes?: string;
};

export function createAppointment(
  input: CreateAppointmentInput,
  existingEntries: CalendarEntry[]
): {
  id: string;
  source: 'client-self-service' | 'admin-manual';
  status: 'confirmed' | 'cancelled';
  startAtIso: string;
  endAtIso: string;
  notes?: string;
};

export function computePublicAvailability(input: {
  date: string;
  serviceDurationMinutes: number;
  slotIntervalMinutes: number;
  workingWindows: Array<{ start: string; end: string }>;
  calendarEntries: CalendarEntry[];
}): string[];

export function canClientCancelOrReschedule(input: {
  appointmentStartAtIso: string;
  nowIso: string;
}): { allowed: boolean; reason?: 'POLICY_WINDOW_CLOSED' };

export function validateSelfServiceToken(input: {
  token: string;
  appointmentId: string;
  appointmentStartAtIso: string;
  nowIso: string;
}): {
  valid: boolean;
  reason?: 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'POLICY_WINDOW_CLOSED';
};
```

## Expected deterministic errors/reasons

- Overlap collision: `APPOINTMENT_OVERLAP`
- Policy violation (<1h): `POLICY_WINDOW_CLOSED`
- Invalid token: `INVALID_TOKEN`
- Expired token: `TOKEN_EXPIRED`
