import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readListSource(): string {
  const tsPath = resolve(process.cwd(), 'src/app/features/booking/pages/turnos-list.page.ts');
  const htmlPath = resolve(process.cwd(), 'src/app/features/booking/pages/turnos-list.page.html');
  return `${readFileSync(tsPath, 'utf-8')}\n${readFileSync(htmlPath, 'utf-8')}`;
}

function readRoutesSource(): string {
  const routesPath = resolve(process.cwd(), 'src/app/app.routes.ts');
  return readFileSync(routesPath, 'utf-8');
}

describe('Turnos list admin actions integration RED contract', () => {
  it('keeps cancel action from list and refreshes UI contract state', () => {
    // TODO(Aurora): mantener cancelación admin operativa con hook estable post-migración de acciones.
    const source = readListSource();

    expect(source).toMatch(/cancelByAdmin\(|cancelTurnoByAdmin\(/);
    expect(source).toMatch(/data-testid=["']turno-admin-cancel-action["']/i);
    expect(source).toMatch(/(processTurnos\(|refreshTurnos\()/);
  });

  it('keeps reschedule action available in admin flows', () => {
    // TODO(Aurora): exponer CTA visible de reprogramación en listado admin con hook M4 actual.
    const source = readListSource();

    expect(source).toMatch(/rescheduleByAdmin\(/);
    expect(source).toMatch(/data-testid=["']turnos-admin-reschedule-action["']/i);
  });

  it('removes Complete action everywhere in turnos admin', () => {
    // TODO(Aurora): retirar completeByAdmin y su CTA en todas las entradas admin de turnos.
    const source = readListSource();

    expect(source).not.toMatch(/completeByAdmin\(|markTurnoCompleted\(/);
    expect(source).not.toMatch(/data-testid=["']turno-admin-complete-action["']/i);
    expect(source).not.toMatch(/canCompleteByAdmin\(/);
  });

  it('keeps admin new turno action wired to the real create route', () => {
    // M2: admin creation is allowed only through the real form route, not through fake list-side payloads.
    const listSource = readListSource();
    const routesSource = readRoutesSource();

    expect(listSource).not.toMatch(/data-testid=["']turno-admin-add-action["']/i);
    expect(listSource).toMatch(/data-testid=["']turnos-admin-create-primary-action["']/i);
    expect(listSource).toMatch(/routerLink=["']\/dashboard\/turnos\/new["']/i);
    expect(routesSource).toMatch(/path:\s*['"]turnos\/new['"]/);
  });
});
