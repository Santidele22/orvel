import { describe, expect, it, vi, afterEach } from 'vitest';

type AvailabilityModule = {
  computeAvailableSlots: (input: {
    date: string;
    serviceDurationMinutes: number;
    slotIntervalMinutes: number;
    bufferMinutes: number;
    minNoticeMinutes: number;
    workingWindows: Array<{ start: string; end: string }>;
    occupiedWindows: Array<{ start: string; end: string }>;
    now?: Date;
  }) => string[];
};

async function loadAvailabilityCore(): Promise<AvailabilityModule> {
  try {
    const mod = await import('../../features/booking/data-access/availability-core');
    return mod as AvailabilityModule;
  } catch {
    // TODO(Aurora): crear módulo puro availability-core con computeAvailableSlots y reglas deterministas
    throw new Error(
      'TODO(Aurora): falta src/app/features/booking/data-access/availability-core.ts con computeAvailableSlots()'
    );
  }
}

describe('Availability Core RED contract (pure logic)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates fixed slots for 15 and 30 minutes intervals', async () => {
    const { computeAvailableSlots } = await loadAvailabilityCore();

    const common = {
      date: '2026-04-20',
      serviceDurationMinutes: 30,
      bufferMinutes: 0,
      minNoticeMinutes: 0,
      workingWindows: [{ start: '09:00', end: '10:00' }],
      occupiedWindows: []
    };

    expect(computeAvailableSlots({ ...common, slotIntervalMinutes: 15 })).toEqual([
      '09:00',
      '09:15',
      '09:30'
    ]);

    expect(computeAvailableSlots({ ...common, slotIntervalMinutes: 30 })).toEqual(['09:00', '09:30']);
  });

  it('respects one or more working-hour windows', async () => {
    const { computeAvailableSlots } = await loadAvailabilityCore();

    const slots = computeAvailableSlots({
      date: '2026-04-20',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferMinutes: 0,
      minNoticeMinutes: 0,
      workingWindows: [
        { start: '09:00', end: '10:00' },
        { start: '11:00', end: '12:00' }
      ],
      occupiedWindows: []
    });

    expect(slots).toEqual(['09:00', '09:30', '11:00', '11:30']);
  });

  it('offers tuesday split intervals 09:00-13:30 and 16:00-20:00 for a 60-minute occupancy inside each window', async () => {
    const { computeAvailableSlots } = await loadAvailabilityCore();
    const { resolveWorkingDayIntervals } = await import(
      '../../features/settings/data-access/resolve-working-day-intervals'
    );

    const workingWindows = resolveWorkingDayIntervals({
      enabled: true,
      start: '09:00',
      end: '13:30',
      intervals: [
        { start: '09:00', end: '13:30' },
        { start: '16:00', end: '20:00' }
      ]
    });

    const slots = computeAvailableSlots({
      date: '2026-04-21',
      serviceDurationMinutes: 60,
      slotIntervalMinutes: 30,
      bufferMinutes: 0,
      minNoticeMinutes: 0,
      workingWindows,
      occupiedWindows: []
    });

    expect(slots).toContain('12:30');
    expect(slots).toContain('16:00');
    expect(slots).not.toContain('13:00');
    expect(slots).not.toContain('14:00');
    expect(slots).not.toContain('15:30');

    const halfHourSlots = computeAvailableSlots({
      date: '2026-04-21',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferMinutes: 0,
      minNoticeMinutes: 0,
      workingWindows,
      occupiedWindows: []
    });

    expect(halfHourSlots).toContain('13:00');
    expect(halfHourSlots).toContain('16:00');
    expect(halfHourSlots).not.toContain('14:00');
    expect(halfHourSlots).not.toContain('15:30');
  });

  it('applies buffer minutes around occupied windows before filtering collisions', async () => {
    const { computeAvailableSlots } = await loadAvailabilityCore();

    const slots = computeAvailableSlots({
      date: '2026-04-20',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 15,
      bufferMinutes: 15,
      minNoticeMinutes: 0,
      workingWindows: [{ start: '09:00', end: '12:00' }],
      occupiedWindows: [{ start: '10:00', end: '10:30' }]
    });

    expect(slots).toEqual(['09:00', '09:15', '10:45', '11:00', '11:15', '11:30']);
  });

  it('applies minimum booking notice relative to frozen now', async () => {
    const { computeAvailableSlots } = await loadAvailabilityCore();
    vi.useFakeTimers();
    // Canonical UTC policy (REQ-DOMAIN-1): anchor `now` at an explicit UTC
    // instant so the min-notice filter is deterministic in every timezone.
    vi.setSystemTime(new Date('2026-04-20T09:07:00Z'));

    const slots = computeAvailableSlots({
      date: '2026-04-20',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 15,
      bufferMinutes: 0,
      minNoticeMinutes: 30,
      workingWindows: [{ start: '09:00', end: '11:00' }],
      occupiedWindows: []
    });

    expect(slots).toEqual(['09:45', '10:00', '10:15', '10:30']);
  });

  it('excludes start times that collide with existing appointments', async () => {
    const { computeAvailableSlots } = await loadAvailabilityCore();

    const slots = computeAvailableSlots({
      date: '2026-04-20',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 15,
      bufferMinutes: 0,
      minNoticeMinutes: 0,
      workingWindows: [{ start: '09:00', end: '11:00' }],
      occupiedWindows: [{ start: '10:00', end: '10:30' }]
    });

    expect(slots).toEqual(['09:00', '09:15', '09:30', '10:30']);
  });

  it('handles boundaries and edge cases: no working hours and invalid ranges', async () => {
    const { computeAvailableSlots } = await loadAvailabilityCore();

    expect(
      computeAvailableSlots({
        date: '2026-04-20',
        serviceDurationMinutes: 30,
        slotIntervalMinutes: 30,
        bufferMinutes: 0,
        minNoticeMinutes: 0,
        workingWindows: [],
        occupiedWindows: []
      })
    ).toEqual([]);

    expect(() =>
      computeAvailableSlots({
        date: '2026-04-20',
        serviceDurationMinutes: 30,
        slotIntervalMinutes: 15,
        bufferMinutes: 0,
        minNoticeMinutes: 0,
        workingWindows: [{ start: '12:00', end: '11:00' }],
        occupiedWindows: []
      })
    ).toThrowError(/invalid|range|hora|window/i);

    expect(() =>
      computeAvailableSlots({
        date: '2026-04-20',
        serviceDurationMinutes: 30,
        slotIntervalMinutes: 15,
        bufferMinutes: 0,
        minNoticeMinutes: 0,
        workingWindows: [{ start: '09:00', end: '12:00' }],
        occupiedWindows: [{ start: '10:00', end: '10:00' }]
      })
    ).toThrowError(/invalid|range|hora|window/i);
  });
});
