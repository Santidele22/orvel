import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function readAppFile(path: string): string {
  return readFileSync(join(root, path), 'utf-8');
}

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(`\\n\\s{2}(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`).exec(sourceText);
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

describe('Dashboard corrective UI actions contract', () => {
  it('wires Gestionar bajas to a real active/deactivated client view instead of a disabled null delete action', () => {
    const clientesTs = readAppFile('src/app/features/clientes/pages/clientes.page.ts');
    const clientesHtml = readAppFile('src/app/features/clientes/pages/clientes.page.html');

    const actionButton = clientesHtml.match(/<button[\s\S]{0,700}data-testid=["']clientes-deactivate-action["'][\s\S]{0,700}>/i)?.[0] ?? '';

    expect(clientesTs).toMatch(/showDeactivated\s*=\s*signal\(false\)/);
    expect(clientesTs).toMatch(/manageDeactivations\(/);
    expect(clientesTs).toMatch(/queryParams:\s*\{\s*estado:\s*nextValue\s*\?\s*['"]bajas['"]/i);
    expect(clientesTs).toMatch(/cliente\.active\s*===\s*deactivatedMode/);
    expect(actionButton).not.toMatch(/\[disabled\]=["']!editingClientId\(\)["']|performDeactivate\(editingClientId\(\)!\)/i);
    expect(actionButton).toMatch(/manageDeactivations\(\)/);
    expect(actionButton).toMatch(/aria-pressed/);
  });

  it('opens a safe service delete confirmation and only deletes from the confirm action', () => {
    const serviciosTs = readAppFile('src/app/features/servicios/pages/servicios.page.ts');
    const serviciosHtml = readAppFile('src/app/features/servicios/pages/servicios.page.html');
    const openDeleteBody = methodBody(serviciosTs, 'openDeleteServicio');
    const confirmDeleteBody = methodBody(serviciosTs, 'confirmDeleteServicio');

    expect(serviciosTs).toMatch(/deleteConfirmServiceId\s*=\s*signal<string \| null>\(null\)/);
    expect(openDeleteBody).toMatch(/deleteConfirmServiceId\.set\(serviceId\)/);
    expect(openDeleteBody).not.toMatch(/performDeleteServicio\(|servicioService\.(?:update|delete)\(/);
    expect(confirmDeleteBody).toMatch(/performDeleteServicio\(serviceId\)/);
    expect(serviciosHtml).toMatch(/data-testid=["']servicios-delete-confirm-modal["'][\s\S]{0,260}role=["']dialog["']|role=["']dialog["'][\s\S]{0,260}data-testid=["']servicios-delete-confirm-modal["']/i);
    expect(serviciosHtml).toMatch(/aria-modal=["']true["']/i);
    expect(serviciosHtml).toMatch(/data-testid=["']servicios-delete-cancel["'][\s\S]{0,360}\(click\)=["']cancelDeleteServicio\(\)["']/i);
    expect(serviciosHtml).toMatch(/data-testid=["']servicios-delete-confirm["'][\s\S]{0,420}\(click\)=["']confirmDeleteServicio\(\)["']/i);
    expect(serviciosHtml).toMatch(/¿Eliminar este servicio\?|Eliminar servicio/i);
  });

  it('walk-in UI is absent from the operator turno form', () => {
    const turnoHtml = readAppFile('src/app/features/booking/pages/turno-form.page.html');
    const turnoScss = readAppFile('src/app/features/booking/pages/turno-form.page.scss');

    expect(turnoHtml).not.toMatch(/data-testid=["']turno-admin-start-walk-in["']/i);
    expect(turnoHtml).not.toMatch(/data-testid=["']turno-admin-walk-in-name["']/i);
    expect(turnoHtml).not.toMatch(/Atención sin ficha|Agregar walk-in|atención sin ficha/i);
    expect(turnoScss).not.toMatch(/\.walk-in-link/);
  });

  it('keeps the dashboard notification bell high-contrast and fully opaque', () => {
    const topbarTs = readAppFile('src/app/shared/dashboard-topbar/templates/zen-topbar.component.ts');

    expect(topbarTs).toMatch(/data-testid=["']dashboard-topbar-notifications["'][\s\S]{0,420}text-text-primary/i);
    expect(topbarTs).toMatch(/data-testid=["']dashboard-topbar-notifications["'][\s\S]{0,420}border-white\/10/i);
    expect(topbarTs).toMatch(/ri-notification-3-fill[^>]*opacity-100/i);
  });
});
