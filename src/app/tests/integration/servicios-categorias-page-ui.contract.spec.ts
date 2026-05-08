import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readServiciosPageSource(): string {
  const tsPath = resolve(process.cwd(), 'src/app/pages/dashboard/servicios/servicios.page.ts');
  const htmlPath = resolve(process.cwd(), 'src/app/pages/dashboard/servicios/servicios.page.html');

  const tsSource = existsSync(tsPath) ? readFileSync(tsPath, 'utf-8') : '';
  const htmlSource = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : '';

  return `${tsSource}\n${htmlSource}`;
}

describe('Sprint 1 RED - Servicios/Categorías page UI behavior contract', () => {
  it('renders category list with deterministic selector hooks', () => {
    // TODO(Aurora): renderizar lista de categorías real en la página con @for/*ngFor
    const source = readServiciosPageSource();

    expect(source).toMatch(/data-testid=["']category-list["']/);
    expect(source).toMatch(/(@for|\*ngFor)[\s\S]*(categoria|categories)/i);
  });

  it('supports create category form with trim + dedupe feedback UI contract', () => {
    // TODO(Aurora): agregar form reactivo tipado con validación trim/dedupe y feedback accesible
    const source = readServiciosPageSource();

    expect(source).toMatch(/data-testid=["']category-create-form["']/);
    expect(source).toMatch(/data-testid=["']category-input["']/);
    expect(source).toMatch(/trim\(\)/);
    expect(source).toMatch(/(duplicada|existente|ya existe)/i);
    expect(source).toMatch(/data-testid=["']category-feedback["']/);
  });

  it('renders services list/table with category, duration, price and active status columns', () => {
    // TODO(Aurora): implementar tabla/lista de servicios con columnas mínimas del sprint
    const source = readServiciosPageSource();

    expect(source).toMatch(/data-testid=["']services-list["']/);
    expect(source).toMatch(/categor[ií]a/i);
    expect(source).toMatch(/duraci[oó]n/i);
    expect(source).toMatch(/precio/i);
    expect(source).toMatch(/(estado|activo)/i);
  });

  it('implements basic filter/search behavior contract', () => {
    // TODO(Aurora): conectar input de búsqueda/filtro contra el listado renderizado
    const source = readServiciosPageSource();

    expect(source).toMatch(/data-testid=["']services-search-input["']/);
    expect(source).toMatch(/toLowerCase\(\)/);
    expect(source).toMatch(/trim\(\)/);
  });

  it('exposes loading and empty states in template contract', () => {
    // TODO(Aurora): incluir estados loading/empty explícitos para UX determinista
    const source = readServiciosPageSource();

    expect(source).toMatch(/data-testid=["']services-loading-state["']/);
    expect(source).toMatch(/data-testid=["']services-empty-state["']/);
    expect(source).toMatch(/aria-busy/);
  });
});
