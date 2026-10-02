// @vitest-environment jsdom

import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { Routes } from '@angular/router';

import { routes } from '../../app.routes';
import { DASHBOARD_TARGETS, classifyRoutePath, describeSurface } from './dashboard-targets';

/**
 * Fase 0 of #1098: the web/pwa seam has to be machine-checkable, not a paragraph in an ADR.
 * This walks the real router table (including lazy children) and fails when a route is not
 * classified for one of the two targets, so adding a route forces the decision.
 */
async function collectRoutePaths(routeList: Routes, prefix = ''): Promise<string[]> {
  const paths: string[] = [];

  for (const route of routeList) {
    const path = [prefix, route.path ?? ''].filter((segment) => segment !== '').join('/');
    paths.push(path);

    if (route.children?.length) {
      paths.push(...(await collectRoutePaths(route.children, path)));
    }
    if (typeof route.loadChildren === 'function') {
      const loaded: unknown = await route.loadChildren();
      const resolved: unknown = Array.isArray(loaded) ? loaded : await loaded;
      if (Array.isArray(resolved)) {
        paths.push(...(await collectRoutePaths(resolved as Routes, path)));
      }
    }
  }

  return paths;
}

describe('contract: dashboard target surfaces (#1098 Fase 0)', () => {
  it('classifies every route in the real router table as web, pwa or shared', async () => {
    const paths = [...new Set(await collectRoutePaths(routes))].sort();

    expect(paths.length).toBeGreaterThan(15);

    const unclassified = paths.filter((path) => classifyRoutePath(path) === null);
    expect(
      unclassified,
      'Every route must be classified for the web/pwa split. Add a pattern to DASHBOARD_TARGETS ' +
        'in apps/dashboard/src/app/core/platform/dashboard-targets.ts with its reason.'
    ).toEqual([]);
  });

  it('only uses the three declared targets and always explains the call', () => {
    for (const surface of DASHBOARD_TARGETS) {
      expect(DASHBOARD_TARGETS.map((entry) => entry.target)).toContain(surface.target);
      expect(['web', 'pwa', 'shared']).toContain(surface.target);
      expect(surface.reason.length, `${surface.id} must record why`).toBeGreaterThan(20);
      expect(surface.id).toMatch(/^[a-z0-9-]+$/);
    }

    expect(new Set(DASHBOARD_TARGETS.map((entry) => entry.id)).size).toBe(DASHBOARD_TARGETS.length);
  });

  it('classifies the surfaces the ADR decided', () => {
    expect(classifyRoutePath('booking/luna')).toBe('pwa');
    expect(classifyRoutePath('booking/luna/sole')).toBe('pwa');
    expect(classifyRoutePath('booking/manage')).toBe('pwa');
    expect(classifyRoutePath('dashboard/installar')).toBe('pwa');

    expect(classifyRoutePath('dashboard/turnos')).toBe('shared');
    expect(classifyRoutePath('dashboard/inicio')).toBe('shared');
    expect(classifyRoutePath('auth/login')).toBe('shared');
    expect(classifyRoutePath('signup')).toBe('shared');

    // The shell is mounted twice (at /dashboard/* and at /* via canMatch), so the same surfaces
    // have to classify with and without the prefix.
    expect(classifyRoutePath('')).toBe('shared');
    expect(classifyRoutePath('dashboard')).toBe('shared');
    expect(classifyRoutePath('turnos')).toBe('shared');
    expect(classifyRoutePath('clientes')).toBe('web');

    expect(classifyRoutePath('dashboard/configuracion')).toBe('web');
    expect(classifyRoutePath('dashboard/servicios')).toBe('web');
    expect(classifyRoutePath('billing/subscription')).toBe('web');
    expect(classifyRoutePath('billing/subscription/cancel')).toBe('web');
  });

  it('leaves unknown paths unclassified instead of guessing', () => {
    expect(classifyRoutePath('nueva-superficie/x')).toBeNull();
    expect(classifyRoutePath('dashboard/loquesea')).toBeNull();
  });

  it('reports the split as a readable inventory', () => {
    const inventory = describeSurface();

    expect(inventory).toContain('pwa');
    expect(inventory).toContain('web');
    expect(inventory).toContain('shared');
    expect(inventory.split('\n').filter((line) => line.startsWith('- ')).length).toBe(DASHBOARD_TARGETS.length);
  });
});
