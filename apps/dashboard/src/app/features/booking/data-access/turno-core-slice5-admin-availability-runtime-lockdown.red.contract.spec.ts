import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ADMIN_ADAPTER_PATH = new URL('../../../../../../../packages/booking/src/infrastructure/supabase/admin-booking.repository.ts', import.meta.url);
const AVAILABILITY_PATH = new URL('../../../../../../../packages/booking/src/application/booking-availability.service.ts', import.meta.url);
const SCHEDULING_PATH = new URL('../../../../../../../packages/booking/src/application/booking-scheduling.service.ts', import.meta.url);
const turnoServiceSource = fs.readFileSync(ADMIN_ADAPTER_PATH, 'utf8')
  + fs.readFileSync(AVAILABILITY_PATH, 'utf8')
  + fs.readFileSync(SCHEDULING_PATH, 'utf8');

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(`\\n\\s{2}(?:private\\s+)?(?:async\\s+)?${methodName}\\s*\\(`).exec(sourceText);
  if (!signatureMatch?.index) return '';

  const signatureStart = signatureMatch.index + 1;

  const bodyStart = sourceText.indexOf('{', signatureStart);
  if (bodyStart === -1) return '';

  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;

    if (depth === 0) {
      return sourceText.slice(signatureStart, index + 1);
    }
  }

  return sourceText.slice(signatureStart);
}

function allRuntimeTypeScriptFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return allRuntimeTypeScriptFiles(absolute);
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return [];

    const normalized = absolute.split(path.sep).join('/');
    const isTestOrFixture =
      /(?:^|\/)(?:tests?|fixtures?|__fixtures__)(?:\/|$)/.test(normalized) ||
      /(?:\.spec|\.test|\.contract)\.ts$/.test(normalized);

    return isTestOrFixture ? [] : [absolute];
  });
}

