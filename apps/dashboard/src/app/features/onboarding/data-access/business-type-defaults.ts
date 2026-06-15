import { normalizePlanCode, type CanonicalPlanCode } from '../../../core/plans/plan-entitlements';

export const ALLOWED_ONBOARDING_BUSINESS_TYPES = ['uñas', 'peluqueria', 'barberia', 'spa', 'pestañas', 'cejas', 'masajes', 'otro'] as const;

export type OnboardingBusinessType = (typeof ALLOWED_ONBOARDING_BUSINESS_TYPES)[number];

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

const BUSINESS_TYPE_CAPACITY: Record<OnboardingBusinessType, number> = {
  uñas: 1,
  peluqueria: 2,
  barberia: 2,
  spa: 2,
  pestañas: 1,
  cejas: 1,
  masajes: 1,
  otro: 1
};

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
  return typeof value === 'string' && (ALLOWED_ONBOARDING_BUSINESS_TYPES as readonly string[]).includes(value.trim().toLowerCase());
}

export function buildInitialBusinessSettingsForOnboarding(input: {
  businessId: string;
  businessName: string;
  businessType: OnboardingBusinessType;
  plan: unknown;
  now?: string;
}): InitialBusinessSettings {
  const normalizedBusinessName = input.businessName.trim();
  const slugSeed = `${slugify(normalizedBusinessName)}-${slugify(input.businessType)}`;

  return {
    businessId: input.businessId,
    businessType: input.businessType,
    businessName: normalizedBusinessName,
    slugSeed,
    plan: normalizePlanCode(input.plan),
    capacity: BUSINESS_TYPE_CAPACITY[input.businessType],
    bufferMinutes: 15,
    minNoticeMinutes: 120,
    slotIntervalMinutes: 30,
    workingHours: structuredClone(DEFAULT_WORKING_HOURS),
    updatedAt: input.now ?? new Date().toISOString()
  };
}
