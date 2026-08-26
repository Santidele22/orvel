import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('Clientes dar de baja contract', () => {
  it('exposes dar de baja from the edit-client modal with a confirm step', () => {
    const ts = read('src/app/features/clientes/pages/clientes.page.ts');
    const html = read('src/app/features/clientes/pages/clientes.page.html');

    expect(html).toMatch(/data-testid=["']clientes-dar-de-baja["']/);
    expect(html).toMatch(/data-testid=["']clientes-dar-de-baja["'][\s\S]{0,500}\(click\)=["']openBajaConfirm\(\)["']/);
    expect(html).toMatch(/data-testid=["']clientes-dar-de-baja-confirm-modal["']/);
    expect(html).toMatch(/data-testid=["']clientes-dar-de-baja-confirm["'][\s\S]{0,420}\(click\)=["']confirmBaja\(\)["']/);
    expect(html).toMatch(/data-testid=["']clientes-dar-de-baja-cancel["'][\s\S]{0,360}\(click\)=["']cancelBajaConfirm\(\)["']/);
    expect(html).toMatch(/Dar de baja/i);

    expect(ts).toMatch(/openBajaConfirm\s*\(/);
    expect(ts).toMatch(/confirmBaja\s*\(/);
    expect(ts).toMatch(/cancelBajaConfirm\s*\(/);
    expect(ts).toMatch(/performDeactivate\(/);
  });
});
