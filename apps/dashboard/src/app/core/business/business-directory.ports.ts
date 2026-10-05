import { InjectionToken, type Signal } from '@angular/core';
import type { BusinessPublicView, BusinessSettings, WeekdayKey, WorkingDayHours } from '../../models/business.model';

/**
 * Read-model contracts for the business directory.
 *
 * `features/settings` owns the persistence and the settings form. Every other
 * consumer (booking, servicios, dashboard-home, perfil, operator-web-push, the
 * public turnero) only *reads* the directory, so it depends on these tokens
 * instead of importing the settings feature. `app.config.ts` binds them to the
 * feature implementation with `useExisting`.
 *
 * There is no inert default on purpose: an unbound token fails loudly at
 * injection time instead of silently degrading the caller.
 */

export type BusinessProfessionalSummary = {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  active: boolean;
  serviceIds: string[];
};

export type PublicDirectoryError = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type PublicDirectoryResponse<T> = {
  status: number;
  data?: T;
  error?: PublicDirectoryError;
};

export interface BusinessSettingsSource {
  readonly settings: Signal<BusinessSettings | null>;
  hasHydratedSnapshot(userId: string): boolean;
  /** Hydrates the settings signal for the signed-in user (idempotent). */
  loadFromSupabase(userId: string, forceReload?: boolean): Promise<void>;
}

export interface ActiveBusinessIdSource {
  getActiveBusinessId(candidateBusinessOrUserId?: string): Promise<string>;
}

export interface BusinessProfessionalsSource {
  listBusinessProfessionals(businessId: string): Promise<BusinessProfessionalSummary[]>;
}

export interface WorkingHoursDefaultsSource {
  getDefaultWorkingHours(): Record<WeekdayKey, WorkingDayHours>;
}

export interface PublicBusinessDirectorySource {
  resolveBusinessBySlug(businessSlug: string): Promise<PublicDirectoryResponse<BusinessPublicView>>;
  resolvePublicProfessional(
    businessSlug: string,
    professionalSlug: string
  ): Promise<{ id: string; name: string; slug: string; serviceIds: string[] } | null>;
  listPublicProfessionalsForService(
    businessSlug: string,
    serviceId: string
  ): Promise<Array<{ id: string; name: string }>>;
}

export const BUSINESS_SETTINGS_SOURCE = new InjectionToken<BusinessSettingsSource>(
  'BUSINESS_SETTINGS_SOURCE'
);
export const ACTIVE_BUSINESS_ID_SOURCE = new InjectionToken<ActiveBusinessIdSource>(
  'ACTIVE_BUSINESS_ID_SOURCE'
);
export const BUSINESS_PROFESSIONALS_SOURCE = new InjectionToken<BusinessProfessionalsSource>(
  'BUSINESS_PROFESSIONALS_SOURCE'
);
export const WORKING_HOURS_DEFAULTS_SOURCE = new InjectionToken<WorkingHoursDefaultsSource>(
  'WORKING_HOURS_DEFAULTS_SOURCE'
);
export const PUBLIC_BUSINESS_DIRECTORY_SOURCE = new InjectionToken<PublicBusinessDirectorySource>(
  'PUBLIC_BUSINESS_DIRECTORY_SOURCE'
);
