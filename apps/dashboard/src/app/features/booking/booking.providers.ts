import { inject, makeEnvironmentProviders } from '@angular/core';
import {
  ADMIN_BOOKING_REPOSITORY,
  SUPABASE_CLIENT,
  SupabaseAdminBookingRepository
} from '@orvel/booking/infrastructure';

export { ADMIN_BOOKING_REPOSITORY };

export function provideBooking() {
  return makeEnvironmentProviders([
    {
      provide: ADMIN_BOOKING_REPOSITORY,
      useFactory: () => new SupabaseAdminBookingRepository(inject(SUPABASE_CLIENT))
    }
  ]);
}
