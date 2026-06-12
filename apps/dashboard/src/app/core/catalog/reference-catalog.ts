export type CatalogPlan = {
  code: string;
  label: string;
  maxLocales: number;
  maxRubros: number;
  maxMonthlyBookings: number | null;
  aiCreditsMonthly: number;
};

export type CatalogAddOn = {
  code: string;
  label: string;
  priceMonthlyCents: number;
  billingCadence: 'monthly';
};

export type CatalogBusinessType = {
  code: string;
  label: string;
  themeKey: string;
  sortOrder: number;
  defaultCapacity: number;
};

export type DashboardReferenceCatalog = {
  plans: CatalogPlan[];
  addOns: CatalogAddOn[];
  planAliases: Array<{ alias: string; planCode: string }>;
  businessTypes: CatalogBusinessType[];
  businessTypeAliases: Array<{ alias: string; businessTypeCode: string }>;
  planBusinessTypes: Array<{ planCode: string; businessTypeCode: string }>;
};

type RawObject = Record<string, unknown>;

const EMPTY_CATALOG: DashboardReferenceCatalog = {
  plans: [],
  addOns: [],
  planAliases: [],
  businessTypes: [],
  businessTypeAliases: [],
  planBusinessTypes: []
};

// Explicit fixture/dev fallback only. Productive catalog reads must use the
// Supabase get_dashboard_reference_catalog RPC via reference-catalog.gateway.ts.
export const DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE_PAYLOAD = {
  plans: [
    { code: 'FREE', name: 'Free', max_locales: 1, max_rubros: 1, max_monthly_bookings: 15, ai_credits_monthly: 0 },
    { code: 'STARTER', name: 'Starter', max_locales: 1, max_rubros: 2, max_monthly_bookings: null, ai_credits_monthly: 100 },
    { code: 'GROWTH', name: 'Growth', max_locales: 1, max_rubros: 5, max_monthly_bookings: null, ai_credits_monthly: 500 },
    { code: 'PRO', name: 'Pro', max_locales: 1, max_rubros: 10, max_monthly_bookings: null, ai_credits_monthly: 2000 }
  ],
  add_ons: [
    { code: 'MULTI_BRANCH', label: 'Sucursales adicionales / Multi-sucursal', price_monthly_cents: 2_000_000, billing_cadence: 'monthly' },
    { code: 'EXTRA_BRANCH', label: 'Sucursal adicional', price_monthly_cents: 2_000_000, billing_cadence: 'monthly' }
  ],
  plan_aliases: [
    { alias: 'STARTER', plan_code: 'STARTER' },
    { alias: 'BASIC', plan_code: 'STARTER' },
    { alias: 'MEDIUM', plan_code: 'GROWTH' }
  ],
  business_types: [
    { code: 'peluqueria', label: 'Peluquería', theme_key: 'beauty', sort_order: 10, default_capacity: 2 },
    { code: 'unas', label: 'Uñas', theme_key: 'beauty', sort_order: 20, default_capacity: 1 },
    { code: 'barberia', label: 'Barbería', theme_key: 'beauty', sort_order: 30, default_capacity: 2 },
    { code: 'spa', label: 'Spa', theme_key: 'wellness', sort_order: 40, default_capacity: 2 },
    { code: 'pestanas', label: 'Pestañas', theme_key: 'beauty', sort_order: 50, default_capacity: 1 },
    { code: 'cejas', label: 'Cejas', theme_key: 'beauty', sort_order: 60, default_capacity: 1 },
    { code: 'masajes', label: 'Masajes', theme_key: 'wellness', sort_order: 70, default_capacity: 1 },
    { code: 'otro', label: 'Otro', theme_key: 'default', sort_order: 999, default_capacity: 1 }
  ],
  business_type_aliases: [
    { alias: 'peluquería', business_type_code: 'peluqueria' },
    { alias: 'peluqueria', business_type_code: 'peluqueria' },
    { alias: 'uñas', business_type_code: 'unas' },
    { alias: 'unas', business_type_code: 'unas' },
    { alias: 'barbería', business_type_code: 'barberia' },
    { alias: 'barberia', business_type_code: 'barberia' },
    { alias: 'spa', business_type_code: 'spa' },
    { alias: 'pestañas', business_type_code: 'pestanas' },
    { alias: 'pestanas', business_type_code: 'pestanas' },
    { alias: 'cejas', business_type_code: 'cejas' },
    { alias: 'masajes', business_type_code: 'masajes' },
    { alias: 'otro', business_type_code: 'otro' }
  ],
  plan_business_types: [
    { plan_code: 'FREE', business_type_code: 'peluqueria' },
    { plan_code: 'FREE', business_type_code: 'unas' },
    { plan_code: 'FREE', business_type_code: 'barberia' },
    { plan_code: 'FREE', business_type_code: 'spa' },
    { plan_code: 'FREE', business_type_code: 'pestanas' },
    { plan_code: 'FREE', business_type_code: 'cejas' },
    { plan_code: 'FREE', business_type_code: 'masajes' },
    { plan_code: 'FREE', business_type_code: 'otro' },
    { plan_code: 'STARTER', business_type_code: 'peluqueria' },
    { plan_code: 'STARTER', business_type_code: 'unas' },
    { plan_code: 'STARTER', business_type_code: 'barberia' },
    { plan_code: 'STARTER', business_type_code: 'spa' },
    { plan_code: 'STARTER', business_type_code: 'pestanas' },
    { plan_code: 'STARTER', business_type_code: 'cejas' },
    { plan_code: 'STARTER', business_type_code: 'masajes' },
    { plan_code: 'STARTER', business_type_code: 'otro' },
    { plan_code: 'GROWTH', business_type_code: 'peluqueria' },
    { plan_code: 'GROWTH', business_type_code: 'unas' },
    { plan_code: 'GROWTH', business_type_code: 'barberia' },
    { plan_code: 'GROWTH', business_type_code: 'spa' },
    { plan_code: 'GROWTH', business_type_code: 'pestanas' },
    { plan_code: 'GROWTH', business_type_code: 'cejas' },
    { plan_code: 'GROWTH', business_type_code: 'masajes' },
    { plan_code: 'GROWTH', business_type_code: 'otro' },
    { plan_code: 'PRO', business_type_code: 'peluqueria' },
    { plan_code: 'PRO', business_type_code: 'unas' },
    { plan_code: 'PRO', business_type_code: 'barberia' },
    { plan_code: 'PRO', business_type_code: 'spa' },
    { plan_code: 'PRO', business_type_code: 'pestanas' },
    { plan_code: 'PRO', business_type_code: 'cejas' },
    { plan_code: 'PRO', business_type_code: 'masajes' },
    { plan_code: 'PRO', business_type_code: 'otro' }
  ]
};

