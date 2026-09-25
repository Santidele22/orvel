import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readServiciosSource(): string {
  const tsPath = resolve(process.cwd(), 'src/app/pages/dashboard/servicios/servicios.page.ts');
  const htmlPath = resolve(process.cwd(), 'src/app/pages/dashboard/servicios/servicios.page.html');

  const tsSource = existsSync(tsPath) ? readFileSync(tsPath, 'utf-8') : '';
  const htmlSource = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : '';

  return `${tsSource}\n${htmlSource}`;
}

describe('D-03 RED contract - Servicios CRUD in dashboard', () => {
  describe('Create service', () => {
    it('opens add modal from deterministic trigger and add flow entrypoint', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/data-testid=["']servicios-modal-add-trigger["']/i);
      expect(source).toMatch(/openAddModal\(\)/);
      expect(source).toMatch(/setActiveModal\(['"]add['"]\)/);
      expect(source).toMatch(/showModal\.set\(true\)/);
    });

    it('enforces required validation on name, duration and price before create submit', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/nombre:\s*\[[^\]]*Validators\.required/i);
      expect(source).toMatch(/duracionMinutos:\s*\[[^\]]*Validators\.required/i);
      expect(source).toMatch(/precio:\s*\[[^\]]*Validators\.required/i);
      expect(source).toMatch(/if\s*\(this\.servicioForm\.invalid\)/);
      expect(source).toMatch(/markAllAsTouched\(\)/);
    });

    it('submits create with persistence call and refreshes the rendered list', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/onCreateServicio\(\)/);
      expect(source).toMatch(/servicioService\.create\(/);
      expect(source).toMatch(/(await\s+this\.loadData\(\)|await\s+firstValueFrom\(this\.servicioService\.getAll\(\)\))/);
    });

    it('keeps modal open and exposes feedback when create submit fails', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/onCreateServicio\([\s\S]*try\s*\{[\s\S]*\}\s*catch\s*\{/);
      expect(source).toMatch(/feedback\.set\(/);
      expect(source).not.toMatch(/catch\s*\{[\s\S]*closeModal\(\)/);
    });
  });

  describe('Edit service', () => {
    it('opens edit modal with selected service data prefilled', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/openEditModal\(servicio\?:\s*Servicio\)/);
      expect(source).toMatch(/setActiveModal\(['"]edit['"]\)/);
      expect(source).toMatch(/selectedServicioDraft\.set\(servicio/);
      expect(source).toMatch(/servicioForm\.patchValue\(/);
    });

    it('persists edits via service update and refreshes list after save', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/(activeModalType\(\)\s*===\s*['"]edit['"]|openEditModal)/);
      expect(source).toMatch(/servicioService\.update\(/);
      expect(source).toMatch(/(await\s+this\.loadData\(\)|await\s+firstValueFrom\(this\.servicioService\.getAll\(\)\))/);
    });

    it('cancel action resets draft/form state to avoid leakage between sessions', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/cancelServiciosModal\(\)/);
      expect(source).toMatch(/resetModalDraftState\(\)/);
      expect(source).toMatch(/selectedServicioDraft\.set\(null\)/);
      expect(source).toMatch(/servicioForm\.reset\(/);
      expect(source).toMatch(/activeModalType\.set\(null\)/);
    });
  });

  describe('Delete service', () => {
    it('opens delete confirmation with selected service context', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/openDeleteModal\(servicio\?:\s*Servicio\)/);
      expect(source).toMatch(/setActiveModal\(['"]delete['"]\)/);
      expect(source).toMatch(/selectedServicioDraft\.set\(servicio/);
      expect(source).toMatch(/(selectedServicioDraft\(\)\?\.nombre|selectedServicioDraft\(\)\s*&&)/);
    });

    it('confirm delete persists removal and refreshes list', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/confirmDeleteModal\(\)/);
      expect(source).toMatch(/servicioService\.delete\(/);
      expect(source).toMatch(/(await\s+this\.loadData\(\)|await\s+firstValueFrom\(this\.servicioService\.getAll\(\)\))/);
    });

    it('cancel delete path closes modal and keeps item unchanged', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/data-testid=["']servicios-modal-cancel["']/i);
      expect(source).toMatch(/\(click\)=['"]cancelServiciosModal\(\)['"]/);
      expect(source).not.toMatch(/cancelServiciosModal\([\s\S]*servicioService\.delete\(/);
    });
  });

  describe('Data / tenant safeguards', () => {
    it('requires CRUD mutations to include current tenant/account context', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/(tenantContext|accountId)/i);
      expect(source).toMatch(/servicioService\.(create|update|delete)\([\s\S]*(tenantContext|accountId)/i);
    });

    it('guards against stale mutation responses corrupting latest list state', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/(mutationVersion|requestId|operationId|inFlightMutationId|stale response)/i);
      expect(source).toMatch(/(if\s*\([^)]*(stale|latest|version|requestId)[^)]*\)\s*\{[\s\S]*(return|ignore))/i);
    });
  });

  describe('Regression guard from D-01 modal reliability', () => {
    it('keeps D-01 modal reliability hooks for servicios intact', () => {
      const source = readServiciosSource();

      expect(source).toMatch(/data-testid=["']servicios-modal-(add|edit|delete)-trigger["']/i);
      expect(source).toMatch(/data-testid=["']servicios-modal-close["']/i);
      expect(source).toMatch(/data-testid=["']servicios-modal-overlay["']/i);
      expect(source).toMatch(/document:keydown\.escape/i);
      expect(source).toMatch(/role=["']dialog["']/i);
      expect(source).toMatch(/aria-modal=["']true["']/i);
    });
  });
});
