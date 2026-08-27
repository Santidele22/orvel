import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : '';
}

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(
    `\\n\\s{2}(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`
  ).exec(sourceText);
  if (!signatureMatch?.index) {
    return '';
  }

  const signatureStart = signatureMatch.index + 1;
  const bodyStart = sourceText.indexOf('{', signatureStart);
  if (bodyStart === -1) {
    return '';
  }

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

function extractModal(pageHtml: string, openSignal: string): string {
  const start = pageHtml.indexOf(`@if (${openSignal}())`);
  if (start < 0) {
    return '';
  }

  const nextIf = pageHtml.indexOf('@if (', start + 1);
  return pageHtml.slice(start, nextIf >= 0 ? nextIf : pageHtml.length);
}

function expectResultModalChrome(modal: string, testId: string, title: string): void {
  expect(modal).toContain(`data-testid="${testId}"`);
  expect(modal).toContain(`data-testid="${testId}-overlay"`);
  expect(modal).toContain(`data-testid="${testId}-close"`);
  expect(modal).toContain(`data-testid="${testId}-done"`);
  expect(modal).toContain(title);
  expect(modal).toContain('Confirmación');
  expect(modal).toContain('Entendido');
  expect(modal).toContain('ri-checkbox-circle-line');
  expect(modal).toMatch(/role=["']dialog["']/);
  expect(modal).toMatch(/aria-modal=["']true["']/);
  expect(modal).toContain('bg-black/65');
  expect(modal).toContain('backdrop-blur-md');
  expect(modal).toContain('rounded-3xl');
  expect(modal).toContain('bg-[#121827]');
}

describe('Contract: operator result modals after successful mutations', () => {
  it('opens a deleted-service dialog after performDeleteServicio succeeds and keeps the confirm dialog', () => {
    const pageTs = readSource('src/app/features/servicios/pages/servicios.page.ts');
    const pageHtml = readSource('src/app/features/servicios/pages/servicios.page.html');
    const performDelete = methodBody(pageTs, 'performDeleteServicio');
    const confirmDelete = methodBody(pageTs, 'confirmDeleteServicio');
    const modal = extractModal(pageHtml, 'isServicioDeletedModalOpen');

    expect(pageTs).toMatch(/isServicioDeletedModalOpen\s*=\s*signal\(false\)/);
    expect(confirmDelete).toMatch(/performDeleteServicio\(serviceId\)/);
    expect(performDelete).toMatch(/servicioService\.update\(/);
    expect(performDelete).toMatch(/deleteConfirmServiceId\.set\(null\)/);
    expect(performDelete).toMatch(/isServicioDeletedModalOpen\.set\(true\)/);
    expect(performDelete.indexOf('isServicioDeletedModalOpen.set(true)')).toBeGreaterThan(
      performDelete.indexOf('servicioService.update(')
    );
    expect(performDelete.indexOf('isServicioDeletedModalOpen.set(true)')).toBeGreaterThan(
      performDelete.indexOf('deleteConfirmServiceId.set(null)')
    );

    const catchBlock = performDelete.match(/catch\s*\([^)]*\)\s*\{[\s\S]*?\n    \}/)?.[0] ?? '';
    expect(catchBlock).not.toMatch(/isServicioDeletedModalOpen\.set\(true\)/);
    expect(confirmDelete).toMatch(/feedback\.set\(DELETE_SERVICE_ERROR_MESSAGE\)/);
    expect(confirmDelete).not.toMatch(/isServicioDeletedModalOpen\.set\(true\)/);

    expect(pageHtml).toMatch(/data-testid=["']servicios-delete-confirm-modal["']/);
    expect(pageHtml).toMatch(/¿Eliminar este servicio\?/);
    expectResultModalChrome(modal, 'servicios-deleted-modal', 'Servicio eliminado');
    expect(pageHtml).toMatch(/data-testid=["']servicios-deleted-modal-overlay["'][\s\S]{0,240}\(click\)=["']closeServicioDeletedModal\(\)["']/);
    expect(pageHtml).toMatch(/data-testid=["']servicios-deleted-modal-close["'][\s\S]{0,420}\(click\)=["']closeServicioDeletedModal\(\)["']/);
    expect(pageHtml).toMatch(/data-testid=["']servicios-deleted-modal-done["'][\s\S]{0,420}\(click\)=["']closeServicioDeletedModal\(\)["']/);
    expect(pageTs).toMatch(
      /closeServicioDeletedModal\s*\(\s*\)\s*:\s*void\s*\{[\s\S]*isServicioDeletedModalOpen\.set\(false\)/
    );
  });

  it('opens a baja result dialog after performDeactivate succeeds and keeps the confirm dialog', () => {
    const pageTs = readSource('src/app/features/clientes/pages/clientes.page.ts');
    const pageHtml = readSource('src/app/features/clientes/pages/clientes.page.html');
    const performDeactivate = methodBody(pageTs, 'performDeactivate');
    const modal = extractModal(pageHtml, 'isClienteBajaResultModalOpen');

    expect(pageTs).toMatch(/isClienteBajaResultModalOpen\s*=\s*signal\(false\)/);
    expect(performDeactivate).toMatch(/darDeBajaCliente\(clientId\)/);
    expect(performDeactivate).toMatch(/next:\s*\(\)\s*=>\s*\{[\s\S]*cancelBajaConfirm\(\)/);
    expect(performDeactivate).toMatch(/next:\s*\(\)\s*=>\s*\{[\s\S]*closeModal\(\)/);
    expect(performDeactivate).toMatch(/next:\s*\(\)\s*=>\s*\{[\s\S]*loadClients\(\)/);
    expect(performDeactivate).toMatch(/isClienteBajaResultModalOpen\.set\(true\)/);
    expect(performDeactivate.indexOf('isClienteBajaResultModalOpen.set(true)')).toBeGreaterThan(
      performDeactivate.indexOf('darDeBajaCliente(clientId)')
    );
    expect(performDeactivate.indexOf('isClienteBajaResultModalOpen.set(true)')).toBeGreaterThan(
      performDeactivate.indexOf('cancelBajaConfirm()')
    );
    expect(performDeactivate.indexOf('isClienteBajaResultModalOpen.set(true)')).toBeGreaterThan(
      performDeactivate.indexOf('closeModal()')
    );
    expect(performDeactivate.indexOf('isClienteBajaResultModalOpen.set(true)')).toBeGreaterThan(
      performDeactivate.indexOf('loadClients()')
    );

    const errorBlock = performDeactivate.match(/error:\s*\([^)]*\)\s*=>\s*\{[\s\S]*?\n      \}/)?.[0] ?? '';
    expect(errorBlock).toMatch(/formMessage\.set\(/);
    expect(errorBlock).not.toMatch(/isClienteBajaResultModalOpen\.set\(true\)/);

    expect(pageHtml).toMatch(/data-testid=["']clientes-dar-de-baja-confirm-modal["']/);
    expect(pageHtml).toMatch(/¿Dar de baja a este cliente\?/);
    expectResultModalChrome(modal, 'clientes-baja-result-modal', 'Cliente dado de baja');
    expect(pageHtml).toMatch(/data-testid=["']clientes-baja-result-modal-overlay["'][\s\S]{0,240}\(click\)=["']closeClienteBajaResultModal\(\)["']/);
    expect(pageHtml).toMatch(/data-testid=["']clientes-baja-result-modal-close["'][\s\S]{0,420}\(click\)=["']closeClienteBajaResultModal\(\)["']/);
    expect(pageHtml).toMatch(/data-testid=["']clientes-baja-result-modal-done["'][\s\S]{0,420}\(click\)=["']closeClienteBajaResultModal\(\)["']/);
    expect(pageTs).toMatch(
      /closeClienteBajaResultModal\s*\(\s*\)\s*:\s*void\s*\{[\s\S]*isClienteBajaResultModalOpen\.set\(false\)/
    );
  });

  it('opens a scheduled-turno dialog only after a successful create, then navigates or emits on dismiss', () => {
    const pageTs = readSource('src/app/features/booking/pages/turno-form.page.ts');
    const pageHtml = readSource('src/app/features/booking/pages/turno-form.page.html');
    const saveBody = methodBody(pageTs, 'save');
    const closeBody = methodBody(pageTs, 'closeTurnoAgendadoModal');
    const modal = extractModal(pageHtml, 'isTurnoAgendadoModalOpen');

    expect(pageTs).toMatch(/isTurnoAgendadoModalOpen\s*=\s*signal\(false\)/);
    expect(saveBody).toMatch(/scheduling\.create\(/);
    expect(saveBody).toMatch(/isTurnoAgendadoModalOpen\.set\(true\)/);
    expect(saveBody.indexOf('isTurnoAgendadoModalOpen.set(true)')).toBeGreaterThan(
      saveBody.indexOf('this.scheduling.create')
    );

    const editBranchStart = saveBody.indexOf('if (this.isEdit()');
    const createBranchStart = saveBody.indexOf('} else {', editBranchStart);
    const editBranch = saveBody.slice(editBranchStart, createBranchStart >= 0 ? createBranchStart : saveBody.length);
    expect(editBranch).toMatch(/rescheduleByAdmin\(/);
    expect(editBranch).not.toMatch(/isTurnoAgendadoModalOpen\.set\(true\)/);

    const createThenNavigate = saveBody.slice(saveBody.indexOf('this.scheduling.create'));
    expect(createThenNavigate).not.toMatch(/saved\.emit\(\)/);
    expect(createThenNavigate).not.toMatch(/router\.navigate\(\[\s*['"]\/dashboard\/turnos['"]\s*\]\)/);

    const catchBlock = saveBody.match(/catch\s*\([^)]*\)\s*\{[\s\S]*?\n    \}/)?.[0] ?? '';
    expect(catchBlock).not.toMatch(/isTurnoAgendadoModalOpen\.set\(true\)/);

    expect(closeBody).toMatch(/isTurnoAgendadoModalOpen\.set\(false\)/);
    expect(closeBody).toMatch(/saved\.emit\(\)/);
    expect(closeBody).toMatch(/router\.navigate\(\[\s*['"]\/dashboard\/turnos['"]\s*\]\)/);
    expect(closeBody.indexOf('saved.emit()')).toBeGreaterThan(closeBody.indexOf('isTurnoAgendadoModalOpen.set(false)'));
    expect(closeBody.indexOf("router.navigate(['/dashboard/turnos'])")).toBeGreaterThan(
      closeBody.indexOf('isTurnoAgendadoModalOpen.set(false)')
    );

    expectResultModalChrome(modal, 'turno-agendado-modal', 'Turno agendado');
    expect(pageHtml).toMatch(/data-testid=["']turno-agendado-modal-overlay["'][\s\S]{0,240}\(click\)=["']closeTurnoAgendadoModal\(\)["']/);
    expect(pageHtml).toMatch(/data-testid=["']turno-agendado-modal-close["'][\s\S]{0,420}\(click\)=["']closeTurnoAgendadoModal\(\)["']/);
    expect(pageHtml).toMatch(/data-testid=["']turno-agendado-modal-done["'][\s\S]{0,420}\(click\)=["']closeTurnoAgendadoModal\(\)["']/);
  });
});
