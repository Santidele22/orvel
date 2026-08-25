import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode, inject } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { RealSupabaseBookingGateway, SUPABASE_CLIENT } from '@orvel/booking/infrastructure';

import { routes } from './app.routes';
import { provideBooking } from './features/booking/booking.providers';
import { createSupabaseClient } from './core/runtime/supabase-client';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideServiceWorker('/dashboard/orvel-push-sw.js', {
      enabled: !isDevMode(),
      scope: '/dashboard/',
      registrationStrategy: 'registerImmediately'
    }),
    { provide: SUPABASE_CLIENT, useFactory: createSupabaseClient },
    {
      provide: RealSupabaseBookingGateway,
      useFactory: () => new RealSupabaseBookingGateway(inject(SUPABASE_CLIENT))
    },
    provideBooking()
  ]
};
