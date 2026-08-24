/**
 * packages-types-shape.red.contract.spec.ts
 *
 * Drift guard for the @orvel/types package surface (chore-extract-types-package).
 *
 * Asserts:
 * - package.json exports a single canonical entry (types + default → ./src/index.ts).
 * - src/*.model.ts files are import-free (no @angular, no dashboard-internal imports).
 * - 4 dashboard old paths are explicit per-name re-export shims from @orvel/types.
 * - pnpm-workspace.yaml still wires packages/*.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..', '..');
const PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'types');
const DASHBOARD_MODELS = join(REPO_ROOT, 'apps', 'dashboard', 'src', 'app', 'models');
const MODEL_FILES = ['branch.model.ts', 'business.model.ts', 'cliente.model.ts', 'user.model.ts'] as const;

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('@orvel/types package shape contract (chore-extract-types-package)', () => {
  it('package.json exports the canonical single entry', () => {
    const packageJson = JSON.parse(readSource(join(PACKAGE_ROOT, 'package.json')));

    expect(packageJson.name).toBe('@orvel/types');
    expect(packageJson.type).toBe('module');
    expect(packageJson.exports['.'].types).toBe('./src/index.ts');
    expect(packageJson.exports['.'].default).toBe('./src/index.ts');
    expect(Object.keys(packageJson.exports)).toEqual(['.']);
  });

  it('extracted model files are import-free (no @angular, no dashboard-internal imports)', () => {
    for (const fileName of MODEL_FILES) {
      const source = readSource(join(PACKAGE_ROOT, 'src', fileName));
      expect(source, `${fileName} must not import`).not.toMatch(/^\s*import\b/m);
      expect(source, `${fileName} must not mention @angular`).not.toMatch(/@angular\//);
      expect(source, `${fileName} must not import dashboard internals`).not.toMatch(
        /from\s+['"](\.\.\/)+/
      );
    }
  });

  it('4 dashboard shims re-export from @orvel/types (no export *)', () => {
    for (const fileName of MODEL_FILES) {
      const shim = readSource(join(DASHBOARD_MODELS, fileName));
      expect(shim).toContain("from '@orvel/types'");
      expect(shim, `${fileName} shim must be explicit per-name`).not.toContain('export *');
    }
  });

  it('pnpm-workspace.yaml still wires packages/*', () => {
    expect(readSource(join(REPO_ROOT, 'pnpm-workspace.yaml'))).toContain('packages/*');
  });
});
