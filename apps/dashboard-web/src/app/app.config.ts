import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { SUPABASE_CLIENT } from '@orvel/booking/infrastructure';

import { routes } from './app.routes';
import { createSupabaseClient } from '@orvel/dashboard-core/adapters/supabase/supabase-client';
import {
  ACTIVE_BUSINESS_ID_SOURCE,
  BUSINESS_PROFESSIONALS_SOURCE,
  BUSINESS_SETTINGS_SOURCE,
  PUBLIC_BUSINESS_DIRECTORY_SOURCE,
  WORKING_HOURS_DEFAULTS_SOURCE
} from '@orvel/dashboard-core/business/business-directory.ports';
import { BusinessService } from '../../../dashboard/src/app/features/settings/data-access/business.service';

/**
 * Fase 3 of #1098 — the web target's providers.
 *
 * Same bindings as the PWA (`apps/dashboard/src/app/app.config.ts`) **except** `provideServiceWorker`:
 * the web build must not register a service worker, and the artifact contract test proves it does
 * not ship one either.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    { provide: SUPABASE_CLIENT, useFactory: createSupabaseClient },
    // Business directory read ports: the settings feature owns the implementation.
    { provide: BUSINESS_SETTINGS_SOURCE, useExisting: BusinessService },
    { provide: ACTIVE_BUSINESS_ID_SOURCE, useExisting: BusinessService },
    { provide: BUSINESS_PROFESSIONALS_SOURCE, useExisting: BusinessService },
    { provide: WORKING_HOURS_DEFAULTS_SOURCE, useExisting: BusinessService },
    { provide: PUBLIC_BUSINESS_DIRECTORY_SOURCE, useExisting: BusinessService }
  ]
};
