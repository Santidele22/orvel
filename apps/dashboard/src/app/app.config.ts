import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { SUPABASE_CLIENT } from '@orvel/booking/infrastructure';

import { routes } from './app.routes';
import { createSupabaseClient } from './core/runtime/supabase-client';
import {
  ACTIVE_BUSINESS_ID_SOURCE,
  BUSINESS_PROFESSIONALS_SOURCE,
  BUSINESS_SETTINGS_SOURCE,
  PUBLIC_BUSINESS_DIRECTORY_SOURCE,
  WORKING_HOURS_DEFAULTS_SOURCE
} from './core/business/business-directory.ports';
import { BusinessService } from './core/business/business.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideServiceWorker('/dashboard/orvel-push-sw.js', {
      enabled: !isDevMode(),
      scope: '/dashboard/',
      registrationStrategy: 'registerImmediately'
    }),
    { provide: SUPABASE_CLIENT, useFactory: createSupabaseClient },
    // Business directory read ports: the settings feature owns the
    // implementation, everyone else consumes these contracts.
    { provide: BUSINESS_SETTINGS_SOURCE, useExisting: BusinessService },
    { provide: ACTIVE_BUSINESS_ID_SOURCE, useExisting: BusinessService },
    { provide: BUSINESS_PROFESSIONALS_SOURCE, useExisting: BusinessService },
    { provide: WORKING_HOURS_DEFAULTS_SOURCE, useExisting: BusinessService },
    { provide: PUBLIC_BUSINESS_DIRECTORY_SOURCE, useExisting: BusinessService }
  ]
};
