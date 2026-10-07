import { describe, expect, it } from 'vitest';
import { buildPublicBookingUrl } from './public-booking-url';

describe('public booking URL helper (dashboard shim)', () => {
  it('keeps QA hosted booking links on the current QA origin', () => {
    expect(buildPublicBookingUrl('mi-salon', 'https://qa.orvel.pro')).toBe(
      'https://qa.orvel.pro/booking/mi-salon'
    );
  });
});
