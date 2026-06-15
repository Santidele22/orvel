import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function getRoutesSource(): string {
  const routesPath = resolve(process.cwd(), 'src/app/app.routes.ts');
  return readFileSync(routesPath, 'utf-8');
}

describe('Sprint 1 route-level smoke contract', () => {
  it('registers /dashboard/servicios route', () => {
    // TODO(Aurora): agregar página de servicios y su ruta hija en app.routes.ts
    const routesSource = getRoutesSource();
    expect(routesSource).toMatch(/path:\s*'servicios'/);
  });

  it('registers /dashboard/clientes route', () => {
    // TODO(Aurora): agregar página de clientes y su ruta hija en app.routes.ts
    const routesSource = getRoutesSource();
    expect(routesSource).toMatch(/path:\s*'clientes'/);
  });
});
