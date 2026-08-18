import { inject, makeEnvironmentProviders } from '@angular/core';
import {
  BookingAvailabilityService,
  BookingCrudService,
  BookingNotificationsService,
  BookingSchedulingService
} from '@orvel/booking/application';
import {
  ADMIN_BOOKING_REPOSITORY,
  SUPABASE_CLIENT,
  SupabaseAdminBookingRepository
} from '@orvel/booking/infrastructure';
import { TurnoService } from './data-access/turno.facade';

export { ADMIN_BOOKING_REPOSITORY };

export function provideBooking() {
  return makeEnvironmentProviders([
    {
      provide: ADMIN_BOOKING_REPOSITORY,
      useFactory: () => new SupabaseAdminBookingRepository(inject(SUPABASE_CLIENT))
    },
    { provide: BookingCrudService, useFactory: () => new BookingCrudService(inject(ADMIN_BOOKING_REPOSITORY)) },
    { provide: BookingSchedulingService, useFactory: () => new BookingSchedulingService(inject(ADMIN_BOOKING_REPOSITORY)) },
    { provide: BookingAvailabilityService, useFactory: () => new BookingAvailabilityService(inject(ADMIN_BOOKING_REPOSITORY)) },
    { provide: BookingNotificationsService, useFactory: () => new BookingNotificationsService(inject(ADMIN_BOOKING_REPOSITORY)) },
    TurnoService
  ]);
}
