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

export type RescheduleAppointmentInput = {
  id: string;
  startAtIso: string;
  endAtIso: string;
};

export function createAppointment(
  input: CreateAppointmentInput,
  existingEntries: CalendarEntry[]
): {
  id: string;
  status: 'confirmed' | 'cancelled';
  source: 'client-self-service' | 'admin-manual';
  startAtIso: string;
  endAtIso: string;
  notes?: string;
} {
  const range = parseAppointmentRange(input.startAtIso, input.endAtIso);
  assertNoOverlap(range, existingEntries);

  return {
    id: input.id,
    source: input.source,
    status: 'confirmed',
    startAtIso: input.startAtIso,
    endAtIso: input.endAtIso,
    notes: input.notes
  };
}

export function rescheduleAppointment(
  input: RescheduleAppointmentInput,
  existingEntries: CalendarEntry[]
): CalendarEntry {
  const existing = findAppointment(input.id, existingEntries);
  const range = parseAppointmentRange(input.startAtIso, input.endAtIso);
  assertNoOverlap(range, existingEntries, input.id);

  return {
    id: existing.id,
    type: existing.type,
    startAtIso: input.startAtIso,
    endAtIso: input.endAtIso,
    status: 'confirmed'
  };
}

export function cancelAppointment(id: string, existingEntries: CalendarEntry[]): CalendarEntry {
  const existing = findAppointment(id, existingEntries);
  return {
    ...existing,
    status: 'cancelled'
  };
}

function findAppointment(id: string, existingEntries: CalendarEntry[]): CalendarEntry {
  const existing = existingEntries.find(entry => entry.id === id);
  if (!existing) {
    throw new Error('APPOINTMENT_NOT_FOUND');
  }
  return existing;
}

function parseAppointmentRange(startAtIso: string, endAtIso: string): { startAtMs: number; endAtMs: number } {
  const startAtMs = parseIsoToMs(startAtIso);
  const endAtMs = parseIsoToMs(endAtIso);
  if (startAtMs >= endAtMs) {
    throw new Error('INVALID_APPOINTMENT_RANGE');
  }
  return { startAtMs, endAtMs };
}

function assertNoOverlap(
  range: { startAtMs: number; endAtMs: number },
  existingEntries: CalendarEntry[],
  ignoreId?: string
): void {
  const overlap = existingEntries.some(entry => {
    if (entry.id === ignoreId || entry.status === 'cancelled') {
      return false;
    }

    return overlaps(range, {
      startAtMs: parseIsoToMs(entry.startAtIso),
      endAtMs: parseIsoToMs(entry.endAtIso)
    });
  });

  if (overlap) {
    throw new Error('APPOINTMENT_OVERLAP');
  }
}

export function computePublicAvailability(input: {
  date: string;
  serviceDurationMinutes: number;
  slotIntervalMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  nowIso: string;
  workingWindows: Array<{ start: string; end: string }>;
  calendarEntries: CalendarEntry[];
}): string[] {
  const {
    date,
    serviceDurationMinutes,
    slotIntervalMinutes,
    bufferMinutes = 0,
    minNoticeMinutes = 0,
    workingWindows,
    calendarEntries
  } = input;

  if (serviceDurationMinutes <= 0 || slotIntervalMinutes <= 0) {
    return [];
  }

  const nowMs = input.nowIso ? parseIsoToMs(input.nowIso) : Number.NEGATIVE_INFINITY;
  const minAllowedStartMs = nowMs + (minNoticeMinutes * 60 * 1000);

  const occupiedRanges = calendarEntries
    .filter(entry => {
      if (entry.status === 'cancelled') {
        return false;
      }
      return true;
    })
    .map(entry => ({
      startAtMs: parseIsoToMs(entry.startAtIso) - (bufferMinutes * 60 * 1000),
      endAtMs: parseIsoToMs(entry.endAtIso) + (bufferMinutes * 60 * 1000)
    }));

  const slots: string[] = [];

  for (const window of workingWindows) {
    const windowStartMinutes = parseTime(window.start);
    const windowEndMinutes = parseTime(window.end);

    if (windowStartMinutes >= windowEndMinutes) {
      continue;
    }

    const lastStartMinutes = windowEndMinutes - serviceDurationMinutes;
    for (let startMinutes = windowStartMinutes; startMinutes <= lastStartMinutes; startMinutes += slotIntervalMinutes) {
      const endMinutes = startMinutes + serviceDurationMinutes;
      const slotStartMs = buildUtcMs(date, startMinutes);
      const slotEndMs = buildUtcMs(date, endMinutes);

      const slotRange = {
        startAtMs: slotStartMs,
        endAtMs: slotEndMs
      };

      // Check min notice
      if (slotStartMs < minAllowedStartMs) {
        continue;
      }

      const collides = occupiedRanges.some(range => overlaps(slotRange, range));
      if (!collides) {
        slots.push(formatMinutes(startMinutes));
      }
    }
  }

  return slots;
}

export function canClientCancelOrReschedule(input: {
  appointmentStartAtIso: string;
  nowIso: string;
}): { allowed: boolean; reason?: 'POLICY_WINDOW_CLOSED' } {
  const appointmentStartMs = parseIsoToMs(input.appointmentStartAtIso);
  const nowMs = parseIsoToMs(input.nowIso);

  const oneHourMs = 60 * 60 * 1000;
  if (appointmentStartMs - nowMs >= oneHourMs) {
    return { allowed: true };
  }

  return { allowed: false, reason: 'POLICY_WINDOW_CLOSED' };
}

export function validateSelfServiceToken(input: {
  token: string;
  appointmentId: string;
  appointmentStartAtIso: string;
  nowIso: string;
}): {
  valid: boolean;
  reason?: 'INVALID_TOKEN' | 'TOKEN_EXPIRED' | 'POLICY_WINDOW_CLOSED';
} {
  const expectedToken = `tok_valid_${input.appointmentId}`;
  if (input.token !== expectedToken) {
    return { valid: false, reason: 'INVALID_TOKEN' };
  }

  const appointmentStartMs = parseIsoToMs(input.appointmentStartAtIso);
  const nowMs = parseIsoToMs(input.nowIso);

  if (nowMs > appointmentStartMs) {
    return { valid: false, reason: 'TOKEN_EXPIRED' };
  }

  const policy = canClientCancelOrReschedule({
    appointmentStartAtIso: input.appointmentStartAtIso,
    nowIso: input.nowIso
  });

  if (!policy.allowed) {
    return { valid: false, reason: 'POLICY_WINDOW_CLOSED' };
  }

  return { valid: true };
}

function parseIsoToMs(iso: string): number {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    throw new Error('INVALID_ISO_DATE');
  }
  return parsed;
}

function overlaps(a: { startAtMs: number; endAtMs: number }, b: { startAtMs: number; endAtMs: number }): boolean {
  return a.startAtMs < b.endAtMs && a.endAtMs > b.startAtMs;
}

function parseTime(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('INVALID_TIME');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('INVALID_TIME');
  }

  return hours * 60 + minutes;
}

function buildUtcMs(date: string, minutesInDay: number): number {
  const hours = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  const hourPart = String(hours).padStart(2, '0');
  const minutePart = String(minutes).padStart(2, '0');
  return parseIsoToMs(`${date}T${hourPart}:${minutePart}:00.000Z`);
}

function formatMinutes(minutesInDay: number): string {
  const hours = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
