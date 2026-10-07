import { describe, expect, it } from 'vitest';
import { buildPublicBookingUrl } from './public-booking-url';

describe('public booking URL helper (dashboard shim)', () => {
  it('canonicalises any hosted origin to the production one', () => {
    // #1133 retired qa: there is no pre-release origin to preserve any more.
    expect(buildPublicBookingUrl('mi-salon', 'https://qa.orvel.pro')).toBe(
      'https://orvel.pro/booking/mi-salon'
    );
  });
});
