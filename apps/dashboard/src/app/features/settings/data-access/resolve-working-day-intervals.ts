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

export function addClockMinutes(time: string, minutesToAdd: number): string {
  const [hour, minute] = time.split(':').map(Number);
  const total = Math.min(Math.max((hour * 60 + minute) + minutesToAdd, 0), (23 * 60) + 59);
  const nextHour = Math.floor(total / 60);
  const nextMinute = total % 60;
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
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
