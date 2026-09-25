import { inject, makeEnvironmentProviders } from '@angular/core';
import { BOOKING_QUERIES, SUPABASE_CLIENT, SupabaseBookingQueries } from '@orvel/booking/infrastructure';

export function provideBookingQueries() {
  return makeEnvironmentProviders([
    {
      provide: BOOKING_QUERIES,
      useFactory: () => new SupabaseBookingQueries(inject(SUPABASE_CLIENT))
    }
  ]);
}
