import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readPage(file: 'servicios' | 'clientes'): string {
  return readFileSync(
    resolve(process.cwd(), `src/app/pages/dashboard/${file}/${file}.page.ts`),
    'utf-8'
  );
}

describe('Sprint 1 RED - Atomic layering contract for dashboard pages', () => {
  it('uses at least one reusable presentational component from shared layer', () => {
    // TODO(Aurora): conectar page/container con al menos un componente presentacional reutilizable (atom/molecule)
    const serviciosSource = readPage('servicios');
    const clientesSource = readPage('clientes');
    const combinedSource = `${serviciosSource}\n${clientesSource}`;

    expect(combinedSource).toMatch(/shared\/components\//);
    expect(combinedSource).toMatch(/imports:\s*\[[\s\S]*(Component|Directive|Pipe)/);
  });
});
