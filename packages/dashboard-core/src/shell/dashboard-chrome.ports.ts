import { InjectionToken, type Type } from '@angular/core';

/**
 * Chrome contracts the dashboard shell needs from features it must not import.
 *
 * `shared/*` must not depend on `features/*`, so the shell injects these tokens
 * and the composition root (`dashboard-shell.routes.ts`) binds them to the
 * feature implementations. Every default is inert: with no provider the shell
 * simply renders without the operator tour.
 */
export interface DashboardTourPort {
  canAutoStart(): boolean;
  run(): Promise<void>;
}

/** Onboarding payload the shell needs to resolve the dashboard config. */
export interface DashboardOnboardingPayload {
  selectedRubros: string[];
  selectedTemplateIds: string[];
  preloadedCatalog: { categories: unknown[]; services: unknown[] };
}

export type DashboardOnboardingPayloadReader = (storage: Storage) => DashboardOnboardingPayload;

function emptyOnboardingPayload(): DashboardOnboardingPayload {
  return {
    selectedRubros: [],
    selectedTemplateIds: [],
    preloadedCatalog: { categories: [], services: [] }
  };
}

export const DASHBOARD_TOUR = new InjectionToken<DashboardTourPort | null>('DASHBOARD_TOUR', {
  factory: () => null
});

export const DASHBOARD_TOUR_HELP_COMPONENT = new InjectionToken<Type<unknown> | null>(
  'DASHBOARD_TOUR_HELP_COMPONENT',
  { factory: () => null }
);

export const DASHBOARD_ONBOARDING_PAYLOAD = new InjectionToken<DashboardOnboardingPayloadReader>(
  'DASHBOARD_ONBOARDING_PAYLOAD',
  // A fresh object per read: the default must not be a shared mutable singleton.
  { factory: () => () => emptyOnboardingPayload() }
);
