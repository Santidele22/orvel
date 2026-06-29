import type { WeekdayKey, WorkingDayHours } from '../../../../models/business.model';

export interface DayAvailability {
  date: string;
  label: string;
  weekday: string;
  isWorkingDay: boolean;
  hasAvailability: boolean;
}

const WEEKDAY_KEYS: WeekdayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const PUBLIC_BOOKING_DAY_WINDOW = 14;
const UTC_NOON_HOUR = 12;
export const DEFAULT_BUSINESS_TIMEZONE = 'America/Argentina/Buenos_Aires';

export function getWeekdayKey(date: Date): WeekdayKey {
  return WEEKDAY_KEYS[date.getDay()];
}

function resolveTimeZone(timeZone?: string): string {
  const candidate = timeZone || DEFAULT_BUSINESS_TIMEZONE;

  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}

export function toLocalCivilDate(date: Date, timeZone?: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: resolveTimeZone(timeZone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const year = parts.find(part => part.type === 'year')?.value ?? '1970';
  const month = parts.find(part => part.type === 'month')?.value ?? '01';
  const day = parts.find(part => part.type === 'day')?.value ?? '01';

  return `${year}-${month}-${day}`;
}

export function getWeekdayKeyFromLocalCivilDate(dateIso: string): WeekdayKey {
  const [year, month, day] = dateIso.split('-').map(Number);
  return WEEKDAY_KEYS[new Date(Date.UTC(year, month - 1, day, UTC_NOON_HOUR)).getUTCDay()];
}

export function buildPublicBookingDays(
  workingHours: Partial<Record<WeekdayKey, WorkingDayHours>> | null | undefined,
  today: Date = new Date(),
  timeZone: string = DEFAULT_BUSINESS_TIMEZONE
): DayAvailability[] {
  const days: DayAvailability[] = [];
  const [todayYear, todayMonth, todayDay] = toLocalCivilDate(today, timeZone).split('-').map(Number);

  for (let i = 0; i < PUBLIC_BOOKING_DAY_WINDOW; i++) {
    const d = new Date(Date.UTC(todayYear, todayMonth - 1, todayDay + i, UTC_NOON_HOUR));
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const iso = `${year}-${month}-${day}`;
    const weekdayKey = getWeekdayKeyFromLocalCivilDate(iso);
    const isWorkingDay = workingHours?.[weekdayKey]?.enabled === true;

    days.push({
      date: iso,
      label: d.getUTCDate().toString(),
      weekday: d.toLocaleString('es-AR', { weekday: 'short', timeZone: 'UTC' }).toUpperCase().replace('.', ''),
      isWorkingDay,
      hasAvailability: false
    });
  }

  return days;
}
