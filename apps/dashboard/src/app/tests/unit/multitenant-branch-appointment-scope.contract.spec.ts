import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getRuntimeReferenceCatalogSnapshot } from '../../core/catalog/reference-catalog.gateway';
import { getCatalogAddOn } from '../../core/catalog/reference-catalog';
import { getPlanEntitlements } from '../../core/plans/plan-entitlements';

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

function readExistingSources(paths: string[]): string {
  return paths
    .filter((path) => existsSync(resolve(process.cwd(), path)))
    .map((path) => readSource(path))
    .join('\n');
}

describe('Multitenant branch appointment scope RED contract', () => {
  it('keeps PRO base at one local and exposes multi-branch as a separate ARS 20,000 add-on', () => {
    const pro = getPlanEntitlements('PRO');
    const multiBranchAddOn = getCatalogAddOn(getRuntimeReferenceCatalogSnapshot(), 'MULTI_BRANCH');
    const branches = Array.from({ length: 5 }, (_, index) => ({
      id: `branch-barberia-${index + 1}`,
      businessId: 'business-brand-orvel',
      displayName: `Orvel Barber ${index + 1}`,
      rubro: 'barberia'
    }));

    expect(pro.maxLocales).toBe(1);
    expect(multiBranchAddOn).toMatchObject({
      code: 'MULTI_BRANCH',
      priceMonthlyCents: 2_000_000,
      billingCadence: 'monthly'
    });
    expect(new Set(branches.map((branch) => branch.businessId))).toEqual(new Set(['business-brand-orvel']));
    expect(new Set(branches.map((branch) => branch.rubro))).toEqual(new Set(['barberia']));
    expect(new Set(branches.map((branch) => branch.id)).size).toBe(5);

    const branchModelPath = resolve(process.cwd(), 'src/app/models/branch.model.ts');
    expect(existsSync(branchModelPath), 'Branch/location/salon must be modeled separately from Business').toBe(true);

    const branchSources = readExistingSources([
      'src/app/models/branch.model.ts',
      'src/app/core/branches/branch-entitlements.ts'
    ]);

    expect(branchSources).toMatch(/businessId|business_id/);
    expect(branchSources).toMatch(/rubro|category/);
    expect(branchSources).not.toMatch(/unique[^\n]*(rubro|category)|(rubro|category)[^\n]*unique/i);
  });

  it('requires appointment DTOs and records to carry an operational branch/location/salon scope', () => {
    const turnoModel = readSource('src/app/features/booking/models/turno.model.ts');

    expect(turnoModel).toMatch(/branchId|branch_id|salonId|salon_id|locationId|location_id/);
    expect(turnoModel).toMatch(/CreateTurnoDTO[\s\S]*(branchId|branch_id|salonId|salon_id|locationId|location_id)/);
    expect(turnoModel).toMatch(/FiltrarTurnoDTO[\s\S]*(branchId|branch_id|salonId|salon_id|locationId|location_id)/);
  });

  it('scopes appointment reads by active branch and rejects legacy business-wide reads', () => {
    const turnoService = readSource('src/app/features/booking/data-access/turno.service.ts');
    const branchContextService = readSource('src/app/core/branches/branch-context.service.ts');

    expect(turnoService).toMatch(/activeBranch|activeLocation|activeSalon|branchId|branch_id|salonId|salon_id|locationId|location_id/);
    expect(branchContextService, 'dashboard branch loading must use the backend-owned RPC because browser branch SELECT grants are revoked').toMatch(
      /\.rpc\(\s*['"]get_dashboard_branches['"]/i
    );
    expect(branchContextService, 'branch context must not depend on direct branch table reads in the browser').not.toMatch(
      /\.from\(\s*['"](?:public\.)?branches['"]\s*\)[\s\S]{0,500}\.select\s*\(/i
    );
    expect(turnoService, 'appointment branch validation must use the dashboard-owned branches RPC before list_admin_bookings').toMatch(
      /validateBranchTenant[\s\S]*\.rpc\(\s*['"]get_dashboard_branches['"]/i
    );
    expect(turnoService, 'appointment listing must use the least-privilege branch-scoped RPC').toMatch(
      /\.rpc\(\s*['"]list_admin_bookings['"]\s*,\s*\{[\s\S]{0,240}p_branch_id\s*:/i
    );
    expect(turnoService, 'direct bookings reads conflict with revoked SELECT grants').not.toMatch(
      /\.from\(\s*['"](?:public\.)?bookings['"]\s*\)[\s\S]{0,500}\.select\s*\(/i
    );
    expect(turnoService).not.toMatch(/\.from\(['"]bookings['"]\)[\s\S]*\.eq\(['"]business_id['"],\s*businessId\)/);
  });

  it('keeps admin booking RPC migrations on the canonical branches.is_active column', () => {
    const activeBranchMigration = readFileSync(
      resolve(process.cwd(), '../../supabase/migrations/20260705193000_fix_admin_booking_active_branch_column.sql'),
      'utf-8'
    );

    expect(activeBranchMigration).toMatch(/b\.is_active\s+IS\s+TRUE/i);
    expect(activeBranchMigration).toMatch(/br\.is_active\s+AS\s+branch_active/i);
    expect(activeBranchMigration).not.toMatch(/\bbranches\s+\w+[\s\S]{0,240}\b\w+\.active\b/i);
  });

  it('scopes appointment writes by branch and rejects missing or invalid branch context before RPC', () => {
    const turnoService = readSource('src/app/features/booking/data-access/turno.service.ts');
    const apiTypes = readSource('../../packages/booking/src/types.ts');
    const realGateway = readSource('src/app/core/api/supabase-booking/real-gateway.ts');

    expect(apiTypes).toMatch(/AdminManualBookingPayload[\s\S]*(branchId|branch_id|salonId|salon_id|locationId|location_id)/);
    expect(turnoService).toMatch(/BRANCH_REQUIRED|LOCATION_REQUIRED|SALON_REQUIRED|ACTIVE_BRANCH_REQUIRED|branch context/i);
    expect(turnoService).toMatch(/BRANCH_FORBIDDEN|BRANCH_NOT_FOUND|INVALID_BRANCH|validate.*branch/i);
    expect(turnoService).toMatch(/createAdminManualBooking\([\s\S]*(branchId|branch_id|salonId|salon_id|locationId|location_id)/);
    expect(realGateway).toMatch(/create_admin_manual_booking[\s\S]*(branch_id|salon_id|location_id)/);
  });

  it('removes old ambiguous owner_id + maybeSingle business resolution for booking scope', () => {
    const turnoService = readSource('src/app/features/booking/data-access/turno.service.ts');

    expect(turnoService).not.toMatch(/owner_id[\s\S]{0,240}maybeSingle\(\)/);
    expect(turnoService).not.toMatch(/resolveBusinessId[\s\S]*return\s+authUserId/);
    expect(turnoService).toMatch(/validate.*(branch|location|salon).*tenant|tenant.*validate.*(branch|location|salon)|account.*(branch|location|salon)/i);
  });

  it('keeps appointments isolated when two branches share rubro=barberia under the same tenant', () => {
    const sources = readExistingSources([
      'src/app/features/booking/data-access/turno.service.ts',
      '../../packages/booking/src/types.ts',
      'src/app/core/api/supabase-booking/real-gateway.ts',
      'src/app/features/booking/models/turno.model.ts'
    ]);

    expect(sources).toMatch(/branch-barberia-a|branch-barberia-b|same-category|same category|rubro=barberia|rubro['"]:\s*['"]barberia/i);
    expect(sources).toMatch(/isolation|isolated|aisla|aislamiento|branch scope/i);
  });
});
