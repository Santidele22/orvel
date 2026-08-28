import { describe, expect, it } from 'vitest';
import { pickNextAppointment } from './pick-next-appointment';

function atHour(hours: number, minutes = 0): Date {
  const now = new Date(2026, 7, 28, hours, minutes, 0, 0);
  return now;
}

describe('pickNextAppointment', () => {
  it('returns null when featured is empty', () => {
    expect(pickNextAppointment([], atHour(15))).toBeNull();
  });

  it('picks a later today booking instead of an already-ended morning one', () => {
    const morning = { id: 'am', hora: '09:00', duracionMinutos: 30, dateLabel: 'Hoy' };
    const afternoon = { id: 'pm', hora: '16:30', duracionMinutos: 30, dateLabel: 'Hoy' };
    expect(pickNextAppointment([morning, afternoon], atHour(15))).toEqual(afternoon);
  });

  it('keeps an in-progress today booking', () => {
    const current = { id: 'now', hora: '14:45', duracionMinutos: 45, dateLabel: 'Hoy' };
    expect(pickNextAppointment([current], atHour(15))).toEqual(current);
  });

  it('returns null when every today booking already ended', () => {
    const morning = { id: 'am', hora: '09:00', duracionMinutos: 30, dateLabel: 'Hoy' };
    expect(pickNextAppointment([morning], atHour(15))).toBeNull();
  });

  it('skips ended today bookings in favor of tomorrow', () => {
    const morning = { id: 'am', hora: '09:00', duracionMinutos: 30, dateLabel: 'Hoy' };
    const tomorrow = { id: 'tm', hora: '10:00', duracionMinutos: 30, dateLabel: 'Mañana' };
    expect(pickNextAppointment([morning, tomorrow], atHour(15))).toEqual(tomorrow);
  });

  it('does not drop a later-today booking when fecha-style Date reconstruction would shift the day', () => {
    const later = { id: 'pm', hora: '23:59', duracionMinutos: 30, dateLabel: 'Hoy' };
    expect(pickNextAppointment([later], atHour(15))).toEqual(later);
  });
});
