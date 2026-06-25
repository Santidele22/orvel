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

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(`\\n\\s{2}(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`).exec(sourceText);
  if (!signatureMatch?.index) return '';

  const signatureStart = signatureMatch.index + 1;
  const bodyStart = sourceText.indexOf('{', signatureStart);
  if (bodyStart === -1) return '';

  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;

    if (depth === 0) return sourceText.slice(signatureStart, index + 1);
  }

  return sourceText.slice(signatureStart);
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

  it('keeps admin new turno action wired to the real modal flow while preserving the deep-link route', () => {
    // M2: the visible primary action opens the real modal flow; /dashboard/turnos/new remains as deep-link fallback.
    const listSource = readListSource();
    const routesSource = readRoutesSource();

    expect(listSource).not.toMatch(/data-testid=["']turno-admin-add-action["']/i);
    expect(listSource).toMatch(/data-testid=["']turnos-admin-create-primary-action["']/i);
    expect(listSource).toMatch(/<button\b(?=[^>]*data-testid=["']turnos-admin-create-primary-action["'])(?=[^>]*type=["']button["'])(?=[^>]*\(click\)=["']openAdminNewTurnoModal\(\)["'])[^>]*>/i);
    expect(listSource).toMatch(/@if\s*\(showNewTurnoModal\(\)\)\s*\{[\s\S]{0,260}<app-turno-form\b[\s\S]{0,260}presentation=["']modal["']/i);
    expect(routesSource).toMatch(/path:\s*['"]turnos\/new['"][\s\S]{0,180}TurnoFormPage/);
  });

  it('closes the Nuevo Turno modal on cancel and refreshes after save', () => {
    const listSource = readListSource();
    const closeBody = methodBody(listSource, 'closeAdminNewTurnoModal');
    const savedBody = methodBody(listSource, 'handleAdminNewTurnoSaved');

    expect(listSource, 'embedded modal must wire cancelled and saved outputs back to the list owner').toMatch(
      /<app-turno-form\b[\s\S]{0,260}\(cancelled\)=["']closeAdminNewTurnoModal\(\)["'][\s\S]{0,260}\(saved\)=["']handleAdminNewTurnoSaved\(\)["']/i
    );
    expect(closeBody, 'cancel/close should hide the modal without navigating away from the list').toMatch(/showNewTurnoModal\.set\(false\)/);
    expect(closeBody, 'cancel should not refresh or navigate because nothing was saved').not.toMatch(/refreshTurnosFromSource|router\.navigate/);
    expect(savedBody, 'save should close the modal before returning control to the list').toMatch(/showNewTurnoModal\.set\(false\)/);
    expect(savedBody, 'save should refresh the timeline/list so the new turno appears').toMatch(/refreshTurnosFromSource\(/);
  });
});
