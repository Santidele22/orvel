import type { WeekdayKey, WorkingDayHours } from '@orvel/types';

const WEEKDAYS: WeekdayKey[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday'
];

export const SETTINGS_FORM_NUMERIC_DEFAULTS = {
  cancelationGracePeriod: 60,
  maxAdvanceDays: 90,
  cleanupTimeMinutes: 0,
  capacity: 1
} as const;

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function finiteNumberOr(value: unknown, fallback: number): number {
  return toFiniteNumber(value) ?? fallback;
}

export function finiteAtLeastOr(value: unknown, min: number, fallback: number): number {
  const n = toFiniteNumber(value);
  return n !== undefined && n >= min ? n : fallback;
}

export function resolveWorkingHours(
  workingHours: unknown,
  defaultHours: Record<WeekdayKey, WorkingDayHours>
): Record<WeekdayKey, WorkingDayHours> {
  if (!workingHours || typeof workingHours !== 'object' || Array.isArray(workingHours)) {
    return { ...defaultHours };
  }

  const record = workingHours as Record<string, unknown>;
  const merged: Record<WeekdayKey, WorkingDayHours> = { ...defaultHours };

  for (const day of WEEKDAYS) {
    const hours = record[day];
    if (hours && typeof hours === 'object' && !Array.isArray(hours)) {
      merged[day] = hours as WorkingDayHours;
    }
  }

  return merged;
}

export type NullableSettingsRow = {
  cancellation_window_minutes?: unknown;
  max_advance_days?: unknown;
  cleanup_time_minutes?: unknown;
  capacity?: unknown;
  working_hours?: unknown;
};

export function mapNullableSettingsToFormDefaults(
  settings: NullableSettingsRow | null | undefined,
  defaultHours: Record<WeekdayKey, WorkingDayHours>
) {
  return {
    cancelationGracePeriod: finiteNumberOr(
      settings?.cancellation_window_minutes,
      SETTINGS_FORM_NUMERIC_DEFAULTS.cancelationGracePeriod
    ),
    maxAdvanceDays: finiteAtLeastOr(
      settings?.max_advance_days,
      1,
      SETTINGS_FORM_NUMERIC_DEFAULTS.maxAdvanceDays
    ),
    cleanupTimeMinutes: finiteNumberOr(
      settings?.cleanup_time_minutes,
      SETTINGS_FORM_NUMERIC_DEFAULTS.cleanupTimeMinutes
    ),
    capacity: finiteAtLeastOr(settings?.capacity, 1, SETTINGS_FORM_NUMERIC_DEFAULTS.capacity),
    workingHours: resolveWorkingHours(settings?.working_hours, defaultHours)
  };
}
