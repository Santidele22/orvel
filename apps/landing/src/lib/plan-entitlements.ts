export type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';

export type PlanEntitlements = {
  maxLocales: number;
  maxRubros: number;
};

export const PLAN_ENTITLEMENTS: Record<PlanCode, PlanEntitlements> = {
  FREE: {
    maxLocales: 1,
    maxRubros: 1
  },
  BASIC: {
    maxLocales: 1,
    maxRubros: 3
  },
  MEDIUM: {
    maxLocales: 1,
    maxRubros: 4
  },
  PRO: {
    maxLocales: 1,
    maxRubros: 5
  }
};

const PLAN_CONTEXT_QUERY_KEYS = ['plan', 'planCode', 'tier'] as const;
const PLAN_CONTEXT_STORAGE_KEYS = ['orvel.signup.plan', 'orvel.plan', 'plan'] as const;

type BrowserStorageLike = {
  getItem: (key: string) => string | null;
};

export function resolvePlanCode(rawPlan: unknown): PlanCode {
  if (typeof rawPlan !== 'string') {
    return 'FREE';
  }

  const normalizedPlan = rawPlan.trim().toUpperCase();
  if (normalizedPlan === 'STARTED' || normalizedPlan === 'STARTER') {
    return 'BASIC';
  }

  if (normalizedPlan === 'GROWTH') {
    return 'MEDIUM';
  }

  if (normalizedPlan in PLAN_ENTITLEMENTS) {
    return normalizedPlan as PlanCode;
  }

  return 'FREE';
}

export function getPlanEntitlements(rawPlan: unknown): PlanEntitlements {
  return PLAN_ENTITLEMENTS[resolvePlanCode(rawPlan)];
}

export function resolvePlanCodeFromContext(input: {
  searchParams?: URLSearchParams;
  sessionStorage?: BrowserStorageLike;
  localStorage?: BrowserStorageLike;
}): PlanCode {
  const fromQuery = PLAN_CONTEXT_QUERY_KEYS.map((key) => input.searchParams?.get(key)).find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );

  if (fromQuery) {
    return resolvePlanCode(fromQuery);
  }

  const storages = [input.sessionStorage, input.localStorage].filter(
    (storage): storage is BrowserStorageLike => typeof storage?.getItem === 'function'
  );

  for (const storage of storages) {
    for (const key of PLAN_CONTEXT_STORAGE_KEYS) {
      const fromStorage = storage.getItem(key);
      if (typeof fromStorage === 'string' && fromStorage.trim().length > 0) {
        return resolvePlanCode(fromStorage);
      }
    }
  }

  return 'FREE';
}

export function formatPlanLimitCopy(plan: PlanCode): string {
  const { maxRubros } = getPlanEntitlements(plan);
  return `Plan ${plan}: seleccioná hasta ${maxRubros} rubro${maxRubros === 1 ? '' : 's'} o servicio${maxRubros === 1 ? '' : 's'}.`;
}

export function formatPlanLimitError(plan: PlanCode): string {
  const { maxRubros } = getPlanEntitlements(plan);
  return `Límite alcanzado para plan ${plan}: podés seleccionar hasta ${maxRubros} rubro${maxRubros === 1 ? '' : 's'}.`;
}
