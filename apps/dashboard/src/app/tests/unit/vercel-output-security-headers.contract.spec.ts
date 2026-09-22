import { describe, expect, it } from 'vitest';
import {
  SECURITY_HEADERS,
  patchVercelOutputConfig,
} from '../../../../../../scripts/vercel-output-config.mjs';

const EXPECTED_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

type HeaderEntry = { source: string; headers: { key: string; value: string }[] };

describe('TDD contract: the combined deploy ships the project security headers', () => {
  it('injects the project-wide security headers into the build output config', () => {
    const patched = patchVercelOutputConfig({ version: 3, routes: [{ handle: 'filesystem' }] }) as {
      headers?: HeaderEntry[];
    };

    expect(Array.isArray(patched.headers)).toBe(true);

    const catchAll = patched.headers?.find((entry) => entry.source === '/(.*)');
    expect(catchAll, 'expected a catch-all header entry at /(.*)').toBeDefined();

    for (const expected of EXPECTED_SECURITY_HEADERS) {
      expect(catchAll?.headers).toContainEqual(expected);
    }
  });

  it('is idempotent and preserves header entries it does not manage', () => {
    const fixture = {
      version: 3,
      headers: [
        { source: '/assets/(.*)', headers: [{ key: 'Cache-Control', value: 'max-age=31536000' }] },
      ],
    };

    const once = patchVercelOutputConfig(fixture);
    const twice = patchVercelOutputConfig(once) as { headers: HeaderEntry[] };

    expect(twice.headers.filter((entry) => entry.source === '/(.*)')).toHaveLength(1);
    expect(twice.headers.some((entry) => entry.source === '/assets/(.*)')).toBe(true);
  });

  it('exports the managed header list so the deploy has a single source of truth', () => {
    expect(SECURITY_HEADERS).toEqual(EXPECTED_SECURITY_HEADERS);
  });

  it('keeps the security headers out of per-app vercel.json files the combined project never reads', async () => {
    const { existsSync } = await import('node:fs');
    const { readFile } = await import('node:fs/promises');

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
