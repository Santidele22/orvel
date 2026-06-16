import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dashboardRoot = process.cwd();
const monorepoRoot = path.resolve(dashboardRoot, '..', '..');

function readDashboardSource(relativePath: string): string {
  const filePath = path.join(dashboardRoot, relativePath);
  expect(fs.existsSync(filePath), `Missing expected dashboard source file: ${relativePath}`).toBe(true);
  return fs.readFileSync(filePath, 'utf8');
}

function readSupabaseSqlCorpus(): string {
  const migrationsDir = path.join(monorepoRoot, 'supabase', 'migrations');
  expect(fs.existsSync(migrationsDir), 'Missing checked-in Supabase migrations for backend contract checks').toBe(true);

  return fs
    .readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => fs.readFileSync(path.join(migrationsDir, entry), 'utf8'))
    .join('\n\n');
}

function extractFunction(sql: string, functionName: string): string {
  const pattern = new RegExp(
    `create\\s+or\\s+replace\\s+function\\s+(?:public\\.)?${functionName}\\s*\\([\\s\\S]*?(?=\\n\\s*(?:create|alter|grant|revoke|insert|do|--|$))`,
    'i'
  );

  return sql.match(pattern)?.[0] ?? '';
}

describe('RED contract: dashboard core catalog is backend-first', () => {
  it('has a productive catalog gateway/service that fetches get_dashboard_reference_catalog RPC', () => {
    const catalogSource = readDashboardSource('src/app/core/catalog/reference-catalog.ts');
    const catalogGatewayCandidates = [
      'src/app/core/catalog/reference-catalog.gateway.ts',
      'src/app/core/catalog/reference-catalog.service.ts',
      'src/app/core/catalog/dashboard-reference-catalog.gateway.ts',
      'src/app/core/catalog/dashboard-reference-catalog.service.ts'
    ];
    const gatewaySource = catalogGatewayCandidates
      .map((relativePath) => {
        const filePath = path.join(dashboardRoot, relativePath);
        return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
      })
      .join('\n\n');
    const productiveCatalogSource = `${catalogSource}\n\n${gatewaySource}`;

    expect(
      productiveCatalogSource,
      'Productive dashboard catalog must call the backend source-of-truth RPC get_dashboard_reference_catalog()'
    ).toMatch(/\.rpc\(\s*['"]get_dashboard_reference_catalog['"]/);
    expect(
      productiveCatalogSource,
      'Catalog gateway/service should normalize the backend RPC payload before consumers use it'
    ).toMatch(/normalizeDashboardReferenceCatalog\s*\(/);
  });

  it('does not export a hardcoded bootstrap catalog as the productive default source of truth', () => {
    const catalogSource = readDashboardSource('src/app/core/catalog/reference-catalog.ts');

    expect(
      catalogSource,
      'Local catalog data is allowed only as test/dev fixture or explicit non-production fallback, not DEFAULT_DASHBOARD_REFERENCE_CATALOG'
    ).not.toMatch(/export\s+const\s+DEFAULT_DASHBOARD_REFERENCE_CATALOG\s*=\s*normalizeDashboardReferenceCatalog\s*\(\s*BOOTSTRAP_CATALOG_PAYLOAD\s*\)/);
    expect(
      catalogSource,
      'Hardcoded FREE/STARTER/GROWTH/PRO payloads must not be the productive catalog source of truth'
    ).not.toMatch(/BOOTSTRAP_CATALOG_PAYLOAD[\s\S]{0,800}\bSTARTER\b[\s\S]{0,800}\bGROWTH\b[\s\S]{0,800}\bPRO\b/);
  });
});

describe('RED contract: dashboard core entitlements are backend snapshot-first', () => {
  it('server-entitlements API uses get_business_entitlements_snapshot RPC and no fake business maps', () => {
    const source = readDashboardSource('src/app/core/entitlements/server-entitlements.api.ts');

    expect(source, 'Core entitlements must call the backend entitlement snapshot RPC').toMatch(
      /\.rpc\(\s*['"]get_business_entitlements_snapshot['"]/
    );
    expect(source, 'Remove fake BUSINESS_PLAN source-of-truth maps from core entitlements').not.toMatch(
      /\bBUSINESS_PLAN\b/
    );
    expect(source, 'Remove fake BUSINESS_USAGE source-of-truth maps from core entitlements').not.toMatch(
      /\bBUSINESS_USAGE\b/
    );
    expect(source, 'Remove seeded QA business IDs from productive entitlement decisioning').not.toMatch(/biz_qa_001/);
  });

  it('backend entitlement snapshot contract includes every limit the core consumes', () => {
    const sql = readSupabaseSqlCorpus();
    const rpc = extractFunction(sql, 'get_business_entitlements_snapshot');

    expect(rpc, 'Missing public.get_business_entitlements_snapshot RPC contract').toMatch(
      /create\s+or\s+replace\s+function\s+(?:public\.)?get_business_entitlements_snapshot\s*\(/i
    );
    for (const requiredLimit of ['max_locales', 'max_rubros', 'max_monthly_bookings', 'ai_credits_monthly']) {
      expect(rpc, `Entitlement snapshot RPC must return ${requiredLimit}`).toMatch(new RegExp(`\\b${requiredLimit}\\b`, 'i'));
    }
  });

  it('exposes all entitlement limits in the core snapshot shape', async () => {
    const { getBusinessEntitlementsSnapshot } = await import('../../core/entitlements/server-entitlements.api');

    const snapshot = await getBusinessEntitlementsSnapshot({ businessId: 'contract-shape-check' });

    expect(snapshot.limits, 'Core snapshot limits must mirror the backend contract used by consumers').toEqual(
      expect.objectContaining({
        maxLocales: expect.any(Number),
        maxRubros: expect.any(Number),
        maxMonthlyBookings: expect.anything(),
        aiCreditsMonthly: expect.any(Number)
      })
    );
  });

  it('fails closed when entitlement truth is unavailable instead of silently enabling privileges', async () => {
    const { assertBusinessEntitlement } = await import('../../core/entitlements/server-entitlements.api');

    await expect(
      assertBusinessEntitlement({
        businessId: 'missing-backend-snapshot',
        metric: 'maxLocales',
        requestedUnits: 1
      })
    ).resolves.toMatchObject({
      allowed: false,
      reason: expect.stringMatching(/UNAVAILABLE|SUBSCRIPTION_NOT_ACTIVE|ENTITLEMENT_LIMIT_EXCEEDED/)
    });
  });
});
