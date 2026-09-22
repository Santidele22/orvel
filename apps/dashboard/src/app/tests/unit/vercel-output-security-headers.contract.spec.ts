import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  SECURITY_HEADERS,
  patchVercelOutputConfig,
} from '../../../../../../scripts/vercel-output-config.mjs';

const EXPECTED_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Build Output API v3 schema: https://vercel.com/docs/build-output-api/configuration
const SUPPORTED_CONFIG_KEYS = [
  'version',
  'routes',
  'images',
  'wildcard',
  'overrides',
  'cache',
  'framework',
  'crons',
  'services',
];

type Route = {
  src?: string;
  dest?: string;
  handle?: string;
  continue?: boolean;
  headers?: Record<string, string>;
};

describe('TDD contract: the combined deploy ships the project security headers', () => {
  it('applies the headers through a route entry, using only Build Output keys', () => {
    const patched = patchVercelOutputConfig({ version: 3, routes: [{ handle: 'filesystem' }] }) as {
      routes: Route[];
    } & Record<string, unknown>;

    for (const key of Object.keys(patched)) {
      expect(SUPPORTED_CONFIG_KEYS, `config.json must not carry the unsupported key "${key}"`).toContain(
        key
      );
    }

    const headersRoute = patched.routes.find(
      (route) => route.src === '/(.*)' && Boolean(route.headers)
    );

    expect(headersRoute, 'expected a catch-all route carrying the security headers').toBeDefined();
    expect(headersRoute?.continue).toBe(true);

    for (const [key, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
      expect(headersRoute?.headers?.[key]).toBe(value);
    }

    const filesystemIndex = patched.routes.findIndex((route) => route.handle === 'filesystem');
    expect(patched.routes.indexOf(headersRoute as Route)).toBeLessThan(filesystemIndex);
  });

  it('is idempotent and preserves the routes it does not manage', () => {
    const fixture = {
      version: 3,
      routes: [{ handle: 'filesystem' }, { src: '^/api/(.*)$', dest: '/api' }],
    };

    const once = patchVercelOutputConfig(fixture) as { routes: Route[] };
    const twice = patchVercelOutputConfig(once) as { routes: Route[] };

    expect(
      twice.routes.filter((route) => route.src === '/(.*)' && Boolean(route.headers))
    ).toHaveLength(1);
    expect(twice.routes.some((route) => route.src === '^/api/(.*)$')).toBe(true);
  });

  it('exports the managed header map so the deploy has a single source of truth', () => {
    expect(SECURITY_HEADERS).toEqual(EXPECTED_SECURITY_HEADERS);
  });

  it('keeps the security headers out of per-app vercel.json files the combined project never reads', async () => {
    for (const app of ['dashboard', 'landing']) {
      const configPath = new URL(`../../../../../../apps/${app}/vercel.json`, import.meta.url);

      if (!existsSync(configPath)) continue;

      const config = await readFile(configPath, 'utf8');
      expect(config, `apps/${app}/vercel.json must not redeclare the security headers`).not.toContain(
        'X-Frame-Options'
      );
    }
  });
});
