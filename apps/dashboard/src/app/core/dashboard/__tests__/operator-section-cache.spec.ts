// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(
    `\\n\\s{2}(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`
  ).exec(sourceText);
  if (!signatureMatch?.index) return '';

  const signatureStart = signatureMatch.index + 1;
  const bodyStart = sourceText.indexOf('{', signatureStart);
  if (bodyStart === -1) return '';

  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return sourceText.slice(signatureStart, index + 1);
  }

  return sourceText.slice(signatureStart);
}

describe('operator section cache contracts', () => {
  const clientesPage = read('src/app/features/clientes/pages/clientes.page.ts');
  const serviciosPage = read('src/app/features/servicios/pages/servicios.page.ts');
  const turnosList = read('src/app/features/booking/pages/turnos-list.page.ts');
  const configPage = read('src/app/features/settings/pages/configuracion.page.ts');
  const businessService = read('src/app/features/settings/data-access/business.service.ts');
  const dashboardService = read('src/app/core/dashboard/dashboard.service.ts');
  const branchContext = read('src/app/core/branches/branch-context.service.ts');
  const routeProtection = read('src/app/core/auth/route-protection.ts');
  const clienteService = read('src/app/features/clientes/data-access/cliente.service.ts');
  const servicioService = read('src/app/features/servicios/data-access/servicio.service.ts');

  it('clientes and servicios pages seed from warm items and do not set loading true on remount', () => {
    const loadClients = methodBody(clientesPage, 'loadClients') || clientesPage;
    const loadData = methodBody(serviciosPage, 'loadData') || serviciosPage;

    expect(clientesPage).toMatch(/isLoaded\s*\(/);
    expect(serviciosPage).toMatch(/isLoaded\s*\(/);
    expect(loadClients).toMatch(/isLoaded\s*\(/);
    expect(loadData).toMatch(/isLoaded\s*\(/);
    expect(loadClients).toMatch(/if\s*\(\s*this\.clienteService\.isLoaded\(\)\s*\)\s*\{[\s\S]*?loading\.set\(false\)/);
    expect(loadData).toMatch(/if\s*\(\s*this\.servicioService\.isLoaded\(\)\s*\)\s*\{[\s\S]*?loading\.set\(false\)/);
  });

  it('turnos loadBookings skips crud.getAll when the same branch is warm on DashboardService', () => {
    const loadBookings = methodBody(turnosList, 'loadBookings');
    const ngOnInit = methodBody(turnosList, 'ngOnInit');

    expect(turnosList).toMatch(/DashboardService/);
    expect(loadBookings).toMatch(/isAdminBookingsWarm|adminBookingsLoadedBranchId|getAdminBookings/);
    expect(loadBookings).toMatch(/crud\.getAll/);
    expect(ngOnInit).toMatch(/isAdminBookingsWarm/);
    expect(ngOnInit).toMatch(/if\s*\(\s*!warm\s*\)/);
  });

  it('config remount skip uses BusinessService hydrated snapshot, not a page-only hydratedUserId', () => {
    const hydrate = methodBody(configPage, 'hydrateBusinessSettings');
    expect(businessService).toMatch(/hydratedUserId/);
    expect(businessService).toMatch(/hasHydratedSnapshot|clearHydration|invalidate\s*\(/);
    expect(hydrate).toMatch(/hasHydratedSnapshot|getSnapshot\(/);
    expect(hydrate).not.toMatch(/this\.hydratedUserId === userId/);
  });

  it('retry load still nulls hydration on the holder so settings-load tests keep a real reload', () => {
    const retry = methodBody(configPage, 'retryLoadSettings');
    expect(retry).toMatch(/hydratedUserId\s*=\s*null|clearHydration\s*\(/);
  });

  it('branch switch and session reset centrally invalidate section caches', () => {
    const setActive = methodBody(branchContext, 'setActiveBranch');
    const resetSession = methodBody(branchContext, 'resetSession');
    expect(setActive).toMatch(/invalidateSectionCaches|invalidateOperatorSectionCaches/);
    expect(resetSession).toMatch(/invalidateSectionCaches|invalidateOperatorSectionCaches/);
  });

  it('logout clears root section caches after resetBranchContextSession', () => {
    expect(routeProtection).toMatch(/resetBranchContextSession\s*\(/);
    expect(routeProtection).toMatch(/invalidateSectionCaches|invalidateOperatorSectionCaches|clearOperatorSectionCaches/);
  });

  it('turno mutations invalidate home bookings instead of relying on a local patch only', () => {
    expect(methodBody(turnosList, 'updateEstado')).toMatch(/invalidate\s*\(/);
    expect(methodBody(turnosList, 'cancelTurnoByAdmin')).toMatch(/invalidate\s*\(/);
    expect(methodBody(turnosList, 'refreshTurnosFromSource')).toMatch(/invalidate\s*\(/);
  });

  it('mutation then Inicio refetches because DashboardService.invalidate clears the warm flag', () => {
    expect(methodBody(dashboardService, 'invalidate')).toMatch(/bookingsLoaded|loaded\s*=\s*false|false/);
    expect(methodBody(dashboardService, 'refreshData')).toMatch(/isLoaded|bookingsLoaded|loaded/);
  });

  it('cliente and servicio mutations call invalidate in the service itself', () => {
    expect(methodBody(clienteService, 'create')).toMatch(/invalidate\s*\(/);
    expect(methodBody(clienteService, 'update')).toMatch(/invalidate\s*\(/);
    expect(methodBody(clienteService, 'softDeleteClient')).toMatch(/invalidate\s*\(/);
    expect(methodBody(servicioService, 'create')).toMatch(/invalidate\s*\(/);
    expect(methodBody(servicioService, 'update')).toMatch(/invalidate\s*\(/);
    expect(methodBody(servicioService, 'delete')).toMatch(/invalidate\s*\(/);
    expect(servicioService).toMatch(/createCategoriaAndPersist[\s\S]{0,400}this\.invalidate\s*\(/);
  });
});
