export type TimeWindow = {
  start: string;
  end: string;
};

export type ComputeAvailableSlotsInput = {
  date: string;
  serviceDurationMinutes: number;
  slotIntervalMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  workingWindows: TimeWindow[];
  occupiedWindows: TimeWindow[];
  now?: Date;
};

const DAY_MINUTES = 24 * 60;

export function computeAvailableSlots(input: ComputeAvailableSlotsInput): string[] {
  const {
    date,
    serviceDurationMinutes,
    slotIntervalMinutes,
    bufferMinutes,
    minNoticeMinutes,
    workingWindows,
    occupiedWindows,
    now
  } = input;

  if (!Number.isFinite(serviceDurationMinutes) || serviceDurationMinutes <= 0) {
    throw new Error('Invalid service duration range');
  }

  if (!Number.isFinite(slotIntervalMinutes) || slotIntervalMinutes <= 0) {
    throw new Error('Invalid slot interval range');
  }

  const parsedDate = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error('Invalid date range');
  }

  if (workingWindows.length === 0) {
    return [];
  }

  const workingRanges = workingWindows.map(window => parseAndValidateRange(window, 'working window'));
  const expandedOccupiedRanges = occupiedWindows
    .map(window => parseAndValidateRange(window, 'occupied window'))
    .map(range => ({
      start: Math.max(0, range.start - Math.max(0, bufferMinutes)),
      end: Math.min(DAY_MINUTES, range.end + Math.max(0, bufferMinutes))
    }));

  const shouldApplyNoticeFilter = now !== undefined || minNoticeMinutes > 0;
  const minStartDate = shouldApplyNoticeFilter
    ? new Date((now ?? new Date()).getTime() + Math.max(0, minNoticeMinutes) * 60_000)
    : null;
  const candidateStarts = new Set<number>();

  for (const range of workingRanges) {
    const latestStart = range.end - serviceDurationMinutes;
    for (let start = range.start; start <= latestStart; start += slotIntervalMinutes) {
      const end = start + serviceDurationMinutes;
      if (collides({ start, end }, expandedOccupiedRanges)) {
        continue;
      }

      const candidateDate = minutesFromDate(date, start);
      if (minStartDate !== null && candidateDate < minStartDate) {
        continue;
      }

      candidateStarts.add(start);
    }
  }

  return [...candidateStarts].sort((a, b) => a - b).map(formatMinutes);
}

function parseAndValidateRange(window: TimeWindow, label: string): { start: number; end: number } {
  const start = parseTime(window.start);
  const end = parseTime(window.end);

  if (start >= end) {
    throw new Error(`Invalid ${label} range`);
  }

  return { start, end };
}

function parseTime(value: string): number {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new Error('Invalid time window range');
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error('Invalid time window range');
  }

  return hours * 60 + minutes;
}

function collides(target: { start: number; end: number }, occupiedRanges: Array<{ start: number; end: number }>): boolean {
  return occupiedRanges.some(range => target.start < range.end && target.end > range.start);
}

function minutesFromDate(date: string, minutesInDay: number): Date {
  // Canonical UTC policy: anchor candidates at UTC midnight (matches
  // booking-core.computePublicAvailability's buildUtcMs). Local-Date framing
  // would shift the min-notice boundary by the host TZ offset (R4).
  const hours = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  const hourPart = String(hours).padStart(2, '0');
  const minutePart = String(minutes).padStart(2, '0');
  return new Date(`${date}T${hourPart}:${minutePart}:00.000Z`);
}

function formatMinutes(minutesInDay: number): string {
  const hours = Math.floor(minutesInDay / 60);
  const minutes = minutesInDay % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}
