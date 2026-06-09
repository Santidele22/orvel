import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  getDefaultDashboardReferenceCatalog,
  getPlanEntitlementsFromCatalog
} from '../../core/catalog/reference-catalog';
import { createSupabaseEntitlementsRepository, assertEntitlement, configureEntitlementsRepository } from '../../features/billing/data-access/subscriptions/entitlements.api';

type SupabaseRpcRow = {
  business_id: string;
  tenant_id: string;
  subscription_status: string;
  plan_code: unknown;
  max_locales?: number | null;
  max_rubros?: number | null;
  max_monthly_bookings?: number | null;
  ai_credits_monthly?: number | null;
};

function readEntitlementsApiSource(): string {
  const sourcePath = path.join(
    process.cwd(),
    'src',
    'app',
    'features',
    'billing',
    'data-access',
    'subscriptions',
    'entitlements.api.ts'
  );
  expect(fs.existsSync(sourcePath), 'Missing billing subscriptions entitlements API source file').toBe(true);
  return fs.readFileSync(sourcePath, 'utf8');
}

function createRepositoryFor(row: SupabaseRpcRow) {
  return createSupabaseEntitlementsRepository({
    rpc: async () => ({ data: row, error: null })
  } as any);
}

describe('RED contract: billing subscription entitlements align with the reference catalog', () => {
  it('does not keep local billing PLAN_LIMITS as a source-of-truth matrix', () => {
    const source = readEntitlementsApiSource();

    expect(source, 'Entitlements must import/read the shared reference catalog').toMatch(
      /core\/catalog\/reference-catalog|\.\.\/\.\.\/\.\.\/core\/catalog\/reference-catalog/
    );
    expect(source, 'Remove local PLAN_LIMITS; fallback entitlements must come from catalog/Supabase source of truth').not.toMatch(
      /\bPLAN_LIMITS\b/
    );
  });

  it('does not normalize STARTER/GROWTH into legacy BASIC/MEDIUM canonical outputs', () => {
    const source = readEntitlementsApiSource();

    expect(source, 'STARTER must remain the canonical output; BASIC is only an accepted alias').not.toMatch(
      /STARTER['"]?\s*\)?\s*return\s*['"]BASIC['"]|STARTER[\s\S]{0,80}=>\s*['"]BASIC['"]/
    );
    expect(source, 'GROWTH must remain the canonical output; MEDIUM is only an accepted alias').not.toMatch(
      /GROWTH['"]?\s*\)?\s*return\s*['"]MEDIUM['"]|GROWTH[\s\S]{0,80}=>\s*['"]MEDIUM['"]/
    );
  });

  it('accepts legacy BASIC/MEDIUM aliases but returns STARTER/GROWTH and catalog limits', async () => {
    const catalog = getDefaultDashboardReferenceCatalog();
    const starterEntitlements = getPlanEntitlementsFromCatalog(catalog, 'STARTER');
    const growthEntitlements = getPlanEntitlementsFromCatalog(catalog, 'GROWTH');

    await expect(
      createRepositoryFor({
        business_id: 'business-1',
        tenant_id: 'tenant-1',
        subscription_status: 'active',
        plan_code: ' basic ',
        max_locales: null,
        max_rubros: null,
        max_monthly_bookings: null,
        ai_credits_monthly: null
      }).getActiveSnapshot({ businessId: 'business-1', tenantId: 'tenant-1' })
    ).resolves.toMatchObject({
      planCode: 'STARTER',
      limits: starterEntitlements
    });

    await expect(
      createRepositoryFor({
        business_id: 'business-2',
        tenant_id: 'tenant-2',
        subscription_status: 'trialing',
        plan_code: 'MEDIUM'
      }).getActiveSnapshot({ businessId: 'business-2', tenantId: 'tenant-2' })
    ).resolves.toMatchObject({
      planCode: 'GROWTH',
      limits: growthEntitlements
    });
  });

  it('uses canonical STARTER/GROWTH for entitlement decisioning including monthly bookings', async () => {
    configureEntitlementsRepository(
      createRepositoryFor({
        business_id: 'business-3',
        tenant_id: 'tenant-3',
        subscription_status: 'active',
        plan_code: 'MEDIUM',
        max_locales: null,
        max_rubros: null,
        max_monthly_bookings: null,
        ai_credits_monthly: null
      })
    );

    await expect(
      assertEntitlement({
        businessId: 'business-3',
        tenantId: 'tenant-3',
        metric: 'maxMonthlyBookings' as any,
        requestedUnits: 50_000
      })
    ).resolves.toEqual({ allowed: true, reason: 'OK' });

    configureEntitlementsRepository(null);
  });

  it.each([null, undefined, '', '   ', 'enterprise'])('falls back fail-closed to FREE for unknown plan %s', async (planCode) => {
    const freeEntitlements = getPlanEntitlementsFromCatalog(getDefaultDashboardReferenceCatalog(), 'FREE');

    await expect(
      createRepositoryFor({
        business_id: 'business-free',
        tenant_id: 'tenant-free',
        subscription_status: 'active',
        plan_code: planCode,
        max_locales: null,
        max_rubros: null,
        max_monthly_bookings: null,
        ai_credits_monthly: null
      }).getActiveSnapshot({ businessId: 'business-free', tenantId: 'tenant-free' })
    ).resolves.toMatchObject({
      planCode: 'FREE',
      limits: freeEntitlements
    });
  });
});
