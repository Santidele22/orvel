import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readConfiguracionTsSource(): string {
  const tsPath = resolve(
    process.cwd(),
    'src/app/pages/dashboard/configuracion/configuracion.page.ts'
  );

  return existsSync(tsPath) ? readFileSync(tsPath, 'utf-8') : '';
}

describe('Sprint 2 RED - Atomic layering contract for settings page', () => {
  it('uses at least one reusable shared presentational component', () => {
    // TODO(Aurora): reutilizar componente presentacional de shared/components en configuracion.page.ts
    const source = readConfiguracionTsSource();

    expect(source).toMatch(/shared\/components\//);
    expect(source).toMatch(/imports:\s*\[[\s\S]*(Component|Directive|Pipe)/);
  });
});
