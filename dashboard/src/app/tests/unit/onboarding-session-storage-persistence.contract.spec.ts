import { describe, expect, it } from 'vitest';

type RubroSlug = 'peluqueria' | 'unas' | 'pestanas' | 'barberia' | 'spa';

type OnboardingCatalog = {
  categories: Array<{ slug?: string; name: string }>;
  services: Array<{
    slug?: string;
    name: string;
    categorySlug?: string;
    baseDurationMinutes: number;
  }>;
};

type OnboardingState = {
  selectedRubros: RubroSlug[];
  selectedTemplateIds: string[];
  preloadedCatalog: OnboardingCatalog;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type PersistOnboardingStateFn = (storage: StorageLike, state: OnboardingState) => void;
type ReadOnboardingStateFn = (storage: StorageLike) => OnboardingState;

async function loadStorageModule(): Promise<{
  ONBOARDING_STORAGE_KEY: string;
  persistOnboardingState: PersistOnboardingStateFn;
  readOnboardingState: ReadOnboardingStateFn;
}> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/onboarding/data-access/onboarding-storage');
  } catch {
    throw new Error(
      'Missing module src/app/features/onboarding/data-access/onboarding-storage.ts with ONBOARDING_STORAGE_KEY, persistOnboardingState(storage, state), readOnboardingState(storage).'
    );
  }

  const ONBOARDING_STORAGE_KEY = module['ONBOARDING_STORAGE_KEY'] as string | undefined;
  const persistOnboardingState = module['persistOnboardingState'] as PersistOnboardingStateFn | undefined;
  const readOnboardingState = module['readOnboardingState'] as ReadOnboardingStateFn | undefined;

  if (!ONBOARDING_STORAGE_KEY || !persistOnboardingState || !readOnboardingState) {
    throw new Error(
      'Missing exports ONBOARDING_STORAGE_KEY, persistOnboardingState(storage, state), readOnboardingState(storage) in src/app/features/onboarding/data-access/onboarding-storage.ts'
    );
  }

  return { ONBOARDING_STORAGE_KEY, persistOnboardingState, readOnboardingState };
}

function createMemoryStorage(seed?: Record<string, string>): StorageLike {
  const map = new Map<string, string>(Object.entries(seed ?? {}));

  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    }
  };
}

describe('TDD contract: onboarding session/storage persistence (landing -> dashboard mock)', () => {
  it('persists selectedRubros, selectedTemplateIds and preloaded catalog', async () => {
    const { ONBOARDING_STORAGE_KEY, persistOnboardingState, readOnboardingState } = await loadStorageModule();
    const storage = createMemoryStorage();

    const state: OnboardingState = {
      selectedRubros: ['peluqueria', 'unas', 'spa'],
      selectedTemplateIds: ['tpl-peluqueria-base', 'tpl-unas-base'],
      preloadedCatalog: {
        categories: [
          { slug: 'cortes', name: 'Cortes' },
          { slug: 'manicuria', name: 'Manicuría' }
        ],
        services: [
          { slug: 'corte-dama', name: 'Corte Dama', categorySlug: 'cortes', baseDurationMinutes: 45 },
          {
            slug: 'semi-permanente',
            name: 'Semi permanente',
            categorySlug: 'manicuria',
            baseDurationMinutes: 60
          }
        ]
      }
    };

    persistOnboardingState(storage, state);

    expect(storage.getItem(ONBOARDING_STORAGE_KEY)).toBeTypeOf('string');
    expect(readOnboardingState(storage)).toEqual(state);
  });

  it('survives handoff between landing and dashboard by reading same payload', async () => {
    const { ONBOARDING_STORAGE_KEY, persistOnboardingState, readOnboardingState } = await loadStorageModule();
    const landingStorage = createMemoryStorage();

    const state: OnboardingState = {
      selectedRubros: ['pestanas', 'barberia'],
      selectedTemplateIds: ['tpl-pestanas-base', 'tpl-barberia-base'],
      preloadedCatalog: {
        categories: [{ slug: 'mirada', name: 'Mirada' }],
        services: [
          { slug: 'lifting', name: 'Lifting de pestañas', categorySlug: 'mirada', baseDurationMinutes: 75 }
        ]
      }
    };

    persistOnboardingState(landingStorage, state);

    const raw = landingStorage.getItem(ONBOARDING_STORAGE_KEY);
    const dashboardStorage = createMemoryStorage(raw ? { [ONBOARDING_STORAGE_KEY]: raw } : undefined);

    expect(readOnboardingState(dashboardStorage)).toEqual(state);
  });

  it('returns safe empty defaults when storage payload is missing or corrupted', async () => {
    const { ONBOARDING_STORAGE_KEY, readOnboardingState } = await loadStorageModule();

    const emptyStorage = createMemoryStorage();
    expect(readOnboardingState(emptyStorage)).toEqual({
      selectedRubros: [],
      selectedTemplateIds: [],
      preloadedCatalog: { categories: [], services: [] }
    });

    const brokenStorage = createMemoryStorage({ [ONBOARDING_STORAGE_KEY]: '{not-json' });
    expect(readOnboardingState(brokenStorage)).toEqual({
      selectedRubros: [],
      selectedTemplateIds: [],
      preloadedCatalog: { categories: [], services: [] }
    });
  });
});
