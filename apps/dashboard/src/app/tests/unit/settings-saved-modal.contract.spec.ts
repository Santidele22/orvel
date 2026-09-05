import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSource(relativePath: string): string {
  const absolutePath = resolve(process.cwd(), relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : '';
}

function extractOnSubmit(pageTs: string): string {
  const start = pageTs.indexOf('async onSubmit(');
  const end = pageTs.indexOf('\n  private createDayGroup', start);
  return start >= 0 ? pageTs.slice(start, end >= 0 ? end : undefined) : '';
}

function extractSettingsSavedModal(pageHtml: string): string {
  const start = pageHtml.indexOf('@if (isSettingsSavedModalOpen())');
  if (start < 0) {
    return '';
  }

  const nextIf = pageHtml.indexOf('@if (', start + 1);
  const timeModal = pageHtml.indexOf('<app-configuracion-time-modal', start);
  const end = Math.min(
    nextIf >= 0 ? nextIf : pageHtml.length,
    timeModal >= 0 ? timeModal : pageHtml.length
  );
  return pageHtml.slice(start, end);
}

describe('Contract: settings saved modal after Configuraciones persist', () => {
  it('opens a saved-settings dialog on successful persist without reloading', () => {
    const pageTs = readSource('src/app/features/settings/pages/configuracion.page.ts');
    const pageHtml = readSource('src/app/features/settings/pages/configuracion.page.html');
    const onSubmit = extractOnSubmit(pageTs);

    expect(pageTs).toMatch(/isSettingsSavedModalOpen\s*=\s*signal\(false\)/);
    expect(onSubmit).toMatch(/this\.facade\.save\(/);
    expect(onSubmit).toMatch(/this\.isSettingsSavedModalOpen\.set\(true\)/);
    expect(onSubmit.indexOf('this.isSettingsSavedModalOpen.set(true)')).toBeGreaterThan(onSubmit.indexOf('this.facade.save('));
    expect(onSubmit).not.toMatch(/settingsForm\.reset\(/);
    expect(onSubmit).not.toMatch(/location\.reload|window\.location/);

    expect(pageHtml).toMatch(/@if\s*\(\s*isSettingsSavedModalOpen\(\)\s*\)/);
    expect(pageHtml).toMatch(/data-testid=["']settings-saved-modal["']/);
    expect(pageHtml).toContain('Configuración guardada');
    expect(pageHtml).toMatch(/role=["']dialog["']/);
    expect(pageHtml).toMatch(/aria-modal=["']true["']/);
  });

  it('keeps validation and persist errors inline and never opens the success modal on failure', () => {
    const pageTs = readSource('src/app/features/settings/pages/configuracion.page.ts');
    const onSubmit = extractOnSubmit(pageTs);
    const catchBlock = onSubmit.match(/catch\s*\([^)]*\)\s*\{[\s\S]*?\n    \}/)?.[0] ?? '';

    expect(onSubmit).toMatch(/Formulario inválido[\s\S]*return;/);
    expect(onSubmit).toMatch(/No se pudo guardar la configuración/);
    expect(catchBlock).not.toMatch(/isSettingsSavedModalOpen\.set\(true\)/);
    expect(onSubmit).toMatch(/if\s*\(!validation\.isValid\)\s*\{[\s\S]*return;/);
    expect(onSubmit.indexOf('if (!validation.isValid)')).toBeLessThan(onSubmit.indexOf('this.facade.save('));
  });

  it('dismisses the saved modal via Entendido, overlay click, and close icon without resetting the form', () => {
    const pageTs = readSource('src/app/features/settings/pages/configuracion.page.ts');
    const pageHtml = readSource('src/app/features/settings/pages/configuracion.page.html');

    expect(pageHtml).toMatch(/data-testid=["']settings-saved-modal-overlay["']/);
    expect(pageHtml).toMatch(/data-testid=["']settings-saved-modal-close["']/);
    expect(pageHtml).toMatch(/Entendido/);
    expect(pageHtml).toMatch(/\(click\)=["']closeSettingsSavedModal\(\)["']/);
    expect(pageTs).toMatch(/closeSettingsSavedModal\s*\(\s*\)\s*:\s*void\s*\{[\s\S]*isSettingsSavedModalOpen\.set\(false\)/);
    expect(pageTs).not.toMatch(/closeSettingsSavedModal\s*\(\s*\)\s*:\s*void\s*\{[\s\S]{0,200}settingsForm\.reset\(/);
  });

  it('uses compact dashboard dialog chrome instead of leftover zen placeholder tokens', () => {
    const pageHtml = readSource('src/app/features/settings/pages/configuracion.page.html');
    const modal = extractSettingsSavedModal(pageHtml);

    expect(modal).toContain('bg-black/65');
    expect(modal).toContain('backdrop-blur-md');
    expect(modal).toContain('max-w-lg');
    expect(modal).toContain('rounded-3xl');
    expect(modal).toContain('border-white/10');
    expect(modal).toContain('bg-[#121827]');
    expect(modal).toContain('h-9 w-9');
    expect(modal).toContain('h-11 w-11');
    expect(modal).toMatch(/h-11 rounded-xl bg-primary/);
    expect(modal).not.toContain('max-w-zen-content');
    expect(modal).not.toContain('p-zen-xxl');
    expect(modal).not.toContain('h-20 w-20');
    expect(modal).not.toContain('text-4xl');
  });

  it('opens the saved modal after Equipo hours persist', () => {
    const pageTs = readSource('src/app/features/settings/pages/configuracion.page.ts');
    const saveHours = pageTs.slice(pageTs.indexOf('async saveProfessionalHours('));

    expect(saveHours).toMatch(/replaceProfessionalHours\(/);
    expect(saveHours).toMatch(/isSettingsSavedModalOpen\.set\(true\)/);
    expect(saveHours.indexOf('isSettingsSavedModalOpen.set(true)')).toBeGreaterThan(
      saveHours.indexOf('replaceProfessionalHours(')
    );
  });
});
