import { signal, computed, type Signal } from '@angular/core';

export interface DayStripController {
  selectedDate: Signal<Date>;
  days: Signal<Date[]>;
  nextDay(): void;
  prevDay(): void;
  goToDate(d: Date): void;
}

/**
 * Pure Angular signal hook for day-strip state.
 *
 * Returns a reactive day-strip centred on `selectedDate`. The `days` signal
 * recomputes when `selectedDate` changes, producing `length` (default 7)
 * consecutive dates.
 *
 * All dates are local civil dates (no time component, no UTC drift).
 * Locale: Argentina Spanish (es-AR).
 */
export function useDayStripController(options?: {
  anchor?: Date;
  length?: number;
}): DayStripController {
  const anchor = options?.anchor ?? new Date();
  const length = options?.length ?? 7;

  const today = civilDate(anchor);
  const selectedDate = signal<Date>(today);

  const days = computed<Date[]>(() => {
    const result: Date[] = [];
    const center = civilDate(selectedDate());
    const start = new Date(center);
    start.setDate(center.getDate() - Math.floor(length / 2));

    for (let i = 0; i < length; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      result.push(d);
    }
    return result;
  });

  return {
    selectedDate,
    days,
    nextDay: () => selectedDate.update((d) => addDays(d, 1)),
    prevDay: () => selectedDate.update((d) => addDays(d, -1)),
    goToDate: (d: Date) => selectedDate.set(civilDate(d)),
  };
}

/** Normalise a Date to a local civil date (0:00:00.000). */
function civilDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Return a new Date offset by `n` days (may be negative). */
function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}
