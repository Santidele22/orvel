import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function clientFormFooter(html: string): string {
  const match = html.match(
    /<div class="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:justify-end">([\s\S]*?)<\/div>/,
  );
  expect(match, 'client form footer row').toBeTruthy();
  return match![1];
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

  it('places dar de baja in the same footer row as Guardar cambios when editing', () => {
    const html = read('src/app/features/clientes/pages/clientes.page.html');
    const footer = clientFormFooter(html);

    expect(footer).toMatch(/@if \(editingClientId\(\)\) \{/);
    expect(footer).toMatch(/data-testid=["']clientes-dar-de-baja["']/);
    expect(footer).toMatch(/\(click\)=["']openBajaConfirm\(\)["']/);
    expect(footer).toMatch(/data-testid=["']client-form-submit["']/);
    expect(footer).toMatch(/editingClientId\(\) \? 'Guardar cambios' : 'Crear cliente'/);

    const bajaIdx = footer.indexOf('clientes-dar-de-baja');
    const submitIdx = footer.indexOf('client-form-submit');
    expect(bajaIdx).toBeGreaterThan(-1);
    expect(submitIdx).toBeGreaterThan(bajaIdx);

    expect(footer).not.toMatch(/data-testid=["']clientes-dar-de-baja["'][^>]*\bw-full\b/);
    expect(html).not.toMatch(
      /@if \(editingClientId\(\)\) \{[\s\S]*?data-testid=["']clientes-dar-de-baja["'][\s\S]*?\}[\s\S]*?<div class="flex flex-col-reverse gap-3 pt-3 sm:flex-row sm:justify-end">/,
    );
  });

  it('does not render Borrar on the edit modal footer', () => {
    const html = read('src/app/features/clientes/pages/clientes.page.html');
    const footer = clientFormFooter(html);

    expect(footer).toMatch(
      /@if \(editingClientId\(\)\) \{[\s\S]*?data-testid=["']clientes-dar-de-baja["'][\s\S]*?\} @else \{[\s\S]*?data-testid=["']clientes-modal-cancel["'][\s\S]*?>Borrar<\/button>/,
    );
    expect(footer).not.toMatch(
      /<div class="flex flex-col-reverse[^"]*">\s*<button type="button" data-testid=["']clientes-modal-cancel["']/,
    );
  });

  it('keeps create-client footer with Crear cliente and without dar de baja outside editing', () => {
    const html = read('src/app/features/clientes/pages/clientes.page.html');
    const footer = clientFormFooter(html);

    expect(footer).toMatch(/: 'Crear cliente'/);
    expect(footer).toMatch(/data-testid=["']clientes-modal-cancel["'][\s\S]*>Borrar<\/button>/);
    expect(html).toMatch(/@if \(editingClientId\(\)\) \{[\s\S]{0,900}data-testid=["']clientes-dar-de-baja["']/);

    const bajaButtonMatches = html.match(/data-testid=["']clientes-dar-de-baja["']/g) ?? [];
    expect(bajaButtonMatches).toHaveLength(1);
  });

  it('keeps the baja confirm modal unchanged', () => {
    const html = read('src/app/features/clientes/pages/clientes.page.html');

    expect(html).toMatch(/data-testid=["']clientes-dar-de-baja-confirm-modal["']/);
    expect(html).toMatch(/data-testid=["']clientes-dar-de-baja-confirm["'][\s\S]{0,420}\(click\)=["']confirmBaja\(\)["']/);
    expect(html).toMatch(/data-testid=["']clientes-dar-de-baja-cancel["'][\s\S]{0,360}\(click\)=["']cancelBajaConfirm\(\)["']/);
    expect(html).toMatch(/¿Dar de baja a este cliente\?/);
  });
});
