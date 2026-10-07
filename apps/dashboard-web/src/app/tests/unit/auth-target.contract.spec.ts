import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Fase 4 of #1098 / ADR 0012 — each app declares its own execution target.
 *
 * The shared core cannot know which app imported it, so the app hands its target over from the
 * bootstrap, next to its runtime env. The failure this guards against is a copy-paste: the two
 * files are near-identical, and a web target that declared `pwa` would resolve the PWA's session
 * key, which is the coupling audit finding S2 is about.
 */
const WEB_CONFIGURATOR = resolve(
  import.meta.dirname,
  '..',
  '..',
  'runtime',
  'configure-dashboard-environment.ts'
);
const PWA_CONFIGURATOR = join(
  resolve(import.meta.dirname, '..', '..', '..', '..', '..'),
  'dashboard',
  'src',
  'app',
  'runtime',
  'configure-dashboard-environment.ts'
);

function declaredTarget(file: string): string | null {
  const source = readFileSync(file, 'utf8');
  return source.match(/configureDashboardAuthTarget\(\s*'([a-z]+)'\s*\)/)?.[1] ?? null;
}

describe('execution target declaration', () => {
  it('the web console declares the web target', () => {
    expect(declaredTarget(WEB_CONFIGURATOR)).toBe('web');
  });

  it('the pwa declares the pwa target', () => {
    expect(declaredTarget(PWA_CONFIGURATOR)).toBe('pwa');
  });

  it('the two apps never declare the same target', () => {
    expect(declaredTarget(WEB_CONFIGURATOR)).not.toBe(declaredTarget(PWA_CONFIGURATOR));
  });
});
