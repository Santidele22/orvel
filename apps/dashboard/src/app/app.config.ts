import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { SUPABASE_CLIENT } from '@orvel/booking/infrastructure';

import { routes } from './app.routes';
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
    { provide: SUPABASE_CLIENT, useFactory: createSupabaseClient }
  ]
};
