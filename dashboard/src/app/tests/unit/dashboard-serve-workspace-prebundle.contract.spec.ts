/**
 * Drift guard: Vite must not prebundle workspace TypeScript packages.
 * Those packages use type:module + extensionless relative imports, which
 * crash esbuild after the first successful ng serve bundle.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DASHBOARD_ROOT = join(import.meta.dirname, '..', '..', '..', '..');
const WORKSPACE_PACKAGES = [
  '@orvel/auth',
  '@orvel/billing',
  '@orvel/booking',
  '@orvel/config',
  '@orvel/domain',
  '@orvel/shared',
  '@orvel/types',
] as const;
const PACKAGE_SRC_GLOBS = [
  '../../packages/auth/src/**/*.ts',
  '../../packages/billing/src/**/*.ts',
  '../../packages/booking/src/**/*.ts',
  '../../packages/config/src/**/*.ts',
  '../../packages/domain/src/**/*.ts',
  '../../packages/types/src/**/*.ts',
] as const;

describe('dashboard serve workspace prebundle contract', () => {
  it('excludes @orvel workspace packages from Vite prebundle', () => {
    const angularJson = JSON.parse(readFileSync(join(DASHBOARD_ROOT, 'angular.json'), 'utf8'));
    const exclude = angularJson.projects['salon-de-belleza'].architect.serve.options.prebundle.exclude;

    expect(exclude).toEqual([...WORKSPACE_PACKAGES]);
  });

  it('includes workspace package sources in the app TypeScript program', () => {
    const tsconfig = readFileSync(join(DASHBOARD_ROOT, 'tsconfig.app.json'), 'utf8');

    for (const glob of PACKAGE_SRC_GLOBS) {
      expect(tsconfig).toContain(`"${glob}"`);
    }
    expect(tsconfig).toContain('"../../packages/**/*.spec.ts"');
  });
});
