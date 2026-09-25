export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

export type ArgentinaClock = { dateKey: string; minutes: number };
export type LiveTurnoLike = { fecha: Date; hora?: string; duracionMinutos?: number };

export function readArgentinaClock(now: Date): ArgentinaClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ARGENTINA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '0';
  return {
    dateKey: `${value('year')}-${value('month')}-${value('day')}`,
    minutes: Number(value('hour')) * 60 + Number(value('minute')),
  };
}

export function civilDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function localDateFromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function weekdayIndexFromDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

export function parseHoraMinutes(hora: string | undefined): number {
  const [hours, minutes] = (hora || '00:00').split(':').map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
}

export function hasTurnoElapsed(turno: LiveTurnoLike, clock: ArgentinaClock): boolean {
  const key = civilDateKey(turno.fecha);
  if (key !== clock.dateKey) return key < clock.dateKey;
  return parseHoraMinutes(turno.hora) + (turno.duracionMinutos || 30) <= clock.minutes;
}

export function isStartInThePast(slotDateKey: string, startHora: string, clock: ArgentinaClock): boolean {
  if (slotDateKey !== clock.dateKey) return slotDateKey < clock.dateKey;
  return parseHoraMinutes(startHora) < clock.minutes;
}

export function filterLiveAvailableStarts(starts: string[], slotDateKey: string, clock: ArgentinaClock): string[] {
  return starts.filter((start) => !isStartInThePast(slotDateKey, start, clock));
}

export function filterLiveTurnos<T extends LiveTurnoLike>(turnos: T[], clock: ArgentinaClock): T[] {
  return turnos.filter((turno) => !hasTurnoElapsed(turno, clock));
}
