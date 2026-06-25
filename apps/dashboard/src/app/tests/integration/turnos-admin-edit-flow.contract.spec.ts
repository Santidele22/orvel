import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readTurnoFormSource(): string {
  const tsPath = resolve(process.cwd(), 'src/app/features/booking/pages/turno-form.page.ts');
  const htmlPath = resolve(process.cwd(), 'src/app/features/booking/pages/turno-form.page.html');
  return `${readFileSync(tsPath, 'utf-8')}\n${readFileSync(htmlPath, 'utf-8')}`;
}

function readRoutesSource(): string {
  const routesPath = resolve(process.cwd(), 'src/app/app.routes.ts');
  return readFileSync(routesPath, 'utf-8');
}

describe('Turnos admin edit flow integration RED contract', () => {
  it('allows admin reprogramar from edit flow only if slot available', () => {
    // TODO(Aurora): integrar rescheduleByAdmin en flujo editar con submit explícito de reprogramación
    const source = readTurnoFormSource();

    expect(source).toMatch(/rescheduleByAdmin\(/);
    expect(source).toMatch(/data-testid=["']turno-admin-reschedule-submit["']/i);
  });

  it('blocks admin reprogramar when target slot is unavailable and shows deterministic feedback', () => {
    // TODO(Aurora): normalizar feedback de reprogramación bloqueada con hook accesible
    const source = readTurnoFormSource();

    expect(source).toMatch(/TURNO_SLOT_COLLISION/);
    expect(source).toMatch(/data-testid=["']turno-admin-reschedule-feedback["']/i);
    expect(source).toMatch(/aria-live=["']polite["']/i);
  });

  it('keeps /dashboard/turnos edit route smoke for admin actions', () => {
    // TODO(Aurora): mantener ruta de edición estable al conectar acciones admin
    const routesSource = readRoutesSource();

    expect(routesSource).toMatch(/export\s+const\s+dashboardShellChildren\s*:\s*Routes\s*=\s*\[/);
    expect(routesSource).toMatch(/dashboardShellChildren[\s\S]*path:\s*'turnos\/edit\/:id'[\s\S]*TurnoFormPage/);
    expect(routesSource).toMatch(/path:\s*'dashboard'/);
    expect(routesSource).toMatch(/path:\s*'dashboard'[\s\S]*children:\s*dashboardShellChildren/);
  });
});
