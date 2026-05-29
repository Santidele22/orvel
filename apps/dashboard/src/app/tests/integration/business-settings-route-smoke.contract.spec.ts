import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function getRoutesSource(): string {
  const routesPath = resolve(process.cwd(), 'src/app/app.routes.ts');
  return readFileSync(routesPath, 'utf-8');
}

describe('Sprint 2 route-level smoke contract (Business Settings)', () => {
  it('registers /dashboard/configuracion under dashboard children routes', () => {
    // TODO(Aurora): agregar ruta hija path: 'configuracion' en app.routes.ts
    const routesSource = getRoutesSource();

    expect(routesSource).toMatch(/path:\s*'dashboard'/);
    expect(routesSource).toMatch(/children:\s*\[[\s\S]*path:\s*'configuracion'/);
  });
});
