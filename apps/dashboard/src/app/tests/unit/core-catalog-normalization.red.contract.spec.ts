import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type CatalogPlan = {
  code: string;
  label: string;
  maxLocales: number;
  maxRubros: number;
  maxMonthlyBookings: number | null;
  aiCreditsMonthly: number;
};

type CatalogBusinessType = {
  code: string;
  label: string;
  themeKey: string;
  sortOrder: number;
};

type DashboardReferenceCatalog = {
  plans: CatalogPlan[];
  planAliases: Array<{ alias: string; planCode: string }>;
  businessTypes: CatalogBusinessType[];
  businessTypeAliases: Array<{ alias: string; businessTypeCode: string }>;
  planBusinessTypes: Array<{ planCode: string; businessTypeCode: string }>;
};

type CatalogModule = {
  normalizeDashboardReferenceCatalog: (input: unknown) => DashboardReferenceCatalog;
  resolvePlanCodeFromCatalog: (catalog: DashboardReferenceCatalog, value: unknown) => string | null;
  resolveBusinessTypeCodeFromCatalog: (catalog: DashboardReferenceCatalog, value: unknown) => string | null;
  getPlanEntitlementsFromCatalog: (catalog: DashboardReferenceCatalog, plan: unknown) => Omit<
    CatalogPlan,
    'code' | 'label'
  > | null;
  getAllowedBusinessTypesForPlan: (catalog: DashboardReferenceCatalog, plan: unknown) => CatalogBusinessType[];
};

const rawCatalogFromSupabase = {
  plans: [
    {
      code: 'starter',
      name: 'Starter',
      max_locales: 1,
      max_rubros: 2,
      max_monthly_bookings: null,
      ai_credits_monthly: 100
    },
    {
      code: 'growth',
      name: 'Growth',
      max_locales: 3,
      max_rubros: 5,
      max_monthly_bookings: null,
      ai_credits_monthly: 500
    }
  ],
  plan_aliases: [
    { alias: 'basic', plan_code: 'starter' },
    { alias: 'medium', plan_code: 'growth' }
  ],
  business_types: [
    { code: 'hair_salon', label: 'Peluquería', theme_key: 'zen', sort_order: 2 },
    { code: 'barber_shop', label: 'Barbería', theme_key: 'zen', sort_order: 1 },
    { code: 'spa', label: 'Spa', theme_key: 'zen', sort_order: 3 }
  ],
  business_type_aliases: [{ alias: 'peluqueria', business_type_code: 'hair_salon' }],
  plan_business_types: [
    { plan_code: 'starter', business_type_code: 'barber_shop' },
    { plan_code: 'starter', business_type_code: 'hair_salon' },
    { plan_code: 'growth', business_type_code: 'barber_shop' },
    { plan_code: 'growth', business_type_code: 'hair_salon' },
    { plan_code: 'growth', business_type_code: 'spa' }
  ]
};

async function loadCatalogModule(): Promise<CatalogModule> {
  try {
    return (await import('../../core/catalog/reference-catalog')) as CatalogModule;
  } catch {
    throw new Error(
      'TODO(BB-8): add src/app/core/catalog/reference-catalog.ts with normalization and alias helpers backed by get_dashboard_reference_catalog(), not hardcoded plan/business-type matrices.'
    );
  }
}

describe('RED contract: core catalog normalization and consumers', () => {
  it('normalizes Supabase snake_case catalog payload into canonical frontend shapes', async () => {
    const catalogModule = await loadCatalogModule();

    const catalog = catalogModule.normalizeDashboardReferenceCatalog(rawCatalogFromSupabase);

    expect(catalog.plans).toEqual([
      {
        code: 'STARTER',
        label: 'Starter',
        maxLocales: 1,
        maxRubros: 2,
        maxMonthlyBookings: null,
        aiCreditsMonthly: 100
      },
      {
        code: 'GROWTH',
        label: 'Growth',
        maxLocales: 3,
        maxRubros: 5,
        maxMonthlyBookings: null,
        aiCreditsMonthly: 500
      }
    ]);
    expect(catalog.businessTypes.map((type) => type.code)).toEqual(['BARBER_SHOP', 'HAIR_SALON', 'SPA']);
    expect(catalog.planAliases).toContainEqual({ alias: 'BASIC', planCode: 'STARTER' });
    expect(catalog.businessTypeAliases).toContainEqual({ alias: 'PELUQUERIA', businessTypeCode: 'HAIR_SALON' });
  });

  it('resolves plans, entitlements, and allowed business types from catalog aliases only', async () => {
    const catalogModule = await loadCatalogModule();
    const catalog = catalogModule.normalizeDashboardReferenceCatalog(rawCatalogFromSupabase);

    expect(catalogModule.resolvePlanCodeFromCatalog(catalog, ' BASIC ')).toBe('STARTER');
    expect(catalogModule.resolvePlanCodeFromCatalog(catalog, 'medium')).toBe('GROWTH');
    expect(catalogModule.resolvePlanCodeFromCatalog(catalog, 'enterprise')).toBeNull();

    expect(catalogModule.getPlanEntitlementsFromCatalog(catalog, 'medium')).toEqual({
      maxLocales: 3,
      maxRubros: 5,
      maxMonthlyBookings: null,
      aiCreditsMonthly: 500
    });

    expect(catalogModule.resolveBusinessTypeCodeFromCatalog(catalog, 'peluqueria')).toBe('HAIR_SALON');
    expect(catalogModule.getAllowedBusinessTypesForPlan(catalog, 'basic').map((type) => type.code)).toEqual([
      'BARBER_SHOP',
      'HAIR_SALON'
    ]);
  });

  it('migrates onboarding consumers away from hardcoded plan/business-type matrices', () => {
    const dashboardRoot = process.cwd();
    const consumerFiles = [
      'src/app/features/onboarding/pages/signup-business-types-step.page.ts',
      'src/app/features/onboarding/data-access/business-type-defaults.ts',
      'src/app/features/onboarding/data-access/onboarding-plan-rules.ts',
      'src/app/features/onboarding/data-access/landing-dashboard-onboarding-wiring.flow.ts'
    ];

    for (const relativePath of consumerFiles) {
      const filePath = path.join(dashboardRoot, relativePath);
      expect(fs.existsSync(filePath), `Missing expected catalog consumer: ${relativePath}`).toBe(true);
      const source = fs.readFileSync(filePath, 'utf8');

      expect(source, `${relativePath} should import/read the core reference catalog`).toMatch(/core\/catalog|reference-catalog/i);
      expect(source, `${relativePath} must not rely on the legacy hardcoded PLAN_ENTITLEMENTS matrix`).not.toMatch(
        /PLAN_ENTITLEMENTS|CANONICAL_PLAN_ENTITLEMENTS|getPlanEntitlements\s*\(/i
      );
      expect(source, `${relativePath} must not keep a local plan-to-business-type matrix`).not.toMatch(
        /PLAN_TO_BUSINESS_TYPES|allowedBusinessTypesByPlan|STARTER[\s\S]{0,120}GROWTH[\s\S]{0,120}PRO/i
      );
    }
  });
});
