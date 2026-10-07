// @vitest-environment jsdom

import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import type { Routes } from '@angular/router';

import { routes as webRoutes } from '../../app.routes';
import { dashboardWebShellChildren } from '../../shell.routes';
import { routes as pwaRoutes } from '../../../../../dashboard/src/app/app.routes';
import { dashboardShellChildren } from '../../../../../dashboard/src/app/dashboard-shell.routes';
import {
  classifyRoutePath,
  normalizeRoutePath
} from '@orvel/dashboard-core/platform/dashboard-targets';

/**
 * Fase 3 of #1098 — the web target's side of the seam, as a contract.
 *
 * Fase 0 made the classification machine-checkable; this spec makes the *web app's router table*
 * answer to it. It walks both real tables (the PWA's and this app's, including lazy children) and
 * fails when:
 *
 *   1. a route in the web table is classified `pwa` (the web target mounted something that belongs
 *      to the installable product);
 *   2. a route in the web table is not classified at all (someone added a surface without deciding);
 *   3. a `web`/`shared` route of the PWA is missing from the web table (the split silently dropped a
 *      surface, which is the failure mode that matters: losing the console in the web artifact).
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

describe('contract: the web target mounts only web and shared surfaces (#1098 Fase 3)', () => {
  it('classifies every web-target route as web or shared, never pwa, never unclassified', async () => {
    const paths = [...new Set(await collectRoutePaths(webRoutes))].sort();

    expect(paths.length).toBeGreaterThan(10);

    const pwaInWeb = paths.filter((path) => classifyRoutePath(path) === 'pwa');
    expect(
      pwaInWeb,
      'The web target must not mount a pwa-classified route. Remove it here, or move the surface ' +
        'to `shared` in DASHBOARD_TARGETS with its reason.'
    ).toEqual([]);

    const unclassified = paths.filter((path) => classifyRoutePath(path) === null);
    expect(
      unclassified,
      'Every route must be classified for the web/pwa split. Add a pattern to DASHBOARD_TARGETS in ' +
        'packages/dashboard-core/src/platform/dashboard-targets.ts with its reason.'
    ).toEqual([]);
  });

  it('mounts every web/shared route the PWA exposes', async () => {
    const webPaths = new Set((await collectRoutePaths(webRoutes)).map(normalizeRoutePath));
    const pwaPaths = [...new Set(await collectRoutePaths(pwaRoutes))].map(normalizeRoutePath);

    const required = pwaPaths.filter((path) => {
      const target = classifyRoutePath(path);
      return target === 'web' || target === 'shared';
    });

    const missing = required.filter((path) => !webPaths.has(path));
    expect(
      missing,
      'A surface classified web/shared is missing from the web target. Mount it in ' +
        'apps/dashboard-web/src/app/app.routes.ts (or reclassify it in DASHBOARD_TARGETS).'
    ).toEqual([]);
  });

  it('keeps every shell child it mounts classified as web or shared', () => {
    const paths = dashboardWebShellChildren.map((route) => normalizeRoutePath(route.path ?? ''));

    const unclassified = paths.filter((path) => classifyRoutePath(path) === null);
    expect(unclassified, 'A shell child must be classified before the web target mounts it.').toEqual([]);

    const pwaOnly = paths.filter((path) => classifyRoutePath(path) === 'pwa');
    expect(pwaOnly, 'The web shell must not mount a pwa-classified child.').toEqual([]);
  });

  it('drops no shell child the PWA declares: the filter is a seam, not a silent loss', () => {
    const declared = dashboardShellChildren.map((route) => normalizeRoutePath(route.path ?? ''));
    const mounted = dashboardWebShellChildren.map((route) => normalizeRoutePath(route.path ?? ''));

    const dropped = declared.filter((path) => !mounted.includes(path));
    const droppedWebOrShared = dropped.filter((path) => {
      const target = classifyRoutePath(path);
      return target === 'web' || target === 'shared';
    });

    expect(
      droppedWebOrShared,
      'The web shell silently dropped a web/shared child. Either mount it or reclassify it.'
    ).toEqual([]);
  });
});
