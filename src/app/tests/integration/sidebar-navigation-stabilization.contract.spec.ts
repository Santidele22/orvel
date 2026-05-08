import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSidebarTemplate(): string {
  return readFileSync(
    resolve(process.cwd(), 'src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html'),
    'utf-8'
  );
}

function readTurnosListSource(): string {
  const tsPath = resolve(process.cwd(), 'src/app/pages/dashboard/turnos/turnos-list.page.ts');
  const htmlPath = resolve(process.cwd(), 'src/app/pages/dashboard/turnos/turnos-list.page.html');
  return `${readFileSync(tsPath, 'utf-8')}\n${readFileSync(htmlPath, 'utf-8')}`;
}

function section(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  if (start === -1 || end === -1) {
    return '';
  }

  return source.slice(start, end);
}

describe('Sidebar stabilization RED contract (functional navigation + admin policy)', () => {
  const requiredRoutes = [
    '/dashboard/turnos',
    '/dashboard/clientes',
    '/dashboard/servicios',
    '/dashboard/configuracion'
  ];

  const templates = [
    {
      name: 'Zen',
      startMarker: '<!-- ZEN SIDEBAR -->',
      endMarker: '<!-- INDUSTRIAL SIDEBAR -->'
    },
    {
      name: 'Industrial',
      startMarker: '<!-- INDUSTRIAL SIDEBAR -->',
      endMarker: '<!-- CHIC SIDEBAR -->'
    },
    {
      name: 'Chic',
      startMarker: '<!-- CHIC SIDEBAR -->',
      endMarker: '<!-- INK SIDEBAR -->'
    },
    {
      name: 'Ink',
      startMarker: '<!-- INK SIDEBAR -->',
      endMarker: '<div class="sr-only" data-testid="sidebar-account-actions">'
    }
  ];

  it.each(templates)(
    'requires complete routerLink supervision routes in $name sidebar',
    ({ startMarker, endMarker }) => {
      const sidebar = readSidebarTemplate();
      const templateSection = section(sidebar, startMarker, endMarker);

      expect(templateSection).not.toBe('');

      for (const route of requiredRoutes) {
        const routeRegex = new RegExp(`routerLink=["']${route}["']`, 'i');
        expect(templateSection).toMatch(routeRegex);
      }
    }
  );

  it.each(templates)('removes sidebar primary booking CTA in $name admin template', ({ startMarker, endMarker }) => {
    const sidebar = readSidebarTemplate();
    const templateSection = section(sidebar, startMarker, endMarker);

    expect(templateSection).not.toMatch(/data-testid=["']sidebar-primary-action["']/i);
    expect(templateSection).not.toMatch(/\b(quick\s*book|reservation|new\s*order|new\s*session|nueva\s+reserv)/i);
  });

  it('keeps turnos list admin actions restricted to cancel + reschedule only', () => {
    const listSource = readTurnosListSource();

    expect(listSource).toMatch(/data-testid=["']turno-admin-cancel-action["']/i);
    expect(listSource).toMatch(/data-testid=["']turno-admin-reschedule-action["']/i);

    expect(listSource).not.toMatch(/data-testid=["']turno-admin-complete-action["']/i);
    expect(listSource).not.toMatch(/data-testid=["']turno-admin-add-action["']/i);
    expect(listSource).not.toMatch(/\b(completeByAdmin|markTurnoCompleted|addTurno|createTurno|newTurno)\b/);
  });
});
