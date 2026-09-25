import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { WeekdayKey, WorkingDayHours } from '../../models/business.model';
import { resolveWorkingHours } from '../../features/settings/data-access/map-nullable-settings-to-form-defaults';

const defaultHours: Record<WeekdayKey, WorkingDayHours> = {
  monday: { enabled: true, start: '09:00', end: '18:00' },
  tuesday: { enabled: true, start: '09:00', end: '18:00' },
  wednesday: { enabled: true, start: '09:00', end: '18:00' },
  thursday: { enabled: true, start: '09:00', end: '18:00' },
  friday: { enabled: true, start: '09:00', end: '18:00' },
  saturday: { enabled: true, start: '09:00', end: '18:00' },
  sunday: { enabled: false, start: '00:00', end: '00:00' }
};

const serviceTs = readFileSync(
  new URL('../../features/settings/data-access/business.service.ts', import.meta.url),
  'utf8'
);

describe('working hours merge stored days onto defaults', () => {
  it('maps empty working_hours to wednesday enabled 09:00-18:00', () => {
    const merged = resolveWorkingHours({}, defaultHours);

    expect(merged.wednesday).toEqual({ enabled: true, start: '09:00', end: '18:00' });
  });

  it('fills a missing wednesday key from defaults without overwriting monday', () => {
    const merged = resolveWorkingHours(
      { monday: { enabled: true, start: '08:00', end: '17:00' } },
      defaultHours
    );

    expect(merged.monday).toEqual({ enabled: true, start: '08:00', end: '17:00' });
    expect(merged.wednesday).toEqual({ enabled: true, start: '09:00', end: '18:00' });
  });

  it('preserves an explicit wednesday.enabled false', () => {
    const merged = resolveWorkingHours(
      { wednesday: { enabled: false, start: '09:00', end: '18:00' } },
      defaultHours
    );

    expect(merged.wednesday.enabled).toBe(false);
    expect(merged.monday).toEqual(defaultHours.monday);
  });

  it('maps public view working hours through the same merge instead of a truthy empty object', () => {
    expect(serviceTs).toMatch(/workingHours:\s*resolveWorkingHours\(/);
    expect(serviceTs).not.toMatch(
      /workingHours:\s*settings\?\.workingHours\s*\?\?\s*settings\?\.working_hours\s*\?\?\s*this\.getDefaultWorkingHours\(\)/
    );
  });
});
