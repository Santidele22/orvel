import { describe, expect, it } from 'vitest';
import { buildPublicBookingUrl, getPublicBookingOrigin } from '../public-booking-url';

describe('public booking URL helpers', () => {
  it('uses the canonical root domain for hosted dashboard origins', () => {
    expect(buildPublicBookingUrl('tatto-tu-cola-da4183d5', 'https://dashboard.orvel.pro')).toBe(
      'https://orvel.pro/booking/tatto-tu-cola-da4183d5'
    );
  });

  it('keeps local development booking links on the current local origin', () => {
    expect(getPublicBookingOrigin('http://localhost:4200')).toBe('http://localhost:4200');
    expect(buildPublicBookingUrl('mi-salon', 'http://127.0.0.1:4200')).toBe('http://127.0.0.1:4200/booking/mi-salon');
  });

  it('keeps the canonical public origin stable when the current origin is already orvel.pro', () => {
    expect(getPublicBookingOrigin('https://orvel.pro')).toBe('https://orvel.pro');
    expect(buildPublicBookingUrl('mi-salon', 'https://orvel.pro')).toBe('https://orvel.pro/booking/mi-salon');
  });

  it('keeps 0.0.0.0 booking links local for device testing', () => {
    expect(getPublicBookingOrigin('http://0.0.0.0:4200')).toBe('http://0.0.0.0:4200');
  });

  it('encodes unsafe slug segments instead of creating nested paths', () => {
    expect(buildPublicBookingUrl('salon centro/mañana libre', 'https://orvel.pro')).toBe(
      'https://orvel.pro/booking/salon%20centro%2Fma%C3%B1ana%20libre'
    );
  });
});
