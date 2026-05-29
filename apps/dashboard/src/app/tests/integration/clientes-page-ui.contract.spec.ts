import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readClientesPageSource(): string {
  const tsPath = resolve(process.cwd(), 'src/app/pages/dashboard/clientes/clientes.page.ts');
  const htmlPath = resolve(process.cwd(), 'src/app/pages/dashboard/clientes/clientes.page.html');

  const tsSource = existsSync(tsPath) ? readFileSync(tsPath, 'utf-8') : '';
  const htmlSource = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : '';

  return `${tsSource}\n${htmlSource}`;
}

describe('Sprint 1 RED - Clientes page UI behavior contract', () => {
  it('renders clients list with deterministic selector hooks', () => {
    // TODO(Aurora): renderizar listado de clientes y filas derivadas de facade/service mock
    const source = readClientesPageSource();

    expect(source).toMatch(/data-testid=["']clients-list["']/);
    expect(source).toMatch(/(@for|\*ngFor)[\s\S]*(cliente|clients)/i);
  });

  it('implements search input behavior with trim + case-insensitive normalization', () => {
    // TODO(Aurora): wirear buscador reactivo con normalización trim + lowercase
    const source = readClientesPageSource();

    expect(source).toMatch(/data-testid=["']clients-search-input["']/);
    expect(source).toMatch(/trim\(\)/);
    expect(source).toMatch(/toLowerCase\(\)/);
  });

  it('defines create/edit form interactions (positive submit + validation case)', () => {
    // TODO(Aurora): crear formulario tipado de clientes con submit válido y estado inválido visible
    const source = readClientesPageSource();

    expect(source).toMatch(/data-testid=["']client-form["']/);
    expect(source).toMatch(/formControlName=["']nombre["']/);
    expect(source).toMatch(/formControlName=["']telefono["']/);
    expect(source).toMatch(/(invalid|errors|invalido)/i);
    expect(source).toMatch(/data-testid=["']client-form-submit["']/);
  });

  it('exposes loading and empty states in template contract', () => {
    // TODO(Aurora): agregar estados visuales loading/empty en clientes
    const source = readClientesPageSource();

    expect(source).toMatch(/data-testid=["']clients-loading-state["']/);
    expect(source).toMatch(/data-testid=["']clients-empty-state["']/);
    expect(source).toMatch(/aria-busy/);
  });
});
