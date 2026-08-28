import { parseHoraMinutes, readArgentinaClock } from '../../../core/time/argentina-clock';

export type FeaturedAppointmentLike = {
  hora?: string;
  duracionMinutos?: number;
  dateLabel?: string;
};

export function pickNextAppointment<T extends FeaturedAppointmentLike>(
  featured: T[],
  now: Date,
): T | null {
  if (featured.length === 0) {
    return null;
  }

  const clock = readArgentinaClock(now);
  const upcoming = featured.find((turno) => {
    if (turno.dateLabel && turno.dateLabel !== 'Hoy') {
      return true;
    }
    return parseHoraMinutes(turno.hora) + (turno.duracionMinutos || 30) > clock.minutes;
  });

  return upcoming ?? null;
}
