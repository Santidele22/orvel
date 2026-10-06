import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BOOKING_SHARE_REWRITE,
  BOOKING_SPA_REWRITE,
  DASHBOARD_SPA_REWRITE,
  SECURITY_HEADERS_ROUTE_SRC,
  WEB_CONSOLE_HOSTING_ROUTES,
  WEB_CONSOLE_SPA_REWRITE,
  patchVercelOutputConfig,
} from './vercel-output-config.mjs';

/**
 * Fase 4 of #1098 / ADR 0012 — one artifact per origin.
 *
 * The combined deployment patches the landing's Astro output with three hosting rewrites
 * (`/dashboard/*`, the share preview and `/booking/*`). The console is its own origin and its own
 * Vercel project, so its artifact must carry one SPA fallback and none of the landing's rewrites;
 * shipping them would mean the console answers for paths that no longer belong to it.
 */

const filesystemFirst = { version: 3, routes: [{ handle: 'filesystem' }] };

function routesOf(config) {
  return config.routes;
}

test('the combined deploy keeps its three hosting rewrites', () => {
  const config = patchVercelOutputConfig(filesystemFirst);

  for (const rewrite of [DASHBOARD_SPA_REWRITE, BOOKING_SHARE_REWRITE, BOOKING_SPA_REWRITE]) {
    assert.ok(
      routesOf(config).some((route) => route.src === rewrite.src && route.dest === rewrite.dest),
      `expected the combined config to keep ${rewrite.src} -> ${rewrite.dest}`,
    );
  }
});

test('the console artifact exposes exactly one SPA fallback', () => {
  const config = patchVercelOutputConfig(filesystemFirst, {
    hostingRoutes: WEB_CONSOLE_HOSTING_ROUTES,
  });

  const fallbacks = routesOf(config).filter((route) => route.dest === WEB_CONSOLE_SPA_REWRITE.dest);
  assert.equal(fallbacks.length, 1);
  assert.equal(fallbacks[0].src, WEB_CONSOLE_SPA_REWRITE.src);
  assert.deepEqual(routesOf(config).find((route) => route.handle === 'filesystem'), {
    handle: 'filesystem',
  });
});

test('the console artifact carries none of the landing rewrites', () => {
  const config = patchVercelOutputConfig(filesystemFirst, {
    hostingRoutes: WEB_CONSOLE_HOSTING_ROUTES,
  });

  const foreign = routesOf(config).filter((route) =>
    [DASHBOARD_SPA_REWRITE, BOOKING_SHARE_REWRITE, BOOKING_SPA_REWRITE].some(
      (rewrite) => route.dest === rewrite.dest || route.src === rewrite.src,
    ),
  );

  assert.deepEqual(foreign, []);
  assert.ok(!routesOf(config).some((route) => String(route.dest).includes('dashboard')));
});

test('both artifact shapes keep the managed security headers route first', () => {
  for (const hostingRoutes of [undefined, WEB_CONSOLE_HOSTING_ROUTES]) {
    const config = patchVercelOutputConfig(filesystemFirst, hostingRoutes ? { hostingRoutes } : {});
    const [first] = routesOf(config);

    assert.equal(first.src, SECURITY_HEADERS_ROUTE_SRC);
    assert.equal(first.continue, true);
    assert.match(first.headers['Content-Security-Policy'], /default-src 'self'/);
    assert.match(first.headers['Content-Security-Policy'], /connect-src .*supabase/);
    assert.equal(first.headers['Strict-Transport-Security'], 'max-age=31536000');
  }
});

test('patching replaces previously managed routes instead of stacking duplicates', () => {
  const once = patchVercelOutputConfig(filesystemFirst, {
    hostingRoutes: WEB_CONSOLE_HOSTING_ROUTES,
  });
  const twice = patchVercelOutputConfig(once, { hostingRoutes: WEB_CONSOLE_HOSTING_ROUTES });

  // Count by shape, not by src: the console SPA fallback legitimately shares `/(.*)` with the
  // catch-all headers route, and only the headers route is managed (and replaced) per patch.
  const headersRoutes = (config) =>
    config.routes.filter((route) => route.src === SECURITY_HEADERS_ROUTE_SRC && route.headers);

  assert.equal(twice.routes.length, once.routes.length);
  assert.equal(headersRoutes(twice).length, 1);
  assert.equal(twice.routes.filter((route) => route.dest === '/index.html').length, 1);
});
