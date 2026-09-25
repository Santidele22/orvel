import { sanitizeSelectedRubros } from './onboarding-rubros';
import {
  CatalogCategory,
  CatalogService,
  mergeTemplateCatalogs,
  sanitizeSelectedTemplateIds,
  TemplateCatalog
} from './onboarding-templates';

export const ONBOARDING_STORAGE_KEY = 'turnea.onboarding.v1';

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type OnboardingState = {
  selectedRubros: ReturnType<typeof sanitizeSelectedRubros>;
  selectedTemplateIds: string[];
  preloadedCatalog: TemplateCatalog;
  activeStep?: 'rubros' | 'templates' | 'review' | 'completed';
  stateVersion?: number;
  completedAt?: string;
};

const EMPTY_STATE: OnboardingState = {
  selectedRubros: [],
  selectedTemplateIds: [],
  preloadedCatalog: { categories: [], services: [] }
};

function sanitizeCatalog(input: unknown): TemplateCatalog {
  if (!input || typeof input !== 'object') {
    return { categories: [], services: [] };
  }

  const catalog = input as Partial<TemplateCatalog>;
  const categories: CatalogCategory[] = Array.isArray(catalog.categories)
    ? catalog.categories.filter((item): item is CatalogCategory => !!item && typeof item.name === 'string')
    : [];

  const services: CatalogService[] = Array.isArray(catalog.services)
    ? catalog.services.filter(
        (item): item is CatalogService =>
          !!item && typeof item.name === 'string' && Number.isFinite(item.baseDurationMinutes)
      )
    : [];

  return mergeTemplateCatalogs([{ categories, services }]);
}

function sanitizeOnboardingState(input: unknown): OnboardingState {
  if (!input || typeof input !== 'object') {
    return EMPTY_STATE;
  }

  const payload = input as Partial<OnboardingState>;

  const activeStep =
    payload.activeStep === 'rubros' ||
    payload.activeStep === 'templates' ||
    payload.activeStep === 'review' ||
    payload.activeStep === 'completed'
      ? payload.activeStep
      : undefined;
  const stateVersion = Number.isInteger(payload.stateVersion) && (payload.stateVersion as number) >= 0
    ? (payload.stateVersion as number)
    : undefined;
  const completedAt =
    typeof payload.completedAt === 'string' && payload.completedAt.trim().length > 0
      ? payload.completedAt.trim()
      : undefined;

  return {
    selectedRubros: sanitizeSelectedRubros(payload.selectedRubros),
    selectedTemplateIds: sanitizeSelectedTemplateIds(payload.selectedTemplateIds),
    preloadedCatalog: sanitizeCatalog(payload.preloadedCatalog),
    ...(activeStep ? { activeStep } : {}),
    ...(stateVersion !== undefined ? { stateVersion } : {}),
    ...(completedAt ? { completedAt } : {})
  };
}

export function persistOnboardingState(storage: StorageLike, state: OnboardingState): void {
  const sanitizedState = sanitizeOnboardingState(state);
  storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(sanitizedState));
}

export function readOnboardingState(storage: StorageLike): OnboardingState {
  try {
    const raw = storage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) {
      return EMPTY_STATE;
    }

    const parsed = JSON.parse(raw) as unknown;
    return sanitizeOnboardingState(parsed);
  } catch {
    return EMPTY_STATE;
  }
}

export type OnboardingResumeCheckpoint = {
  activeStep: 'rubros' | 'templates' | 'review' | 'completed';
  stateVersion: number;
  completedAt?: string;
};

export function persistOnboardingResumeCheckpoint(
  storage: StorageLike,
  state: OnboardingState,
  checkpoint: OnboardingResumeCheckpoint
): void {
  persistOnboardingState(storage, {
    ...state,
    activeStep: checkpoint.activeStep,
    stateVersion: checkpoint.stateVersion,
    completedAt: checkpoint.completedAt
  });
}

export function readOnboardingResumeCheckpoint(storage: StorageLike): OnboardingResumeCheckpoint {
  const state = readOnboardingState(storage);

  return {
    activeStep: state.activeStep ?? 'rubros',
    stateVersion: state.stateVersion ?? 0,
    completedAt: state.completedAt
  };
}
