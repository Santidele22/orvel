import { describe, expect, it } from 'vitest';

import { patchVercelOutputConfig } from '../../../../scripts/vercel-output-config.mjs';

const BOOKING_SPA = { src: '/booking(?:/.*)?', dest: '/dashboard/index.html' };
const DASHBOARD_SPA = { src: '/dashboard(?:/.*)?', dest: '/dashboard/index.html' };
const NOT_FOUND = { src: '/.*', dest: '/404', status: 404 };

function routeIndex(routes: Array<Record<string, unknown>>, predicate: (route: Record<string, unknown>) => boolean) {
  return routes.findIndex(predicate);
}

function firstMatchingDest(routes: Array<Record<string, unknown>>, pathname: string) {
  const filesystemIndex = routeIndex(routes, (route) => route.handle === 'filesystem');
  const afterFilesystem = filesystemIndex >= 0 ? routes.slice(filesystemIndex + 1) : routes;
  for (const route of afterFilesystem) {
    if (typeof route.src !== 'string' || typeof route.dest !== 'string') {
      continue;
    }
    if (new RegExp(`^${route.src}$`).test(pathname)) {
      return route.dest;
    }
  }
  return undefined;
}

describe('Contract: Vercel SPA rewrite stays after filesystem and before 404', () => {
  it('places booking SPA rewrite after filesystem and before the /.* 404 dest', () => {
    const fixture = {
      version: 3,
      routes: [
        { src: '/_astro/(.*)', dest: '/_astro/$1' },
        { handle: 'filesystem' },
        { src: '/api/(.*)', dest: '/api' },
        NOT_FOUND,
      ],
    };

    const patched = patchVercelOutputConfig(fixture);
    const routes = patched.routes as Array<Record<string, unknown>>;

    const filesystemIndex = routeIndex(routes, (route) => route.handle === 'filesystem');
    const bookingIndex = routeIndex(
      routes,
      (route) => route.src === BOOKING_SPA.src && route.dest === BOOKING_SPA.dest,
    );
    const dashboardIndex = routeIndex(
      routes,
      (route) => route.src === DASHBOARD_SPA.src && route.dest === DASHBOARD_SPA.dest,
    );
    const notFoundIndex = routeIndex(
      routes,
      (route) => route.src === NOT_FOUND.src && route.status === 404,
    );

    expect(filesystemIndex).toBeGreaterThanOrEqual(0);
    expect(bookingIndex).toBeGreaterThan(filesystemIndex);
    expect(dashboardIndex).toBeGreaterThan(filesystemIndex);
    expect(notFoundIndex).toBeGreaterThan(bookingIndex);
    expect(routes[notFoundIndex]?.dest).toBe(NOT_FOUND.dest);
  });

  it('inserts filesystem then SPA rewrites when the fixture has no filesystem handle',
    () => {
      const fixture = {
        version: 3,
        routes: [
          { src: '/api/(.*)', dest: '/api' },
          NOT_FOUND,
        ],
      };

      const patched = patchVercelOutputConfig(fixture);
      const routes = patched.routes as Array<Record<string, unknown>>;

      expect(routes[0]).toEqual({ handle: 'filesystem' });
      expect(routes[1]).toEqual(DASHBOARD_SPA);
      expect(routes[2]).toEqual(BOOKING_SPA);
      expect(routes.some((route) => route.src === NOT_FOUND.src && route.status === 404)).toBe(true);
    },
  );

  it('keeps /booking/manage on the SPA rewrite dest, not a 404 dest',
    () => {
      const fixture = {
        version: 3,
        routes: [{ handle: 'filesystem' }, NOT_FOUND],
      };

      const patched = patchVercelOutputConfig(fixture);
      const dest = firstMatchingDest(patched.routes as Array<Record<string, unknown>>, '/booking/manage');

      expect(dest).toBe('/dashboard/index.html');
      expect(dest).not.toBe(NOT_FOUND.dest);
      expect(
        (patched.routes as Array<Record<string, unknown>>).some(
          (route) => typeof route.dest === 'string' && String(route.dest).includes('booking-share'),
        ),
      ).toBe(false);
    },
  );
});
