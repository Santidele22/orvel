export type FeaturedAppointmentLike = {
  hora?: string;
  duracionMinutos?: number;
  dateLabel?: string;
};

function clockMinutes(hora: string | undefined): number | null {
  const [hours, minutes] = (hora || '00:00').split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

export function pickNextAppointment<T extends FeaturedAppointmentLike>(
  featured: T[],
  now: Date,
): T | null {
  if (featured.length === 0) {
    return null;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const upcoming = featured.find((turno) => {
    if (turno.dateLabel && turno.dateLabel !== 'Hoy') {
      return true;
    }
    const start = clockMinutes(turno.hora);
    if (start === null) {
      return true;
    }
    return start + (turno.duracionMinutos || 30) > nowMinutes;
  });

  return upcoming ?? null;
}