describe('TurnoService Core Slice 5 admin availability runtime lockdown RED contract', () => {
  const adminAvailabilityMethods = [
    'getHorariosDisponibles',
    'getHorariosDisponiblesConConfiguracion'
  ] as const;

  it.each(adminAvailabilityMethods)('%s routes productive availability through canonical backend availability RPC/gateway', (methodName) => {
    const body = methodBody(turnoServiceSource, methodName);

    expect(body, `${methodName} must exist so callers can be locked down`).not.toBe('');
    expect(body, `${methodName} must not calculate productive slots with local computeAvailableSlots`).not.toMatch(
      /computeAvailableSlots\s*\(/
    );
    expect(body, `${methodName} must call the canonical backend/gateway availability contract`).toMatch(
      /(?:queryPublicSlotAvailability|queryAdminSlotAvailability|query_(?:public|admin)_slot_availability|availability[_-]?rpc|supabaseBookingApi)/i
    );
  });

  it('does not keep hardcoded productive admin availability windows or local booking-rule defaults as source of truth', () => {
    const productiveAvailabilitySource = adminAvailabilityMethods
      .map((methodName) => methodBody(turnoServiceSource, methodName))
      .join('\n');

    expect(productiveAvailabilitySource).not.toContain("start: '09:00'");
    expect(productiveAvailabilitySource).not.toContain("end: '19:00'");
    expect(productiveAvailabilitySource).not.toContain('slotIntervalMinutes: 30');
    expect(productiveAvailabilitySource).not.toContain('bufferMinutes: 0');
    expect(productiveAvailabilitySource).not.toContain('minNoticeMinutes: 0');
  });

  it('does not derive productive availability from frontend occupied windows or raw bookings/blocked_times reads', () => {
    const productiveAvailabilitySource = adminAvailabilityMethods
      .map((methodName) => methodBody(turnoServiceSource, methodName))
      .join('\n');

    expect(productiveAvailabilitySource).not.toMatch(/getOccupiedWindowsForDate\s*\(/);
    expect(productiveAvailabilitySource).not.toMatch(/\.from\(\s*['"](?:bookings|blocked_times)['"]\s*\)/i);
    expect(productiveAvailabilitySource).not.toMatch(/\.select\([\s\S]{0,120}(?:starts_at|ends_at|branch_id|business_id)/i);
  });

  it('keeps any local/mock slot calculation behind an explicit mock or test/dev-only branch', () => {
    const computeCallIndex = turnoServiceSource.indexOf('computeAvailableSlots(');

    if (computeCallIndex === -1) {
      expect(computeCallIndex).toBe(-1);
      return;
    }

    const guardWindow = turnoServiceSource.slice(Math.max(0, computeCallIndex - 500), computeCallIndex);
    expect(guardWindow, 'local availability calculation is allowed only after an explicit mock/test/dev guard').toMatch(
      /provider\s*={2,3}\s*['"]mock['"]|import\.meta\.env\.MODE\s*={2,3}\s*['"]test['"]|import\.meta\.env\.DEV|NODE_ENV\s*={2,3}\s*['"]test['"]/i
    );
  });

  it('preserves backend remainingCapacity or marks zero-capacity admin slots unavailable before exposing them', () => {
    const productiveAvailabilitySource = adminAvailabilityMethods
      .map((methodName) => methodBody(turnoServiceSource, methodName))
      .join('\n');

    expect(productiveAvailabilitySource, 'admin availability must not collapse backend slots to plain strings without capacity semantics').toMatch(
      /remainingCapacity|remaining_capacity|available\s*:\s*[^;]*(?:remainingCapacity|remaining_capacity)|capacity/i
    );
    expect(productiveAvailabilitySource, 'zero-capacity slots must not remain bookable in admin UI').toMatch(
      /remaining(?:C|_c)apacity\s*[<={2,3}]\s*0|available\s*:\s*false|filter\([^)]*remaining(?:C|_c)apacity/i
    );
  });

  it('allows availability-core helpers only in tests/fixtures, not runtime TurnoService or other production files', () => {
    const dashboardSrc = path.resolve(process.cwd(), 'src');
    const runtimeFilesImportingAvailabilityCore = allRuntimeTypeScriptFiles(dashboardSrc).filter((filePath) =>
      fs.readFileSync(filePath, 'utf8').includes('availability-core')
    );

    expect(runtimeFilesImportingAvailabilityCore).toEqual([]);
  });

  it('preserves tenant branch validation and never permits null/global branch scope for admin create, availability, or blocked-time RPCs', () => {
    const createBody = methodBody(turnoServiceSource, 'create');
    const createWithSupabaseBody = methodBody(turnoServiceSource, 'createWithSupabase');
    const queryAdminSlotAvailabilityBody = methodBody(turnoServiceSource, 'queryAdminSlotAvailability');
    const createBlockedTimeBody = methodBody(turnoServiceSource, 'createBlockedTime');
    const createBlockedTimeWithResolvedTenantBody = methodBody(turnoServiceSource, 'createBlockedTimeWithResolvedTenant');
    const rpcBodies = [
      createWithSupabaseBody,
      queryAdminSlotAvailabilityBody,
      createBlockedTimeWithResolvedTenantBody
    ].join('\n');

    expect(createBody + createWithSupabaseBody, 'manual admin create may resolve/provision a default internal branch, but must not reject branchless MVP by requiring the page to pass branchId upfront').not.toMatch(
      /if\s*\([^)]*!dto\.branchId\?\.trim\(\)[^)]*\)[\s\S]{0,180}ACTIVE_BRANCH_REQUIRED/i
    );
    expect(rpcBodies, 'every admin RPC path must validate resolved branch ownership against the authenticated tenant/business').toMatch(
      /validateBranchTenant\(\s*supabase[\s\S]{0,220}(?:branchScope|branchId|request\.branchId)/i
    );
    expect(rpcBodies, 'admin RPC payloads must use the validated tenant branch scope, not null/global branch ids').toMatch(
      /branch_id\s*:\s*branchScope\.branchId|branchId\s*:\s*branchScope\.branchId/i
    );
    expect(rpcBodies + createBlockedTimeBody, 'admin branch scope must fail closed when no safe branch can be resolved').not.toMatch(
      /branch(?:_id|Id)\s*:\s*(?:null|undefined|['"]global['"]|['"]\*['"]|['"]{2})/i
    );
  });

  it('fails closed for explicit branchId but ignores stale implicit localStorage/auth branch before default/provisioned fallback', () => {
    const resolverBody = methodBody(turnoServiceSource, 'resolveInternalDefaultBranchScope');
    const clearRememberedBranchScopeBody = methodBody(turnoServiceSource, 'clearRememberedBranchScope');
    const resolveActiveBranchIdBody = methodBody(turnoServiceSource, 'resolveActiveBranchId');
    const queryAdminSlotAvailabilityBody = methodBody(turnoServiceSource, 'queryAdminSlotAvailability');
    const createBlockedTimeWithResolvedTenantBody = methodBody(turnoServiceSource, 'createBlockedTimeWithResolvedTenant');

    expect(resolverBody, 'resolver must keep explicit request/dto branchId validation fail-closed').toMatch(
      /explicitRequestedBranchId[\s\S]{0,220}validateBranchTenant\(\s*supabaseClient\s*,\s*explicitRequestedBranchId[\s\S]{0,220}return branchScope/i
    );
    expect(resolverBody, 'implicit active branch validation failures must be caught so owned default/provisioned branch fallback can run').toMatch(
      /rememberedBranchId[\s\S]{0,220}try\s*\{[\s\S]{0,260}validateBranchTenant\(\s*supabaseClient\s*,\s*rememberedBranchId[\s\S]{0,360}catch\s*\(/i
    );
    expect(resolverBody, 'stale implicit branch must be cleared/ignored before default branch lookup or provisioning').toMatch(
      /clearRememberedBranchScope\(\s*rememberedBranchId\s*\)[\s\S]{0,900}\.from\(\s*['"]branches['"]\s*\)/i
    );
    expect(clearRememberedBranchScopeBody + resolveActiveBranchIdBody, 'stale localStorage/auth active branch ids must not keep winning future implicit resolution').toMatch(
      /ignoredImplicitBranchIds\.add\([\s\S]{0,900}ignoredImplicitBranchIds\.has/i
    );
    expect(queryAdminSlotAvailabilityBody, 'availability without explicit request.branchId must not re-label implicit active branch as explicit').toMatch(
      /request\.branchId\s*\?[\s\S]{0,180}validateBranchTenant\(\s*supabase\s*,\s*request\.branchId\s*\)[\s\S]{0,180}:\s*await this\.resolveInternalDefaultBranchScope\(\s*supabase\s*\)/i
    );
    expect(turnoServiceSource, 'blocked-time creation without explicit payload.branchId must use the internal default resolver so stale implicit branch ids can be cleared before fallback/provisioning').toMatch(
      /branchId\s*\?[\s\S]{0,220}validateBranchTenant\(\s*supabase\s*,\s*branchId[\s\S]{0,220}:\s*await this\.resolveInternalDefaultBranchScope\(\s*supabase\s*,\s*payload\.branchId\s*,\s*adminSession\s*\)/i
    );
  });
});
