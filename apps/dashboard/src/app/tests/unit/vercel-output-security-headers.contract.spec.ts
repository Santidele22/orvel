import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  SECURITY_HEADERS,
  buildSecurityHeaders,
  patchVercelOutputConfig,
} from '../../../../../../scripts/vercel-output-config.mjs';

const EXPECTED_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000',
};

function parseCsp(value: string | undefined): Map<string, string> {
  const directives = new Map<string, string>();
  for (const part of (value ?? '').split(';')) {
    const [name, ...rest] = part.trim().split(/\s+/);
    if (name) directives.set(name, rest.join(' '));
  }
  return directives;
}

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
    for (const [key, value] of Object.entries(EXPECTED_SECURITY_HEADERS)) {
      expect(SECURITY_HEADERS[key], `missing managed header ${key}`).toBe(value);
    }
  });

  it('ships a CSP that locks down exfiltration, plugins, framing and base tags', () => {
    const csp = parseCsp(SECURITY_HEADERS['Content-Security-Policy']);

    expect(csp.get('default-src')).toBe("'self'");
    expect(csp.get('object-src')).toBe("'none'");
    expect(csp.get('base-uri')).toBe("'self'");
    expect(csp.get('form-action')).toBe("'self'");
    expect(csp.get('frame-ancestors')).toBe("'none'");
    expect(csp.get('connect-src')).toContain("'self'");
    expect(csp.get('connect-src')).toContain('https://*.supabase.co');
    // Realtime notifications use a websocket; without wss:// in connect-src the
    // dashboard would lose them in production.
    expect(csp.get('connect-src')).toContain('wss://*.supabase.co');
    expect(csp.get('style-src')).toContain('https://fonts.googleapis.com');
    expect(csp.get('font-src')).toContain('https://fonts.gstatic.com');
    expect(csp.get('img-src')).toContain('data:');
  });

  it('keeps the inline boot scripts working and lets a deploy add its own origins', () => {
    const csp = parseCsp(SECURITY_HEADERS['Content-Security-Policy']);

    // Documented debt: index.html boots the PWA with three inline scripts, so
    // script-src must allow inline. Removing them is the follow-up that lets
    // this directive drop 'unsafe-inline'.
    expect(csp.get('script-src')).toContain("'self'");
    expect(csp.get('script-src')).toContain("'unsafe-inline'");

    const widened = buildSecurityHeaders({ supabaseOrigin: 'https://project.supabase.co' });
    expect(parseCsp(widened['Content-Security-Policy']).get('connect-src')).toContain(
      'https://project.supabase.co'
    );
    expect(parseCsp(widened['Content-Security-Policy']).get('connect-src')).toContain(
      'wss://project.supabase.co'
    );
    expect(SECURITY_HEADERS['Content-Security-Policy']).not.toContain('https://project.supabase.co');
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
