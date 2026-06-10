import { normalizePlanCode, type CanonicalPlanCode } from '../../../core/plans/plan-entitlements';
import {
  type CatalogBusinessType,
  resolveBusinessTypeCodeFromCatalog
} from '../../../core/catalog/reference-catalog';
import { getRuntimeReferenceCatalogSnapshot } from '../../../core/catalog/reference-catalog.gateway';
import type { BusinessTypeCode } from './onboarding-business-types-storage';

export type OnboardingBusinessType = BusinessTypeCode;

export type OnboardingWorkingHours = Record<string, { enabled: boolean; start: string; end: string }>;

export type InitialBusinessSettings = {
  businessId: string;
  businessType: OnboardingBusinessType;
  businessName: string;
  slugSeed: string;
  plan: CanonicalPlanCode;
  capacity: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  slotIntervalMinutes: number;
  workingHours: OnboardingWorkingHours;
  updatedAt: string;
};

const DEFAULT_WORKING_HOURS: OnboardingWorkingHours = {
  monday: { enabled: true, start: '09:00', end: '18:00' },
  tuesday: { enabled: true, start: '09:00', end: '18:00' },
  wednesday: { enabled: true, start: '09:00', end: '18:00' },
  thursday: { enabled: true, start: '09:00', end: '18:00' },
  friday: { enabled: true, start: '09:00', end: '18:00' },
  saturday: { enabled: true, start: '10:00', end: '14:00' },
  sunday: { enabled: false, start: '00:00', end: '00:00' }
};

const REFERENCE_CATALOG = getRuntimeReferenceCatalogSnapshot();

const onboardingBusinessTypeDisplayOrder: Record<string, number> = {
  unas: 10,
  peluqueria: 20,
  barberia: 30,
  spa: 40,
  pestanas: 50,
  cejas: 60,
  masajes: 70,
  otro: 80
};

const catalogAllowedOnboardingBusinessTypes = REFERENCE_CATALOG.businessTypes
  .slice()
  .sort(
    (left: CatalogBusinessType, right: CatalogBusinessType) =>
      (onboardingBusinessTypeDisplayOrder[left.code] ?? left.sortOrder) -
        (onboardingBusinessTypeDisplayOrder[right.code] ?? right.sortOrder) || left.sortOrder - right.sortOrder
  )
  .map((businessType: CatalogBusinessType) => businessType.code) as readonly OnboardingBusinessType[];

export { catalogAllowedOnboardingBusinessTypes as ALLOWED_ONBOARDING_BUSINESS_TYPES };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'onboarding-business';
}

export function isAllowedOnboardingBusinessType(value: unknown): value is OnboardingBusinessType {
  const resolved = resolveBusinessTypeCodeFromCatalog(REFERENCE_CATALOG, value);

  return (
    resolved !== null &&
    REFERENCE_CATALOG.businessTypes.some((businessType: CatalogBusinessType) => businessType.code === resolved)
  );
}

function normalizeOnboardingBusinessType(value: unknown): OnboardingBusinessType {
  const resolved = resolveBusinessTypeCodeFromCatalog(REFERENCE_CATALOG, value);
  const catalogBusinessType = REFERENCE_CATALOG.businessTypes.find(
    (businessType: CatalogBusinessType) => businessType.code === resolved
  );

  return (catalogBusinessType?.code.toLowerCase() ?? 'otro') as OnboardingBusinessType;
}

function getDefaultCapacityForBusinessType(businessType: OnboardingBusinessType): number {
  const resolved = resolveBusinessTypeCodeFromCatalog(REFERENCE_CATALOG, businessType);
  const defaultCapacity = REFERENCE_CATALOG.businessTypes.find(
    (type: CatalogBusinessType) => type.code === resolved
  )?.defaultCapacity;

  return typeof defaultCapacity === 'number' && Number.isFinite(defaultCapacity) ? defaultCapacity : 1;
}

export function buildInitialBusinessSettingsForOnboarding(input: {
  businessId: string;
  businessName: string;
  businessType: OnboardingBusinessType;
  plan: unknown;
  now?: string;
}): InitialBusinessSettings {
  const normalizedBusinessName = input.businessName.trim();
  const businessType = normalizeOnboardingBusinessType(input.businessType);
  const slugSeed = `${slugify(normalizedBusinessName)}-${slugify(businessType)}`;

  return {
    businessId: input.businessId,
    businessType,
    businessName: normalizedBusinessName,
    slugSeed,
    plan: normalizePlanCode(input.plan),
    capacity: getDefaultCapacityForBusinessType(businessType),
    bufferMinutes: 15,
    minNoticeMinutes: 120,
    slotIntervalMinutes: 30,
    workingHours: structuredClone(DEFAULT_WORKING_HOURS),
    updatedAt: input.now ?? new Date().toISOString()
  };
}
