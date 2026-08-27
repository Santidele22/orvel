import { inject, makeEnvironmentProviders } from '@angular/core';
import {
  BookingAvailabilityService,
  BookingCrudService,
  BookingNotificationsService,
  BookingSchedulingService,
  PublicBookingService
} from '@orvel/booking/application';
import {
  ADMIN_BOOKING_REPOSITORY,
  BOOKING_QUERIES,
  RealSupabaseBookingGateway,
  SUPABASE_CLIENT,
  SupabaseAdminBookingRepository,
  SupabaseBookingQueries
} from '@orvel/booking/infrastructure';
export { ADMIN_BOOKING_REPOSITORY, BOOKING_QUERIES };

export function provideBooking() {
  return makeEnvironmentProviders([
    {
      provide: ADMIN_BOOKING_REPOSITORY,
      useFactory: () => new SupabaseAdminBookingRepository(inject(SUPABASE_CLIENT))
    },
    {
      provide: BOOKING_QUERIES,
      useFactory: () => new SupabaseBookingQueries(inject(SUPABASE_CLIENT))
    },
    { provide: BookingCrudService, useFactory: () => new BookingCrudService(inject(ADMIN_BOOKING_REPOSITORY)) },
    { provide: BookingSchedulingService, useFactory: () => new BookingSchedulingService(inject(ADMIN_BOOKING_REPOSITORY)) },
    { provide: BookingAvailabilityService, useFactory: () => new BookingAvailabilityService(inject(ADMIN_BOOKING_REPOSITORY)) },
    { provide: BookingNotificationsService, useFactory: () => new BookingNotificationsService(inject(ADMIN_BOOKING_REPOSITORY)) },
    {
      provide: RealSupabaseBookingGateway,
      useFactory: () => new RealSupabaseBookingGateway(inject(SUPABASE_CLIENT))
    },
    { provide: PublicBookingService, useFactory: () => new PublicBookingService(inject(RealSupabaseBookingGateway)) }
  ]);
}
