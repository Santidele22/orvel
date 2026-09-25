import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDefaultDashboardReferenceCatalog } from '../../core/catalog/reference-catalog';

const RUBROS_RELATIVE_PATH = 'src/app/features/onboarding/data-access/onboarding-rubros.ts';
const BUSINESS_STEP_RELATIVE_PATH = 'src/app/features/onboarding/pages/onboarding-business-step.page.ts';

function readDashboardSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

describe('RED contract: dashboard onboarding rubros use the reference catalog', () => {
  it('CAT-ORU-001 @RED - onboarding-rubros.ts must not define REQUIRED_RUBROS as a local allowlist source of truth', () => {
    const source = readDashboardSource(RUBROS_RELATIVE_PATH);

    expect(source, 'Rubro normalization/sanitization must read the dashboard reference catalog').toMatch(
      /REFERENCE_CATALOG|getDefaultDashboardReferenceCatalog|resolveBusinessTypeCodeFromCatalog|businessTypes/
    );
    expect(source, 'Remove local REQUIRED_RUBROS array literal; derive codes from catalog.businessTypes').not.toMatch(
      /(?:export\s+)?const\s+REQUIRED_RUBROS\s*=\s*\[[\s\S]*?\]\s*as\s+const/
    );
  });

  it('CAT-ORU-002 @RED - onboarding-business-step.page.ts must not keep hardcoded rubroOptions', () => {
    const source = readDashboardSource(BUSINESS_STEP_RELATIVE_PATH);

    expect(source, 'Rubro options must be projected from REFERENCE_CATALOG.businessTypes').toMatch(
      /REFERENCE_CATALOG|getDefaultDashboardReferenceCatalog|businessTypes/
    );
    expect(source, 'Remove the local hardcoded rubroOptions array literal from the page').not.toMatch(
      /rubroOptions\s*=\s*\[[\s\S]*?\]/
    );
  });

  it('CAT-ORU-003 @RED - rubro options include every catalog business type in catalog order with labels', () => {
    const source = readDashboardSource(BUSINESS_STEP_RELATIVE_PATH);
    const expectedOptions = getDefaultDashboardReferenceCatalog().businessTypes.map(({ code, label }) => ({
      slug: code.toLowerCase(),
      label
    }));

    for (const option of expectedOptions) {
      expect(source, `Missing catalog rubro option ${option.slug} (${option.label})`).toContain(option.slug);
      expect(source, `Missing catalog rubro label ${option.label}`).toContain(option.label);
    }

    expect(expectedOptions.map((option) => option.slug)).toEqual([
      'peluqueria',
      'unas',
      'barberia',
      'spa',
      'pestanas',
      'cejas',
      'masajes',
      'otro'
    ]);
  });

  it('CAT-ORU-004 @RED - selected rubros persist canonical catalog business-type codes, not the legacy zen theme', () => {
    const source = readDashboardSource(BUSINESS_STEP_RELATIVE_PATH);

    expect(source, 'The page should stop importing the legacy SelectedBusinessType zen-only auth type').not.toMatch(
      /SelectedBusinessType/
    );
    expect(source, 'Do not map all rubros to the zen theme/business type').not.toMatch(
      /mapRubrosToBusinessTypes[\s\S]*?peluqueria\s*:\s*'zen'[\s\S]*?unas\s*:\s*'zen'[\s\S]*?barberia\s*:\s*'zen'/
    );
    expect(source, 'Persist canonical selected rubro/business-type codes into the mock session').toMatch(
      /selectedBusinessTypes\s*[:,=][\s\S]*selectedRubros|selectedRubros[\s\S]*selectedBusinessTypes/
    );
  });
});
