/**
 * packages-domain-shape.red.contract.spec.ts
 *
 * Drift guard for the @orvel/domain package surface.
 * Per sdd-design D5 + sdd-spec REQ-DOMAIN-SPEC-2 (chore-extract-domain-package).
 *
 * Asserts:
 * - package.json exports a single canonical entry (types + default → ./src/index.ts).
 * - src/index.ts re-exports the canonical type surface + runtime functions +
 *   the RequiredRubro type (first pure-types extraction of the 7-package funnel).
 * - src/reference-catalog.ts and src/onboarding-templates.ts are import-free pure
 *   (no dashboard-internal deps, REQ-DOMAIN-1).
 * - src/required-rubro.ts is types-only.
 * - The 3 dashboard old paths are re-export shims pointing at @orvel/domain
 *   (REQ-DOMAIN-3 migration window).
 * - pnpm-workspace.yaml still wires packages/* (REQ-DOMAIN-2 + REQ-DOMAIN-4).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..', '..', '..', '..');
const PACKAGE_ROOT = join(REPO_ROOT, 'packages', 'domain');
const PACKAGE_INDEX = join(PACKAGE_ROOT, 'src', 'index.ts');
const PACKAGE_PACKAGE_JSON = join(PACKAGE_ROOT, 'package.json');
const REFERENCE_CATALOG_SOURCE = join(PACKAGE_ROOT, 'src', 'reference-catalog.ts');
const ONBOARDING_TEMPLATES_SOURCE = join(PACKAGE_ROOT, 'src', 'onboarding-templates.ts');
const REQUIRED_RUBRO_SOURCE = join(PACKAGE_ROOT, 'src', 'required-rubro.ts');
const DASHBOARD_REFERENCE_CATALOG_SHIM = join(
  REPO_ROOT,
  'apps',
  'dashboard',
  'src',
  'app',
  'core',
  'catalog',
  'reference-catalog.ts'
);
const DASHBOARD_ONBOARDING_TEMPLATES_SHIM = join(
  REPO_ROOT,
  'apps',
  'dashboard',
  'src',
  'app',
  'features',
  'onboarding',
  'data-access',
  'onboarding-templates.ts'
);
const DASHBOARD_ONBOARDING_RUBROS_SHIM = join(
  REPO_ROOT,
  'apps',
  'dashboard',
  'src',
  'app',
  'features',
  'onboarding',
  'data-access',
  'onboarding-rubros.ts'
);

function readSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

describe('@orvel/domain package shape contract (chore-extract-domain-package)', () => {
  it('package.json exports the canonical single entry', () => {
    const packageJson = JSON.parse(readSource(PACKAGE_PACKAGE_JSON));

    expect(packageJson.name).toBe('@orvel/domain');
    expect(packageJson.type).toBe('module');
    expect(packageJson.exports).toBeDefined();
    expect(packageJson.exports['.']).toBeDefined();
    expect(packageJson.exports['.'].types).toBe('./src/index.ts');
    expect(packageJson.exports['.'].default).toBe('./src/index.ts');
    // Single exports."." entry — no subpath (per sdd-design D1)
    expect(Object.keys(packageJson.exports)).toEqual(['.']);
  });

  it('src/index.ts re-exports the canonical type surface + runtime functions + RequiredRubro', () => {
    const indexSource = readSource(PACKAGE_INDEX);

    // Runtime functions (reference-catalog)
    expect(indexSource).toContain('DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE');
    expect(indexSource).toContain('DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE_PAYLOAD');
    expect(indexSource).toContain('normalizeDashboardReferenceCatalog');
    expect(indexSource).toContain('resolvePlanCodeFromCatalog');
    expect(indexSource).toContain('resolveBusinessTypeCodeFromCatalog');
    expect(indexSource).toContain('getPlanEntitlementsFromCatalog');
    expect(indexSource).toContain('getCatalogAddOn');
    expect(indexSource).toContain('getAllowedBusinessTypesForPlan');
    expect(indexSource).toContain('getDefaultDashboardReferenceCatalog');
    // Runtime functions (onboarding-templates)
    expect(indexSource).toContain('normalizeCatalogSlug');
    expect(indexSource).toContain('normalizeCatalogName');
    expect(indexSource).toContain('sanitizeSelectedTemplateIds');
    expect(indexSource).toContain('mergeTemplateCatalogs');
    expect(indexSource).toContain('buildTemplatePreview');
    expect(indexSource).toContain('applyTemplatePreload');
    // Types (reference-catalog)
    expect(indexSource).toContain('type CatalogPlan');
    expect(indexSource).toContain('type CatalogAddOn');
    expect(indexSource).toContain('type CatalogBusinessType');
    expect(indexSource).toContain('type DashboardReferenceCatalog');
    // Types (onboarding-templates)
    expect(indexSource).toContain('type CatalogCategory');
    expect(indexSource).toContain('type CatalogService');
    expect(indexSource).toContain('type TemplateCatalog');
    expect(indexSource).toContain('type RubroTemplate');
    // RequiredRubro type (required-rubro)
    expect(indexSource).toContain('type RequiredRubro');
  });

  it('src/reference-catalog.ts is import-free pure (no dashboard-internal deps)', () => {
    const source = readSource(REFERENCE_CATALOG_SOURCE);

    expect(source, 'reference-catalog must not import anything (REQ-DOMAIN-1)').not.toMatch(/^\s*import\b/m);
    // Core exports present
    expect(source).toContain('export const DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE_PAYLOAD');
    expect(source).toContain('export const DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE');
    expect(source).toContain('export function normalizeDashboardReferenceCatalog');
    expect(source).toContain('export function resolveBusinessTypeCodeFromCatalog');
    expect(source).toContain('export function getDefaultDashboardReferenceCatalog');
  });

  it('src/onboarding-templates.ts is import-free pure (no dashboard-internal deps)', () => {
    const source = readSource(ONBOARDING_TEMPLATES_SOURCE);

    expect(source, 'onboarding-templates must not import anything (REQ-DOMAIN-1)').not.toMatch(/^\s*import\b/m);
    expect(source).toContain('export type TemplateCatalog');
    expect(source).toContain('export function mergeTemplateCatalogs');
    expect(source).toContain('export function sanitizeSelectedTemplateIds');
  });

  it('src/required-rubro.ts is types-only', () => {
    const source = readSource(REQUIRED_RUBRO_SOURCE);

    expect(source).toMatch(/^export\s+type\s+RequiredRubro\s*=/m);
    expect(source, 'required-rubro must not export runtime').not.toMatch(
      /^export\s+(const|let|var|function|interface|class|enum)\b/m
    );
    expect(source, 'required-rubro must not import anything').not.toMatch(/^\s*import\b/m);
  });

  it('3 dashboard shims at the old paths re-export from @orvel/domain (migration window)', () => {
    const referenceCatalogShim = readSource(DASHBOARD_REFERENCE_CATALOG_SHIM);
    const onboardingTemplatesShim = readSource(DASHBOARD_ONBOARDING_TEMPLATES_SHIM);
    const onboardingRubrosShim = readSource(DASHBOARD_ONBOARDING_RUBROS_SHIM);

    expect(referenceCatalogShim).toContain("from '@orvel/domain'");
    expect(onboardingTemplatesShim).toContain("from '@orvel/domain'");
    expect(onboardingRubrosShim).toContain("from '@orvel/domain'");
    // onboarding-rubros keeps the runtime (D3 split): it must still export the runtime functions
    expect(onboardingRubrosShim).toContain('export function sanitizeSelectedRubros');
    expect(onboardingRubrosShim).toContain('export function normalizeRubro');
  });

  it('pnpm-workspace.yaml still wires packages/* (REQ-DOMAIN-2 + REQ-DOMAIN-4)', () => {
    const workspaceYaml = readSource(join(REPO_ROOT, 'pnpm-workspace.yaml'));

    expect(workspaceYaml).toContain('packages/*');
  });
});
