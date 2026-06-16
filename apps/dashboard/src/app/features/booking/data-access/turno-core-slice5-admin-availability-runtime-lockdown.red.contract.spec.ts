import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const TURNO_SERVICE_PATH = new URL('./turno.service.ts', import.meta.url);
const turnoServiceSource = fs.readFileSync(TURNO_SERVICE_PATH, 'utf8');

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
    const dashboardSrc = path.resolve(path.dirname(TURNO_SERVICE_PATH.pathname), '../../../../..');
    const runtimeFilesImportingAvailabilityCore = allRuntimeTypeScriptFiles(dashboardSrc).filter((filePath) =>
      fs.readFileSync(filePath, 'utf8').includes('availability-core')
    );

    expect(runtimeFilesImportingAvailabilityCore).toEqual([]);
  });
});
