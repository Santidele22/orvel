import type { WeekdayKey, WorkingDayHours } from '@orvel/types';

export type WorkingDayInterval = { start: string; end: string };

export type WorkingDayFormValue = {
  enabled: boolean;
  start: string;
  end: string;
  start2: string;
  end2: string;
};

function isInterval(value: unknown): value is WorkingDayInterval {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const record = value as { start?: unknown; end?: unknown };
  return typeof record.start === 'string' && typeof record.end === 'string';
}

export function resolveWorkingDayIntervals(
  day: Pick<WorkingDayHours, 'start' | 'end'> & { intervals?: WorkingDayInterval[] }
): WorkingDayInterval[] {
  if (Array.isArray(day.intervals) && day.intervals.length > 0) {
    return day.intervals.filter(isInterval).slice(0, 2);
  }

  return [{ start: day.start, end: day.end }];
}

export function workingDayHoursToFormValue(day: WorkingDayHours): WorkingDayFormValue {
  const intervals = resolveWorkingDayIntervals(day);
  const first = intervals[0] ?? { start: day.start, end: day.end };
  const second = intervals[1];

  return {
    enabled: day.enabled,
    start: first.start,
    end: first.end,
    start2: second?.start ?? '',
    end2: second?.end ?? ''
  };
}

export function persistWorkingDayHours(day: {
  enabled: boolean;
  start: string;
  end: string;
  start2?: string;
  end2?: string;
  intervals?: WorkingDayInterval[];
}): WorkingDayHours {
  const first: WorkingDayInterval = { start: day.start, end: day.end };
  const start2 = day.start2?.trim() ?? '';
  const end2 = day.end2?.trim() ?? '';
  const intervals: WorkingDayInterval[] = start2 && end2
    ? [first, { start: start2, end: end2 }]
    : resolveWorkingDayIntervals({ start: day.start, end: day.end, intervals: day.intervals });

  return {
    enabled: day.enabled,
    start: intervals[0].start,
    end: intervals[0].end,
    intervals
  };
}

export function persistWorkingHoursRecord(
  hours: Record<string, {
    enabled: boolean;
    start: string;
    end: string;
    start2?: string;
    end2?: string;
    intervals?: WorkingDayInterval[];
  }>
): Record<WeekdayKey, WorkingDayHours> {
  const persisted = {} as Record<WeekdayKey, WorkingDayHours>;

  for (const [key, day] of Object.entries(hours)) {
    persisted[key as WeekdayKey] = persistWorkingDayHours(day);
  }

  return persisted;
}

function timeToMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

function minutesToTime(totalMinutes: number): string {
  const clamped = Math.min(Math.max(totalMinutes, 0), (23 * 60) + 59);
  const nextHour = Math.floor(clamped / 60);
  const nextMinute = clamped % 60;
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
}

export function addClockMinutes(time: string, minutesToAdd: number): string {
  return minutesToTime(timeToMinutes(time) + minutesToAdd);
}

export function splitWorkingDayForCut(start: string, end: string): { end: string; start2: string; end2: string } {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  const siestaStart = 13 * 60 + 30;
  const siestaEnd = 16 * 60;

  if (startMinutes < siestaStart && siestaEnd < endMinutes) {
    return { end: '13:30', start2: '16:00', end2: end };
  }

  const span = endMinutes - startMinutes;
  if (span > 90) {
    const mid = startMinutes + Math.floor(span / 2);
    return {
      end: minutesToTime(mid - 15),
      start2: minutesToTime(mid + 15),
      end2: end
    };
  }

  return {
    end,
    start2: end,
    end2: addClockMinutes(end, 240)
  };
}

export function workingHoursToFormValue(
  hours: Record<WeekdayKey, WorkingDayHours>
): Record<WeekdayKey, WorkingDayFormValue> {
  const mapped = {} as Record<WeekdayKey, WorkingDayFormValue>;

  for (const [key, day] of Object.entries(hours) as Array<[WeekdayKey, WorkingDayHours]>) {
    mapped[key] = workingDayHoursToFormValue(day);
  }

  return mapped;
}
