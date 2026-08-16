/**
 * packages-auth-shape.red.contract.spec.ts
 *
 * Drift guard for the @orvel/auth package surface.
 * Per sdd-design D3 + sdd-spec REQ-SPEC-3.
 *
 * Asserts:
 * - Exports the type-only public surface (TurneaSessionUser, TurneaSession,
 *   LEGACY_DASHBOARD_SESSION_STORAGE_KEY, ValidateSessionSchema type signature).
 * - Does NOT re-export the validateSessionSchema runtime body (it lives in
 *   apps/dashboard/src/app/core/auth/validate-session-schema.ts because it
 *   depends on app-internal ALLOWED_SELECTED_BUSINESS_TYPES).
 * - The dashboard tsconfig can resolve @orvel/auth to packages/auth/.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..', '..');
const PACKAGE_INDEX = join(REPO_ROOT, 'packages', 'auth', 'src', 'index.ts');
const PACKAGE_PACKAGE_JSON = join(REPO_ROOT, 'packages', 'auth', 'package.json');
const DASHBOARD_SHIM = join(REPO_ROOT, 'apps', 'dashboard', 'src', 'app', 'core', 'auth', 'session-contract.ts');

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('@orvel/auth package shape contract (chore-extract-auth-package)', () => {
  it('package.json exports the canonical type-only entry', () => {
    const packageJson = JSON.parse(readSource(PACKAGE_PACKAGE_JSON));

    expect(packageJson.name).toBe('@orvel/auth');
    expect(packageJson.type).toBe('module');
    expect(packageJson.exports).toBeDefined();
    expect(packageJson.exports['.']).toBeDefined();
    expect(packageJson.exports['.'].types).toBe('./src/index.ts');
    expect(packageJson.exports['.'].default).toBe('./src/index.ts');
    // Single exports."." entry — no subpath per sdd-design D3
    expect(Object.keys(packageJson.exports)).toEqual(['.']);
  });

  it('src/index.ts re-exports the type-only public surface', () => {
    const indexSource = readSource(PACKAGE_INDEX);

    expect(indexSource).toContain('LEGACY_DASHBOARD_SESSION_STORAGE_KEY');
    expect(indexSource).toContain('TurneaSession');
    expect(indexSource).toContain('TurneaSessionUser');
    expect(indexSource).toContain('SelectedBusinessType');
    expect(indexSource).toContain('RequiredRubro');
    expect(indexSource).toContain('TemplateCatalog');
    expect(indexSource).toContain('ValidateSessionSchema');
    // Type-only re-exports (type keyword present for each interface)
    expect(indexSource).toContain('type TurneaSession');
    expect(indexSource).toContain('type TurneaSessionUser');
    expect(indexSource).toContain('type SelectedBusinessType');
    expect(indexSource).toContain('type RequiredRubro');
    expect(indexSource).toContain('type TemplateCatalog');
    expect(indexSource).toContain('type ValidateSessionSchema');
    // NO runtime function re-export
    expect(indexSource).not.toContain('export function validateSessionSchema');
  });

  it('src/session-contract.ts is types-only (no runtime body)', () => {
    const sessionContract = readSource(
      join(REPO_ROOT, 'packages', 'auth', 'src', 'session-contract.ts'),
    );

    // Type-only exports present
    expect(sessionContract).toContain('export const LEGACY_DASHBOARD_SESSION_STORAGE_KEY');
    expect(sessionContract).toContain('export interface TurneaSessionUser');
    expect(sessionContract).toContain('export interface TurneaSession');
    expect(sessionContract).toContain('export type SelectedBusinessType');
    // chore-extract-domain-package (REQ-DOMAIN-AUTH-OPAQUES): SelectedBusinessType is
    // derived from the canonical @orvel/domain RequiredRubro type (the design's
    // `RequiredRubro['businessType']` indexing assumed an object shape; the real
    // catalog-derived type is a string, so the equivalent derivation is a direct
    // alias). The opaque RequiredRubro/TemplateCatalog stubs are re-exported from
    // @orvel/domain.
    expect(sessionContract).toContain('SelectedBusinessType = RequiredRubro');
    expect(sessionContract).toContain("export type { RequiredRubro, TemplateCatalog } from '@orvel/domain'");
    expect(sessionContract).toContain('export type ValidateSessionSchema');
    // NO runtime function body
    expect(sessionContract).not.toContain('function validateSessionSchema');
  });

  it('dashboard-local shim re-exports from @orvel/auth (migration window)', () => {
    const shim = readSource(DASHBOARD_SHIM);

    expect(shim).toContain("from '@orvel/auth'");
    expect(shim).toContain('LEGACY_DASHBOARD_SESSION_STORAGE_KEY');
    expect(shim).toContain('TurneaSession');
    expect(shim).toContain('validateSessionSchema');
    // Runtime body now lives in the new local file, not in this shim
    expect(shim).not.toContain('ALLOWED_SELECTED_BUSINESS_TYPES.includes');
  });
});
