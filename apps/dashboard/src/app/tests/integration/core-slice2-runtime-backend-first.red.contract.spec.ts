import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const dashboardRoot = process.cwd();
const monorepoRoot = path.resolve(dashboardRoot, '..', '..');

const productiveConsumerGlobs = [
  'src/app/core/plans/plan-entitlements.ts',
  'src/app/core/accounts/account-plan-policy.ts',
  'src/app/core/entitlements/server-entitlements.api.ts',
  'src/app/features/billing',
  'src/app/features/onboarding'
];

function readFile(relativePath: string): string {
  const filePath = path.join(dashboardRoot, relativePath);
  expect(fs.existsSync(filePath), `Missing expected file: ${relativePath}`).toBe(true);
  return fs.readFileSync(filePath, 'utf8');
}

function listTsFiles(relativePath: string): string[] {
  const absolutePath = path.join(dashboardRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    return [];
  }

  const stat = fs.statSync(absolutePath);
  if (stat.isFile()) {
    return absolutePath.endsWith('.ts') && !absolutePath.endsWith('.spec.ts') ? [absolutePath] : [];
  }

  return fs.readdirSync(absolutePath).flatMap((entry) => listTsFiles(path.join(relativePath, entry)));
}

function readSqlCorpus(): string {
  const migrationsDir = path.join(monorepoRoot, 'supabase', 'migrations');
  expect(fs.existsSync(migrationsDir), 'Missing checked-in Supabase migrations').toBe(true);

  return fs
    .readdirSync(migrationsDir)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => fs.readFileSync(path.join(migrationsDir, entry), 'utf8'))
    .join('\n\n');
}

describe('RED contract: Core Slice 2 runtime catalog is backend-first', () => {
  it('does not let productive plan/billing/onboarding consumers call the dev fixture catalog', () => {
    const offenders = productiveConsumerGlobs
      .flatMap(listTsFiles)
      .filter((filePath) => fs.readFileSync(filePath, 'utf8').includes('getDefaultDashboardReferenceCatalog'))
      .map((filePath) => path.relative(dashboardRoot, filePath));

    expect(
      offenders,
      'getDefaultDashboardReferenceCatalog() is a dev/test fixture escape hatch; productive consumers must use an injectable gateway/cache/repository backed by get_dashboard_reference_catalog.'
    ).toEqual([]);
  });

  it('provides an injectable runtime catalog cache/repository instead of only a raw fixture helper', () => {
    const gatewaySource = readFile('src/app/core/catalog/reference-catalog.gateway.ts');
    const planSource = readFile('src/app/core/plans/plan-entitlements.ts');
    const accountPolicySource = readFile('src/app/core/accounts/account-plan-policy.ts');

    expect(gatewaySource, 'Runtime catalog layer must fetch the backend source-of-truth RPC.').toMatch(
      /\.rpc\(\s*['"]get_dashboard_reference_catalog['"]/
    );
    expect(
      gatewaySource,
      'Runtime catalog layer must expose cache/repository semantics so consumers do not import the fixture-backed default catalog.'
    ).toMatch(/ReferenceCatalog(Cache|Repository)|Catalog(Cache|Repository)|getCachedDashboardReferenceCatalog/);
    expect(`${planSource}\n${accountPolicySource}`, 'Plan/account decisions must receive catalog truth through dependency injection.').toMatch(
      /catalogGateway|catalogRepository|referenceCatalog|DashboardReferenceCatalogGateway|DashboardReferenceCatalogRepository/
    );
  });
});

describe('RED contract: Core Slice 2 entitlements have a productive default backend path', () => {
  it('uses get_business_entitlements_snapshot by default when no ad-hoc repository or invoker is injected', () => {
    const source = readFile('src/app/core/entitlements/server-entitlements.api.ts');

    expect(source, 'Entitlements must know how to build the Supabase-backed default repository.').toMatch(
      /createDefaultServerEntitlementsRepository/
    );
    expect(
      source,
      'getBusinessEntitlementsSnapshot() must not fail closed merely because the caller did not inject a fake map/repository; its productive default path should invoke get_business_entitlements_snapshot and fail closed only when that backend path is unavailable.'
    ).not.toMatch(/if\s*\(\s*!repository\s*\)\s*{\s*return\s+closedSnapshot\(input\.businessId\)/);
    expect(source, 'The default path must call the backend RPC, not require ad-hoc fake maps.').toMatch(
      /rpc\(\s*['"]get_business_entitlements_snapshot['"]/
    );
  });
});

describe('RED contract: Supabase plan/business-type mapping is explicit', () => {
  it('does not seed plan_business_types with a broad CROSS JOIN unless an explicit all-plans-all-types policy flag exists', () => {
    const sql = readSqlCorpus();
    const hasBroadPlanBusinessTypeCrossJoin = /insert\s+into\s+(?:public\.)?plan_business_types[\s\S]{0,500}?cross\s+join\s+(?:public\.)?business_types/i.test(
      sql
    );
    const hasExplicitAllPlansAllTypesPolicyFlag = /all[_-]?plans[_-]?all[_-]?types|ALL_PLANS_ALL_TYPES|allow_all_business_types/i.test(
      sql
    );

    expect(
      hasBroadPlanBusinessTypeCrossJoin && !hasExplicitAllPlansAllTypesPolicyFlag,
      'Seed exact allowed plan/business-type pairs, or add an explicit all-plans-all-types policy flag if broad CROSS JOIN is intentional.'
    ).toBe(false);
  });
});