export const DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE = normalizeDashboardReferenceCatalog(
  DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE_PAYLOAD
);

function asObject(value: unknown): RawObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as RawObject) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readArray(source: RawObject, camelKey: string, snakeKey: string): unknown[] {
  return asArray(source[camelKey] ?? source[snakeKey]);
}

function readString(source: RawObject, camelKey: string, snakeKey = camelKey): string {
  const value = source[camelKey] ?? source[snakeKey];
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(source: RawObject, camelKey: string, snakeKey: string, fallback = 0): number {
  const value = source[camelKey] ?? source[snakeKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readNullableNumber(source: RawObject, camelKey: string, snakeKey: string): number | null {
  const value = source[camelKey] ?? source[snakeKey];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const code = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  return code ? code : null;
}

function normalizeLowerAsciiCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const code = value
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return code ? code : null;
}

function normalizeBusinessTypeCode(value: unknown, forceUppercase = false): string | null {
  const lowerCode = normalizeLowerAsciiCode(value);
  if (!lowerCode) {
    return null;
  }

  return forceUppercase || lowerCode.includes('_') ? lowerCode.toUpperCase() : lowerCode;
}

function normalizeBusinessTypeAlias(value: unknown, businessTypeCode: string, forceUppercase = false): string | null {
  const lowerCode = normalizeLowerAsciiCode(value);
  if (!lowerCode) {
    return null;
  }

  return forceUppercase || businessTypeCode.includes('_') ? lowerCode.toUpperCase() : lowerCode;
}

function normalizeUnique<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function normalizeDashboardReferenceCatalog(input: unknown): DashboardReferenceCatalog {
  const source = asObject(input);
  const rawBusinessTypes = readArray(source, 'businessTypes', 'business_types');
  const forceUppercaseBusinessTypeCodes = rawBusinessTypes
    .map(asObject)
    .some((businessType) => readString(businessType, 'code').includes('_'));

  const plans = normalizeUnique(
    readArray(source, 'plans', 'plans')
      .map(asObject)
      .map((plan): CatalogPlan | null => {
        const code = normalizeCode(readString(plan, 'code'));
        if (!code) {
          return null;
        }
        return {
          code,
          label: readString(plan, 'label') || readString(plan, 'name') || code,
          maxLocales: readNumber(plan, 'maxLocales', 'max_locales'),
          maxRubros: readNumber(plan, 'maxRubros', 'max_rubros'),
          maxMonthlyBookings: readNullableNumber(plan, 'maxMonthlyBookings', 'max_monthly_bookings'),
          aiCreditsMonthly: readNumber(plan, 'aiCreditsMonthly', 'ai_credits_monthly')
        };
      })
      .filter((plan): plan is CatalogPlan => plan !== null),
    (plan) => plan.code
  );

  const addOns = normalizeUnique(
    readArray(source, 'addOns', 'add_ons')
      .map(asObject)
      .map((addOn): CatalogAddOn | null => {
        const code = normalizeCode(readString(addOn, 'code'));
        if (!code) {
          return null;
        }

        return {
          code,
          label: readString(addOn, 'label') || readString(addOn, 'name') || code,
          priceMonthlyCents: readNumber(addOn, 'priceMonthlyCents', 'price_monthly_cents'),
          billingCadence: 'monthly'
        };
      })
      .filter((addOn): addOn is CatalogAddOn => addOn !== null),
    (addOn) => addOn.code
  );

  const planAliases = normalizeUnique(
    readArray(source, 'planAliases', 'plan_aliases')
      .map(asObject)
      .map((aliasRow) => {
        const alias = normalizeCode(readString(aliasRow, 'alias'));
        const planCode = normalizeCode(readString(aliasRow, 'planCode', 'plan_code'));
        return alias && planCode ? { alias, planCode } : null;
      })
      .filter((alias): alias is { alias: string; planCode: string } => alias !== null),
    (alias) => alias.alias
  );

  const businessTypes = normalizeUnique(
    rawBusinessTypes
      .map(asObject)
      .map((businessType): CatalogBusinessType | null => {
        const code = normalizeBusinessTypeCode(readString(businessType, 'code'), forceUppercaseBusinessTypeCodes);
        if (!code) {
          return null;
        }
        return {
          code,
          label: readString(businessType, 'label') || code,
          themeKey: readString(businessType, 'themeKey', 'theme_key') || 'default',
          sortOrder: readNumber(businessType, 'sortOrder', 'sort_order'),
          defaultCapacity: readNumber(businessType, 'defaultCapacity', 'default_capacity', 1)
        };
      })
      .filter((businessType): businessType is CatalogBusinessType => businessType !== null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code)),
    (businessType) => businessType.code
  );

  const businessTypeAliases = normalizeUnique(
    readArray(source, 'businessTypeAliases', 'business_type_aliases')
      .map(asObject)
      .map((aliasRow) => {
        const businessTypeCode = normalizeBusinessTypeCode(
          readString(aliasRow, 'businessTypeCode', 'business_type_code'),
          forceUppercaseBusinessTypeCodes
        );
        const alias = normalizeBusinessTypeAlias(
          readString(aliasRow, 'alias'),
          businessTypeCode ?? '',
          forceUppercaseBusinessTypeCodes
        );
        return alias && businessTypeCode ? { alias, businessTypeCode } : null;
      })
      .filter((alias): alias is { alias: string; businessTypeCode: string } => alias !== null),
    (alias) => alias.alias
  );

  const planBusinessTypes = normalizeUnique(
    readArray(source, 'planBusinessTypes', 'plan_business_types')
      .map(asObject)
      .map((row) => {
        const planCode = normalizeCode(readString(row, 'planCode', 'plan_code'));
        const businessTypeCode = normalizeBusinessTypeCode(
          readString(row, 'businessTypeCode', 'business_type_code'),
          forceUppercaseBusinessTypeCodes
        );
        return planCode && businessTypeCode ? { planCode, businessTypeCode } : null;
      })
      .filter((row): row is { planCode: string; businessTypeCode: string } => row !== null),
    (row) => `${row.planCode}:${row.businessTypeCode}`
  );

  return { ...EMPTY_CATALOG, plans, addOns, planAliases, businessTypes, businessTypeAliases, planBusinessTypes };
}

export function resolvePlanCodeFromCatalog(catalog: DashboardReferenceCatalog, value: unknown): string | null {
  const normalized = normalizeCode(value);
  if (!normalized) {
    return null;
  }

  if (catalog.plans.some((plan) => plan.code === normalized)) {
    return normalized;
  }

  return catalog.planAliases.find((alias) => alias.alias === normalized)?.planCode ?? null;
}

export function resolveBusinessTypeCodeFromCatalog(catalog: DashboardReferenceCatalog, value: unknown): string | null {
  const normalized = normalizeBusinessTypeCode(value);
  if (!normalized) {
    return null;
  }

  if (catalog.businessTypes.some((businessType) => businessType.code === normalized)) {
    return normalized;
  }

  const alternateCasing = normalized === normalized.toUpperCase() ? normalized.toLowerCase() : normalized.toUpperCase();

  return (
    catalog.businessTypeAliases.find((alias) => alias.alias === normalized || alias.alias === alternateCasing)
      ?.businessTypeCode ?? null
  );
}

export function getPlanEntitlementsFromCatalog(
  catalog: DashboardReferenceCatalog,
  plan: unknown
): Omit<CatalogPlan, 'code' | 'label'> | null {
  const planCode = resolvePlanCodeFromCatalog(catalog, plan);
  const catalogPlan = catalog.plans.find((item) => item.code === planCode);
  if (!catalogPlan) {
    return null;
  }

  return {
    maxLocales: catalogPlan.maxLocales,
    maxRubros: catalogPlan.maxRubros,
    maxMonthlyBookings: catalogPlan.maxMonthlyBookings,
    aiCreditsMonthly: catalogPlan.aiCreditsMonthly
  };
}

export function getCatalogAddOn(catalog: DashboardReferenceCatalog, addOnCode: unknown): CatalogAddOn | null {
  const code = normalizeCode(addOnCode);
  if (!code) {
    return null;
  }

  return catalog.addOns.find((addOn) => addOn.code === code) ?? null;
}

export function getAllowedBusinessTypesForPlan(catalog: DashboardReferenceCatalog, plan: unknown): CatalogBusinessType[] {
  const planCode = resolvePlanCodeFromCatalog(catalog, plan);
  if (!planCode) {
    return [];
  }

  const allowedCodes = new Set(
    catalog.planBusinessTypes.filter((row) => row.planCode === planCode).map((row) => row.businessTypeCode)
  );

  return catalog.businessTypes.filter((businessType) => allowedCodes.has(businessType.code));
}

export function getDefaultDashboardReferenceCatalog(): DashboardReferenceCatalog {
  return DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE;
}
