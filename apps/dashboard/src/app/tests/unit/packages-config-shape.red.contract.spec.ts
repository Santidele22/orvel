/**
 * packages-config-shape.red.contract.spec.ts
 *
 * Drift guard for the @orvel/config package surface (chore-extract-config-package).
 *
 * Asserts:
 * - package.json exports a single canonical entry (types + default → ./src/index.ts).
 * - package source has no environment.ts import, no supabase.co URLs, no sb_ / eyJ strings.
 * - dashboard-env.ts re-exports from @orvel/config (no export *) and takes the fallback by injection.
 * - the app bootstrap module owns the generated-environment import.
 * - pnpm-workspace.yaml still wires packages/*.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..', '..');
const PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'config');
const DASHBOARD_ENV = join(REPO_ROOT, 'apps', 'dashboard', 'src', 'app', 'core', 'runtime', 'dashboard-env.ts');
const DASHBOARD_ENV_BOOTSTRAP = join(
  REPO_ROOT,
  'apps',
  'dashboard',
  'src',
  'app',
  'runtime',
  'configure-dashboard-environment.ts'
);
const DASHBOARD_MAIN = join(REPO_ROOT, 'apps', 'dashboard', 'src', 'main.ts');

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function readPackageSrc(): string {
  const srcDir = join(PACKAGE_ROOT, 'src');
  return readdirSync(srcDir)
    .filter((fileName) => fileName.endsWith('.ts'))
    .map((fileName) => readSource(join(srcDir, fileName)))
    .join('\n');
}

describe('@orvel/config package shape contract (chore-extract-config-package)', () => {
  it('package.json exports the canonical single entry', () => {
    const packageJson = JSON.parse(readSource(join(PACKAGE_ROOT, 'package.json')));

    expect(packageJson.name).toBe('@orvel/config');
    expect(packageJson.type).toBe('module');
    expect(packageJson.exports['.'].types).toBe('./src/index.ts');
    expect(packageJson.exports['.'].default).toBe('./src/index.ts');
    expect(Object.keys(packageJson.exports)).toEqual(['.']);
  });

  it('package source has no baked env, environment.ts, or secret-looking strings', () => {
    const source = readPackageSrc();

    expect(source).not.toMatch(/environment\.ts/);
    expect(source).not.toMatch(/@angular\//);
    expect(source).not.toMatch(/supabase\.co/i);
    expect(source).not.toMatch(/\bsb_/);
    expect(source).not.toMatch(/eyJ/);
  });

  it('package loadDashboardRuntimeEnv requires a source argument', () => {
    const source = readSource(join(PACKAGE_ROOT, 'src', 'dashboard-env.ts'));

    expect(source).toMatch(/export function loadDashboardRuntimeEnv\(\s*source:\s*EnvSource\s*\)/);
    expect(source).not.toContain('defaultEnvSource');
    expect(source).toContain('REQUIRED_DASHBOARD_ENV_KEYS');
    expect(source).toContain('withLegacyPublicSupabaseAliases');
  });

  it('dashboard-env.ts re-exports from @orvel/config and takes the environment fallback by injection', () => {
    const shim = readSource(DASHBOARD_ENV);

    expect(shim).toContain("from '@orvel/config'");
    expect(shim).not.toContain('export *');
    expect(shim).toContain('REQUIRED_DASHBOARD_ENV_KEYS');
    expect(shim).toContain('type DashboardRuntimeEnv');
    expect(shim).toContain('function defaultEnvSource');
    expect(shim).toMatch(/export function loadDashboardRuntimeEnv\(\s*source\?:/);
    // Fase 3 of #1098: the core cannot import the per-app generated environment module.
    expect(shim).not.toContain("from '../../../environments/environment'");
    expect(shim).toContain('export function configureDashboardEnvironmentFallback');
  });

  it('the dashboard app owns the build-time environment import', () => {
    const bootstrap = readSource(DASHBOARD_ENV_BOOTSTRAP);

    expect(bootstrap).toContain("from '../../environments/environment'");
    expect(bootstrap).toContain('configureDashboardEnvironmentFallback');
    expect(readSource(DASHBOARD_MAIN)).toContain('./app/runtime/configure-dashboard-environment');
  });

  it('pnpm-workspace.yaml still wires packages/*', () => {
    expect(readSource(join(REPO_ROOT, 'pnpm-workspace.yaml'))).toContain('packages/*');
  });
});
